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

import { randomUUID } from 'crypto';

import { DbService } from '../src/infrastructure/database/db.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import { CheckoutController } from '../src/modules/checkout/checkout.controller';

import { CheckoutService } from '../src/modules/checkout/checkout.service';

import { CheckoutRepository } from '../src/modules/checkout/checkout.repository';

import { CheckoutProcessingRepository } from '../src/modules/checkout/checkout-processing.repository';

import { SourcingService } from '../src/modules/sourcing/sourcing.service';

import { MockInventoryProvider } from '../src/modules/sourcing/adapters/mock-inventory.provider';

import { INVENTORY_PROVIDER } from '../src/modules/sourcing/sourcing.tokens';

import { AuditLogsService } from '../src/modules/audit-logs/audit-logs.service';

import { GroupingService } from '../src/modules/grouping/grouping.service';

import { GroupingRulesService } from '../src/modules/grouping/grouping-rules.service';

import { GroupingStrategySettingsRepository } from '../src/modules/grouping/grouping-strategy-settings.repository';

import { ShipmentGroupsRepository } from '../src/modules/grouping/shipment-groups.repository';

import { ShipmentPlanGeneratorService } from '../src/modules/planning/shipment-plan-generator.service';

import { ShipmentPlanBuilderService } from '../src/modules/planning/shipment-plan-builder.service';

import { ShipmentPlanEvaluatorService } from '../src/modules/planning/shipment-plan-evaluator.service';

import { ShipmentPlanQuoteService } from '../src/modules/planning/shipment-plan-quote.service';

import { ShipmentPlanDeliveryOptionsService } from '../src/modules/planning/shipment-plan-delivery-options.service';

import { DecisionService } from '../src/modules/decision/decision.service';

import { ShipmentCreationService } from '../src/modules/shipments/shipment-creation.service';

import { ShipmentsRepository } from '../src/modules/shipments/shipments.repository';

import { CarriersService } from '../src/modules/carriers/carriers.service';

import { CarrierRegistry } from '../src/modules/carriers/carrier-registry.service';

import { MockCarrierAdapter } from '../src/modules/carriers/adapters/mock-carrier.adapter';

import { MockYangoAdapter } from '../src/modules/carriers/adapters/mock-yango.adapter';

import { SupabaseAuthGuard } from '../src/modules/auth/supabase-auth.guard';

import { AuthService } from '../src/modules/auth/auth.service';


