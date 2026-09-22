import {
    ConfigModule,
    ConfigService,
} from '@nestjs/config';

import {
    Test,
    TestingModule,
} from '@nestjs/testing';

import {
    randomUUID,
} from 'crypto';

import {
    DbService,
} from '../src/infrastructure/database/db.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import {
    GroupingStrategySettingsRepository,
} from '../src/modules/grouping/grouping-strategy-settings.repository';


describe(
    'Grouping Strategy Reorder DB Atomicity Integration',
    () => {
        let moduleRef:
            TestingModule;

        let db:
            DbService;

        let config:
            ConfigService;

        let tenantsService:
            TenantsService;

        let repository:
            GroupingStrategySettingsRepository;

        let tenant:
            CurrentTenant;


        let strategyIds:
            string[] = [];


        /*
         * ============================================================
         * Helpers
         * ============================================================
         */

        function qSchema(
            schemaName: string,
        ): string {
            if (
                !/^[a-zA-Z_][a-zA-Z0-9_]*$/
                    .test(schemaName)
            ) {
                throw new Error(
                    `Invalid schema name: ${schemaName}`,
                );
            }

            return `"${schemaName}"`;
        }


        async function seedStrategies() {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            strategyIds = [
                randomUUID(),
                randomUUID(),
                randomUUID(),
            ];


            await db.query(
                `
                insert into ${schema}.grouping_strategy_settings (
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
                        'Atomicity Strategy 1',
                        true,
                        1,
                        30,
                        '{}'::jsonb
                    ),
                    (
                        $2,
                        'split_by_max_weight',
                        'Atomicity Strategy 2',
                        true,
                        2,
                        20,
                        '{"maxWeightKg": 25}'::jsonb
                    ),
                    (
                        $3,
                        'split_by_max_items',
                        'Atomicity Strategy 3',
                        true,
                        3,
                        10,
                        '{"maxItems": 5}'::jsonb
                    )
                `,
                strategyIds,
            );
        }


        async function cleanupStrategies() {
            if (
                strategyIds.length === 0
            ) {
                return;
            }


            const schema =
                qSchema(
                    tenant.schemaName,
                );


            await db.query(
                `
                delete from ${schema}.grouping_strategy_settings
                where id = any($1::uuid[])
                `,
                [
                    strategyIds,
                ],
            );


            strategyIds = [];
        }


        async function resetStrategies() {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            await db.query(
                `
                update ${schema}.grouping_strategy_settings
                set
                    execution_order =
                        case
                            when id = $1 then 1
                            when id = $2 then 2
                            when id = $3 then 3
                        end,

                    conflict_priority =
                        case
                            when id = $1 then 30
                            when id = $2 then 20
                            when id = $3 then 10
                        end,

                    updated_at = now()

                where id = any(
                    $4::uuid[]
                )
                `,
                [
                    strategyIds[0],
                    strategyIds[1],
                    strategyIds[2],
                    strategyIds,
                ],
            );
        }


        async function getState() {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            return db.query<{
                id: string;
                execution_order: number;
                conflict_priority: number;
            }>(
                `
                select
                    id,
                    execution_order,
                    conflict_priority
                from ${schema}.grouping_strategy_settings
                where id = any($1::uuid[])
                order by id
                `,
                [
                    strategyIds,
                ],
            );
        }


        function normalizedState(
            rows: Array<{
                id: string;
                execution_order: number;
                conflict_priority: number;
            }>,
        ) {
            return rows
                .map(
                    (row) => ({
                        id:
                            row.id,

                        executionOrder:
                            row.execution_order,

                        conflictPriority:
                            row.conflict_priority,
                    }),
                )
                .sort(
                    (
                        first,
                        second,
                    ) =>
                        first.id.localeCompare(
                            second.id,
                        ),
                );
        }


        /*
         * ============================================================
         * Setup
         * ============================================================
         */

        beforeAll(
            async () => {
                moduleRef =
                    await Test
                        .createTestingModule({
                            imports: [
                                ConfigModule
                                    .forRoot({
                                        isGlobal:
                                            true,
                                    }),
                            ],

                            providers: [
                                DbService,
                                ConfigService,
                                TenantsService,
                                GroupingStrategySettingsRepository,
                            ],
                        })
                        .compile();


                db =
                    moduleRef.get(
                        DbService,
                    );


                config =
                    moduleRef.get(
                        ConfigService,
                    );


                tenantsService =
                    moduleRef.get(
                        TenantsService,
                    );


                repository =
                    moduleRef.get(
                        GroupingStrategySettingsRepository,
                    );


                const apiKey =
                    config.get<string>(
                        'TEST_FLOW_SHIP_A_API_KEY',
                    );


                if (!apiKey) {
                    throw new Error(
                        'Missing TEST_FLOW_SHIP_A_API_KEY',
                    );
                }


                tenant =
                    await tenantsService
                        .findByApiKey(
                            apiKey,
                        );


                await seedStrategies();
            },
            30000,
        );


        beforeEach(
            async () => {
                await resetStrategies();
            },
            30000,
        );


        afterAll(
            async () => {
                if (
                    tenant &&
                    strategyIds.length > 0
                ) {
                    await cleanupStrategies();
                }


                if (moduleRef) {
                    await moduleRef.close();
                }
            },
            30000,
        );


        /*
         * ============================================================
         * TEST 1
         *
         * Baseline.
         *
         * A completely valid reorder must update
         * every strategy.
         * ============================================================
         */

        it(
            'should persist a valid reorder for all strategies',
            async () => {
                await repository
                    .reorderStrategies(
                        tenant,
                        [
                            {
                                id:
                                    strategyIds[0],

                                executionOrder:
                                    3,

                                conflictPriority:
                                    10,
                            },

                            {
                                id:
                                    strategyIds[1],

                                executionOrder:
                                    1,

                                conflictPriority:
                                    30,
                            },

                            {
                                id:
                                    strategyIds[2],

                                executionOrder:
                                    2,

                                conflictPriority:
                                    20,
                            },
                        ],
                    );


                const state =
                    await getState();


                const strategy1 =
                    state.find(
                        (
                            item,
                        ) =>
                            item.id ===
                            strategyIds[0],
                    );


                const strategy2 =
                    state.find(
                        (
                            item,
                        ) =>
                            item.id ===
                            strategyIds[1],
                    );


                const strategy3 =
                    state.find(
                        (
                            item,
                        ) =>
                            item.id ===
                            strategyIds[2],
                    );


                expect(
                    strategy1,
                ).toMatchObject({
                    execution_order:
                        3,

                    conflict_priority:
                        10,
                });


                expect(
                    strategy2,
                ).toMatchObject({
                    execution_order:
                        1,

                    conflict_priority:
                        30,
                });


                expect(
                    strategy3,
                ).toMatchObject({
                    execution_order:
                        2,

                    conflict_priority:
                        20,
                });
            },
        );


        /*
         * ============================================================
         * TEST 2
         *
         * First UPDATE succeeds.
         *
         * Second UPDATE contains an invalid UUID
         * and PostgreSQL rejects it.
         *
         * Expected:
         * first UPDATE must also be rolled back.
         * ============================================================
         */

        it(
            'should rollback the first update when the second reorder item fails',
            async () => {
                const before =
                    normalizedState(
                        await getState(),
                    );


                await expect(
                    repository
                        .reorderStrategies(
                            tenant,
                            [
                                {
                                    id:
                                        strategyIds[0],

                                    executionOrder:
                                        99,

                                    conflictPriority:
                                        999,
                                },

                                {
                                    id:
                                        'not-a-valid-uuid',

                                    executionOrder:
                                        98,

                                    conflictPriority:
                                        998,
                                },
                            ],
                        ),
                ).rejects.toThrow();


                const after =
                    normalizedState(
                        await getState(),
                    );


                expect(
                    after,
                ).toEqual(
                    before,
                );
            },
        );


        /*
         * ============================================================
         * TEST 3
         *
         * First two UPDATEs succeed.
         * Third one fails.
         *
         * Expected:
         * NONE of the earlier updates may remain.
         * ============================================================
         */

        it(
            'should rollback all previous updates when a later reorder item fails',
            async () => {
                const before =
                    normalizedState(
                        await getState(),
                    );


                await expect(
                    repository
                        .reorderStrategies(
                            tenant,
                            [
                                {
                                    id:
                                        strategyIds[0],

                                    executionOrder:
                                        50,

                                    conflictPriority:
                                        500,
                                },

                                {
                                    id:
                                        strategyIds[1],

                                    executionOrder:
                                        51,

                                    conflictPriority:
                                        501,
                                },

                                {
                                    id:
                                        'invalid-third-uuid',

                                    executionOrder:
                                        52,

                                    conflictPriority:
                                        502,
                                },
                            ],
                        ),
                ).rejects.toThrow();


                const after =
                    normalizedState(
                        await getState(),
                    );


                expect(
                    after,
                ).toEqual(
                    before,
                );
            },
        );


        /*
         * ============================================================
         * TEST 4
         *
         * A failed reorder must leave the DB clean.
         *
         * Then a valid retry should succeed normally.
         * ============================================================
         */

        it(
            'should allow a clean retry after a failed reorder',
            async () => {
                const originalState =
                    normalizedState(
                        await getState(),
                    );


                /*
                 * First attempt fails after
                 * changing strategy #1.
                 */
                await expect(
                    repository
                        .reorderStrategies(
                            tenant,
                            [
                                {
                                    id:
                                        strategyIds[0],

                                    executionOrder:
                                        100,

                                    conflictPriority:
                                        1000,
                                },

                                {
                                    id:
                                        'broken-uuid',

                                    executionOrder:
                                        101,

                                    conflictPriority:
                                        1001,
                                },
                            ],
                        ),
                ).rejects.toThrow();


                /*
                 * Failure itself must not have changed
                 * any persisted state.
                 */
                expect(
                    normalizedState(
                        await getState(),
                    ),
                ).toEqual(
                    originalState,
                );


                /*
                 * Retry.
                 */
                await repository
                    .reorderStrategies(
                        tenant,
                        [
                            {
                                id:
                                    strategyIds[0],

                                executionOrder:
                                    2,

                                conflictPriority:
                                    20,
                            },

                            {
                                id:
                                    strategyIds[1],

                                executionOrder:
                                    3,

                                conflictPriority:
                                    10,
                            },

                            {
                                id:
                                    strategyIds[2],

                                executionOrder:
                                    1,

                                conflictPriority:
                                    30,
                            },
                        ],
                    );


                const afterRetry =
                    await getState();


                expect(
                    afterRetry.find(
                        (
                            item,
                        ) =>
                            item.id ===
                            strategyIds[0],
                    ),
                ).toMatchObject({
                    execution_order:
                        2,

                    conflict_priority:
                        20,
                });


                expect(
                    afterRetry.find(
                        (
                            item,
                        ) =>
                            item.id ===
                            strategyIds[1],
                    ),
                ).toMatchObject({
                    execution_order:
                        3,

                    conflict_priority:
                        10,
                });


                expect(
                    afterRetry.find(
                        (
                            item,
                        ) =>
                            item.id ===
                            strategyIds[2],
                    ),
                ).toMatchObject({
                    execution_order:
                        1,

                    conflict_priority:
                        30,
                });
            },
        );
    },
);