import { CarrierQuoteOption } from '../../carriers/interfaces/carrier-adapter.interface';
import { ProviderCapacityPlanningTrace, VehiclePlan } from '../../checkout/capacity-planning.service';
import { ShipmentPlanCandidate } from './shipment-plan.interface';
export interface VehicleQuoteResult {
    vehicleType:
    | 'scooter'
    | 'car'
    | 'commercial';

    assignedWeightKg: number;

    quotes: CarrierQuoteOption[];

    failedProviders: FailedCarrierQuoteProvider[];
}
export interface FailedCarrierQuoteProvider {
    providerCode: string;
    providerName: string;
    adapterKey: string;
    error: string;
}
export interface ProviderVehiclePlanQuoteResult {
    providerId: string;
    providerCode: string;
    plan: VehiclePlan;

    vehicleQuotes: VehicleQuoteResult[];
    alternatives?: VehiclePlanQuoteAlternative[];

}
export interface ShipmentGroupQuoteResult {
    groupId: string;

    vehiclePlans?: ProviderVehiclePlanQuoteResult[];

    capacityPlanningTrace?:
    ProviderCapacityPlanningTrace[];

    pickupCities: string[];
    destinationCity: string;
    weightKg: number;

    quotes: CarrierQuoteOption[];

    failedProviders: unknown[];

    vehicleQuotes?: VehicleQuoteResult[];
}
export interface VehiclePlanQuoteAlternative {
    urgency:
    | 'urgent'
    | 'express'
    | 'standard';

    totalPrice: number;
    currency: 'ILS';

    vehicleCount: number;
    estimatedDays: number;
    providerPriority?: number;
}
export interface QuotedShipmentPlan {
    plan: ShipmentPlanCandidate;

    groupQuotes: ShipmentGroupQuoteResult[];

    quoteMetrics: {
        quotedGroupsCount: number;
        groupsWithoutQuotesCount: number;
        totalQuotesCount: number;
    };

    status:
    | 'quoted'
    | 'partially_quoted'
    | 'quote_failed';
}