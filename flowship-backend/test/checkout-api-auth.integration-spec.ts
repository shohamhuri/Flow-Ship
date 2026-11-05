import {
    INestApplication,
    UnauthorizedException,
    ValidationPipe,
} from '@nestjs/common';
import { SOURCE_CONFIRMATION_PROVIDER } from
    '../src/modules/sourcing/sourcing.tokens';
import { CheckoutConfirmationService } from '../src/modules/checkout/checkout-confirmation.service';
import { MockSelfDeliveryProvider } from '../src/modules/sourcing/providers/mock-self-delivery.provider';
import { SELF_DELIVERY_PROVIDER } from '../src/modules/sourcing/sourcing.tokens';
import { MockSourceConfirmationProvider } from
    '../src/modules/sourcing/providers/mock-source-confirmation.provider';
import { SourceDeliveryPermissionsService } from '../src/modules/sourcing/source-delivery-permissions.service';
import {
    ConfigModule,
    ConfigService,
} from '@nestjs/config';
import { ShipmentHistoryController } from '../src/modules/shipments/shipment-history.controller';
import { ShipmentHistoryService } from '../src/modules/shipments/shipment-history.service';
import { ShipmentHistoryRepository } from '../src/modules/shipments/shipment-history.repository';

import {
    Test,
    TestingModule,
} from '@nestjs/testing';

import request from 'supertest';

import { randomUUID } from 'crypto';

import { DbService } from '../src/infrastructure/database/db.service';
import { WeightEstimationService } from
    '../src/modules/checkout/weight-estimation.service';
import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import { CheckoutController } from '../src/modules/checkout/checkout.controller';

import { CheckoutService } from '../src/modules/checkout/checkout.service';
import { SourcingResultsRepository } from '../src/modules/sourcing/sourcing-results.repository';
import { CheckoutRepository } from '../src/modules/checkout/checkout.repository';
import { CapacityPlanningService } from
    '../src/modules/checkout/capacity-planning.service';
import { CheckoutProcessingRepository } from '../src/modules/checkout/checkout-processing.repository';

import { SourcingService } from '../src/modules/sourcing/sourcing.service';

import { MockInventoryProvider } from '../src/modules/sourcing/adapters/mock-inventory.provider';
import { ShipmentPlanConfirmationService } from
    '../src/modules/planning/shipment-plan-confirmation.service';
import { INVENTORY_PROVIDER, DISTANCE_PROVIDER } from '../src/modules/sourcing/sourcing.tokens';

import { AuditLogsService } from '../src/modules/audit-logs/audit-logs.service';

import { GroupingService } from '../src/modules/grouping/grouping.service';

