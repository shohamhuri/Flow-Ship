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
}