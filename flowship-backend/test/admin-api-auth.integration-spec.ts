import {
    INestApplication,
    UnauthorizedException,
    ValidationPipe,
} from '@nestjs/common';

import {
    ConfigModule,
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
    DbService,
} from '../src/infrastructure/database/db.service';

import {
    AdminController,
} from '../src/modules/admin/admin.controller';

import {
    AdminService,
} from '../src/modules/admin/admin.service';

import {
    AuthService,
} from '../src/modules/auth/auth.service';

import {
    SupabaseAuthGuard,
} from '../src/modules/auth/supabase-auth.guard';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';


describe(
    'Admin API + Auth + Tenant Isolation Integration',
    () => {
        let app: INestApplication;
        let moduleRef: TestingModule;

        let db: DbService;
        let config: ConfigService;
        let tenantsService: TenantsService;

        let tenantA: CurrentTenant;
        let tenantB: CurrentTenant;

        const tokenA =
            'integration-admin-token-a';

        const tokenB =
            'integration-admin-token-b';

        /*
         * ============================================================
         * Test IDs
         * ============================================================
         */

        const providerAId =
            randomUUID();

        const providerBId =
            randomUUID();

        const settingsAId =
            randomUUID();

        const settingsBId =
            randomUUID();


        const logAId =
            randomUUID();

        const logBId =
            randomUUID();


        const providerACode =
            `ADMIN_A_${Date.now()}`;

        const providerBCode =
            `ADMIN_B_${Date.now()}`;
        const criterionAId =
            randomUUID();

        const criterionBId =
            randomUUID();


        /*
         * נשמור settings שהיו active לפני הטסט,
         * כדי להחזיר את DB בדיוק למצב הקודם.
         */
        let previousActiveSettingsA:
            string[] = [];

        let previousActiveSettingsB:
            string[] = [];


        /*
         * ============================================================
         * Helpers
         * ============================================================
         */

        function qSchema(
            schemaName: string,
        ) {
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


        function authHeader(
            token: string,
        ) {
            return `Bearer ${token}`;
        }


        /*
         * ============================================================
         * Setup
         * ============================================================
         */

        beforeAll(
            async () => {
                const authServiceMock = {
                    authenticateAccessToken:
                        jest.fn(
                            async (
                                token: string,
                            ) => {
                                if (
                                    token === tokenA
                                ) {
                                    return {
                                        user: {
                                            id:
                                                'integration-admin-a',
                                            email:
                                                'admin-a@test.local',
                                            displayName:
                                                'Integration Admin A',
                                            role:
                                                'admin',
                                        },

                                        tenant:
                                            tenantA,
                                    };
                                }


                                if (
                                    token === tokenB
                                ) {
                                    return {
                                        user: {
                                            id:
                                                'integration-admin-b',
                                            email:
                                                'admin-b@test.local',
                                            displayName:
                                                'Integration Admin B',
                                            role:
                                                'admin',
                                        },

                                        tenant:
                                            tenantB,
                                    };
                                }


                                throw new UnauthorizedException(
                                    'Invalid or expired access token',
                                );
                            },
                        ),
                };


                moduleRef =
                    await Test
                        .createTestingModule({
                            imports: [
                                ConfigModule.forRoot({
                                    isGlobal:
                                        true,
                                }),
                            ],

                            controllers: [
                                AdminController,
                            ],

                            providers: [
                                DbService,
                                ConfigService,
                                TenantsService,
                                AdminService,
                                SupabaseAuthGuard,

                                {
                                    provide:
                                        AuthService,

                                    useValue:
                                        authServiceMock,
                                },
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


                /*
                 * ====================================================
                 * Resolve test tenants
                 * ====================================================
                 */

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
                    await tenantsService
                        .findByApiKey(
                            tenantAApiKey,
                        );

                tenantB =
                    await tenantsService
                        .findByApiKey(
                            tenantBApiKey,
                        );


                const schemaA =
                    qSchema(
                        tenantA.schemaName,
                    );

                const schemaB =
                    qSchema(
                        tenantB.schemaName,
                    );


                /*
                 * ====================================================
                 * Save existing active decision settings
                 * ====================================================
                 */

                const oldSettingsA =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from ${schemaA}.decision_settings
                        where is_active = true
                        `,
                    );


                previousActiveSettingsA =
                    oldSettingsA.map(
                        (row) =>
                            row.id,
                    );


                const oldSettingsB =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from ${schemaB}.decision_settings
                        where is_active = true
                        `,
                    );


                previousActiveSettingsB =
                    oldSettingsB.map(
                        (row) =>
                            row.id,
                    );


                /*
                 * Temporarily disable old active settings.
                 */

                await db.query(
                    `
                    update ${schemaA}.decision_settings
                    set is_active = false
                    where is_active = true
                    `,
                );


                await db.query(
                    `
                    update ${schemaB}.decision_settings
                    set is_active = false
                    where is_active = true
                    `,
                );


                /*
                 * ====================================================
                 * Providers
                 * ====================================================
                 */

                await db.query(
                    `
                    insert into ${schemaA}.providers (
                        id,
                        code,
                        name,
                        adapter_key,
                        is_mock,
                        is_active,
                        priority_score
                    )
                    values (
                        $1,
                        $2,
                        'Admin Integration Provider A',
                        'mock',
                        true,
                        true,
                        0.55
                    )
                    `,
                    [
                        providerAId,
                        providerACode,
                    ],
                );


                await db.query(
                    `
                    insert into ${schemaB}.providers (
                        id,
                        code,
                        name,
                        adapter_key,
                        is_mock,
                        is_active,
                        priority_score
                    )
                    values (
                        $1,
                        $2,
                        'Admin Integration Provider B',
                        'mock',
                        true,
                        true,
                        0.65
                    )
                    `,
                    [
                        providerBId,
                        providerBCode,
                    ],
                );


                /*
                 * ====================================================
                 * Decision settings
                 * ====================================================
                 */

                await db.query(
                    `
                    insert into ${schemaA}.decision_settings (
                        id,
                        price_weight,
                        speed_weight,
                        provider_priority_weight,
                        is_active
                    )
                    values (
                        $1,
                        0.60,
                        0.30,
                        0.10,
                        true
                    )
                    `,
                    [
                        settingsAId,
                    ],
                );


                await db.query(
                    `
                    insert into ${schemaB}.decision_settings (
                        id,
                        price_weight,
                        speed_weight,
                        provider_priority_weight,
                        is_active
                    )
                    values (
                        $1,
                        0.20,
                        0.30,
                        0.50,
                        true
                    )
                    `,
                    [
                        settingsBId,
                    ],
                );


                /*
                 * ====================================================
                 * Decision criteria
                 * ====================================================
                 */

                await db.query(
                    `
    insert into ${schemaA}.decision_criteria (
        id,
        key,
        label,
        description,
        weight,
        is_active
    )
    values (
        $1,
        'price',
        'Admin Integration Price A',
        'Price criterion created by Admin API integration test',
        0.70,
        true
    )
    on conflict (key)
    do update set
        label = excluded.label,
        description = excluded.description,
        weight = excluded.weight,
        is_active = excluded.is_active
    `,
                    [
                        criterionAId,
                    ],
                );
                await db.query(
                    `
    insert into ${schemaB}.decision_criteria (
        id,
        key,
        label,
        description,
        weight,
        is_active
    )
    values (
        $1,
        'speed',
        'Admin Integration Speed B',
        'Speed criterion created by Admin API integration test',
        0.30,
        true
    )
    on conflict (key)
    do update set
        label = excluded.label,
        description = excluded.description,
        weight = excluded.weight,
        is_active = excluded.is_active
    `,
                    [
                        criterionBId,
                    ],
                );
                /*
                 * ====================================================
                 * Provider call logs
                 * ====================================================
                 */

                await db.query(
                    `
                    insert into ${schemaA}.provider_call_logs (
                        id,
                        provider_id,
                        action,
                        request,
                        response,
                        status,
                        response_time_ms,
                        error_message
                    )
                    values (
                        $1,
                        $2,
'get_quote',                        '{"tenant":"A"}'::jsonb,
                        '{"ok":true}'::jsonb,
                        'success',
                        123,
                        null
                    )
                    `,
                    [
                        logAId,
                        providerAId,
                    ],
                );


                await db.query(
                    `
                    insert into ${schemaB}.provider_call_logs (
                        id,
                        provider_id,
                        action,
                        request,
                        response,
                        status,
                        response_time_ms,
                        error_message
                    )
                    values (
                        $1,
                        $2,
                        'get_quote',
                        '{"tenant":"B"}'::jsonb,
                        '{"ok":true}'::jsonb,
                        'success',
                        456,
                        null
                    )
                    `,
                    [
                        logBId,
                        providerBId,
                    ],
                );


                /*
                 * ====================================================
                 * HTTP App
                 * ====================================================
                 */

                app =
                    moduleRef
                        .createNestApplication();


                app.useGlobalPipes(
                    new ValidationPipe({
                        whitelist:
                            true,

                        transform:
                            true,

                        forbidNonWhitelisted:
                            true,
                    }),
                );


                await app.init();
            },
            30000,
        );


        /*
         * ============================================================
         * Cleanup
         * ============================================================
         */

        afterAll(
            async () => {
                if (db && tenantA && tenantB) {
                    const schemaA =
                        qSchema(
                            tenantA.schemaName,
                        );

                    const schemaB =
                        qSchema(
                            tenantB.schemaName,
                        );


                    /*
                     * Logs first because they reference providers.
                     */

                    await db.query(
                        `
                        delete from ${schemaA}.provider_call_logs
                        where id = $1
                        `,
                        [
                            logAId,
                        ],
                    );


                    await db.query(
                        `
                        delete from ${schemaB}.provider_call_logs
                        where id = $1
                        `,
                        [
                            logBId,
                        ],
                    );




                    /*
                     * Test decision settings
                     */
                    await db.query(
                        `
    delete from ${schemaA}.decision_criteria
    where id = $1
    `,
                        [
                            criterionAId,
                        ],
                    );


                    await db.query(
                        `
    delete from ${schemaB}.decision_criteria
    where id = $1
    `,
                        [
                            criterionBId,
                        ],
                    );
                    await db.query(
                        `
                        delete from ${schemaA}.decision_settings
                        where id = $1
                        `,
                        [
                            settingsAId,
                        ],
                    );


                    await db.query(
                        `
                        delete from ${schemaB}.decision_settings
                        where id = $1
                        `,
                        [
                            settingsBId,
                        ],
                    );


                    /*
                     * Restore settings that were active
                     * before this suite started.
                     */

                    if (
                        previousActiveSettingsA.length
                    ) {
                        await db.query(
                            `
                            update ${schemaA}.decision_settings
                            set is_active = true
                            where id = any($1::uuid[])
                            `,
                            [
                                previousActiveSettingsA,
                            ],
                        );
                    }


                    if (
                        previousActiveSettingsB.length
                    ) {
                        await db.query(
                            `
                            update ${schemaB}.decision_settings
                            set is_active = true
                            where id = any($1::uuid[])
                            `,
                            [
                                previousActiveSettingsB,
                            ],
                        );
                    }


                    /*
                     * Providers last.
                     */

                    await db.query(
                        `
                        delete from ${schemaA}.providers
                        where id = $1
                        `,
                        [
                            providerAId,
                        ],
                    );


                    await db.query(
                        `
                        delete from ${schemaB}.providers
                        where id = $1
                        `,
                        [
                            providerBId,
                        ],
                    );
                }


                if (app) {
                    await app.close();
                }
            },
            30000,
        );


        /*
         * ============================================================
         * TEST 1
         * No authorization
         * ============================================================
         */

        it(
            'should reject Admin API request without Authorization header',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .get(
                        '/admin/providers',
                    )
                    .expect(
                        401,
                    );
            },
        );


        /*
         * ============================================================
         * TEST 2
         * Invalid bearer token
         * ============================================================
         */

        it(
            'should reject Admin API request with invalid Bearer token',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .get(
                        '/admin/providers',
                    )
                    .set(
                        'Authorization',
                        authHeader(
                            'invalid-admin-token',
                        ),
                    )
                    .expect(
                        401,
                    );
            },
        );


        /*
         * ============================================================
         * TEST 3
         * Tenant A providers
         * ============================================================
         */

        it(
            'should return Tenant A providers for Tenant A admin',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/providers',
                        )
                        .set(
                            'Authorization',
                            authHeader(
                                tokenA,
                            ),
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
                    response.body.tenant.schemaName,
                ).toBe(
                    tenantA.schemaName,
                );


                expect(
                    response.body.providers,
                ).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            id:
                                providerAId,

                            code:
                                providerACode,

                            name:
                                'Admin Integration Provider A',
                        }),
                    ]),
                );
            },
        );


        /*
         * ============================================================
         * TEST 4
         * Provider tenant isolation
         * ============================================================
         */

        it(
            'should not expose Tenant A provider to Tenant B admin',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/providers',
                        )
                        .set(
                            'Authorization',
                            authHeader(
                                tokenB,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body.providers.some(
                        (
                            provider: {
                                id: string;
                            },
                        ) =>
                            provider.id ===
                            providerAId,
                    ),
                ).toBe(
                    false,
                );


                expect(
                    response.body.providers.some(
                        (
                            provider: {
                                id: string;
                            },
                        ) =>
                            provider.id ===
                            providerBId,
                    ),
                ).toBe(
                    true,
                );
            },
        );


        /*
         * ============================================================
         * TEST 5
         * Update provider
         * ============================================================
         */

        it(
            'should update Tenant A provider through the Admin API',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .patch(
                            `/admin/providers/${providerAId}`,
                        )
                        .set(
                            'Authorization',
                            authHeader(
                                tokenA,
                            ),
                        )
                        .send({
                            isActive:
                                false,

                            priorityScore:
                                0.91,
                        })
                        .expect(
                            200,
                        );


                expect(
                    response.body.provider.id,
                ).toBe(
                    providerAId,
                );


                expect(
                    response.body.provider.isActive,
                ).toBe(
                    false,
                );


                expect(
                    response.body.provider.priorityScore,
                ).toBeCloseTo(
                    0.91,
                );


                const rows =
                    await db.query<{
                        is_active: boolean;
                        priority_score:
                        string | number;
                    }>(
                        `
                        select
                            is_active,
                            priority_score
                        from ${qSchema(
                            tenantA.schemaName,
                        )}.providers
                        where id = $1
                        `,
                        [
                            providerAId,
                        ],
                    );


                expect(
                    rows[0].is_active,
                ).toBe(
                    false,
                );


                expect(
                    Number(
                        rows[0].priority_score,
                    ),
                ).toBeCloseTo(
                    0.91,
                );
            },
        );


        /*
         * ============================================================
         * TEST 6
         * Provider update isolation
         * ============================================================
         */

        it(
            'should not update Tenant B provider when Tenant A provider is changed',
            async () => {
                const rows =
                    await db.query<{
                        is_active: boolean;
                        priority_score:
                        string | number;
                    }>(
                        `
                        select
                            is_active,
                            priority_score
                        from ${qSchema(
                            tenantB.schemaName,
                        )}.providers
                        where id = $1
                        `,
                        [
                            providerBId,
                        ],
                    );


                expect(
                    rows,
                ).toHaveLength(
                    1,
                );


                expect(
                    rows[0].is_active,
                ).toBe(
                    true,
                );


                expect(
                    Number(
                        rows[0].priority_score,
                    ),
                ).toBeCloseTo(
                    0.65,
                );
            },
        );


        /*
         * ============================================================
         * TEST 7
         * Decision settings GET
         * ============================================================
         */

        it(
            'should return Tenant A decision settings',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/decision-settings',
                        )
                        .set(
                            'Authorization',
                            authHeader(
                                tokenA,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body.settings.id,
                ).toBe(
                    settingsAId,
                );


                expect(
                    response.body.settings.priceWeight,
                ).toBeCloseTo(
                    0.60,
                );


                expect(
                    response.body.settings.speedWeight,
                ).toBeCloseTo(
                    0.30,
                );


                expect(
                    response.body.settings.providerPriorityWeight,
                ).toBeCloseTo(
                    0.10,
                );
            },
        );


        /*
         * ============================================================
         * TEST 8
         * Decision settings PATCH
         * ============================================================
         */

        it(
            'should update Tenant A decision settings through the Admin API',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .patch(
                            '/admin/decision-settings',
                        )
                        .set(
                            'Authorization',
                            authHeader(tokenA),
                        )
                        .send({
                            priceWeight: 0.20,
                            speedWeight: 0.70,
                            providerPriorityWeight: 0.10,
                        })
                        .expect(200);

                expect(response.status).toBe(200);

                expect(
                    response.body.settings.priceWeight,
                ).toBeCloseTo(
                    0.20,
                );


                expect(
                    response.body.settings.speedWeight,
                ).toBeCloseTo(
                    0.70,
                );


                const rows =
                    await db.query<{
                        price_weight:
                        string | number;

                        speed_weight:
                        string | number;

                        provider_priority_weight:
                        string | number;
                    }>(
                        `
                        select
                            price_weight,
                            speed_weight,
                            provider_priority_weight
                        from ${qSchema(
                            tenantA.schemaName,
                        )}.decision_settings
                        where id = $1
                        `,
                        [
                            settingsAId,
                        ],
                    );


                expect(
                    Number(
                        rows[0].price_weight,
                    ),
                ).toBeCloseTo(
                    0.20,
                );


                expect(
                    Number(
                        rows[0].speed_weight,
                    ),
                ).toBeCloseTo(
                    0.70,
                );
            },
        );


        /*
         * ============================================================
         * TEST 9
         * Decision settings tenant isolation
         * ============================================================
         */

        it(
            'should not change Tenant B decision settings when Tenant A settings are updated',
            async () => {
                const rows =
                    await db.query<{
                        price_weight:
                        string | number;

                        speed_weight:
                        string | number;

                        provider_priority_weight:
                        string | number;
                    }>(
                        `
                        select
                            price_weight,
                            speed_weight,
                            provider_priority_weight
                        from ${qSchema(
                            tenantB.schemaName,
                        )}.decision_settings
                        where id = $1
                        `,
                        [
                            settingsBId,
                        ],
                    );


                expect(
                    Number(
                        rows[0].price_weight,
                    ),
                ).toBeCloseTo(
                    0.20,
                );


                expect(
                    Number(
                        rows[0].speed_weight,
                    ),
                ).toBeCloseTo(
                    0.30,
                );


                expect(
                    Number(
                        rows[0]
                            .provider_priority_weight,
                    ),
                ).toBeCloseTo(
                    0.50,
                );
            },
        );


        /*
         * ============================================================
         * TEST 10
         * Provider logs + filter
         * ============================================================
         */

        it(
            'should return filtered provider call logs for Tenant A',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/provider-call-logs',
                        )
                        .query({
                            status:
                                'success',

                            providerCode:
                                providerACode,

                            action:
                                'get_quote',

                            limit:
                                '10',
                        })
                        .set(
                            'Authorization',
                            authHeader(
                                tokenA,
                            ),
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
                    response.body.logs,
                ).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            id:
                                logAId,

                            providerId:
                                providerAId,

                            providerCode:
                                providerACode,

                            action:
                                'get_quote',

                            status:
                                'success',
                        }),
                    ]),
                );
            },
        );


        /*
         * ============================================================
         * TEST 11
         * Provider logs isolation
         * ============================================================
         */

        it(
            'should not expose Tenant A provider logs to Tenant B admin',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/provider-call-logs',
                        )
                        .set(
                            'Authorization',
                            authHeader(
                                tokenB,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body.logs.some(
                        (
                            log: {
                                id: string;
                            },
                        ) =>
                            log.id ===
                            logAId,
                    ),
                ).toBe(
                    false,
                );


                expect(
                    response.body.logs.some(
                        (
                            log: {
                                id: string;
                            },
                        ) =>
                            log.id ===
                            logBId,
                    ),
                ).toBe(
                    true,
                );
            },
        );


        /*
         * ============================================================
         * TEST 12
         * Decision criteria tenant isolation
         * ============================================================
         */

        it(
            'should return decision criteria from the authenticated tenant',
            async () => {
                const responseA =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/decision-criteria',
                        )
                        .set(
                            'Authorization',
                            authHeader(tokenA),
                        )
                        .expect(200);


                expect(
                    responseA.body.tenant.schemaName,
                ).toBe(
                    tenantA.schemaName,
                );

                expect(
                    responseA.body.criteria.some(
                        (criterion: { key: string }) =>
                            criterion.key === 'price',
                    ),
                ).toBe(true);


                const responseB =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/decision-criteria',
                        )
                        .set(
                            'Authorization',
                            authHeader(tokenB),
                        )
                        .expect(200);


                expect(
                    responseB.body.tenant.schemaName,
                ).toBe(
                    tenantB.schemaName,
                );

                expect(
                    responseB.body.criteria.some(
                        (criterion: { key: string }) =>
                            criterion.key === 'speed',
                    ),
                ).toBe(true);
            },
        );
    },
);