// src/modules/carriers/interfaces/carrier-adapter.interface.ts

import { CarrierCode } from '../enums/carrier-code.enum';

export interface CarrierQuoteRequest {
    pickupCities: string[];
    destinationCity: string;
    weightKg: number;
}

export interface CarrierQuoteOption {
    carrierName: string;
    serviceName: string;
    price: number;
    currency: 'ILS';
    estimatedDays: number;
    providerPriority?: number;
    providerId?: string;
    providerCode?: string;
    adapterKey?: string;
}

export interface CarrierAdapter {
    code: CarrierCode;

    getQuote(request: CarrierQuoteRequest): Promise<CarrierQuoteOption[]>;
}