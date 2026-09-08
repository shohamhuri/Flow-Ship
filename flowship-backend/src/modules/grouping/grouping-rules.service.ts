import { Injectable } from '@nestjs/common';

import { CurrentTenant } from '../tenants/tenants.service';
import { GroupingStrategySettingsRepository } from './grouping-strategy-settings.repository';
import {
    GroupingStrategyConfig,
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
    async getAllStrategies(
        tenant: CurrentTenant,
    ): Promise<GroupingStrategySetting[]> {
        return this
            .groupingStrategySettingsRepository
            .findAllStrategies(tenant);
    }
    async updateStrategy(
        tenant: CurrentTenant,
        strategyId: string,
        changes: {
            displayName?: string;
            isEnabled?: boolean;
            executionOrder?: number;
            conflictPriority?: number;
            config?: GroupingStrategyConfig;
        },
    ): Promise<GroupingStrategySetting | null> {

        const strategies =
            await this
                .groupingStrategySettingsRepository
                .findAllStrategies(
                    tenant,
                );

        const currentStrategy =
            strategies.find(
                (strategy) =>
                    strategy.id === strategyId,
            );

        if (!currentStrategy) {
            return null;
        }

        const strategyToValidate: GroupingStrategySetting = {
            ...currentStrategy,

            displayName:
                changes.displayName ??
                currentStrategy.displayName,

            isEnabled:
                changes.isEnabled ??
                currentStrategy.isEnabled,

            executionOrder:
                changes.executionOrder ??
                currentStrategy.executionOrder,

            conflictPriority:
                changes.conflictPriority ??
                currentStrategy.conflictPriority,

            config:
                changes.config !== undefined
                    ? changes.config
                    : currentStrategy.config,
        };

        /*
         * חשוב:
         * validation לפני כתיבה ל-DB.
         */
        this.validateStrategyConfig(
            strategyToValidate,
        );

        return this
            .groupingStrategySettingsRepository
            .updateStrategy(
                tenant,
                strategyId,
                changes,
            );
    }
    async reorderStrategies(
        tenant: CurrentTenant,
        items: Array<{
            id: string;
            executionOrder: number;
            conflictPriority: number;
        }>,
    ): Promise<GroupingStrategySetting[]> {
        return this
            .groupingStrategySettingsRepository
            .reorderStrategies(
                tenant,
                items,
            );
    }
}