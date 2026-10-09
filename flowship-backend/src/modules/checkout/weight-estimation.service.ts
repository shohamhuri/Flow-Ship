import { Injectable } from '@nestjs/common';

import { CurrentTenant } from '../tenants/tenants.service';

import {
    WeightEstimationRepository,
    WeightEstimationRule,
} from './weight-estimation.repository';

export interface WeightResolution {
    weightKg: number;
    source: 'actual' | 'estimated';
    ruleId: string | null;
}

@Injectable()
export class WeightEstimationService {
    constructor(
        private readonly repository:
            WeightEstimationRepository,
    ) { }

    resolveActualWeight(
        weight: number | undefined,
    ): WeightResolution | null {
        if (
            weight !== undefined &&
            Number.isFinite(weight) &&
            weight > 0
        ) {
            return {
                weightKg: weight,
                source: 'actual',
                ruleId: null,
            };
        }

        return null;
    }

    async getEstimationRules(
        tenant: CurrentTenant,
    ): Promise<WeightEstimationRule[]> {
        return this.repository.findActiveRules(
            tenant,
        );
    }
    findBestMatchingRule(
        rules: WeightEstimationRule[],
        category?: string,
        productType?: string,
        size?: string,
    ): WeightEstimationRule | null {
        const matchingRules = rules.filter((rule) => {
            if (
                rule.category !== null &&
                rule.category.trim().toLowerCase() !==
                category?.trim().toLowerCase()
            ) {
                return false;
            }

            if (
                rule.productType !== null &&
                rule.productType.trim().toLowerCase() !==
                productType?.trim().toLowerCase()
            ) {
                return false;
            }

            if (
                rule.size !== null &&
                rule.size.trim().toLowerCase() !==
                size?.trim().toLowerCase()
            ) {
                return false;
            }
            return true;
        });

        if (matchingRules.length === 0) {
            return null;
        }

        return matchingRules.sort((a, b) => {
            const specificityA =
                Number(a.category !== null) +
                Number(a.productType !== null) +
                Number(a.size !== null);

            const specificityB =
                Number(b.category !== null) +
                Number(b.productType !== null) +
                Number(b.size !== null);

            return specificityB - specificityA;
        })[0];
    }
    async resolveWeight(
        tenant: CurrentTenant,
        item: {
            weight?: number;
            category?: string;
            productType?: string;
            size?: string;
        },
    ): Promise<WeightResolution | null> {
        const actualWeight =
            this.resolveActualWeight(item.weight);

        if (actualWeight) {
            return actualWeight;
        }

        const rules =
            await this.getEstimationRules(tenant);

        const rule =
            this.findBestMatchingRule(
                rules,
                item.category,
                item.productType,
                item.size,
            );

        if (!rule) {
            return null;
        }

        return {
            weightKg: rule.estimatedWeightKg,
            source: 'estimated',
            ruleId: rule.id,
        };
    }
}