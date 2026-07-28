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
        return [
            {
                carrierName: 'Mock Yango',
                serviceName: 'Yango Same Day',
                price: 150,
                currency: 'ILS',
                estimatedDays: 0,
            },
        ];
    }
}