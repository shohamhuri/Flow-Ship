import { Injectable } from '@nestjs/common';

import {
    SelfDeliveryProvider,
    SelfDeliveryQuoteRequest,
    SelfDeliveryQuoteResponse,
    SelfDeliveryCreateRequest,
    SelfDeliveryCreateResponse,
    SelfDeliveryProviderError
} from '../interfaces/self-delivery-provider.interface';

@Injectable()
export class MockSelfDeliveryProvider
    implements SelfDeliveryProvider {

    async getQuote(
        request: SelfDeliveryQuoteRequest,
    ): Promise<SelfDeliveryQuoteResponse> {

        const estimatedDeliveryAt = new Date(
            Date.now() + 2 * 60 * 60 * 1000,
        ).toISOString();

        return {
            sourceId: request.sourceId,
            accepted: true,
            price: 25,
            currency: 'ILS',
            estimatedDeliveryAt,
        };
    }
    private readonly deliveryOrders = new Map<
        string,
        {
            fingerprint: string;
            response: SelfDeliveryCreateResponse;
        }
    >();

    async createDelivery(
        request: SelfDeliveryCreateRequest,
    ): Promise<SelfDeliveryCreateResponse> {
        if (
            !request.requestId ||
            !request.orderId ||
            !request.storeId ||
            !request.sourceId ||
            !request.recipient?.name ||
            !request.recipient?.phone ||
            !request.items?.length
        ) {
            throw new SelfDeliveryProviderError(
                'INVALID_REQUEST',
                'Invalid self-delivery request',
                false,
            );
        }

        const fingerprint = JSON.stringify({
            orderId: request.orderId,
            storeId: request.storeId,
            sourceId: request.sourceId,
            recipient: request.recipient,
            destination: request.destination,
            items: request.items,
        });

        const existing = this.deliveryOrders.get(request.requestId);

        if (existing) {
            if (existing.fingerprint !== fingerprint) {
                throw new Error(
                    'Self-delivery requestId reused with different content',
                );
            }

            return existing.response;
        }

        const response: SelfDeliveryCreateResponse = {
            sourceId: request.sourceId,
            requestId: request.requestId,
            sourceOrderId: `MOCK-SD-${request.requestId}`,
            status: 'confirmed',
        };

        this.deliveryOrders.set(request.requestId, {
            fingerprint,
            response,
        });

        return response;
    }
}