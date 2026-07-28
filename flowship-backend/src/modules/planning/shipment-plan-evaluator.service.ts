import { Injectable } from '@nestjs/common';

import { ShipmentPlanCandidate } from './interfaces/shipment-plan.interface';

@Injectable()
export class ShipmentPlanEvaluatorService {
    private readonly maxEvaluatedPlans = 30;

    evaluateAndSelect(
        plans: ShipmentPlanCandidate[],
    ): ShipmentPlanCandidate[] {
        const evaluatedPlans = plans
            .filter(
                (plan) =>
                    plan.status === 'grouped' &&
                    plan.grouping !== undefined,
            )
            .map((plan) => {
                const sourceScores =
                    plan.assignments.map(
                        (assignment) =>
                            assignment.selectedSource.totalScore,
                    );

                const totalSourceScore =
                    sourceScores.reduce(
                        (total, score) => total + score,
                        0,
                    );

                const averageSourceScore =
                    sourceScores.length > 0
                        ? totalSourceScore /
                        sourceScores.length
                        : 0;

                return {
                    ...plan,

                    status: 'evaluated' as const,

                    metrics: {
                        shipmentCount:
                            plan.grouping!.totalGroups,

                        totalSourceScore: Number(
                            totalSourceScore.toFixed(3),
                        ),

                        averageSourceScore: Number(
                            averageSourceScore.toFixed(3),
                        ),
                    },
                };
            });

        /*
         * זהו מיון מקדים בלבד:
         *
         * 1. פחות משלוחים עדיף.
         * 2. במקרה של שוויון — ציון מקורות גבוה יותר עדיף.
         *
         * הדירוג הסופי יתבצע רק לאחר קבלת Quotes.
         */
        evaluatedPlans.sort((a, b) => {
            const shipmentCountDifference =
                a.metrics!.shipmentCount -
                b.metrics!.shipmentCount;

            if (shipmentCountDifference !== 0) {
                return shipmentCountDifference;
            }

            return (
                b.metrics!.averageSourceScore -
                a.metrics!.averageSourceScore
            );
        });

        return evaluatedPlans.slice(
            0,
            this.maxEvaluatedPlans,
        );
    }
}