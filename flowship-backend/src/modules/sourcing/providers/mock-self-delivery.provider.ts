import { Injectable } from '@nestjs/common';

import {
    SelfDeliveryProvider,
    SelfDeliveryQuoteRequest,
    SelfDeliveryQuoteResponse,
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
}