import { GroupingRulesService } from '../src/modules/grouping/grouping-rules.service';
import { DeliverySettingsService } from
    '../src/modules/planning/delivery-settings.service';
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
import { DeliveryCenterAdapter } from '../src/modules/carriers/adapters/delivery-center.adapter';

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
        let selfDeliveryCheckoutId: string | undefined;
        const selfDeliveryOrderId =
            `CHECKOUT-SELF-DELIVERY-${randomUUID()}`;
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
                                ShipmentHistoryController,

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
                                MockSourceConfirmationProvider,
                                MockSelfDeliveryProvider,
                                {
                                    provide: SELF_DELIVERY_PROVIDER,
                                    useExisting: MockSelfDeliveryProvider,
                                },

                                {
                                    provide: SOURCE_CONFIRMATION_PROVIDER,
                                    useExisting: MockSourceConfirmationProvider,
                                },

                                ShipmentPlanConfirmationService,
                                DeliverySettingsService,
                                CapacityPlanningService,
                                {
                                    provide: WeightEstimationService,
                                    useValue: {
                                        resolveWeight: jest.fn(async (_tenant, item) => ({
                                            weight: item.weight ?? 1,
                                            weightSource:
                                                item.weight != null
                                                    ? 'provided'
                                                    : 'estimated',
                                            weightEstimationRuleId: null,
                                            weightEstimationRule: null,
                                        })),
                                    },
                                },
                                SupabaseAuthGuard,

                                /*
                                 * Checkout
                                 */
                                CheckoutRepository,
                                CheckoutProcessingRepository,
                                CheckoutService,
                                {
                                    provide: CheckoutConfirmationService,
                                    useValue: {
                                        confirm: jest.fn(),
                                    },
                                },
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

                                {
                                    provide:
                                        DISTANCE_PROVIDER,

                                    useValue: {
                                        getDistanceKm:
                                            jest.fn().mockResolvedValue(10),
                                    },
                                },

                                SourcingService,
                                SourcingResultsRepository,
                                SourceDeliveryPermissionsService,

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
                                DeliveryCenterAdapter,

                                /*
                                 * Decision
                                 */
                                DecisionService,

                                /*
                                 * Shipment
                                 */
                                ShipmentsRepository,
                                ShipmentCreationService,
                                ShipmentHistoryService,
                                ShipmentHistoryRepository,
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
                 * Cleanup Self-Delivery permission
                 * =====================================================
                 */

                await db.query(
                    `
    DELETE FROM flow_ship_test_a.source_delivery_permissions
    WHERE store_id = $1
      AND source_id = $2
    `,
                    ['API-SELF-DELIVERY-STORE', 'WAREHOUSE-SOUTH'],
                );
                /*
 * Recover Self-Delivery checkout ID for cleanup
 */
                const selfDeliveryRows = await db.query<{ id: string }>(
                    `
    SELECT id
    FROM flow_ship_test_a.checkouts
    WHERE external_order_id = $1
    LIMIT 1
    `,
                    [selfDeliveryOrderId],
                );

                selfDeliveryCheckoutId =
                    selfDeliveryRows[0]?.id ?? selfDeliveryCheckoutId;
                /*
                 * =====================================================
                 * Cleanup checkout
                 * =====================================================
                 */

                for (const id of [
                    checkoutId,
                    selfDeliveryCheckoutId,
                ].filter((value): value is string => Boolean(value))) {
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
                            id,],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.shipments
                        where checkout_id = $1
                        `,
                        [
                            id,],
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
                            id,],
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
                            id,],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.shipment_groups
                        where checkout_id = $1
                        `,
                        [
                            id,],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.shipment_decisions
                        where checkout_id = $1
                        `,
                        [
                            id,],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.checkout_processing
                        where checkout_id = $1
                        `,
                        [
                            id,],
                    );

                    await db.query(
                        `DELETE FROM flow_ship_test_a.checkout_sourcing_results
     WHERE checkout_id = $1`,
                        [id],
                    );
                    await db.query(
                        `
                        delete from flow_ship_test_a.checkout_items
                        where checkout_id = $1
                        `,
                        [
                            id,],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.checkouts
                        where id = $1
                        `,
                        [
                            id,],
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


        async function loadCheckoutId(
            externalOrderId: string = orderId,
        ): Promise<string> {

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
                    [externalOrderId],
                );


            if (!rows[0]) {
                throw new Error(
                    `Checkout was not found for order ${externalOrderId}`,
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
                const shipment = response.body.shipments[0];

                expect(shipment).toMatchObject({
                    deliveryMethod: 'carrier',
                    sourceId: 'WAREHOUSE-SOUTH',
                    preparationTimeMinutes: 25,
                    estimatedDeliveryAt: null,
                });

                expect(shipment.readyAt).toEqual(
                    expect.any(String),
                );

                expect(
                    Number.isNaN(Date.parse(shipment.readyAt)),
                ).toBe(false);
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
        /*
 * =============================================================
 * TEST 11
 * Self-Delivery checkout lifecycle
 * =============================================================
 */

        it(
            'should create a Self-Delivery checkout and expose its tracking fields',
            async () => {
                await db.query(
                    `
            INSERT INTO flow_ship_test_a.source_delivery_permissions (
                store_id,
                source_id,
                self_delivery_allowed,
                self_delivery_price
            )
            VALUES ($1, $2, true, $3)
            `,
                    ['API-SELF-DELIVERY-STORE', 'WAREHOUSE-SOUTH', 25],
                );
                const payload = createCheckoutPayload();

                payload.orderId = selfDeliveryOrderId;
                payload.storeId = 'API-SELF-DELIVERY-STORE';
                const response = await request(
                    app.getHttpServer(),
                )
                    .post('/checkout')
                    .set('x-api-key', tenantAApiKey)
                    .send(payload)
                    .expect(201);

                expect(response.body.checkout).toBeDefined();

                expect(response.body.checkout.orderId).toBe(
                    selfDeliveryOrderId,
                );

                selfDeliveryCheckoutId = await loadCheckoutId(
                    selfDeliveryOrderId,
                );

                expect(selfDeliveryCheckoutId).toBeTruthy();
                const detailsResponse = await request(
                    app.getHttpServer(),
                )
                    .get(`/checkout/${selfDeliveryCheckoutId}`)
                    .set('Authorization', `Bearer ${adminTokenA}`)
                    .expect(200);

                console.dir(
                    {
                        selfDeliveryCheckoutId,
                        shipments: detailsResponse.body.shipments,
                    },
                    { depth: null },
                );
                const shipments = detailsResponse.body.shipments;

                expect(shipments).toHaveLength(1);

                const shipment = shipments[0];

                expect(shipment).toMatchObject({
                    deliveryMethod: 'self_delivery',
                    sourceId: 'WAREHOUSE-SOUTH',
                    preparationTimeMinutes: 25,
                    carrierName: 'Source Self Delivery',
                    serviceName: 'Self Delivery',
                    status: 'created',
                });

                expect(shipment.providerId).toBeNull();
                expect(shipment.providerCode).toBeNull();

                expect(shipment.readyAt).toEqual(expect.any(String));
                expect(shipment.estimatedDeliveryAt).toEqual(
                    expect.any(String),
                );

                const createdAt = Date.parse(shipment.createdAt);
                const readyAt = Date.parse(shipment.readyAt);
                const estimatedDeliveryAt = Date.parse(
                    shipment.estimatedDeliveryAt,
                );

                expect(Number.isNaN(createdAt)).toBe(false);
                expect(Number.isNaN(readyAt)).toBe(false);
                expect(Number.isNaN(estimatedDeliveryAt)).toBe(false);

                // זמן ההכנה: 25 דקות, עם סטייה קטנה של שעון הבדיקה.
                expect(readyAt - createdAt).toBeGreaterThan(
                    24 * 60 * 1000,
                );
                expect(readyAt - createdAt).toBeLessThan(
                    26 * 60 * 1000,
                );

                // הספק מחזיר ETA של שעתיים.
                // אין להוסיף אליו שוב את 25 דקות ההכנה.
                expect(estimatedDeliveryAt - createdAt).toBeGreaterThan(
                    119 * 60 * 1000,
                );
                expect(estimatedDeliveryAt - createdAt).toBeLessThan(
                    121 * 60 * 1000,
                );

                expect(shipment.stops).toHaveLength(2);
                expect(shipment.stops[0].stopType).toBe('pickup');
                expect(shipment.stops[1].stopType).toBe('dropoff');
                const historyResponse = await request(app.getHttpServer())
                    .get('/admin/shipment-history')
                    .set('Authorization', `Bearer ${adminTokenA}`)
                    .expect(200);

                expect(historyResponse.body.ok).toBe(true);
                expect(Array.isArray(historyResponse.body.items)).toBe(true);

                expect(historyResponse.body.count).toBe(
                    historyResponse.body.items.length,
                );

                const eventsResponse = await request(app.getHttpServer())
                    .get(`/admin/shipment-history/${shipment.id}/events`)
                    .set('Authorization', `Bearer ${adminTokenA}`)
                    .expect(200);

                expect(eventsResponse.body).toMatchObject({
                    ok: true,
                    shipmentId: shipment.id,
                });

                expect(Array.isArray(eventsResponse.body.events)).toBe(true);
                expect(eventsResponse.body.count).toBe(
                    eventsResponse.body.events.length,
                );
            },
            30000,
        );
    },
);