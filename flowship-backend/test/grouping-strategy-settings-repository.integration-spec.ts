import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';

import { DbService } from '../src/infrastructure/database/db.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import { GroupingStrategySettingsRepository } from '../src/modules/grouping/grouping-strategy-settings.repository';

describe('GroupingStrategySettingsRepository Integration', () => {
    let db: DbService;

    let tenantsService: TenantsService;

    let repository: GroupingStrategySettingsRepository;

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
                ($1, 'group_by_source', 'A Source', true, 1, 100, '{}'::jsonb),
                ($2, 'split_by_max_weight', 'A Weight', true, 2, 80, '{"maxWeightKg": 20}'::jsonb),
                ($3, 'split_by_max_items', 'A Items', false, 3, 60, '{"maxItems": 5}'::jsonb)
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
                ($1, 'group_by_source', 'B Source', true, 1, 100, '{}'::jsonb),
                ($2, 'split_by_max_weight', 'B Weight', true, 2, 80, '{"maxWeightKg": 30}'::jsonb),
                ($3, 'split_by_max_items', 'B Items', false, 3, 60, '{"maxItems": 7}'::jsonb)
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

    it('should return all Tenant A strategies', async () => {
        const strategies =
            await repository.findAllStrategies(
                tenantA,
            );

        const createdStrategies =
            strategies.filter(
                (strategy) =>
                    [
                        aSourceId,
                        aWeightId,
                        aItemsId,
                    ].includes(strategy.id),
            );

        expect(
            createdStrategies,
        ).toHaveLength(3);

        expect(
            createdStrategies.map(
                (strategy) =>
                    strategy.displayName,
            ),
        ).toEqual([
            'A Source',
            'A Weight',
            'A Items',
        ]);
    });

    it('should return all Tenant B strategies', async () => {
        const strategies =
            await repository.findAllStrategies(
                tenantB,
            );

        const createdStrategies =
            strategies.filter(
                (strategy) =>
                    [
                        bSourceId,
                        bWeightId,
                        bItemsId,
                    ].includes(strategy.id),
            );

        expect(
            createdStrategies,
        ).toHaveLength(3);

        expect(
            createdStrategies.map(
                (strategy) =>
                    strategy.displayName,
            ),
        ).toEqual([
            'B Source',
            'B Weight',
            'B Items',
        ]);
    });

    it('should return only active strategies', async () => {
        const strategies =
            await repository.findActiveStrategies(
                tenantA,
            );

        const createdStrategies =
            strategies.filter(
                (strategy) =>
                    [
                        aSourceId,
                        aWeightId,
                        aItemsId,
                    ].includes(strategy.id),
            );

        expect(
            createdStrategies,
        ).toHaveLength(2);

        expect(
            createdStrategies.every(
                (strategy) =>
                    strategy.isEnabled,
            ),
        ).toBe(true);

        expect(
            createdStrategies.find(
                (strategy) =>
                    strategy.id ===
                    aItemsId,
            ),
        ).toBeUndefined();
    });

    it('should order strategies by execution order and conflict priority', async () => {
        const strategies =
            await repository.findAllStrategies(
                tenantA,
            );

        const createdStrategies =
            strategies.filter(
                (strategy) =>
                    [
                        aSourceId,
                        aWeightId,
                        aItemsId,
                    ].includes(strategy.id),
            );

        expect(
            createdStrategies.map(
                (strategy) =>
                    strategy.id,
            ),
        ).toEqual([
            aSourceId,
            aWeightId,
            aItemsId,
        ]);
    });

    it('should update a Tenant A strategy', async () => {
        const updated =
            await repository.updateStrategy(
                tenantA,
                aWeightId,
                {
                    displayName:
                        'A Weight Updated',

                    isEnabled:
                        false,

                    executionOrder:
                        5,

                    conflictPriority:
                        55,

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

            isEnabled:
                false,

            executionOrder:
                5,

            conflictPriority:
                55,

            config: {
                maxWeightKg:
                    42,
            },
        });
    });

    it('should keep Tenant B isolated from Tenant A updates', async () => {
        const strategies =
            await repository.findAllStrategies(
                tenantB,
            );

        const strategy =
            strategies.find(
                (item) =>
                    item.id ===
                    bWeightId,
            );

        expect(
            strategy,
        ).toBeDefined();

        expect(
            strategy,
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

    it('should return null when updating a missing strategy', async () => {
        const updated =
            await repository.updateStrategy(
                tenantA,
                randomUUID(),
                {
                    displayName:
                        'Does Not Exist',
                },
            );

        expect(
            updated,
        ).toBeNull();
    });

    it('should reorder Tenant A strategies', async () => {
        const reordered =
            await repository.reorderStrategies(
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

        const createdStrategies =
            reordered.filter(
                (strategy) =>
                    [
                        aSourceId,
                        aWeightId,
                        aItemsId,
                    ].includes(strategy.id),
            );

        expect(
            createdStrategies.map(
                (strategy) =>
                    strategy.id,
            ),
        ).toEqual([
            aWeightId,
            aItemsId,
            aSourceId,
        ]);

        expect(
            createdStrategies.map(
                (strategy) => ({
                    id:
                        strategy.id,

                    executionOrder:
                        strategy.executionOrder,

                    conflictPriority:
                        strategy.conflictPriority,
                }),
            ),
        ).toEqual([
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
            {
                id:
                    aSourceId,

                executionOrder:
                    30,

                conflictPriority:
                    10,
            },
        ]);
    });
});