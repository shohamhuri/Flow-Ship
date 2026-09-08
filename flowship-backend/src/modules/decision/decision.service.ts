import { Injectable } from '@nestjs/common';
import { DbService } from '../../infrastructure/database/db.service';
import { CarrierQuoteOption } from '../carriers/interfaces/carrier-adapter.interface';
import {
    ShipmentPlanDeliveryOption,
} from '../planning/interfaces/shipment-plan-delivery-option.interface';
export type DecisionCriterionKey =
    | 'price'
    | 'speed'
    | 'provider_priority'
    | 'shipment_count';
export type DecisionCriterion = {
    key: DecisionCriterionKey;
    label: string;
    weight: number;
    isActive: boolean;
};
export type DecisionSettings = {
    priceWeight: number;
    speedWeight: number;
    providerPriorityWeight: number;
};
export type ScoredQuote = CarrierQuoteOption & {
    score: number;
    scoreBreakdown: {
        priceScore?: number;
        speedScore?: number;
        providerPriorityScore?: number;
    };
};
export type DecisionPriorityCard = {
    id: string;
    providerId: string | null;
    criterionKey: DecisionCriterionKey;
    priorityRank: number;
    isActive: boolean;
    config: Record<string, unknown>;
};

type DecisionPriorityCardRow = {
    id: string;
    provider_id: string | null;
    criterion_key: string;
    priority_rank: number;
    is_active: boolean;
    config: Record<string, unknown> | null;
};

export type WeightedDecisionPriorityCard =
    DecisionPriorityCard & {
        weight: number;
    };
export type DeliveryOptionMetrics = {
    totalShippingPrice: number;
    estimatedDeliveryDays: number;
    averageProviderPriority: number;
    shipmentCount: number;
};

export type DeliveryOptionQuoteSelection = {
    groupId: string;
    quote: CarrierQuoteOption;
};

export type DeliveryOptionCandidate = {
    id: string;
    planId: string;
    selectedGroupQuotes: DeliveryOptionQuoteSelection[];
    metrics: DeliveryOptionMetrics;
};

export type ScoredDeliveryOption =
    DeliveryOptionCandidate & {
        score: number;
        scoreBreakdown: {
            priceScore: number;
            speedScore: number;
            providerPriorityScore: number;
            shipmentCountScore: number;
            cardScores: {
                cardId: string;
                criterionKey: DecisionCriterionKey;
                providerId: string | null;
                rawScore: number;
                weight: number;
                weightedScore: number;
                applied: boolean;
            }[];
        };
    };
type TenantContext = {
    id: string;
    name: string;
    schemaName: string;
    status: string;
};

type DecisionCriterionRow = {
    key: string;
    label: string;
    weight: string | number;
    is_active: boolean;
};
export type ScoredShipmentPlanDeliveryOption =
    ShipmentPlanDeliveryOption & {
        score: number;

        scoreBreakdown: {
            priceScore: number;
            speedScore: number;
            providerPriorityScore: number;
            shipmentCountScore: number;

            cardScores: {
                cardId: string;
                criterionKey: DecisionCriterionKey;
                providerId: string | null;
                rawScore: number;
                weight: number;
                weightedScore: number;
                applied: boolean;
            }[];
        };
    };
@Injectable()
export class DecisionService {
    constructor(private readonly db: DbService

    ) { }

    async getCriteriaForTenant(
        tenant: TenantContext,
    ): Promise<DecisionCriterion[]> {
        const schemaName = this.safeSchemaName(tenant.schemaName);

        const rows = await this.db.query<DecisionCriterionRow>(
            `
      select
        key,
        label,
        weight,
        is_active
      from ${schemaName}.decision_criteria
      where is_active = true
      order by created_at asc
      `,
        );

        if (!rows.length) {
            return [
                {
                    key: 'price',
                    label: 'מחיר',
                    weight: 0.6,
                    isActive: true,
                },
                {
                    key: 'speed',
                    label: 'מהירות',
                    weight: 0.3,
                    isActive: true,
                },
                {
                    key: 'provider_priority',
                    label: 'עדיפות ספק',
                    weight: 0.1,
                    isActive: true,
                },
            ];
        }

        return rows
            .filter((row) => this.isSupportedCriterion(row.key))
            .map((row) => ({
                key: row.key as DecisionCriterionKey,
                label: row.label,
                weight: Number(row.weight),
                isActive: row.is_active,
            }));
    }