describe(
    'Checkout API + Tenant Authentication Integration',
    () => {
        let moduleRef: TestingModule;
        let app: INestApplication;

        let db: DbService;
        let config: ConfigService;
        let tenantsService: TenantsService;

        let tenantA: CurrentTenant;
        let tenantB: CurrentTenant;

        let tenantAApiKey: string;
        let tenantBApiKey: string;

        let authenticateAccessTokenMock:
            jest.Mock;

        let providerMockId: string;
        let providerYangoId: string;

        let priceCardId: string;
        let speedCardId: string;

        let groupingStrategyId: string;

        let orderId: string;
        let checkoutId: string;

        const adminTokenA =
            'integration-admin-token-a';

        const adminTokenB =
            'integration-admin-token-b';

        const invalidToken =
            'integration-invalid-token';

        let previouslyActiveProviderIdsA:
            string[] = [];

        let previouslyActiveDecisionCardIdsA:
            string[] = [];

        let previouslyEnabledGroupingStrategyIdsA:
            string[] = [];


        beforeAll(
            async () => {
                /*
                 * =====================================================
                 * Auth mock
                 * =====================================================
                 *
                 * SupabaseAuthGuard עצמו אמיתי.
                 *
                 * רק הקריאה החיצונית ל-Supabase Auth
                 * מוחלפת כדי שהטסט לא יהיה תלוי באינטרנט.
                 */

                authenticateAccessTokenMock =
                    jest.fn();


                moduleRef =
                    await Test
                        .createTestingModule({
                            imports: [
                                ConfigModule.forRoot({
                                    isGlobal: true,
                                }),
                            ],

                            controllers: [
                                CheckoutController,
                            ],

                            providers: [
                                /*
                                 * Infrastructure
                                 */
                                DbService,

                                /*
                                 * Tenant
                                 */
                                TenantsService,

                                /*
                                 * Auth
                                 */
                                {
                                    provide:
                                        AuthService,

                                    useValue: {
                                        authenticateAccessToken:
                                            authenticateAccessTokenMock,
                                    },
                                },

                                SupabaseAuthGuard,

                                /*
                                 * Checkout
                                 */
                                CheckoutRepository,
                                CheckoutProcessingRepository,
                                CheckoutService,

                                /*
                                 * Audit
                                 */
                                AuditLogsService,

                                /*
                                 * Sourcing
                                 */
                                MockInventoryProvider,

                                {
                                    provide:
                                        INVENTORY_PROVIDER,

                                    useExisting:
                                        MockInventoryProvider,
                                },

                                SourcingService,

                                /*
                                 * Grouping
                                 */
                                GroupingStrategySettingsRepository,
                                GroupingRulesService,
                                GroupingService,
                                ShipmentGroupsRepository,

                                /*
                                 * Planning
                                 */
                                ShipmentPlanGeneratorService,
                                ShipmentPlanBuilderService,
                                ShipmentPlanEvaluatorService,
                                ShipmentPlanQuoteService,
                                ShipmentPlanDeliveryOptionsService,

                                /*
                                 * Carriers
                                 */
                                MockCarrierAdapter,
                                MockYangoAdapter,
                                CarrierRegistry,
                                CarriersService,

                                /*
                                 * Decision
                                 */
                                DecisionService,

                                /*
                                 * Shipment
                                 */
                                ShipmentsRepository,
                                ShipmentCreationService,
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
                 * =====================================================
                 * HTTP application
                 * =====================================================
                 */

                app =
                    moduleRef
                        .createNestApplication();


                /*
                 * אותו ValidationPipe שיש ב-main.ts
                 */

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


                /*
                 * =====================================================
                 * Test tenants
                 * =====================================================
                 */

                const keyA =
                    config.get<string>(
                        'TEST_FLOW_SHIP_A_API_KEY',
                    );

                const keyB =
                    config.get<string>(
                        'TEST_FLOW_SHIP_B_API_KEY',
                    );


                if (!keyA) {
                    throw new Error(
                        'Missing TEST_FLOW_SHIP_A_API_KEY',
                    );
                }


                if (!keyB) {
                    throw new Error(
                        'Missing TEST_FLOW_SHIP_B_API_KEY',
                    );
                }


                tenantAApiKey =
                    keyA;

                tenantBApiKey =
                    keyB;


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


                /*
                 * =====================================================
                 * Auth contexts
                 * =====================================================
                 */

                authenticateAccessTokenMock
                    .mockImplementation(
                        async (
                            accessToken:
                                string,
                        ) => {
                            if (
                                accessToken ===
                                adminTokenA
                            ) {
                                return {
                                    user: {
                                        id:
                                            'integration-user-a',

                                        email:
                                            'integration-a@test.local',

                                        displayName:
                                            'Integration User A',

                                        role:
                                            'admin',
                                    },

                                    tenant:
                                        tenantA,
                                };
                            }


                            if (
                                accessToken ===
                                adminTokenB
                            ) {
                                return {
                                    user: {
                                        id:
                                            'integration-user-b',

                                        email:
                                            'integration-b@test.local',

                                        displayName:
                                            'Integration User B',

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
                    );


                /*
                 * =====================================================
                 * IDs
                 * =====================================================
                 */

                providerMockId =
                    randomUUID();

                providerYangoId =
                    randomUUID();

                priceCardId =
                    randomUUID();

                speedCardId =
                    randomUUID();

                groupingStrategyId =
                    randomUUID();

                orderId =
                    `CHECKOUT-API-${Date.now()}-${randomUUID()}`;


                /*
                 * =====================================================
                 * Save previous Tenant A configuration
                 * =====================================================
                 */

                const activeProviders =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from flow_ship_test_a.providers
                        where is_active = true
                        `,
                    );


                previouslyActiveProviderIdsA =
                    activeProviders.map(
                        (row) =>
                            row.id,
                    );


                const activeDecisionCards =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from flow_ship_test_a.decision_priority_cards
                        where is_active = true
                        `,
                    );


                previouslyActiveDecisionCardIdsA =
                    activeDecisionCards.map(
                        (row) =>
                            row.id,
                    );


                const enabledStrategies =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from flow_ship_test_a.grouping_strategy_settings
                        where is_enabled = true
                        `,
                    );


                previouslyEnabledGroupingStrategyIdsA =
                    enabledStrategies.map(
                        (row) =>
                            row.id,
                    );


                /*
                 * =====================================================
                 * Disable existing config
                 * =====================================================
                 */

                await db.query(
                    `
                    update flow_ship_test_a.providers
                    set is_active = false
                    `,
                );


                await db.query(
                    `
                    update flow_ship_test_a.decision_priority_cards
                    set is_active = false
                    `,
                );


                await db.query(
                    `
                    update flow_ship_test_a.grouping_strategy_settings
                    set is_enabled = false
                    `,
                );


                /*
                 * =====================================================
                 * Providers
                 * =====================================================
                 */

                await db.query(
                    `
                    insert into flow_ship_test_a.providers (
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
                            'api-test-mock',
                            'API Test Mock',
                            'mock',
                            true,
                            true,
                            0.70
                        ),
                        (
                            $2,
                            'api-test-yango',
                            'API Test Yango',
                            'mock-yango',
                            true,
                            true,
                            0.70
                        )
                    `,
                    [
                        providerMockId,
                        providerYangoId,
                    ],
                );


                /*
                 * =====================================================
                 * Decision cards
                 * =====================================================
                 */

                await db.query(
                    `
                    insert into flow_ship_test_a.decision_priority_cards (
                        id,
                        provider_id,
                        criterion_key,
                        title,
                        priority_rank,
                        is_active,
                        config
                    )
                    values
                        (
                            $1,
                            null,
                            'price',
                            'API Test Price',
                            1,
                            true,
                            '{}'::jsonb
                        ),
                        (
                            $2,
                            null,
                            'speed',
                            'API Test Speed',
                            2,
                            true,
                            '{}'::jsonb
                        )
                    `,
                    [
                        priceCardId,
                        speedCardId,
                    ],
                );


                /*
                 * =====================================================
                 * Grouping strategy
                 * =====================================================
                 */

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
                    values (
                        $1,
                        'group_by_source',
                        'API Test Group By Source',
                        true,
                        1,
                        100,
                        '{}'::jsonb
                    )
                    `,
                    [
                        groupingStrategyId,
                    ],
                );
            },
            30000,
        );


        afterAll(
            async () => {
                if (!db) {
                    if (app) {
                        await app.close();
                    }

                    return;
                }


                /*
                 * =====================================================
                 * Cleanup checkout
                 * =====================================================
                 */

                if (checkoutId) {
                    await db.query(
                        `
                        delete from flow_ship_test_a.shipment_stops
                        where shipment_id in (
                            select id
                            from flow_ship_test_a.shipments
                            where checkout_id = $1
                        )
                        `,
                        [
                            checkoutId,
                        ],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.shipments
                        where checkout_id = $1
                        `,
                        [
                            checkoutId,
                        ],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.shipment_group_items
                        where shipment_group_id in (
                            select id
                            from flow_ship_test_a.shipment_groups
                            where checkout_id = $1
                        )
                        `,
                        [
                            checkoutId,
                        ],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.shipment_group_sources
                        where shipment_group_id in (
                            select id
                            from flow_ship_test_a.shipment_groups
                            where checkout_id = $1
                        )
                        `,
                        [
                            checkoutId,
                        ],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.shipment_groups
                        where checkout_id = $1
                        `,
                        [
                            checkoutId,
                        ],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.shipment_decisions
                        where checkout_id = $1
                        `,
                        [
                            checkoutId,
                        ],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.checkout_processing
                        where checkout_id = $1
                        `,
                        [
                            checkoutId,
                        ],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.checkout_items
                        where checkout_id = $1
                        `,
                        [
                            checkoutId,
                        ],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.checkouts
                        where id = $1
                        `,
                        [
                            checkoutId,
                        ],
                    );
                }


                /*
                 * =====================================================
                 * Audit logs
                 * =====================================================
                 */

                await db.query(
                    `
                    delete from flow_ship_test_a.audit_logs
                    where entity_id = $1
                    `,
                    [
                        orderId,
                    ],
                );


                /*
                 * =====================================================
                 * Provider logs
                 * =====================================================
                 */

                await db.query(
                    `
                    delete from flow_ship_test_a.provider_call_logs
                    where provider_id = any($1::uuid[])
                    `,
                    [[
                        providerMockId,
                        providerYangoId,
                    ]],
                );


                /*
                 * =====================================================
                 * Test config
                 * =====================================================
                 */

                await db.query(
                    `
                    delete from flow_ship_test_a.decision_priority_cards
                    where id = any($1::uuid[])
                    `,
                    [[
                        priceCardId,
                        speedCardId,
                    ]],
                );


                await db.query(
                    `
                    delete from flow_ship_test_a.grouping_strategy_settings
                    where id = $1
                    `,
                    [
                        groupingStrategyId,
                    ],
                );


                await db.query(
                    `
                    delete from flow_ship_test_a.providers
                    where id = any($1::uuid[])
                    `,
                    [[
                        providerMockId,
                        providerYangoId,
                    ]],
                );


                /*
                 * =====================================================
                 * Restore previous configuration
                 * =====================================================
                 */

                if (
                    previouslyActiveProviderIdsA.length >
                    0
                ) {
                    await db.query(
                        `
                        update flow_ship_test_a.providers
                        set is_active = true
                        where id = any($1::uuid[])
                        `,
                        [
                            previouslyActiveProviderIdsA,
                        ],
                    );
                }


                if (
                    previouslyActiveDecisionCardIdsA.length >
                    0
                ) {
                    await db.query(
                        `
                        update flow_ship_test_a.decision_priority_cards
                        set is_active = true
                        where id = any($1::uuid[])
                        `,
                        [
                            previouslyActiveDecisionCardIdsA,
                        ],
                    );
                }


                if (
                    previouslyEnabledGroupingStrategyIdsA.length >
                    0
                ) {
                    await db.query(
                        `
                        update flow_ship_test_a.grouping_strategy_settings
                        set is_enabled = true
                        where id = any($1::uuid[])
                        `,
                        [
                            previouslyEnabledGroupingStrategyIdsA,
                        ],
                    );
                }


                await app.close();
            },
            30000,
        );


        function createCheckoutPayload() {
            return {
                orderId,

                storeId:
                    'API-INTEGRATION-STORE',

                destination: {
                    country:
                        'Israel',

                    city:
                        'Netivot',

                    street:
                        'HaShalom',

                    houseNumber:
                        '15',

                    postalCode:
                        '8770000',
                },

                items: [
                    {
                        sku:
                            'SHIRT-BLACK-M',

                        name:
                            'API Integration Black Shirt',

                        quantity:
                            2,

                        weight:
                            1,

                        price:
                            100,

                        category:
                            'standard',
                    },
                ],
            };
        }


        async function loadCheckoutId():
            Promise<string> {

            const rows =
                await db.query<{
                    id: string;
                }>(
                    `
                    select id
                    from flow_ship_test_a.checkouts
                    where external_order_id = $1
                    order by created_at desc
                    limit 1
                    `,
                    [
                        orderId,
                    ],
                );


            if (!rows[0]) {
                throw new Error(
                    `Checkout was not found for order ${orderId}`,
                );
            }


            return rows[0].id;
        }


        /*
         * =============================================================
         * TEST 1
         * POST /checkout
         * =============================================================
         */

        it(
            'should create a checkout through POST /checkout using Tenant A API key',
            async () => {

                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/checkout',
                        )
                        .set(
                            'x-api-key',
                            tenantAApiKey,
                        )
                        .send(
                            createCheckoutPayload(),
                        )
                        .expect(
                            201,
                        );


                expect(
                    response.body.checkout,
                ).toBeDefined();


                expect(
                    response.body
                        .checkout
                        .orderId,
                ).toBe(
                    orderId,
                );


                expect(
                    response.body
                        .checkout
                        .totalItems,
                ).toBe(
                    2,
                );


                expect(
                    response.body
                        .checkout
                        .totalPrice,
                ).toBe(
                    200,
                );


                expect(
                    response.body
                        .planning
                        .decision
                        .winner,
                ).toBeDefined();


                checkoutId =
                    await loadCheckoutId();


                expect(
                    checkoutId,
                ).toBeTruthy();
            },
            30000,
        );


        /*
         * =============================================================
         * TEST 2
         * Tenant A DB isolation
         * =============================================================
         */

        it(
            'should persist the API checkout only inside Tenant A schema',
            async () => {

                const rowsA =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from flow_ship_test_a.checkouts
                        where id = $1
                        `,
                        [
                            checkoutId,
                        ],
                    );


                const rowsB =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from flow_ship_test_b.checkouts
                        where id = $1
                        `,
                        [
                            checkoutId,
                        ],
                    );


                expect(
                    rowsA,
                ).toHaveLength(
                    1,
                );


                expect(
                    rowsB,
                ).toHaveLength(
                    0,
                );
            },
        );


        /*
         * =============================================================
         * TEST 3
         * Missing API key
         * =============================================================
         */

        it(
            'should return 401 when POST /checkout has no x-api-key',
            async () => {

                const payload =
                    createCheckoutPayload();


                payload.orderId =
                    `MISSING-KEY-${randomUUID()}`;


                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/checkout',
                        )
                        .send(
                            payload,
                        )
                        .expect(
                            401,
                        );


                expect(
                    response.body.message,
                ).toBe(
                    'Missing x-api-key header',
                );
            },
        );


        /*
         * =============================================================
         * TEST 4
         * Invalid API key
         * =============================================================
         */

        it(
            'should return 401 when POST /checkout receives an invalid API key',
            async () => {

                const payload =
                    createCheckoutPayload();


                payload.orderId =
                    `INVALID-KEY-${randomUUID()}`;


                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/checkout',
                        )
                        .set(
                            'x-api-key',
                            `invalid-${randomUUID()}`,
                        )
                        .send(
                            payload,
                        )
                        .expect(
                            401,
                        );


                expect(
                    response.body.message,
                ).toBe(
                    'Invalid API key',
                );
            },
        );


        /*
         * =============================================================
         * TEST 5
         * Missing Authorization
         * =============================================================
         */

        it(
            'should return 401 for GET /checkout without Authorization header',
            async () => {

                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/checkout',
                        )
                        .expect(
                            401,
                        );


                expect(
                    response.body.message,
                ).toBe(
                    'Authorization header is missing',
                );


                /*
                 * במקרה הזה ה-Guard אמור לעצור
                 * לפני AuthService.
                 */

                expect(
                    authenticateAccessTokenMock,
                ).not.toHaveBeenCalledWith(
                    undefined,
                );
            },
        );


        /*
         * =============================================================
         * TEST 6
         * Invalid Bearer format
         * =============================================================
         */

        it(
            'should return 401 for GET /checkout when Authorization is not Bearer',
            async () => {

                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/checkout',
                        )
                        .set(
                            'Authorization',
                            'Basic abc123',
                        )
                        .expect(
                            401,
                        );


                expect(
                    response.body.message,
                ).toBe(
                    'Authorization header must use Bearer token',
                );
            },
        );


        /*
         * =============================================================
         * TEST 7
         * Invalid Bearer token
         * =============================================================
         */

        it(
            'should return 401 when Supabase authentication rejects the Bearer token',
            async () => {

                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/checkout',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${invalidToken}`,
                        )
                        .expect(
                            401,
                        );


                expect(
                    response.body.message,
                ).toBe(
                    'Invalid or expired access token',
                );


                expect(
                    authenticateAccessTokenMock,
                ).toHaveBeenCalledWith(
                    invalidToken,
                );
            },
        );


        /*
         * =============================================================
         * TEST 8
         * GET /checkout
         * =============================================================
         */

        it(
            'should return Tenant A checkouts for an authenticated Tenant A admin',
            async () => {

                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/checkout',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${adminTokenA}`,
                        )
                        .expect(
                            200,
                        );


                expect(
                    Array.isArray(
                        response.body,
                    ),
                ).toBe(
                    true,
                );


                const checkout =
                    response.body.find(
                        (
                            row: {
                                id: string;
                            },
                        ) =>
                            row.id ===
                            checkoutId,
                    );


                expect(
                    checkout,
                ).toBeDefined();


                expect(
                    checkout.orderId,
                ).toBe(
                    orderId,
                );
            },
        );


        /*
         * =============================================================
         * TEST 9
         * GET /checkout/:id
         * =============================================================
         */

        it(
            'should return checkout details for the authenticated Tenant A admin',
            async () => {

                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            `/checkout/${checkoutId}`,
                        )
                        .set(
                            'Authorization',
                            `Bearer ${adminTokenA}`,
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body,
                ).toMatchObject({
                    id:
                        checkoutId,

                    orderId:
                        orderId,

                    status:
                        'grouped',

                    totalItems:
                        2,

                    totalPrice:
                        200,
                });


                expect(
                    response.body.items,
                ).toHaveLength(
                    1,
                );


                expect(
                    response.body
                        .shipmentGroups,
                ).toHaveLength(
                    1,
                );


                expect(
                    response.body
                        .shipments,
                ).toHaveLength(
                    1,
                );
            },
        );


        /*
         * =============================================================
         * TEST 10
         * Admin Tenant isolation
         * =============================================================
         */

        it(
            'should return 404 when Tenant B admin requests Tenant A checkout',
            async () => {

                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            `/checkout/${checkoutId}`,
                        )
                        .set(
                            'Authorization',
                            `Bearer ${adminTokenB}`,
                        )
                        .expect(
                            404,
                        );


                expect(
                    response.body.message,
                ).toBe(
                    `Checkout not found: ${checkoutId}`,
                );


                /*
                 * מוודאים שה-token באמת תורגם
                 * ל-context של Tenant B.
                 */

                expect(
                    authenticateAccessTokenMock,
                ).toHaveBeenCalledWith(
                    adminTokenB,
                );
            },
        );
    },
);