
import {
    Inject,
    Injectable,
} from '@nestjs/common';

import {
    CurrentTenant,
} from '../tenants/tenants.service';

import {
    SELF_DELIVERY_PROVIDER,
} from '../sourcing/sourcing.tokens';

import type {
    SelfDeliveryProvider,
    SelfDeliveryCreateRequest,
} from '../sourcing/interfaces/self-delivery-provider.interface';
import {
    SelfDeliveryProviderError,
} from '../sourcing/interfaces/self-delivery-provider.interface';

import {
    SelfDeliveryFulfillmentRepository,
} from './self-delivery-fulfillment.repository';

@Injectable()
export class SelfDeliveryFulfillmentService {
    constructor(
        private readonly fulfillmentRepository:
            SelfDeliveryFulfillmentRepository,

        @Inject(SELF_DELIVERY_PROVIDER)
        private readonly selfDeliveryProvider:
            SelfDeliveryProvider,
    ) { }
    async getStatus(
        tenant: CurrentTenant,
        shipmentId: string,
    ): Promise<'pending' | 'processing' | 'confirmed' | 'failed' | null> {
        const fulfillment =
            await this.fulfillmentRepository.findByShipmentId(
                tenant,
                shipmentId,
            );

        return fulfillment?.status ?? null;
    }
    async prepare(
        tenant: CurrentTenant,
        shipmentId: string,
        request: Omit<SelfDeliveryCreateRequest, 'requestId'>,
    ): Promise<void> {
        await this.fulfillmentRepository.createPending(
            tenant,
            shipmentId,
            request,
        );
    }
    async executePending(
        tenant: CurrentTenant,
        shipmentId: string,
    ): Promise<void> {
        const fulfillment =
            await this.fulfillmentRepository.claimPending(
                tenant,
                shipmentId,
            );

        if (!fulfillment) {
            const existing =
                await this.fulfillmentRepository.findByShipmentId(
                    tenant,
                    shipmentId,
                );

            if (!existing) {
                throw new Error(
                    'Self-delivery fulfillment not found',
                );
            }

            if (existing.status === 'confirmed') {
                return;
            }

            throw new Error(
                `Self-delivery fulfillment is ${existing.status}`,
            );
        }

        try {
            const response =
                await this.selfDeliveryProvider.createDelivery(
                    fulfillment.request_payload,
                );

            if (
                response.requestId !== fulfillment.request_id ||
                response.sourceId !== fulfillment.source_id ||
                response.status !== 'confirmed' ||
                !response.sourceOrderId?.trim()
            ) {
                throw new Error(
                    'Invalid self-delivery provider confirmation',
                );
            }

            await this.fulfillmentRepository.markConfirmed(
                tenant,
                shipmentId,
                response.sourceOrderId,
            );
        } catch (error) {
            if (
                error instanceof SelfDeliveryProviderError &&
                error.code === 'INVALID_REQUEST'
            ) {
                await this.fulfillmentRepository.markFailed(
                    tenant,
                    shipmentId,
                    error.message,
                );
            }

            // TIMEOUT, PROVIDER_UNAVAILABLE, INTERNAL_ERROR
            // ושגיאות לא מסווגות עשויים להצביע על תוצאה לא ידועה.
            // משאירים processing כדי למנוע יצירת משלוח כפול.
            throw error;
        }
    }

}
