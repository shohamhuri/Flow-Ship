
import {
    BadRequestException,
    Controller,
    Headers,
    Param,
    Post,
    Req,
    UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { SourceDeliveryWebhookResolverService } from './source-delivery-webhook-resolver.service';
import { SourceDeliveryWebhookSignatureService } from './source-delivery-webhook-signature.service';
import { SelfDeliveryFulfillmentRepository } from './self-delivery-fulfillment.repository';
import { ShipmentStatusService } from './shipment-status.service';

import type {
    SelfDeliveryTrackingUpdate,
} from '../sourcing/interfaces/self-delivery-provider.interface';

@Controller('shipments/self-delivery/webhook')
export class SourceDeliveryWebhookController {
    constructor(
        private readonly resolver:
            SourceDeliveryWebhookResolverService,
        private readonly signatureService:
            SourceDeliveryWebhookSignatureService,
        private readonly fulfillmentRepository:
            SelfDeliveryFulfillmentRepository,
        private readonly shipmentStatusService:
            ShipmentStatusService,
    ) { }

    @Post(':webhookId')
    async receive(
        @Param('webhookId') webhookId: string,
        @Headers('x-supplier-signature') signature: string | undefined,
        @Headers('x-supplier-timestamp') timestamp: string | undefined,
        @Req() req: RawBodyRequest<Request>,
    ) {
        const integration = await this.resolver.resolve(webhookId);

        if (!req.rawBody) {
            throw new BadRequestException(
                'Missing raw webhook body',
            );
        }

        this.signatureService.verify(
            integration.webhookSecret,
            req.rawBody,
            signature,
            timestamp,
        );

        const update = req.body as SelfDeliveryTrackingUpdate;

        if (
            !update ||
            typeof update !== 'object' ||
            Array.isArray(update) ||
            typeof update.sourceId !== 'string' ||
            typeof update.sourceOrderId !== 'string' ||
            typeof update.externalEventId !== 'string' ||
            typeof update.occurredAt !== 'string' ||
            typeof update.status !== 'string'
        ) {
            throw new BadRequestException(
                'Invalid supplier tracking payload',
            );
        }

        if (update.sourceId !== integration.sourceId) {
            throw new UnauthorizedException(
                'Supplier does not match webhook integration',
            );
        }

        const fulfillment =
            await this.fulfillmentRepository.findBySourceOrderId(
                integration.tenant,
                update.sourceId,
                update.sourceOrderId,
            );

        if (
            !fulfillment ||
            fulfillment.request_payload?.storeId !== integration.storeId ||
            fulfillment.request_payload?.sourceId !== integration.sourceId
        ) {
            throw new UnauthorizedException(
                'Supplier order does not belong to webhook integration',
            );
        }

        const result =
            await this.shipmentStatusService.processSelfDeliveryUpdate(
                integration.tenant,
                update,
            );

        return {
            ok: true,
            result,
        };
    }
}
