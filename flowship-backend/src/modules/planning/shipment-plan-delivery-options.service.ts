import { Injectable } from '@nestjs/common';

import { QuotedShipmentPlan } from './interfaces/shipment-plan-quote.interface';
import {
    SelectedGroupQuote,
    ShipmentPlanDeliveryOption,
    ShipmentPlanDeliveryOptionsResult,
} from './interfaces/shipment-plan-delivery-option.interface';

@Injectable()
export class ShipmentPlanDeliveryOptionsService {
    private readonly maxOptionsPerPlan = 100;

    generateForPlans(
        quotedPlans: QuotedShipmentPlan[],
    ): ShipmentPlanDeliveryOptionsResult[] {
        return quotedPlans.map((quotedPlan) =>
            this.generateForPlan(quotedPlan),
        );
    }

    private generateForPlan(
        quotedPlan: QuotedShipmentPlan,
    ): ShipmentPlanDeliveryOptionsResult {
        const quotableGroups =
            quotedPlan.groupQuotes.filter(
                (groupQuote) =>
                    groupQuote.quotes.length > 0,
            );

        if (
            quotableGroups.length === 0 ||
            quotableGroups.length !==
            quotedPlan.groupQuotes.length
        ) {
            return {
                quotedPlan,
                deliveryOptions: [],
                statistics: {
                    theoreticalCombinations: 0,
                    generatedCombinations: 0,
                    generationLimitReached: false,
                },
            };
        }

        const theoreticalCombinations =
            quotableGroups.reduce(
                (total, groupQuote) =>
                    total * groupQuote.quotes.length,
                1,
            );

        const combinations: SelectedGroupQuote[][] = [];

        this.buildCombinations(
            quotableGroups,
            0,
            [],
            combinations,
        );

        const deliveryOptions =
            combinations.map(
                (combination, index) =>
                    this.buildDeliveryOption(
                        quotedPlan,
                        combination,
                        index,
                    ),
            );

        return {
            quotedPlan,

            deliveryOptions,

            statistics: {
                theoreticalCombinations,
                generatedCombinations:
                    deliveryOptions.length,
                generationLimitReached:
                    theoreticalCombinations >
                    this.maxOptionsPerPlan,
            },
        };
    }

    private buildCombinations(
        groupQuotes: QuotedShipmentPlan['groupQuotes'],
        groupIndex: number,
        currentCombination: SelectedGroupQuote[],
        results: SelectedGroupQuote[][],
    ): void {
        if (
            results.length >=
            this.maxOptionsPerPlan
        ) {
            return;
        }

        if (
            groupIndex >= groupQuotes.length
        ) {
            results.push([
                ...currentCombination,
            ]);

            return;
        }

        const currentGroup =
            groupQuotes[groupIndex];

        for (const quote of currentGroup.quotes) {
            currentCombination.push({
                groupId: currentGroup.groupId,
                pickupCities:
                    currentGroup.pickupCities,
                destinationCity:
                    currentGroup.destinationCity,
                weightKg:
                    currentGroup.weightKg,
                quote,
            });

            this.buildCombinations(
                groupQuotes,
                groupIndex + 1,
                currentCombination,
                results,
            );

            currentCombination.pop();

            if (
                results.length >=
                this.maxOptionsPerPlan
            ) {
                break;
            }
        }
    }

    private buildDeliveryOption(
        quotedPlan: QuotedShipmentPlan,
        selectedGroupQuotes: SelectedGroupQuote[],
        index: number,
    ): ShipmentPlanDeliveryOption {
        const totalShippingPrice =
            selectedGroupQuotes.reduce(
                (sum, selected) =>
                    sum + selected.quote.price,
                0,
            );

        const estimatedDeliveryDays =
            selectedGroupQuotes.reduce(
                (maximumDays, selected) =>
                    Math.max(
                        maximumDays,
                        selected.quote
                            .estimatedDays,
                    ),
                0,
            );

        const totalProviderPriority =
            selectedGroupQuotes.reduce(
                (sum, selected) =>
                    sum +
                    (selected.quote.providerPriority ?? 0),
                0,
            );
        const averageProviderPriority =
            selectedGroupQuotes.length > 0
                ? totalProviderPriority /
                selectedGroupQuotes.length
                : 0;

        return {
            id: `${quotedPlan.plan.id}-delivery-${index + 1}`,

            planId: quotedPlan.plan.id,

            selectedGroupQuotes,

            metrics: {
                totalShippingPrice,
                estimatedDeliveryDays,
                averageProviderPriority,
                shipmentCount:
                    selectedGroupQuotes.length,
            },
        };
    }
}