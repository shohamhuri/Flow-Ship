import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { validateSelfDeliveryDestination }
    from './validate-self-delivery-destination';
import { isDeepStrictEqual } from 'node:util';
import { SelfDeliveryFulfillmentService }
    from '../shipments/self-delivery-fulfillment.service';
import type { CurrentTenant } from '../tenants/tenants.service';
import type { ConfirmCheckoutDto } from './dto/confirm-checkout.dto';
import { validateSelectedDeliveryOption } from
    './validate-selected-delivery-option';
import { CheckoutPaymentSignatureService } from './checkout-payment-signature.service';
import { CheckoutRepository } from './checkout.repository';
import { CheckoutPaymentWebhookRepository } from './checkout-payment-webhook.repository';
import { ShipmentsRepository } from '../shipments/shipments.repository';
@Injectable()
export class CheckoutConfirmationService {
    constructor(
        private readonly checkoutRepository: CheckoutRepository,
        private readonly paymentSignatureService: CheckoutPaymentSignatureService,
        private readonly paymentWebhookRepository: CheckoutPaymentWebhookRepository,
        private readonly selfDeliveryFulfillmentService: SelfDeliveryFulfillmentService,
        private readonly shipmentsRepository: ShipmentsRepository,


    ) { }

    async confirm(
        tenant: CurrentTenant,
        checkoutId: string,
        dto: ConfirmCheckoutDto,
        rawBody: Buffer,
        signature: string | undefined,
        timestamp: string | undefined,

    ): Promise<void> {
        const secret = await this.checkoutRepository
            .getStorePaymentWebhookSecret(tenant, dto.storeId);

        this.paymentSignatureService.verify(
            secret,
            rawBody,
            signature,
            timestamp,
        );
        const checkout =
            await this.checkoutRepository.getCheckoutById(
                tenant,
                checkoutId,
            );

        if (!checkout) {
            throw new NotFoundException(
                'Checkout not found',
            );
        }

        if (
            checkout.orderId !== dto.orderId ||
            checkout.storeId !== dto.storeId ||
            checkout.platform !== 'manual'
        ) {
            throw new BadRequestException(
                'Checkout does not match the supplied order and store',
            );
        }
        if (checkout.status !== 'grouped') {
            throw new BadRequestException(
                `Checkout cannot be confirmed with status: ${checkout.status}`,
            );
        }
        if (!checkout.decision) {
            throw new BadRequestException(
                'Checkout has no delivery decision',
            );
        }

        const selectedOption = validateSelectedDeliveryOption(
            checkout.decision.evaluatedOptions,
            dto.selectedDeliveryOptionId,
        );

        if (
            selectedOption.id !==
            checkout.decision.selectedDeliveryOptionId
        ) {
            throw new BadRequestException(
                'Selected delivery option does not match created shipments',
            );
        }
        const registered = await this.paymentWebhookRepository.registerEvent(
            tenant,
            dto.storeId,
            checkoutId,
            dto.paymentReference,
            dto,
        );

        if (!registered) {
            const existing = await this.paymentWebhookRepository.findEvent(
                tenant,
                dto.storeId,
                checkoutId,
            );

            if (
                !existing ||
                existing.paymentReference !== dto.paymentReference
            ) {
                throw new BadRequestException(
                    'Checkout already confirmed with a different payment reference',
                );
            }
            if (
                !isDeepStrictEqual(
                    existing.payload,
                    JSON.parse(JSON.stringify(dto)),
                )
            ) {
                throw new BadRequestException(
                    'Checkout already confirmed with different details',
                );
            }
        }
        const event = await this.paymentWebhookRepository.findEvent(
            tenant,
            dto.storeId,
            checkoutId,
        );

        if (!event) {
            throw new Error('Payment confirmation event not found');
        }

        if (event.status === 'processed') {
            return;
        }

        const claimed = await this.paymentWebhookRepository.claimEvent(
            tenant,
            event.id,
        );

        if (!claimed) {
            throw new Error(
                'Payment confirmation is already being processed or requires recovery',
            );
        }
        try {

            const selfDeliveryShipments =
                await this.shipmentsRepository.findSelfDeliveryShipmentsByCheckoutId(
                    tenant,
                    checkoutId,
                );
            if (selfDeliveryShipments.length > 0) {
                const destination = validateSelfDeliveryDestination(
                    checkout.destination,
                );

                for (const shipment of selfDeliveryShipments) {
                    if (
                        shipment.order_id !== checkout.orderId ||
                        !shipment.metadata?.sourceId ||
                        !Array.isArray(shipment.metadata.items) ||
                        shipment.metadata.items.length === 0
                    ) {
                        throw new Error(
                            `Invalid self-delivery shipment: ${shipment.id}`,
                        );
                    }

                    await this.selfDeliveryFulfillmentService.prepare(
                        tenant,
                        shipment.id,
                        {
                            orderId: checkout.orderId,
                            storeId: dto.storeId,
                            sourceId: shipment.metadata.sourceId,
                            recipient: dto.recipient,
                            destination,
                            items: shipment.metadata.items.map((item) => ({
                                sku: item.sku,
                                quantity: item.quantity,
                            })),
                        },
                    );
                }
            }
            for (const shipment of selfDeliveryShipments) {
                const status =
                    await this.selfDeliveryFulfillmentService.getStatus(
                        tenant,
                        shipment.id,
                    );

                if (status === 'confirmed') {
                    continue;
                }

                if (status !== 'pending') {
                    throw new Error(
                        `Self-delivery shipment ${shipment.id} requires reconciliation. Status: ${status}`,
                    );
                }

                await this.selfDeliveryFulfillmentService.executePending(
                    tenant,
                    shipment.id,
                );
            }
            const markedProcessed =
                await this.paymentWebhookRepository.markProcessed(
                    tenant,
                    event.id,
                );

            if (!markedProcessed) {
                throw new Error(
                    'Failed to mark payment confirmation as processed',
                );
            }
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Unknown payment confirmation processing error';

            await this.paymentWebhookRepository.markFailed(
                tenant,
                event.id,
                message,
            );

            throw error;
        }
    }
}