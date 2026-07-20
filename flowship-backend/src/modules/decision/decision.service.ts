import { Injectable } from '@nestjs/common';
import { DbService } from '../../infrastructure/database/db.service';
import { CarrierQuoteOption } from '../carriers/interfaces/carrier-adapter.interface';

export type DecisionCriterionKey =
    | 'price'
    | 'speed'
    | 'provider_priority';

export type DecisionCriterion = {
    key: DecisionCriterionKey;
    label: string;
    weight: number;
    isActive: boolean;
};

export type ScoredQuote = CarrierQuoteOption & {
    score: number;
    scoreBreakdown: {
        priceScore?: number;
        speedScore?: number;
        providerPriorityScore?: number;
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

@Injectable()
export class DecisionService {
    constructor(private readonly db: DbService) { }

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
        criteria: DecisionCriterion[],
    ): ScoredQuote | null {
        if (quotes.length === 0) {
            return null;
        }

        const prices = quotes.map((q) => q.price);
        const estimatedDays = quotes.map((q) => q.estimatedDays);

        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        const minDays = Math.min(...estimatedDays);
        const maxDays = Math.max(...estimatedDays);

        const scoredQuotes = quotes.map((quote) => {
            const priceScore = this.calculateInverseScore(
                quote.price,
                minPrice,
                maxPrice,
            );

            const speedScore = this.calculateInverseScore(
                quote.estimatedDays,
                minDays,
                maxDays,
            );

            const providerPriorityScore = quote.providerPriority ?? 0.5;

            let score = 0;

            for (const criterion of criteria) {
                if (criterion.key === 'price') {
                    score += priceScore * criterion.weight;
                }

                if (criterion.key === 'speed') {
                    score += speedScore * criterion.weight;
                }

                if (criterion.key === 'provider_priority') {
                    score += providerPriorityScore * criterion.weight;
                }
            }

            return {
                ...quote,
                score: Number(score.toFixed(4)),
                scoreBreakdown: {
                    priceScore: Number(priceScore.toFixed(4)),
                    speedScore: Number(speedScore.toFixed(4)),
                    providerPriorityScore: Number(providerPriorityScore.toFixed(4)),
                },
            };
        });

        return scoredQuotes.sort((a, b) => b.score - a.score)[0];
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
        return ['price', 'speed', 'provider_priority'].includes(key);
    }

    private safeSchemaName(schemaName: string): string {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
            throw new Error(`Invalid schema name: ${schemaName}`);
        }

        return `"${schemaName}"`;
    }
}