// src/modules/carriers/interfaces/carrier-adapter.interface.ts

import { CarrierCode } from '../enums/carrier-code.enum';
export interface CarrierPickupSource {
    sourceId: string;
    address: string;
    readyAt: string;
}
export interface CarrierQuoteRequest {
    pickupCities: string[];
    destinationCity: string;
    weightKg: number;

    pickupAddress?: string;
    destinationAddress?: string;

    vehicleType?: 'scooter' | 'car' | 'commercial';
    urgency?: 'urgent' | 'express' | 'standard';
    /**
 * סוגי המשלוח שמותר לבקש עבור הקבוצה,
 * לאחר בדיקות זמני ההכנה והנסיעה.
 *
 * urgent  = משלוח מהיר
 * express = מהיום להיום
 * standard = משלוח רגיל
 */
    allowedUrgencies?: Array<
        'urgent' | 'express' | 'standard'
    >;

    /**
 * המועד המוקדם ביותר שבו כל המשלוח
 * יהיה מוכן לאיסוף.
 * ISO 8601
 */
    readyAt?: string;

    /**
     * פרטי מוכנות לאיסוף עבור כל מקור בנפרד.
     */
    pickupSources?: CarrierPickupSource[];
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
    urgency?: 'urgent' | 'express' | 'standard';
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