import { Injectable } from '@nestjs/common';

import { CarriersService } from '../carriers/carriers.service';
import { CurrentTenant } from '../tenants/tenants.service';

import { ShipmentPlanCandidate } from './interfaces/shipment-plan.interface';
import {
    QuotedShipmentPlan,
    ShipmentGroupQuoteResult,
} from './interfaces/shipment-plan-quote.interface';
import { CheckoutDestination } from '../checkout/interfaces/checkout.interface';
@Injectable()
export class ShipmentPlanQuoteService {
    constructor(
        private readonly carriersService: CarriersService,
    ) { }

    async getQuotesForPlans(
        plans: ShipmentPlanCandidate[],
        destination: CheckoutDestination, tenant: CurrentTenant,
    ): Promise<QuotedShipmentPlan[]> {
        return Promise.all(
            plans.map((plan) =>
                this.getQuotesForPlan(
                    plan,
                    destination,
                    tenant,
                ),
            ),
        );
    }

    private async getQuotesForPlan(
        plan: ShipmentPlanCandidate,
        destination: CheckoutDestination, tenant: CurrentTenant,
    ): Promise<QuotedShipmentPlan> {
        const shipmentGroups =
            plan.grouping?.shipmentGroups ?? [];

        const groupQuotes = await Promise.all(
            shipmentGroups.map((group) =>
                this.getQuotesForGroup(
                    group,
                    destination,
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
        destination: CheckoutDestination, tenant: CurrentTenant,
    ): Promise<ShipmentGroupQuoteResult> {
        if (group.sources.length === 0) {
            throw new Error(
                `Shipment group ${group.groupId} has no supply sources`,
            );
        }

        const pickupCities =
            group.sources.map(
                (source) =>
                    source.location.city,
            );
        const pickupAddress =
            group.sources
                .map(
                    (source) =>
                        `${source.location.street} ${source.location.houseNumber}, ${source.location.city}`,
                )
                .join(' | ');

        const destinationAddress =
            `${destination.street} ${destination.houseNumber}, ${destination.city}`;
        const result =
            await this.carriersService.getQuotes(
                {
                    pickupCities,
                    destinationCity: destination.city,
                    weightKg: group.totalWeight,
                    pickupAddress,
                    destinationAddress,
                },
                tenant,
            );

        return {
            groupId: group.groupId,

            pickupCities,
            destinationCity: destination.city,
            weightKg: group.totalWeight,

            quotes: result.quotes,
            failedProviders: result.failedProviders,
        };
    }
}