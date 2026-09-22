import {
    INestApplication,
    UnauthorizedException,
    ValidationPipe,
} from '@nestjs/common';
import { DeliveryCenterAdapter } from '../src/modules/carriers/adapters/delivery-center.adapter';
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
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import {
    AuthService,
} from '../src/modules/auth/auth.service';

import {
    SupabaseAuthGuard,
} from '../src/modules/auth/supabase-auth.guard';

import {
    CarriersController,
} from '../src/modules/carriers/carriers.controller';

import {
    CarriersService,
} from '../src/modules/carriers/carriers.service';

import {
    CarrierRegistry,
} from '../src/modules/carriers/carrier-registry.service';

import {
    MockCarrierAdapter,
} from '../src/modules/carriers/adapters/mock-carrier.adapter';

import {
    MockYangoAdapter,
} from '../src/modules/carriers/adapters/mock-yango.adapter';

import {
    QuotesController,
} from '../src/modules/quotes/quotes.controller';

import {
    QuotesService,
} from '../src/modules/quotes/quotes.service';

import {
    DecisionService,
} from '../src/modules/decision/decision.service';


describe(
    'Carriers + Quotes API + Auth + Tenant Isolation Integration',
    () => {
        let app: INestApplication;
        let moduleRef: TestingModule;

        let db: DbService;
        let config: ConfigService;
        let tenantsService: TenantsService;

        let tenantA:
            Awaited<
                ReturnType<
                    TenantsService['findByApiKey']
                >
            >;

        let tenantB:
            Awaited<
                ReturnType<
                    TenantsService['findByApiKey']
                >
            >;


        const tokenA =
            'integration-carriers-token-a';

        const tokenB =
            'integration-carriers-token-b';


        const providerAMockId =
            randomUUID();

        const providerAYangoId =
            randomUUID();

        const providerABadId =
            randomUUID();

        const providerBMockId =
            randomUUID();

        const providerBYangoId =
            randomUUID();


        const settingsAId =
            randomUUID();

        const settingsBId =
            randomUUID();


        const runId =
            Date.now().toString();


        const providerAMockCode =
            `API_A_MOCK_${runId}`;

        const providerAYangoCode =
            `API_A_YANGO_${runId}`;

        const providerABadCode =
            `API_A_BAD_${runId}`;

        const providerBMockCode =
            `API_B_MOCK_${runId}`;

        const providerBYangoCode =
            `API_B_YANGO_${runId}`;


        let previousActiveProvidersA:
            string[] = [];

        let previousActiveProvidersB:
            string[] = [];

        let previousActiveSettingsA:
            string[] = [];

        let previousActiveSettingsB:
            string[] = [];


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


        function authHeader(
            token: string,
        ): string {
            return `Bearer ${token}`;
        }


        const validQuotePayload = {
            pickupCities: [
                'Tel Aviv',
                'Netivot',
            ],

            destinationCity:
                'Jerusalem',

            weightKg:
                3,
        };


        beforeAll(
            async () => {
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
                                CarriersController,
                                QuotesController,
                            ],

                            providers: [
                                DbService,
                                ConfigService,
                                TenantsService,

                                MockCarrierAdapter,
                                MockYangoAdapter,
                                CarrierRegistry,
                                DeliveryCenterAdapter,
                                CarriersService,
                                DecisionService,
                                QuotesService,

                                SupabaseAuthGuard,

                                {
                                    provide:
                                        AuthService,

                                    useValue: {
                                        authenticateAccessToken:
                                            jest.fn(
                                                async (
                                                    token:
                                                        string,
                                                ) => {
                                                    if (
                                                        token ===
                                                        tokenA
                                                    ) {
                                                        return {
                                                            user: {
                                                                id:
                                                                    'integration-user-a',

                                                                email:
                                                                    'a@test.local',

                                                                displayName:
                                                                    'Integration A',

                                                                role:
                                                                    'admin',
                                                            },

                                                            tenant:
                                                                tenantA,
                                                        };
                                                    }

                                                    if (
                                                        token ===
                                                        tokenB
                                                    ) {
                                                        return {
                                                            user: {
                                                                id:
                                                                    'integration-user-b',

                                                                email:
                                                                    'b@test.local',

                                                                displayName:
                                                                    'Integration B',

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
                                    },
                                },
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

                        transform:
                            true,

                        forbidNonWhitelisted:
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


                const schemaA =
                    qSchema(
                        tenantA.schemaName,
                    );

                const schemaB =
                    qSchema(
                        tenantB.schemaName,
                    );


                /*
                 * ===========================================
                 * Save current active providers
                 * ===========================================
                 */

                const activeProvidersA =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from ${schemaA}.providers
                        where is_active = true
                        `,
                    );


                previousActiveProvidersA =
                    activeProvidersA.map(
                        (row) =>
                            row.id,
                    );


                const activeProvidersB =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from ${schemaB}.providers
                        where is_active = true
                        `,
                    );


                previousActiveProvidersB =
                    activeProvidersB.map(
                        (row) =>
                            row.id,
                    );


                /*
                 * Disable existing active providers
                 */

                await db.query(
                    `
                    update ${schemaA}.providers
                    set is_active = false
                    where is_active = true
                    `,
                );


                await db.query(
                    `
                    update ${schemaB}.providers
                    set is_active = false
                    where is_active = true
                    `,
                );


                /*
                 * ===========================================
                 * Save active decision settings
                 * ===========================================
                 */

                const activeSettingsA =
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
                    activeSettingsA.map(
                        (row) =>
                            row.id,
                    );


                const activeSettingsB =
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
                    activeSettingsB.map(
                        (row) =>
                            row.id,
                    );


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
                 * ===========================================
                 * Tenant A providers
                 * ===========================================
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
                    values
                    (
                        $1,
                        $2,
                        'API Integration Mock A',
                        'mock',
                        true,
                        true,
                        0.20
                    ),
                    (
                        $3,
                        $4,
                        'API Integration Yango A',
                        'mock-yango',
                        true,
                        true,
                        0.90
                    ),
                    (
                        $5,
                        $6,
                        'API Integration Broken A',
                        'adapter-does-not-exist',
                        true,
                        true,
                        0.50
                    )
                    `,
                    [
                        providerAMockId,
                        providerAMockCode,

                        providerAYangoId,
                        providerAYangoCode,

                        providerABadId,
                        providerABadCode,
                    ],
                );


                /*
                 * ===========================================
                 * Tenant B providers
                 * ===========================================
                 */

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
                    values
                    (
                        $1,
                        $2,
                        'API Integration Mock B',
                        'mock',
                        true,
                        true,
                        0.80
                    ),
                    (
                        $3,
                        $4,
                        'API Integration Yango B',
                        'mock-yango',
                        true,
                        true,
                        0.60
                    )
                    `,
                    [
                        providerBMockId,
                        providerBMockCode,

                        providerBYangoId,
                        providerBYangoCode,
                    ],
                );


                /*
                 * ===========================================
                 * Tenant A:
                 * strongly PRICE oriented
                 * ===========================================
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
                        0.90,
                        0.05,
                        0.05,
                        true
                    )
                    `,
                    [
                        settingsAId,
                    ],
                );


                /*
                 * ===========================================
                 * Tenant B:
                 * strongly SPEED oriented
                 * ===========================================
                 */

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
                        0.05,
                        0.90,
                        0.05,
                        true
                    )
                    `,
                    [
                        settingsBId,
                    ],
                );
            },
            30000,
        );


        afterAll(
            async () => {
                if (
                    db &&
                    tenantA &&
                    tenantB
                ) {
                    const schemaA =
                        qSchema(
                            tenantA.schemaName,
                        );

                    const schemaB =
                        qSchema(
                            tenantB.schemaName,
                        );


                    const providerIdsA = [
                        providerAMockId,
                        providerAYangoId,
                        providerABadId,
                    ];


                    const providerIdsB = [
                        providerBMockId,
                        providerBYangoId,
                    ];


                    /*
                     * Logs first because they reference providers
                     */

                    await db.query(
                        `
                        delete from ${schemaA}.provider_call_logs
                        where provider_id =
                            any($1::uuid[])
                        `,
                        [
                            providerIdsA,
                        ],
                    );


                    await db.query(
                        `
                        delete from ${schemaB}.provider_call_logs
                        where provider_id =
                            any($1::uuid[])
                        `,
                        [
                            providerIdsB,
                        ],
                    );


                    /*
                     * Test decision settings
                     */

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
                     * Test providers
                     */

                    await db.query(
                        `
                        delete from ${schemaA}.providers
                        where id =
                            any($1::uuid[])
                        `,
                        [
                            providerIdsA,
                        ],
                    );


                    await db.query(
                        `
                        delete from ${schemaB}.providers
                        where id =
                            any($1::uuid[])
                        `,
                        [
                            providerIdsB,
                        ],
                    );


                    /*
                     * Restore previous providers
                     */

                    if (
                        previousActiveProvidersA.length
                    ) {
                        await db.query(
                            `
                            update ${schemaA}.providers
                            set is_active = true
                            where id =
                                any($1::uuid[])
                            `,
                            [
                                previousActiveProvidersA,
                            ],
                        );
                    }


                    if (
                        previousActiveProvidersB.length
                    ) {
                        await db.query(
                            `
                            update ${schemaB}.providers
                            set is_active = true
                            where id =
                                any($1::uuid[])
                            `,
                            [
                                previousActiveProvidersB,
                            ],
                        );
                    }


                    /*
                     * Restore previous decision settings
                     */

                    if (
                        previousActiveSettingsA.length
                    ) {
                        await db.query(
                            `
                            update ${schemaA}.decision_settings
                            set is_active = true
                            where id =
                                any($1::uuid[])
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
                            where id =
                                any($1::uuid[])
                            `,
                            [
                                previousActiveSettingsB,
                            ],
                        );
                    }
                }


                if (app) {
                    await app.close();
                }
            },
            30000,
        );


        /*
         * =============================================================
         * TEST 1
         * Carriers requires Authorization
         * =============================================================
         */

        it(
            'should reject /carriers/quotes without Authorization header',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .post(
                        '/carriers/quotes',
                    )
                    .send(
                        validQuotePayload,
                    )
                    .expect(
                        401,
                    );
            },
        );


        /*
         * =============================================================
         * TEST 2
         * Invalid token
         * =============================================================
         */

        it(
            'should reject /carriers/quotes with invalid Bearer token',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .post(
                        '/carriers/quotes',
                    )
                    .set(
                        'Authorization',
                        authHeader(
                            'invalid-token',
                        ),
                    )
                    .send(
                        validQuotePayload,
                    )
                    .expect(
                        401,
                    );
            },
        );


        /*
         * =============================================================
         * TEST 3
         * DTO validation
         * =============================================================
         */

        it(
            'should reject invalid carrier quote payload',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/carriers/quotes',
                        )
                        .set(
                            'Authorization',
                            authHeader(
                                tokenA,
                            ),
                        )
                        .send({
                            pickupCities:
                                [],

                            destinationCity:
                                'Jerusalem',

                            weightKg:
                                0,
                        })
                        .expect(
                            400,
                        );


                expect(
                    Array.isArray(
                        response.body.message,
                    ),
                ).toBe(
                    true,
                );
            },
        );


        /*
         * =============================================================
         * TEST 4
         * Tenant A Carriers API
         * =============================================================
         */

        it(
            'should return Tenant A quotes and report its broken provider',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/carriers/quotes',
                        )
                        .set(
                            'Authorization',
                            authHeader(
                                tokenA,
                            ),
                        )
                        .send(
                            validQuotePayload,
                        )
                        .expect(
                            201,
                        );


                expect(
                    response.body.ok,
                ).toBe(
                    true,
                );


                expect(
                    response.body
                        .tenant
                        .schemaName,
                ).toBe(
                    tenantA.schemaName,
                );


                expect(
                    response.body.count,
                ).toBe(
                    2,
                );


                expect(
                    response.body.quotes,
                ).toHaveLength(
                    2,
                );


                const providerCodes =
                    response.body.quotes.map(
                        (
                            quote:
                                any,
                        ) =>
                            quote.providerCode,
                    );


                expect(
                    providerCodes,
                ).toEqual(
                    expect.arrayContaining([
                        providerAMockCode,
                        providerAYangoCode,
                    ]),
                );


                expect(
                    response.body.failedProviders,
                ).toHaveLength(
                    1,
                );


                expect(
                    response.body
                        .failedProviders[0]
                        .providerCode,
                ).toBe(
                    providerABadCode,
                );


                expect(
                    response.body
                        .failedProviders[0]
                        .adapterKey,
                ).toBe(
                    'adapter-does-not-exist',
                );


                expect(
                    response.body
                        .failedProviders[0]
                        .error,
                ).toContain(
                    'Carrier adapter not found',
                );
            },
        );


        /*
         * =============================================================
         * TEST 5
         * Tenant B isolation
         * =============================================================
         */

        it(
            'should return only Tenant B providers for Tenant B admin',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/carriers/quotes',
                        )
                        .set(
                            'Authorization',
                            authHeader(
                                tokenB,
                            ),
                        )
                        .send(
                            validQuotePayload,
                        )
                        .expect(
                            201,
                        );


                expect(
                    response.body
                        .tenant
                        .schemaName,
                ).toBe(
                    tenantB.schemaName,
                );


                expect(
                    response.body.count,
                ).toBe(
                    2,
                );


                expect(
                    response.body.failedProviders,
                ).toEqual(
                    [],
                );


                const providerCodes =
                    response.body.quotes.map(
                        (
                            quote:
                                any,
                        ) =>
                            quote.providerCode,
                    );


                expect(
                    providerCodes,
                ).toEqual(
                    expect.arrayContaining([
                        providerBMockCode,
                        providerBYangoCode,
                    ]),
                );


                expect(
                    providerCodes,
                ).not.toContain(
                    providerAMockCode,
                );


                expect(
                    providerCodes,
                ).not.toContain(
                    providerAYangoCode,
                );
            },
        );


        /*
         * =============================================================
         * TEST 6
         * Real provider_call_logs
         * =============================================================
         */

        it(
            'should write successful and failed provider call logs for Tenant A',
            async () => {
                const rows =
                    await db.query<{
                        provider_id: string;
                        action: string;
                        status: string;
                        error_message:
                        string | null;
                    }>(
                        `
                        select
                            provider_id,
                            action,
                            status,
                            error_message
                        from ${qSchema(
                            tenantA.schemaName,
                        )}.provider_call_logs
                        where provider_id =
                            any($1::uuid[])
                        order by created_at asc
                        `,
                        [[
                            providerAMockId,
                            providerAYangoId,
                            providerABadId,
                        ]],
                    );


                expect(
                    rows.length,
                ).toBeGreaterThanOrEqual(
                    3,
                );


                expect(
                    rows.some(
                        (row) =>
                            row.provider_id ===
                            providerAMockId &&
                            row.status ===
                            'success' &&
                            row.action ===
                            'get_quote',
                    ),
                ).toBe(
                    true,
                );


                expect(
                    rows.some(
                        (row) =>
                            row.provider_id ===
                            providerAYangoId &&
                            row.status ===
                            'success',
                    ),
                ).toBe(
                    true,
                );


                const failedRow =
                    rows.find(
                        (row) =>
                            row.provider_id ===
                            providerABadId &&
                            row.status ===
                            'failed',
                    );


                expect(
                    failedRow,
                ).toBeDefined();


                expect(
                    failedRow
                        ?.error_message,
                ).toContain(
                    'Carrier adapter not found',
                );
            },
        );


        /*
         * =============================================================
         * TEST 7
         * Logs tenant isolation
         * =============================================================
         */

        it(
            'should keep provider call logs isolated between tenants',
            async () => {
                const rowsB =
                    await db.query<{
                        provider_id: string;
                    }>(
                        `
                        select provider_id
                        from ${qSchema(
                            tenantB.schemaName,
                        )}.provider_call_logs
                        where provider_id =
                            any($1::uuid[])
                        `,
                        [[
                            providerBMockId,
                            providerBYangoId,
                        ]],
                    );


                expect(
                    rowsB.length,
                ).toBeGreaterThanOrEqual(
                    2,
                );


                const leakedA =
                    await db.query<{
                        provider_id: string;
                    }>(
                        `
                        select provider_id
                        from ${qSchema(
                            tenantB.schemaName,
                        )}.provider_call_logs
                        where provider_id =
                            any($1::uuid[])
                        `,
                        [[
                            providerAMockId,
                            providerAYangoId,
                            providerABadId,
                        ]],
                    );


                expect(
                    leakedA,
                ).toHaveLength(
                    0,
                );
            },
        );


        /*
         * =============================================================
         * TEST 8
         * Quotes requires auth
         * =============================================================
         */

        it(
            'should reject /quotes without Authorization header',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .post(
                        '/quotes',
                    )
                    .send(
                        validQuotePayload,
                    )
                    .expect(
                        401,
                    );
            },
        );


        /*
         * =============================================================
         * TEST 9
         * QuoteRequestDto validation
         * =============================================================
         */

        it(
            'should reject invalid /quotes payload',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .post(
                        '/quotes',
                    )
                    .set(
                        'Authorization',
                        authHeader(
                            tokenA,
                        ),
                    )
                    .send({
                        pickupCities: [
                            'Tel Aviv',
                        ],

                        destinationCity:
                            'Jerusalem',

                        weightKg:
                            -5,
                    })
                    .expect(
                        400,
                    );
            },
        );


        /*
         * =============================================================
         * TEST 10
         * Tenant A price-oriented decision
         * =============================================================
         */

        it(
            'should choose Mock Express for price-oriented Tenant A',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/quotes',
                        )
                        .set(
                            'Authorization',
                            authHeader(
                                tokenA,
                            ),
                        )
                        .send(
                            validQuotePayload,
                        )
                        .expect(
                            201,
                        );


                expect(
                    response.body.ok,
                ).toBe(
                    true,
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
                        .decisionSettings,
                ).toEqual({
                    priceWeight:
                        0.90,

                    speedWeight:
                        0.05,

                    providerPriorityWeight:
                        0.05,
                });


                expect(
                    response.body.count,
                ).toBe(
                    2,
                );


                expect(
                    response.body.bestQuote,
                ).not.toBeNull();


                expect(
                    response.body
                        .bestQuote
                        .carrierName,
                ).toBe(
                    'Mock Express',
                );


                expect(
                    response.body
                        .bestQuote
                        .serviceName,
                ).toBe(
                    'Budget Delivery',
                );


                expect(
                    response.body
                        .bestQuote
                        .price,
                ).toBe(
                    15,
                );


                expect(
                    response.body.failedProviders,
                ).toHaveLength(
                    1,
                );
            },
        );


        /*
         * =============================================================
         * TEST 11
         * Tenant B speed-oriented decision
         * =============================================================
         */

        it(
            'should choose Mock Yango for speed-oriented Tenant B',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/quotes',
                        )
                        .set(
                            'Authorization',
                            authHeader(
                                tokenB,
                            ),
                        )
                        .send(
                            validQuotePayload,
                        )
                        .expect(
                            201,
                        );


                expect(
                    response.body.ok,
                ).toBe(
                    true,
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
                        .decisionSettings,
                ).toEqual({
                    priceWeight:
                        0.05,

                    speedWeight:
                        0.90,

                    providerPriorityWeight:
                        0.05,
                });


                expect(
                    response.body.bestQuote
                        .carrierName,
                ).toBe(
                    'Mock Yango',
                );


                expect(
                    response.body.bestQuote
                        .serviceName,
                ).toBe(
                    'Yango Same Day',
                );


                expect(
                    response.body.bestQuote
                        .estimatedDays,
                ).toBe(
                    0,
                );


                expect(
                    response.body
                        .failedProviders,
                ).toEqual(
                    [],
                );
            },
        );


        /*
         * =============================================================
         * TEST 12
         * Full Quotes API tenant isolation
         * =============================================================
         */

        it(
            'should keep quotes and decision settings isolated between Tenant A and Tenant B',
            async () => {
                const [
                    responseA,
                    responseB,
                ] =
                    await Promise.all([
                        request(
                            app.getHttpServer(),
                        )
                            .post(
                                '/quotes',
                            )
                            .set(
                                'Authorization',
                                authHeader(
                                    tokenA,
                                ),
                            )
                            .send(
                                validQuotePayload,
                            )
                            .expect(
                                201,
                            ),

                        request(
                            app.getHttpServer(),
                        )
                            .post(
                                '/quotes',
                            )
                            .set(
                                'Authorization',
                                authHeader(
                                    tokenB,
                                ),
                            )
                            .send(
                                validQuotePayload,
                            )
                            .expect(
                                201,
                            ),
                    ]);


                expect(
                    responseA.body
                        .tenant
                        .schemaName,
                ).toBe(
                    tenantA.schemaName,
                );


                expect(
                    responseB.body
                        .tenant
                        .schemaName,
                ).toBe(
                    tenantB.schemaName,
                );


                expect(
                    responseA.body
                        .decisionSettings
                        .priceWeight,
                ).toBe(
                    0.90,
                );


                expect(
                    responseB.body
                        .decisionSettings
                        .priceWeight,
                ).toBe(
                    0.05,
                );


                expect(
                    responseA.body
                        .bestQuote
                        .carrierName,
                ).toBe(
                    'Mock Express',
                );


                expect(
                    responseB.body
                        .bestQuote
                        .carrierName,
                ).toBe(
                    'Mock Yango',
                );


                const codesA =
                    responseA.body.quotes.map(
                        (
                            quote:
                                any,
                        ) =>
                            quote.providerCode,
                    );


                const codesB =
                    responseB.body.quotes.map(
                        (
                            quote:
                                any,
                        ) =>
                            quote.providerCode,
                    );


                expect(
                    codesA,
                ).toEqual(
                    expect.arrayContaining([
                        providerAMockCode,
                        providerAYangoCode,
                    ]),
                );


                expect(
                    codesB,
                ).toEqual(
                    expect.arrayContaining([
                        providerBMockCode,
                        providerBYangoCode,
                    ]),
                );


                expect(
                    codesA,
                ).not.toEqual(
                    expect.arrayContaining([
                        providerBMockCode,
                        providerBYangoCode,
                    ]),
                );


                expect(
                    codesB,
                ).not.toEqual(
                    expect.arrayContaining([
                        providerAMockCode,
                        providerAYangoCode,
                    ]),
                );
            },
        );
    },
);