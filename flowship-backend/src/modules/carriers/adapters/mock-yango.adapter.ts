import { Injectable } from '@nestjs/common';
import { CarrierCode } from '../enums/carrier-code.enum';
import {
    CarrierAdapter,
    CarrierQuoteOption,
    CarrierQuoteRequest,
} from '../interfaces/carrier-adapter.interface';

@Injectable()
export class MockYangoAdapter implements CarrierAdapter {
    code = CarrierCode.MOCK_YANGO;

    async getQuote(
        request: CarrierQuoteRequest,
    ): Promise<CarrierQuoteOption[]> {
        const basePrice = request.weightKg <= 5 ? 32 : 52;

        return [
            {
                carrierName: 'Mock Yango',
                serviceName: 'Yango Same Day',
                price: basePrice,
                currency: 'ILS',
                estimatedDays: 0,
            },
            {
                carrierName: 'Mock Yango',
                serviceName: 'Yango Express',
                price: basePrice + 18,
                currency: 'ILS',
                estimatedDays: 1,
            },
        ];
    }
}