import { Injectable } from '@nestjs/common';

import { CarriersService } from '../carriers/carriers.service';
import { CurrentTenant } from '../tenants/tenants.service';

import { ShipmentPlanCandidate } from './interfaces/shipment-plan.interface';
import {
    QuotedShipmentPlan,
    ShipmentGroupQuoteResult,
} from './interfaces/shipment-plan-quote.interface';

@Injectable()
export class ShipmentPlanQuoteService {
    constructor(
        private readonly carriersService: CarriersService,
    ) { }

    async getQuotesForPlans(
        plans: ShipmentPlanCandidate[],
        destinationCity: string,
        tenant: CurrentTenant,
    ): Promise<QuotedShipmentPlan[]> {
        return Promise.all(
            plans.map((plan) =>
                this.getQuotesForPlan(
                    plan,
                    destinationCity,
                    tenant,
                ),
            ),
        );
    }

    private async getQuotesForPlan(
        plan: ShipmentPlanCandidate,
        destinationCity: string,
        tenant: CurrentTenant,
    ): Promise<QuotedShipmentPlan> {
        const shipmentGroups =
            plan.grouping?.shipmentGroups ?? [];

        const groupQuotes = await Promise.all(
            shipmentGroups.map((group) =>
                this.getQuotesForGroup(
                    group,
                    destinationCity,
                    tenant,
                ),
            ),
        );

        const quotedGroupsCount =
            groupQuotes.filter(
                (groupQuote) =>
                    groupQuote.quotes.length > 0,
            ).length;

        const groupsWithoutQuotesCount =
            groupQuotes.filter(
                (groupQuote) =>
                    groupQuote.quotes.length === 0,
            ).length;

        const totalQuotesCount =
            groupQuotes.reduce(
                (sum, groupQuote) =>
                    sum + groupQuote.quotes.length,
                0,
            );

        let status: QuotedShipmentPlan['status'];

        if (
            groupQuotes.length > 0 &&
            groupsWithoutQuotesCount === 0
        ) {
            status = 'quoted';
        } else if (quotedGroupsCount > 0) {
            status = 'partially_quoted';
        } else {
            status = 'quote_failed';
        }

        return {
            plan,

            groupQuotes,

            quoteMetrics: {
                quotedGroupsCount,
                groupsWithoutQuotesCount,
                totalQuotesCount,
            },

            status,
        };
    }

    private async getQuotesForGroup(
        group: NonNullable<
            ShipmentPlanCandidate['grouping']
        >['shipmentGroups'][number],
        destinationCity: string,
        tenant: CurrentTenant,
    ): Promise<ShipmentGroupQuoteResult> {
        const originCity = group.source.location.city;

        const result =
            await this.carriersService.getQuotes(
                {
                    originCity,
                    destinationCity,
                    weightKg: group.totalWeight,
                },
                tenant,
            );

        return {
            groupId: group.groupId,

            originCity,
            destinationCity,
            weightKg: group.totalWeight,

            quotes: result.quotes,
            failedProviders: result.failedProviders,
        };
    }
}