    selectBestQuote(
        quotes: CarrierQuoteOption[],
        settings: DecisionSettings,
    ): ScoredQuote | null {
        if (quotes.length === 0) {
            return null;
        }

        const prices =
            quotes.map((quote) => quote.price);

        const estimatedDays =
            quotes.map(
                (quote) => quote.estimatedDays,
            );

        const minPrice =
            Math.min(...prices);

        const maxPrice =
            Math.max(...prices);

        const minDays =
            Math.min(...estimatedDays);

        const maxDays =
            Math.max(...estimatedDays);

        const scoredQuotes =
            quotes.map((quote) => {
                const priceScore =
                    this.calculateInverseScore(
                        quote.price,
                        minPrice,
                        maxPrice,
                    );

                const speedScore =
                    this.calculateInverseScore(
                        quote.estimatedDays,
                        minDays,
                        maxDays,
                    );

                const providerPriorityScore =
                    quote.providerPriority ?? 0.5;

                const score =
                    priceScore *
                    settings.priceWeight +
                    speedScore *
                    settings.speedWeight +
                    providerPriorityScore *
                    settings.providerPriorityWeight;

                return {
                    ...quote,

                    score:
                        Number(
                            score.toFixed(4),
                        ),

                    scoreBreakdown: {
                        priceScore:
                            Number(
                                priceScore.toFixed(4),
                            ),

                        speedScore:
                            Number(
                                speedScore.toFixed(4),
                            ),

                        providerPriorityScore:
                            Number(
                                providerPriorityScore
                                    .toFixed(4),
                            ),
                    },
                };
            });

        return scoredQuotes.sort(
            (a, b) =>
                b.score - a.score,
        )[0];
    }
    selectBestDeliveryOption(
        options: ShipmentPlanDeliveryOption[],
        cards: WeightedDecisionPriorityCard[],
    ): ScoredShipmentPlanDeliveryOption | null {
        if (options.length === 0) {
            return null;
        }

        const prices = options.map(
            (option) =>
                option.metrics.totalShippingPrice,
        );

        const deliveryDays = options.map(
            (option) =>
                option.metrics.estimatedDeliveryDays,
        );

        const shipmentCounts = options.map(
            (option) =>
                option.metrics.shipmentCount,
        );

        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        const minDays = Math.min(...deliveryDays);
        const maxDays = Math.max(...deliveryDays);

        const minShipmentCount =
            Math.min(...shipmentCounts);

        const maxShipmentCount =
            Math.max(...shipmentCounts);
        console.log('Prices:', prices);
        console.log('Min:', minPrice);
        console.log('Max:', maxPrice);
        const scoredOptions:
            ScoredShipmentPlanDeliveryOption[] =
            options.map((option) => {
                const priceScore =
                    this.calculateInverseScore(
                        option.metrics.totalShippingPrice,
                        minPrice,
                        maxPrice,
                    );

                const speedScore =
                    this.calculateInverseScore(
                        option.metrics
                            .estimatedDeliveryDays,
                        minDays,
                        maxDays,
                    );

                const shipmentCountScore =
                    this.calculateInverseScore(
                        option.metrics.shipmentCount,
                        minShipmentCount,
                        maxShipmentCount,
                    );

                const providerPriorityScore =
                    option.metrics
                        .averageProviderPriority;

                let totalScore = 0;

                const cardScores = cards.map(
                    (card) => {
                        const applied =
                            card.providerId === null ||
                            this.optionUsesProvider(
                                option,
                                card.providerId,
                            );

                        if (!applied) {
                            return {
                                cardId: card.id,
                                criterionKey:
                                    card.criterionKey,
                                providerId:
                                    card.providerId,
                                rawScore: 0,
                                weight: card.weight,
                                weightedScore: 0,
                                applied: false,
                            };
                        }

                        const rawScore =
                            this.getCriterionScore(
                                card.criterionKey,
                                {
                                    priceScore,
                                    speedScore,
                                    providerPriorityScore,
                                    shipmentCountScore,
                                },
                            );

                        const weightedScore =
                            rawScore * card.weight;

                        totalScore += weightedScore;

                        return {
                            cardId: card.id,
                            criterionKey:
                                card.criterionKey,
                            providerId:
                                card.providerId,
                            rawScore: Number(
                                rawScore.toFixed(4),
                            ),
                            weight: card.weight,
                            weightedScore: Number(
                                weightedScore.toFixed(4),
                            ),
                            applied: true,
                        };
                    },
                );

                return {
                    ...option,

                    score: Number(
                        totalScore.toFixed(4),
                    ),

                    scoreBreakdown: {
                        priceScore: Number(
                            priceScore.toFixed(4),
                        ),

                        speedScore: Number(
                            speedScore.toFixed(4),
                        ),

                        providerPriorityScore: Number(
                            providerPriorityScore
                                .toFixed(4),
                        ),

                        shipmentCountScore: Number(
                            shipmentCountScore
                                .toFixed(4),
                        ),

                        cardScores,
                    },
                };
            });

        return scoredOptions.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }

            if (
                a.metrics.totalShippingPrice !==
                b.metrics.totalShippingPrice
            ) {
                return (
                    a.metrics.totalShippingPrice -
                    b.metrics.totalShippingPrice
                );
            }

