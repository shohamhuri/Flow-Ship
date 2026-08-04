import { Injectable } from '@nestjs/common';

import { DbService } from '../../infrastructure/database/db.service';
import { CurrentTenant } from '../tenants/tenants.service';
import {
    GroupingStrategyConfig,
    GroupingStrategyKey,
    GroupingStrategySetting,
} from './interfaces/grouping-strategy-setting.interface';

interface GroupingStrategySettingRow {
    id: string;

    strategy_key: GroupingStrategyKey;
    display_name: string;

    is_enabled: boolean;

    execution_order: number;
    conflict_priority: number;

    config: GroupingStrategyConfig;

    created_at: Date | string;
    updated_at: Date | string;
}

@Injectable()
export class GroupingStrategySettingsRepository {
    constructor(
        private readonly databaseService: DbService,
    ) { }

    async findActiveStrategies(
        tenant: CurrentTenant,
    ): Promise<GroupingStrategySetting[]> {
        const result =
            await this.databaseService.query<GroupingStrategySettingRow>(
                `
                select
                    id,
                    strategy_key,
                    display_name,
                    is_enabled,
                    execution_order,
                    conflict_priority,
                    config,
                    created_at,
                    updated_at
                from ${tenant.schemaName}.grouping_strategy_settings
                where is_enabled = true
                order by
                    execution_order asc,
                    conflict_priority desc
                `,
            );

        return result.map(
            (row): GroupingStrategySetting => ({
                id: row.id,

                strategyKey: row.strategy_key,
                displayName: row.display_name,

                isEnabled: row.is_enabled,

                executionOrder: row.execution_order,
                conflictPriority: row.conflict_priority,

                config: row.config ?? {},

                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at),
            }),
        );
    }
    async findAllStrategies(
        tenant: CurrentTenant,
    ): Promise<GroupingStrategySetting[]> {
        const result =
            await this.databaseService.query<GroupingStrategySettingRow>(
                `
      select
        id,
        strategy_key,
        display_name,
        is_enabled,
        execution_order,
        conflict_priority,
        config,
        created_at,
        updated_at
      from ${tenant.schemaName}.grouping_strategy_settings
      order by
        execution_order asc,
        conflict_priority desc
      `,
            );

        return result.map(
            (row): GroupingStrategySetting => ({
                id: row.id,

                strategyKey: row.strategy_key,
                displayName: row.display_name,

                isEnabled: row.is_enabled,

                executionOrder: row.execution_order,
                conflictPriority: row.conflict_priority,

                config: row.config ?? {},

                createdAt: new Date(row.created_at),
                updatedAt: new Date(row.updated_at),
            }),
        );
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
        const rows =
            await this.databaseService.query<GroupingStrategySettingRow>(
                `
      update ${tenant.schemaName}.grouping_strategy_settings
      set
        display_name =
          coalesce($1, display_name),

        is_enabled =
          coalesce($2, is_enabled),

        execution_order =
          coalesce($3, execution_order),

        conflict_priority =
          coalesce($4, conflict_priority),

        config =
          coalesce($5::jsonb, config),

        updated_at = now()

      where id = $6

      returning
        id,
        strategy_key,
        display_name,
        is_enabled,
        execution_order,
        conflict_priority,
        config,
        created_at,
        updated_at
      `,
                [
                    changes.displayName ?? null,
                    changes.isEnabled ?? null,
                    changes.executionOrder ?? null,
                    changes.conflictPriority ?? null,
                    changes.config !== undefined
                        ? JSON.stringify(changes.config)
                        : null,
                    strategyId,
                ],
            );

        const row = rows[0];

        if (!row) {
            return null;
        }

        return {
            id: row.id,

            strategyKey: row.strategy_key,
            displayName: row.display_name,

            isEnabled: row.is_enabled,

            executionOrder: row.execution_order,
            conflictPriority: row.conflict_priority,

            config: row.config ?? {},

            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
        };
    }
    async reorderStrategies(
        tenant: CurrentTenant,
        items: Array<{
            id: string;
            executionOrder: number;
            conflictPriority: number;
        }>,
    ): Promise<GroupingStrategySetting[]> {
        for (const item of items) {
            await this.databaseService.query(
                `
      update ${tenant.schemaName}.grouping_strategy_settings
      set
        execution_order = $1,
        conflict_priority = $2,
        updated_at = now()
      where id = $3
      `,
                [
                    item.executionOrder,
                    item.conflictPriority,
                    item.id,
                ],
            );
        }

        return this.findAllStrategies(tenant);
    }
}