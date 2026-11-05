
import {
    BadRequestException,
    Inject,
    Injectable,
} from '@nestjs/common';

import type { CurrentTenant } from '../tenants/tenants.service';

import { SELF_DELIVERY_PROVIDER }
    from '../sourcing/sourcing.tokens';

import type { SelfDeliveryProvider }
    from '../sourcing/interfaces/self-delivery-provider.interface';

import { SourceDeliveryIntegrationsService }
    from './source-delivery-integrations.service';

import { SelfDeliveryFulfillmentRepository }
    from './self-delivery-fulfillment.repository';

import { ShipmentStatusService }
    from './shipment-status.service';

@Injectable()
export class SelfDeliveryPollingService {
    constructor(
        private readonly integrations:
            SourceDeliveryIntegrationsService,

        private readonly fulfillments:
            SelfDeliveryFulfillmentRepository,

        @Inject(SELF_DELIVERY_PROVIDER)
        private readonly provider: SelfDeliveryProvider,

        private readonly shipmentStatus:
            ShipmentStatusService,
    ) { }

    async poll(
        tenant: CurrentTenant,
        storeId: string,
        sourceId: string,
        sourceOrderId: string,
    ): Promise<'processed' | 'duplicate' | 'ignored' | 'disabled'> {
        const integration =
            await this.integrations.findByStoreAndSource(
                tenant,
                storeId,
                sourceId,
            );

        if (!integration?.pollingEnabled) {
            return 'disabled';
        }

        const fulfillment =
            await this.fulfillments.findBySourceOrderId(
                tenant,
                sourceId,
                sourceOrderId,
            );

        if (
            !fulfillment ||
            fulfillment.request_payload?.storeId !== storeId ||
            fulfillment.request_payload?.sourceId !== sourceId
        ) {
            throw new BadRequestException(
                'Self-delivery order does not belong to integration',
            );
        }

        if (!this.provider.getDeliveryStatus) {
            throw new BadRequestException(
                'Self-delivery provider does not support polling',
            );
        }

        const update = await this.provider.getDeliveryStatus({
            sourceId,
            sourceOrderId,
        });

        if (
            update.sourceId !== sourceId ||
            update.sourceOrderId !== sourceOrderId
        ) {
            throw new BadRequestException(
                'Supplier returned tracking data for another order',
            );
        }

        return this.shipmentStatus.processSelfDeliveryUpdate(
            tenant,
            update,
        );
    }
    async pollActiveShipments(
        tenant: CurrentTenant,
    ): Promise<void> {
        const activeFulfillments =
            await this.fulfillments.findActiveForPolling(tenant);

        for (const fulfillment of activeFulfillments) {
            try {
                const storeId = fulfillment.request_payload.storeId;

                await this.poll(
                    tenant,
                    storeId,
                    fulfillment.source_id,
                    fulfillment.source_order_id!,
                );
            } catch (error) {
                console.error(
                    `Self-delivery polling failed for shipment ${fulfillment.shipment_id}`,
                    error,
                );
            }
        }
    }
}
