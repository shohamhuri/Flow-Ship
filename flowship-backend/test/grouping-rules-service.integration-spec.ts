import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';

import { DbService } from '../src/infrastructure/database/db.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import { GroupingStrategySettingsRepository } from '../src/modules/grouping/grouping-strategy-settings.repository';

import { GroupingRulesService } from '../src/modules/grouping/grouping-rules.service';

describe('GroupingRulesService Integration', () => {
    let db: DbService;

    let tenantsService: TenantsService;

    let repository: GroupingStrategySettingsRepository;

    let service: GroupingRulesService;

    let config: ConfigService;

    let tenantA: CurrentTenant;
    let tenantB: CurrentTenant;

    let aSourceId: string;
    let aWeightId: string;
    let aItemsId: string;

    let bSourceId: string;
    let bWeightId: string;
    let bItemsId: string;

    beforeAll(async () => {
        const moduleRef =
            await Test.createTestingModule({
                imports: [
                    ConfigModule.forRoot({
                        isGlobal: true,
                    }),
                ],
                providers: [
                    DbService,
                    TenantsService,
                    GroupingStrategySettingsRepository,
                    GroupingRulesService,
                ],
            }).compile();

        db =
            moduleRef.get(DbService);

        tenantsService =
            moduleRef.get(TenantsService);

        repository =
            moduleRef.get(
                GroupingStrategySettingsRepository,
            );

        service =
            moduleRef.get(
                GroupingRulesService,
            );

        config =
            moduleRef.get(ConfigService);

        const tenantAApiKey =
            config.get<string>(
                'TEST_FLOW_SHIP_A_API_KEY',
            );

        const tenantBApiKey =
            config.get<string>(
                'TEST_FLOW_SHIP_B_API_KEY',
            );

        if (!tenantAApiKey) {
            throw new Error(
                'Missing TEST_FLOW_SHIP_A_API_KEY',
            );
        }

        if (!tenantBApiKey) {
            throw new Error(
                'Missing TEST_FLOW_SHIP_B_API_KEY',
            );
        }

        tenantA =
            await tenantsService.findByApiKey(
                tenantAApiKey,
            );

        tenantB =
            await tenantsService.findByApiKey(
                tenantBApiKey,
            );

        aSourceId = randomUUID();
        aWeightId = randomUUID();
        aItemsId = randomUUID();

        bSourceId = randomUUID();
        bWeightId = randomUUID();
        bItemsId = randomUUID();

        await db.query(
            `
            insert into flow_ship_test_a.grouping_strategy_settings (
                id,
                strategy_key,
                display_name,
                is_enabled,
                execution_order,
                conflict_priority,
                config
            )
            values
                (
                    $1,
                    'group_by_source',
                    'A Source',
                    true,
                    1,
                    100,
                    '{}'::jsonb
                ),
                (
                    $2,
                    'split_by_max_weight',
                    'A Weight',
                    true,
                    2,
                    80,
                    '{"maxWeightKg":20}'::jsonb
                ),
                (
                    $3,
                    'split_by_max_items',
                    'A Items',
                    false,
                    3,
                    60,
                    '{"maxItems":5}'::jsonb
                )
            `,
            [
                aSourceId,
                aWeightId,
                aItemsId,
            ],
        );

        await db.query(
            `
            insert into flow_ship_test_b.grouping_strategy_settings (
                id,
                strategy_key,
                display_name,
                is_enabled,
                execution_order,
                conflict_priority,
                config
            )
            values
                (
                    $1,
                    'group_by_source',
                    'B Source',
                    true,
                    1,
                    100,
                    '{}'::jsonb
                ),
                (
                    $2,
                    'split_by_max_weight',
                    'B Weight',
                    true,
                    2,
                    80,
                    '{"maxWeightKg":30}'::jsonb
                ),
                (
                    $3,
                    'split_by_max_items',
                    'B Items',
                    false,
                    3,
                    60,
                    '{"maxItems":7}'::jsonb
                )
            `,
            [
                bSourceId,
                bWeightId,
                bItemsId,
            ],
        );
    }, 30000);

    afterAll(async () => {
        await db.query(
            `
            delete from flow_ship_test_a.grouping_strategy_settings
            where id = any($1::uuid[])
            `,
            [[
                aSourceId,
                aWeightId,
                aItemsId,
            ]],
        );

        await db.query(
            `
            delete from flow_ship_test_b.grouping_strategy_settings
            where id = any($1::uuid[])
            `,
            [[
                bSourceId,
                bWeightId,
                bItemsId,
            ]],
        );

        await db.onModuleDestroy();
    }, 30000);

    it('should return only active Tenant A strategies in execution order', async () => {
        const strategies =
            await service.getActiveStrategies(
                tenantA,
            );

        const testStrategies =
            strategies.filter(
                (strategy) =>
                    [
                        aSourceId,
                        aWeightId,
                        aItemsId,
                    ].includes(strategy.id),
            );

        expect(
            testStrategies,
        ).toHaveLength(2);

        expect(
            testStrategies.map(
                (strategy) =>
                    strategy.id,
            ),
        ).toEqual([
            aSourceId,
            aWeightId,
        ]);

        expect(
            testStrategies.every(
                (strategy) =>
                    strategy.isEnabled,
            ),
        ).toBe(true);
    });

    it('should return disabled strategies through getAllStrategies', async () => {
        const strategies =
            await service.getAllStrategies(
                tenantA,
            );

        const itemsStrategy =
            strategies.find(
                (strategy) =>
                    strategy.id ===
                    aItemsId,
            );

        expect(
            itemsStrategy,
        ).toBeDefined();

        expect(
            itemsStrategy?.isEnabled,
        ).toBe(false);

        expect(
            itemsStrategy?.config,
        ).toEqual({
            maxItems:
                5,
        });
    });

    it('should load Tenant B strategies independently', async () => {
        const strategies =
            await service.getAllStrategies(
                tenantB,
            );

        const testStrategies =
            strategies.filter(
                (strategy) =>
                    [
                        bSourceId,
                        bWeightId,
                        bItemsId,
                    ].includes(strategy.id),
            );

        expect(
            testStrategies,
        ).toHaveLength(3);

        expect(
            testStrategies.some(
                (strategy) =>
                    strategy.id ===
                    aSourceId,
            ),
        ).toBe(false);

        const weight =
            testStrategies.find(
                (strategy) =>
                    strategy.id ===
                    bWeightId,
            );

        expect(
            weight?.config,
        ).toEqual({
            maxWeightKg:
                30,
        });
    });

    it('should update a valid strategy and persist it to the database', async () => {
        const updated =
            await service.updateStrategy(
                tenantA,
                aWeightId,
                {
                    displayName:
                        'A Weight Updated',

                    config: {
                        maxWeightKg:
                            42,
                    },
                },
            );

        expect(
            updated,
        ).not.toBeNull();

        expect(
            updated,
        ).toMatchObject({
            id:
                aWeightId,

            displayName:
                'A Weight Updated',

            config: {
                maxWeightKg:
                    42,
            },
        });

        const rows =
            await db.query<{
                display_name: string;
                config: {
                    maxWeightKg: number;
                };
            }>(
                `
                select
                    display_name,
                    config
                from flow_ship_test_a.grouping_strategy_settings
                where id = $1
                `,
                [aWeightId],
            );

        expect(rows).toHaveLength(1);

        expect(
            rows[0],
        ).toEqual({
            display_name:
                'A Weight Updated',

            config: {
                maxWeightKg:
                    42,
            },
        });
    });

    it('should remove a disabled strategy from active strategies', async () => {
        await service.updateStrategy(
            tenantA,
            aWeightId,
            {
                isEnabled:
                    false,
            },
        );

        const active =
            await service.getActiveStrategies(
                tenantA,
            );

        expect(
            active.some(
                (strategy) =>
                    strategy.id ===
                    aWeightId,
            ),
        ).toBe(false);

        /*
         * מחזירים אותו ל-active
         * כדי ששאר הטסטים יעבדו על state נקי.
         */
        await service.updateStrategy(
            tenantA,
            aWeightId,
            {
                isEnabled:
                    true,
            },
        );
    });

    it('should reorder strategies and persist the new order', async () => {
        const reordered =
            await service.reorderStrategies(
                tenantA,
                [
                    {
                        id:
                            aSourceId,

                        executionOrder:
                            30,

                        conflictPriority:
                            10,
                    },
                    {
                        id:
                            aWeightId,

                        executionOrder:
                            10,

                        conflictPriority:
                            30,
                    },
                    {
                        id:
                            aItemsId,

                        executionOrder:
                            20,

                        conflictPriority:
                            20,
                    },
                ],
            );

        const testStrategies =
            reordered.filter(
                (strategy) =>
                    [
                        aSourceId,
                        aWeightId,
                        aItemsId,
                    ].includes(strategy.id),
            );

        expect(
            testStrategies.map(
                (strategy) =>
                    strategy.id,
            ),
        ).toEqual([
            aWeightId,
            aItemsId,
            aSourceId,
        ]);

        const rows =
            await db.query<{
                id: string;
                execution_order: number;
                conflict_priority: number;
            }>(
                `
                select
                    id,
                    execution_order,
                    conflict_priority
                from flow_ship_test_a.grouping_strategy_settings
                where id = any($1::uuid[])
                order by
                    execution_order asc,
                    conflict_priority desc
                `,
                [[
                    aSourceId,
                    aWeightId,
                    aItemsId,
                ]],
            );

        expect(
            rows.map(
                (row) =>
                    row.id,
            ),
        ).toEqual([
            aWeightId,
            aItemsId,
            aSourceId,
        ]);
    });

    it('should keep Tenant B unchanged after Tenant A updates', async () => {
        const strategies =
            await service.getAllStrategies(
                tenantB,
            );

        const weight =
            strategies.find(
                (strategy) =>
                    strategy.id ===
                    bWeightId,
            );

        expect(
            weight,
        ).toMatchObject({
            displayName:
                'B Weight',

            isEnabled:
                true,

            executionOrder:
                2,

            conflictPriority:
                80,

            config: {
                maxWeightKg:
                    30,
            },
        });
    });

    it('should reject invalid active strategy configuration loaded from the database', async () => {
        await db.query(
            `
            update flow_ship_test_a.grouping_strategy_settings
            set config = '{"maxItems":0}'::jsonb
            where id = $1
            `,
            [aItemsId],
        );

        await db.query(
            `
            update flow_ship_test_a.grouping_strategy_settings
            set is_enabled = true
            where id = $1
            `,
            [aItemsId],
        );

        await expect(
            service.getActiveStrategies(
                tenantA,
            ),
        ).rejects.toThrow(
            'Invalid maxItems configuration',
        );

        /*
         * Restore.
         */
        await db.query(
            `
            update flow_ship_test_a.grouping_strategy_settings
            set
                config = '{"maxItems":5}'::jsonb,
                is_enabled = false
            where id = $1
            `,
            [aItemsId],
        );
    });

    it('should not persist an invalid strategy configuration', async () => {
        /*
         * קודם מוודאים שהערך התקין הוא 42.
         */
        const beforeRows =
            await db.query<{
                config: {
                    maxWeightKg: number;
                };
            }>(
                `
                select config
                from flow_ship_test_a.grouping_strategy_settings
                where id = $1
                `,
                [aWeightId],
            );

        expect(
            beforeRows[0].config,
        ).toEqual({
            maxWeightKg:
                42,
        });

        await expect(
            service.updateStrategy(
                tenantA,
                aWeightId,
                {
                    config: {
                        maxWeightKg:
                            -1,
                    },
                },
            ),
        ).rejects.toThrow(
            'Invalid maxWeightKg configuration',
        );

        const afterRows =
            await db.query<{
                config: {
                    maxWeightKg: number;
                };
            }>(
                `
                select config
                from flow_ship_test_a.grouping_strategy_settings
                where id = $1
                `,
                [aWeightId],
            );

        expect(
            afterRows[0].config,
        ).toEqual({
            maxWeightKg:
                42,
        });
    });
});