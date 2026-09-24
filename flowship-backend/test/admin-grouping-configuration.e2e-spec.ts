import {
    INestApplication,
    UnauthorizedException,
    ValidationPipe,
} from '@nestjs/common';

import {
    ConfigService,
} from '@nestjs/config';

import {
    Test,
    TestingModule,
} from '@nestjs/testing';

import request from 'supertest';

import {
    randomUUID,
} from 'crypto';

import {
    AppModule,
} from '../src/app.module';

import {
    DbService,
} from '../src/infrastructure/database/db.service';

import {
    AuthService,
} from '../src/modules/auth/auth.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import {
    GroupingStrategySettingsRepository,
} from '../src/modules/grouping/grouping-strategy-settings.repository';

import {
    GroupingStrategySetting,
} from '../src/modules/grouping/interfaces/grouping-strategy-setting.interface';


describe(
    'Admin Grouping Configuration E2E',
    () => {
        let app: INestApplication;
        let moduleRef: TestingModule;

        let db: DbService;
        let config: ConfigService;
        let tenantsService: TenantsService;
        let authService: AuthService;

        let repository:
            GroupingStrategySettingsRepository;

        let tenantA: CurrentTenant;
        let tenantB: CurrentTenant;

        let seededIdsA: string[] = [];
        let seededIdsB: string[] = [];


        const TOKEN_A =
            'e2e-grouping-admin-token-a';

        const TOKEN_B =
            'e2e-grouping-admin-token-b';


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


        function authContext(
            tenant: CurrentTenant,
        ) {
            return {
                user: {
                    id:
                        `e2e-user-${tenant.id}`,

                    email:
                        'e2e-grouping@flowship.test',

                    displayName:
                        'E2E Grouping Admin',

                    role:
                        'admin',
                },

                tenant,
            };
        }


        async function seedStrategies(
            tenant: CurrentTenant,
        ): Promise<string[]> {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            const ids = [
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
                    'E2E Group By Source',
                    true,
                    1,
                    100,
                    '{}'::jsonb
                ),
                (
                    $2,
                    'split_by_max_weight',
                    'E2E Split By Weight',
                    true,
                    2,
                    90,
                    '{"maxWeightKg": 20}'::jsonb
                ),
                (
                    $3,
                    'split_by_max_items',
                    'E2E Split By Items',
                    true,
                    3,
                    80,
                    '{"maxItems": 5}'::jsonb
                )
                `,
                ids,
            );


            return ids;
        }


        async function deleteSeededStrategies(
            tenant: CurrentTenant,
            ids: string[],
        ): Promise<void> {
            if (
                ids.length === 0
            ) {
                return;
            }


            await db.query(
                `
                delete from ${qSchema(
                    tenant.schemaName,
                )}.grouping_strategy_settings
                where id = any($1::uuid[])
                `,
                [
                    ids,
                ],
            );
        }


        async function getStrategies(
            tenant: CurrentTenant,
        ): Promise<
            GroupingStrategySetting[]
        > {
            return repository
                .findAllStrategies(
                    tenant,
                );
        }


        async function restoreStrategy(
            tenant: CurrentTenant,
            strategy:
                GroupingStrategySetting,
        ): Promise<void> {
            await repository
                .updateStrategy(
                    tenant,
                    strategy.id,
                    {
                        displayName:
                            strategy.displayName,

                        isEnabled:
                            strategy.isEnabled,

                        executionOrder:
                            strategy.executionOrder,

                        conflictPriority:
                            strategy.conflictPriority,

                        config:
                            strategy.config,
                    },
                );
        }


        async function restoreStrategies(
            tenant: CurrentTenant,
            strategies:
                GroupingStrategySetting[],
        ): Promise<void> {
            for (
                const strategy
                of strategies
            ) {
                await restoreStrategy(
                    tenant,
                    strategy,
                );
            }
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
                                AppModule,
                            ],
                        })
                        .compile();


                app =
                    moduleRef
                        .createNestApplication();


                app.useGlobalPipes(
                    new ValidationPipe({
                        whitelist:
                            true,

                        forbidNonWhitelisted:
                            true,

                        transform:
                            true,
                    }),
                );


                await app.init();


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


                authService =
                    moduleRef.get(
                        AuthService,
                    );


                /*
                 * Mock only external Supabase authentication.
                 * Everything behind the guard remains real.
                 */
                jest.spyOn(
                    authService,
                    'authenticateAccessToken',
                )
                    .mockImplementation(
                        async (
                            token: string,
                        ) => {
                            if (
                                token ===
                                TOKEN_A
                            ) {
                                return authContext(
                                    tenantA,
                                );
                            }


                            if (
                                token ===
                                TOKEN_B
                            ) {
                                return authContext(
                                    tenantB,
                                );
                            }


                            throw new UnauthorizedException(
                                'Invalid access token',
                            );
                        },
                    );


                const apiKeyA =
                    config.get<string>(
                        'TEST_FLOW_SHIP_A_API_KEY',
                    );


                const apiKeyB =
                    config.get<string>(
                        'TEST_FLOW_SHIP_B_API_KEY',
                    );


                if (!apiKeyA) {
                    throw new Error(
                        'Missing TEST_FLOW_SHIP_A_API_KEY',
                    );
                }


                if (!apiKeyB) {
                    throw new Error(
                        'Missing TEST_FLOW_SHIP_B_API_KEY',
                    );
                }


                tenantA =
                    await tenantsService
                        .findByApiKey(
                            apiKeyA,
                        );


                tenantB =
                    await tenantsService
                        .findByApiKey(
                            apiKeyB,
                        );


                if (
                    tenantA.schemaName ===
                    tenantB.schemaName
                ) {
                    throw new Error(
                        'E2E tenants must use different schemas',
                    );
                }


                /*
                 * Use isolated rows.
                 */
                seededIdsA =
                    await seedStrategies(
                        tenantA,
                    );


                seededIdsB =
                    await seedStrategies(
                        tenantB,
                    );
            },
            60000,
        );


        /*
         * ============================================================
         * Cleanup
         * ============================================================
         */

        afterAll(
            async () => {
                if (
                    db &&
                    tenantA &&
                    seededIdsA.length > 0
                ) {
                    await deleteSeededStrategies(
                        tenantA,
                        seededIdsA,
                    );
                }


                if (
                    db &&
                    tenantB &&
                    seededIdsB.length > 0
                ) {
                    await deleteSeededStrategies(
                        tenantB,
                        seededIdsB,
                    );
                }


                if (app) {
                    await app.close();
                }
            },
            60000,
        );


        /*
         * ============================================================
         * TEST 1
         * Auth required
         * ============================================================
         */

        it(
            'should return 401 when Authorization header is missing',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .get(
                        '/admin/grouping-strategies',
                    )
                    .expect(
                        401,
                    );
            },
        );


        /*
         * ============================================================
         * TEST 2
         * Invalid auth
         * ============================================================
         */

        it(
            'should return 401 for invalid access token',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .get(
                        '/admin/grouping-strategies',
                    )
                    .set(
                        'Authorization',
                        'Bearer invalid-token',
                    )
                    .expect(
                        401,
                    );
            },
        );


        /*
         * ============================================================
         * TEST 3
         * Tenant A read
         * ============================================================
         */

        it(
            'should return Tenant A grouping strategies',
            async () => {
                const dbStrategies =
                    await getStrategies(
                        tenantA,
                    );


                expect(
                    dbStrategies.length,
                ).toBeGreaterThan(
                    0,
                );


                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/grouping-strategies',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_A}`,
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body.ok,
                ).toBe(
                    true,
                );


                expect(
                    response.body
                        .tenant
                        .id,
                ).toBe(
                    tenantA.id,
                );


                expect(
                    response.body
                        .tenant
                        .schemaName,
                ).toBe(
                    tenantA.schemaName,
                );


                expect(
                    response.body
                        .strategies,
                ).toHaveLength(
                    dbStrategies.length,
                );


                expect(
                    response.body
                        .strategies
                        .map(
                            (
                                strategy:
                                    any,
                            ) =>
                                strategy.id,
                        ),
                ).toEqual(
                    dbStrategies.map(
                        (
                            strategy,
                        ) =>
                            strategy.id,
                    ),
                );
            },
        );


        /*
         * ============================================================
         * TEST 4
         * Tenant B read
         * ============================================================
         */

        it(
            'should return Tenant B grouping strategies independently',
            async () => {
                const dbStrategiesB =
                    await getStrategies(
                        tenantB,
                    );


                expect(
                    dbStrategiesB.length,
                ).toBeGreaterThan(
                    0,
                );


                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/grouping-strategies',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_B}`,
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body.ok,
                ).toBe(
                    true,
                );


                expect(
                    response.body
                        .tenant
                        .id,
                ).toBe(
                    tenantB.id,
                );


                expect(
                    response.body
                        .tenant
                        .schemaName,
                ).toBe(
                    tenantB.schemaName,
                );


                expect(
                    response.body
                        .strategies,
                ).toHaveLength(
                    dbStrategiesB.length,
                );
            },
        );


        /*
         * ============================================================
         * TEST 5
         * Update + DB persistence
         * ============================================================
         */

        it(
            'should update a grouping strategy in Tenant A',
            async () => {
                const strategies =
                    await getStrategies(
                        tenantA,
                    );


                /*
                 * Use our own fixture, not an arbitrary
                 * pre-existing strategy.
                 */
                const strategy =
                    strategies.find(
                        (item) =>
                            item.id ===
                            seededIdsA[0],
                    );


                expect(
                    strategy,
                ).toBeDefined();


                const original =
                    strategy!;


                const newDisplayName =
                    `E2E Updated ${Date.now()}`;


                try {
                    const response =
                        await request(
                            app.getHttpServer(),
                        )
                            .patch(
                                `/admin/grouping-strategies/${original.id}`,
                            )
                            .set(
                                'Authorization',
                                `Bearer ${TOKEN_A}`,
                            )
                            .send({
                                displayName:
                                    newDisplayName,

                                isEnabled:
                                    original.isEnabled,

                                executionOrder:
                                    original.executionOrder,

                                conflictPriority:
                                    original.conflictPriority,
                            })
                            .expect(
                                200,
                            );


                    expect(
                        response.body.ok,
                    ).toBe(
                        true,
                    );


                    expect(
                        response.body
                            .strategy
                            .id,
                    ).toBe(
                        original.id,
                    );


                    expect(
                        response.body
                            .strategy
                            .displayName,
                    ).toBe(
                        newDisplayName,
                    );


                    const afterUpdate =
                        await getStrategies(
                            tenantA,
                        );


                    const persisted =
                        afterUpdate.find(
                            (item) =>
                                item.id ===
                                original.id,
                        );


                    expect(
                        persisted,
                    ).toBeDefined();


                    expect(
                        persisted!
                            .displayName,
                    ).toBe(
                        newDisplayName,
                    );
                } finally {
                    await restoreStrategy(
                        tenantA,
                        original,
                    );
                }
            },
        );


        /*
         * ============================================================
         * TEST 6
         * Cross-tenant mutation protection
         * ============================================================
         */

        it(
            'should not modify Tenant A strategy through Tenant B',
            async () => {
                const strategiesA =
                    await getStrategies(
                        tenantA,
                    );


                const strategyA =
                    strategiesA.find(
                        (item) =>
                            item.id ===
                            seededIdsA[0],
                    );


                expect(
                    strategyA,
                ).toBeDefined();


                const originalName =
                    strategyA!
                        .displayName;


                await request(
                    app.getHttpServer(),
                )
                    .patch(
                        `/admin/grouping-strategies/${strategyA!.id}`,
                    )
                    .set(
                        'Authorization',
                        `Bearer ${TOKEN_B}`,
                    )
                    .send({
                        displayName:
                            `TENANT-B-${Date.now()}`,
                    })
                    .expect(
                        404,
                    );


                const afterA =
                    await getStrategies(
                        tenantA,
                    );


                const persistedA =
                    afterA.find(
                        (item) =>
                            item.id ===
                            strategyA!.id,
                    );


                expect(
                    persistedA,
                ).toBeDefined();


                expect(
                    persistedA!
                        .displayName,
                ).toBe(
                    originalName,
                );
            },
        );


        /*
         * ============================================================
         * TEST 7
         * Unknown resource
         * ============================================================
         */

        it(
            'should return 404 when grouping strategy does not exist',
            async () => {
                const fakeId =
                    '00000000-0000-4000-8000-000000000001';


                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .patch(
                            `/admin/grouping-strategies/${fakeId}`,
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_A}`,
                        )
                        .send({
                            displayName:
                                'Does not exist',
                        })
                        .expect(
                            404,
                        );


                expect(
                    response.body.message,
                ).toBe(
                    'Grouping strategy not found',
                );
            },
        );


        /*
         * ============================================================
         * TEST 8
         * Production DTO validation
         * ============================================================
         */

        it(
            'should return 400 for invalid update DTO',
            async () => {
                const strategyId =
                    seededIdsA[0];


                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .patch(
                            `/admin/grouping-strategies/${strategyId}`,
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_A}`,
                        )
                        .send({
                            isEnabled:
                                'yes',

                            executionOrder:
                                0,

                            conflictPriority:
                                -1,

                            unknownField:
                                'should-not-exist',
                        })
                        .expect(
                            400,
                        );


                expect(
                    response.body
                        .message,
                ).toEqual(
                    expect.any(
                        Array,
                    ),
                );
            },
        );


        /*
         * ============================================================
         * TEST 9
         * Reorder + real DB persistence
         * ============================================================
         */

        it(
            'should reorder grouping strategies in Tenant A',
            async () => {
                const before =
                    await getStrategies(
                        tenantA,
                    );


                const first =
                    before.find(
                        (item) =>
                            item.id ===
                            seededIdsA[0],
                    );


                const second =
                    before.find(
                        (item) =>
                            item.id ===
                            seededIdsA[1],
                    );


                expect(
                    first,
                ).toBeDefined();


                expect(
                    second,
                ).toBeDefined();


                try {
                    const response =
                        await request(
                            app.getHttpServer(),
                        )
                            .patch(
                                '/admin/grouping-strategies/reorder',
                            )
                            .set(
                                'Authorization',
                                `Bearer ${TOKEN_A}`,
                            )
                            .send({
                                items: [
                                    {
                                        id:
                                            first!.id,

                                        executionOrder:
                                            second!
                                                .executionOrder,

                                        conflictPriority:
                                            first!
                                                .conflictPriority,
                                    },

                                    {
                                        id:
                                            second!.id,

                                        executionOrder:
                                            first!
                                                .executionOrder,

                                        conflictPriority:
                                            second!
                                                .conflictPriority,
                                    },
                                ],
                            })
                            .expect(
                                200,
                            );


                    expect(
                        response.body.ok,
                    ).toBe(
                        true,
                    );


                    const after =
                        await getStrategies(
                            tenantA,
                        );


                    const updatedFirst =
                        after.find(
                            (item) =>
                                item.id ===
                                first!.id,
                        );


                    const updatedSecond =
                        after.find(
                            (item) =>
                                item.id ===
                                second!.id,
                        );


                    expect(
                        updatedFirst,
                    ).toBeDefined();


                    expect(
                        updatedSecond,
                    ).toBeDefined();


                    expect(
                        updatedFirst!
                            .executionOrder,
                    ).toBe(
                        second!
                            .executionOrder,
                    );


                    expect(
                        updatedSecond!
                            .executionOrder,
                    ).toBe(
                        first!
                            .executionOrder,
                    );
                } finally {
                    await restoreStrategies(
                        tenantA,
                        before,
                    );
                }
            },
        );


        /*
         * ============================================================
         * TEST 10
         * Reorder isolation
         * ============================================================
         */

        it(
            'should keep Tenant B unchanged when Tenant A reorders strategies',
            async () => {
                const beforeA =
                    await getStrategies(
                        tenantA,
                    );


                const beforeB =
                    await getStrategies(
                        tenantB,
                    );


                const firstA =
                    beforeA.find(
                        (item) =>
                            item.id ===
                            seededIdsA[0],
                    );


                const secondA =
                    beforeA.find(
                        (item) =>
                            item.id ===
                            seededIdsA[1],
                    );


                expect(
                    firstA,
                ).toBeDefined();


                expect(
                    secondA,
                ).toBeDefined();


                try {
                    await request(
                        app.getHttpServer(),
                    )
                        .patch(
                            '/admin/grouping-strategies/reorder',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_A}`,
                        )
                        .send({
                            items: [
                                {
                                    id:
                                        firstA!.id,

                                    executionOrder:
                                        secondA!
                                            .executionOrder,

                                    conflictPriority:
                                        firstA!
                                            .conflictPriority,
                                },

                                {
                                    id:
                                        secondA!.id,

                                    executionOrder:
                                        firstA!
                                            .executionOrder,

                                    conflictPriority:
                                        secondA!
                                            .conflictPriority,
                                },
                            ],
                        })
                        .expect(
                            200,
                        );


                    const afterB =
                        await getStrategies(
                            tenantB,
                        );


                    expect(
                        afterB.map(
                            (item) => ({
                                id:
                                    item.id,

                                executionOrder:
                                    item.executionOrder,

                                conflictPriority:
                                    item.conflictPriority,

                                displayName:
                                    item.displayName,

                                isEnabled:
                                    item.isEnabled,

                                config:
                                    item.config,
                            }),
                        ),
                    ).toEqual(
                        beforeB.map(
                            (item) => ({
                                id:
                                    item.id,

                                executionOrder:
                                    item.executionOrder,

                                conflictPriority:
                                    item.conflictPriority,

                                displayName:
                                    item.displayName,

                                isEnabled:
                                    item.isEnabled,

                                config:
                                    item.config,
                            }),
                        ),
                    );
                } finally {
                    await restoreStrategies(
                        tenantA,
                        beforeA,
                    );
                }
            },
        );
    },
);