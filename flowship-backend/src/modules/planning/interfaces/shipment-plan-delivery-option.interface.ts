import { CarrierQuoteOption } from '../../carriers/interfaces/carrier-adapter.interface';
import {
    VehiclePlan,
    VehiclePlanItem,
} from '../../checkout/capacity-planning.service'; import { QuotedShipmentPlan } from './shipment-plan-quote.interface';
export interface SelectedVehicleShipment {
    sourceId: string;
    vehicleIndex: number;
    vehicleType?: 'scooter' | 'car' | 'commercial';
    assignedWeightKg?: number;
    items?: VehiclePlanItem[];
    quote: CarrierQuoteOption;

    travelMinutes?: number;
    estimatedDeliveryAt?: string;
}
export interface SelectedGroupQuote {
    groupId: string;
    pickupCities: string[];
    destinationCity: string;
    weightKg: number;
    shipments?: SelectedVehicleShipment[];
    quote: CarrierQuoteOption;

    vehiclePlan?: {
        providerId: string;
        providerCode: string;
        plan: VehiclePlan;
    };
}

export interface ShipmentPlanDeliveryOption {
    id: string;

    planId: string;

    selectedGroupQuotes: SelectedGroupQuote[]; //איזו הצעת מחיר נבחרה לכל משלוח.

    metrics: {
        totalShippingPrice: number;
        estimatedDeliveryDays: number;
        pickupLeadTimeMinutes: number;
        estimatedDeliveryAt?: string;
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