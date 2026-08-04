import { CarrierQuoteOption } from '../../carriers/interfaces/carrier-adapter.interface';
import { ShipmentPlanCandidate } from './shipment-plan.interface';

export interface ShipmentGroupQuoteResult {
    groupId: string;

    originCity: string;
    destinationCity: string;
    weightKg: number;

    quotes: CarrierQuoteOption[];

    failedProviders: unknown[];
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