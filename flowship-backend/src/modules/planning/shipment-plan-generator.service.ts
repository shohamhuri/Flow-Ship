import { Injectable } from '@nestjs/common';

import { ItemSourcingResult } from '../sourcing/interfaces/source-ranking.interface';

import {
    ItemSourceAssignment,
    ShipmentPlanCandidate,
    ShipmentPlanGenerationResult,
} from './interfaces/shipment-plan.interface';

@Injectable()
export class ShipmentPlanGeneratorService {
    /**
     * מספר מקורות האספקה המרבי שנבחן לכל פריט.
     *
     * possibleSources כבר ממוינים ב-SourcingService
     * מהציון הגבוה לנמוך, ולכן נלקחים המקורות המדורגים ביותר.
     */
    private readonly maxSourcesPerItem = 3;

    /**
     * מספר התוכניות המרבי שנייצר עבור Checkout אחד.
     */
    private readonly maxGeneratedPlans = 100;

    generatePlans(
        sourcingResults: ItemSourcingResult[],
    ): ShipmentPlanGenerationResult {
        const unresolvedItems = sourcingResults
            .map((result, itemIndex) => ({
                itemIndex,
                sku: result.sku,
                requestedQuantity:
                    result.requestedQuantity,
                hasPossibleSources:
                    result.possibleSources.length > 0,
            }))
            .filter((item) => !item.hasPossibleSources)
            .map(
                ({
                    itemIndex,
                    sku,
                    requestedQuantity,
                }) => ({
                    itemIndex,
                    sku,
                    requestedQuantity,
                }),
            );

        /*
         * אם אפילו לפריט אחד אין מקור אספקה,
         * אי אפשר ליצור תוכנית מלאה וחוקית להזמנה.
         */
        if (unresolvedItems.length > 0) {
            return {
                plans: [],
                unresolvedItems,
                statistics: {
                    inputItemsCount:
                        sourcingResults.length,
                    theoreticalCombinations: 0,
                    generatedPlansCount: 0,
                    generationLimitReached: false,
                },
            };
        }

        const sourceOptionsPerItem =
            sourcingResults.map(
                (result, itemIndex) => ({
                    itemIndex,
                    sku: result.sku,
                    requestedQuantity:
                        result.requestedQuantity,

                    /*
                     * possibleSources כבר ממוינים לפי totalScore.
                     * לכן slice משאיר את המקורות המועדפים.
                     */
                    possibleSources:
                        result.possibleSources.slice(
                            0,
                            this.maxSourcesPerItem,
                        ),
                }),
            );

        const theoreticalCombinations =
            sourceOptionsPerItem.reduce(
                (total, item) =>
                    total *
                    item.possibleSources.length,
                1,
            );

        const plans: ShipmentPlanCandidate[] = [];

        this.buildCombinations(
            sourceOptionsPerItem,
            0,
            [],
            plans,
        );

        return {
            plans,
            unresolvedItems: [],
            statistics: {
                inputItemsCount:
                    sourcingResults.length,
                theoreticalCombinations,
                generatedPlansCount: plans.length,
                generationLimitReached:
                    theoreticalCombinations >
                    plans.length,
            },
        };
    }

    private buildCombinations(
        sourceOptionsPerItem: Array<{
            itemIndex: number;
            sku: string;
            requestedQuantity: number;
            possibleSources: ItemSourcingResult['possibleSources'];
        }>,
        currentItemIndex: number,
        currentAssignments: ItemSourceAssignment[],
        plans: ShipmentPlanCandidate[],
    ): void {
        /*
         * הגנת maxGeneratedPlans:
         * מפסיקים את הרקורסיה מיד לאחר שהגענו למכסה.
         */
        if (
            plans.length >=
            this.maxGeneratedPlans
        ) {
            return;
        }

        /*
         * אם שובצו מקורות לכל הפריטים,
         * נוצרה תוכנית מועמדת מלאה.
         */
        if (
            currentItemIndex ===
            sourceOptionsPerItem.length
        ) {
            plans.push({
                id: `plan-${plans.length + 1}`,
                assignments: [
                    ...currentAssignments,
                ],
                status: 'generated',
            });

            return;
        }

        const currentItem =
            sourceOptionsPerItem[
            currentItemIndex
            ];

        for (const source of currentItem.possibleSources) {
            if (
                plans.length >=
                this.maxGeneratedPlans
            ) {
                break;
            }

            const assignment: ItemSourceAssignment =
            {
                itemIndex:
                    currentItem.itemIndex,
                sku: currentItem.sku,
                requestedQuantity:
                    currentItem.requestedQuantity,
                selectedSource: source,
            };

            currentAssignments.push(assignment);

            this.buildCombinations(
                sourceOptionsPerItem,
                currentItemIndex + 1,
                currentAssignments,
                plans,
            );

            /*
             * Backtracking:
             * מסירים את השיבוץ האחרון לפני שבוחנים
             * מקור אחר עבור אותו פריט.
             */
            currentAssignments.pop();
        }
    }
}