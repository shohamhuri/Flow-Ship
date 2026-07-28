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
        const basePrice = request.weightKg <= 5 ? 25 : 40;

        return [
            {
                carrierName: 'Mock Express',
                serviceName: 'Budget Delivery',
                price: 15,
                currency: 'ILS',
                estimatedDays: 7,
            },

            // {
            //     carrierName: 'Mock Express',
            //         serviceName: 'Fast Delivery',
            //             price: basePrice + 20,
            //                 currency: 'ILS',
            //                     estimatedDays: 1,
            //     },
        ];
    }
}