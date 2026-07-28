import { CarrierQuoteOption } from '../../carriers/interfaces/carrier-adapter.interface';
import { QuotedShipmentPlan } from './shipment-plan-quote.interface';

export interface SelectedGroupQuote {
    groupId: string;
    originCity: string;
    destinationCity: string;
    weightKg: number;
    quote: CarrierQuoteOption;
}

export interface ShipmentPlanDeliveryOption {
    id: string;

    planId: string;

    selectedGroupQuotes: SelectedGroupQuote[]; //איזו הצעת מחיר נבחרה לכל משלוח.

    metrics: {
        totalShippingPrice: number; //סכום המחירים של כל המשלוחים.
        estimatedDeliveryDays: number;//מספר הימים עד שכל ההזמנה תגיע.
        averageProviderPriority: number;
        shipmentCount: number;
    };
}

export interface ShipmentPlanDeliveryOptionsResult {
    quotedPlan: QuotedShipmentPlan;

    deliveryOptions: ShipmentPlanDeliveryOption[];

    statistics: {
        theoreticalCombinations: number;
        generatedCombinations: number;
        generationLimitReached: boolean;
    };
}