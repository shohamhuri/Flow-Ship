// src/modules/carriers/interfaces/carrier-adapter.interface.ts

import { CarrierCode } from '../enums/carrier-code.enum';

export interface CarrierQuoteRequest {
    pickupCities: string[];
    destinationCity: string;
    weightKg: number;

    pickupAddress?: string;
    destinationAddress?: string;

    vehicleType?: 'scooter' | 'car' | 'commercial';
    urgency?: 'urgent' | 'express' | 'standard';
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

export interface CarrierAdapterConfig {
    settings?: Record<string, unknown> | null;
}

export interface CarrierAdapter {
    code: CarrierCode;

    getQuote(
        request: CarrierQuoteRequest,
        config?: CarrierAdapterConfig,
    ): Promise<CarrierQuoteOption[]>;
}