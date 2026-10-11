import { Injectable } from '@nestjs/common';
import { CarrierCode } from '../enums/carrier-code.enum';
import {
    CarrierAdapter,
    CarrierQuoteOption,
    CarrierQuoteRequest,
} from '../interfaces/carrier-adapter.interface';

@Injectable()
export class MockCarrierAdapter implements CarrierAdapter {
    code = CarrierCode.MOCK;

    async getQuote(
        request: CarrierQuoteRequest,
    ): Promise<CarrierQuoteOption[]> {
        return [
            {
                carrierName: 'Mock Express',
                serviceName: 'Budget Delivery',
                price: 15,
                currency: 'ILS',
                estimatedDays: 7,
                urgency: 'standard',
            },
        ];
    }
}