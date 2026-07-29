import { Injectable } from '@nestjs/common';

import { CurrentTenant } from '../tenants/tenants.service';
import { GroupingStrategySettingsRepository } from './grouping-strategy-settings.repository';
import {
    GroupingStrategySetting,
} from './interfaces/grouping-strategy-setting.interface';

@Injectable()
export class GroupingRulesService {
    constructor(
        private readonly groupingStrategySettingsRepository:
            GroupingStrategySettingsRepository,
    ) { }

    /**
     * הלוגיקה הקיימת שלך נשארת ללא שינוי.
     * קובעת לאיזו קבוצת טיפול שייך פריט לפי הקטגוריה שלו.
     */
    getHandlingGroup(category?: string): string {
        if (!category) {
            return 'standard';
        }

        const normalizedCategory = category
            .trim()
            .toLowerCase();

        switch (normalizedCategory) {
            case 'frozen':
            case 'refrigerated':
            case 'cold':
                return 'cold-chain';

            case 'hazardous':
            case 'dangerous-goods':
                return 'hazardous';

            case 'fragile':
                return 'fragile';

            default:
                return 'standard';
        }
    }

    /**
     * טוענת את אסטרטגיות הקיבוץ הפעילות של ה-Tenant
     * לפי הסדר שנשמר במסד.
     */
    async getActiveStrategies(
        tenant: CurrentTenant,
    ): Promise<GroupingStrategySetting[]> {
        const strategies =
            await this.groupingStrategySettingsRepository
                .findActiveStrategies(tenant);

        for (const strategy of strategies) {
            this.validateStrategyConfig(strategy);
        }

        return strategies;
    }

    /**
     * מוודאת שה-config של כל אסטרטגיה תקין
     * לפני שמתחילים להפעיל אותה.
     */
    private validateStrategyConfig(
        strategy: GroupingStrategySetting,
    ): void {
        switch (strategy.strategyKey) {
            case 'group_by_source':
                return;

            case 'split_by_max_weight': {
                const maxWeightKg =
                    strategy.config.maxWeightKg;

                if (
                    typeof maxWeightKg !== 'number' ||
                    maxWeightKg <= 0
                ) {
                    throw new Error(
                        `Invalid maxWeightKg configuration for grouping strategy ${strategy.strategyKey}`,
                    );
                }

                return;
            }

            case 'split_by_max_items': {
                const maxItems =
                    strategy.config.maxItems;

                if (
                    typeof maxItems !== 'number' ||
                    !Number.isInteger(maxItems) ||
                    maxItems <= 0
                ) {
                    throw new Error(
                        `Invalid maxItems configuration for grouping strategy ${strategy.strategyKey}`,
                    );
                }

                return;
            }

            default: {
                const unsupportedStrategy: never =
                    strategy.strategyKey;

                throw new Error(
                    `Unsupported grouping strategy: ${unsupportedStrategy}`,
                );
            }
        }
    }
}