            return (
                a.metrics.shipmentCount -
                b.metrics.shipmentCount
            );
        })[0];
    }

    private calculateInverseScore(
        value: number,
        min: number,
        max: number,
    ): number {
        if (max === min) {
            return 1;
        }

        return (max - value) / (max - min);
    }

    private isSupportedCriterion(key: string): boolean {
        return [
            'price',
            'speed',
            'provider_priority',
            'shipment_count',
        ].includes(key);
    }

    private safeSchemaName(schemaName: string): string {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
            throw new Error(`Invalid schema name: ${schemaName}`);
        }

        return `"${schemaName}"`;
    }
    async getActivePriorityCards(
        tenant: TenantContext,
    ): Promise<WeightedDecisionPriorityCard[]> {
        const schemaName = this.safeSchemaName(tenant.schemaName);

        const rows = await this.db.query<DecisionPriorityCardRow>(
            `
        select
            id,
            provider_id,
            criterion_key,
            priority_rank,
            is_active,
            config
        from ${schemaName}.decision_priority_cards
        where is_active = true
        order by priority_rank asc, created_at asc
        `,
        );

        const supportedCards = rows.filter((row) =>
            this.isSupportedCriterion(row.criterion_key),
        );

        const totalCards = supportedCards.length;

        if (totalCards === 0) {
            return [];
        }

        /*
         * אם יש 4 קוביות:
         * מקום 1 מקבל 4 נקודות
         * מקום 2 מקבל 3 נקודות
         * מקום 3 מקבל 2 נקודות
         * מקום 4 מקבל נקודה אחת
         */
        const rankSum = (totalCards * (totalCards + 1)) / 2;

        return supportedCards.map((row, index) => {
            const rankValue = totalCards - index;
            const weight = rankValue / rankSum;

            return {
                id: row.id,
                providerId: row.provider_id,
                criterionKey:
                    row.criterion_key as DecisionCriterionKey,
                priorityRank: row.priority_rank,
                isActive: row.is_active,
                config: row.config ?? {},
                weight: Number(weight.toFixed(4)),
            };
        });
    }

    private getCriterionScore(
        criterionKey: DecisionCriterionKey,
        scores: {
            priceScore: number;
            speedScore: number;
            providerPriorityScore: number;
            shipmentCountScore: number;
        },
    ): number {
        switch (criterionKey) {
            case 'price':
                return scores.priceScore;

            case 'speed':
                return scores.speedScore;

            case 'provider_priority':
                return scores.providerPriorityScore;

            case 'shipment_count':
                return scores.shipmentCountScore;

            default:
                return 0;
        }
    }
    private optionUsesProvider(
        option: DeliveryOptionCandidate,
        providerId: string,
    ): boolean {
        return option.selectedGroupQuotes.some(
            (selected) =>
                selected.quote.providerId === providerId,
        );
    }
    async saveShipmentDecision(
        tenant: { schemaName: string },
        checkoutId: string,
        orderId: string,
        winner: ScoredShipmentPlanDeliveryOption,
        priorityCards: WeightedDecisionPriorityCard[],
        evaluatedOptionsCount: number,
    ): Promise<void> {
        const schemaName = tenant.schemaName;

        const sql = `
       insert into ${schemaName}.shipment_decisions (
    checkout_id,
    order_id,
    selected_plan_id,
    selected_delivery_option_id,
    score,
    evaluated_options_count,
    winner_snapshot,
    priority_cards_snapshot
)
values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
on conflict (checkout_id)        do update set
            selected_plan_id = excluded.selected_plan_id,
            selected_delivery_option_id = excluded.selected_delivery_option_id,
            score = excluded.score,
            evaluated_options_count = excluded.evaluated_options_count,
            winner_snapshot = excluded.winner_snapshot,
            priority_cards_snapshot = excluded.priority_cards_snapshot,
            updated_at = now()
    `;

        await this.db.query(sql,
            [
                checkoutId,
                orderId,
                winner.planId,
                winner.id,
                winner.score,
                evaluatedOptionsCount,
                JSON.stringify(winner),
                JSON.stringify(priorityCards),
            ]

        );
    }
    async getDecisionSettings(
        tenant: TenantContext,
    ): Promise<DecisionSettings> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        const rows = await this.db.query<{
            price_weight: string | number;
            speed_weight: string | number;
            provider_priority_weight: string | number;
        }>(
            `
        select
            price_weight,
            speed_weight,
            provider_priority_weight
        from ${schemaName}.decision_settings
        where is_active = true
        order by created_at desc
        limit 1
        `,
        );

        const row = rows[0];

        if (!row) {
            return {
                priceWeight: 0.6,
                speedWeight: 0.3,
                providerPriorityWeight: 0.1,
            };
        }

        return {
            priceWeight:
                Number(row.price_weight),

            speedWeight:
                Number(row.speed_weight),

            providerPriorityWeight:
                Number(row.provider_priority_weight),
        };
    }
}