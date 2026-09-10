import {
    ConfigModule,
    ConfigService,
} from '@nestjs/config';

import {
    Test,
    TestingModule,
} from '@nestjs/testing';

import { randomUUID } from 'crypto';

import { DbService } from '../src/infrastructure/database/db.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import { CheckoutService } from '../src/modules/checkout/checkout.service';

import { CheckoutRepository } from '../src/modules/checkout/checkout.repository';

import { CheckoutProcessingRepository } from '../src/modules/checkout/checkout-processing.repository';

import { CreateCheckoutDto } from '../src/modules/checkout/dto/create-checkout.dto';

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


describe(
    'CheckoutService Full Processing Pipeline Integration',
    () => {
        let moduleRef: TestingModule;

        let db: DbService;

        let tenantsService: TenantsService;

        let checkoutService: CheckoutService;

        let config: ConfigService;

        let tenantA: CurrentTenant;
        let tenantB: CurrentTenant;

        let providerMockId: string;
        let providerYangoId: string;

        let priceCardId: string;
        let speedCardId: string;

        let groupingStrategyId: string;

        let successOrderId: string;
        let failedOrderId: string;

        let successCheckoutId: string;
        let failedCheckoutId: string;

        /*
         * אנחנו שומרים את ה-ID-ים של rows
         * שהיו פעילים לפני הטסט,
         * כדי להחזיר את סביבת הטסט למצבה המקורי.
         */
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
                 * Testing Module
                 * =====================================================
                 *
                 * חשוב:
                 *
                 * לא מייבאים CheckoutModule.
                 *
                 * אנחנו מרכיבים ידנית רק את גרף
                 * ה-dependencies שה-CheckoutService באמת צריך.
                 */

                moduleRef =
                    await Test
                        .createTestingModule({
                            imports: [
                                ConfigModule.forRoot({
                                    isGlobal: true,
                                }),
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

                tenantsService =
                    moduleRef.get(
                        TenantsService,
                    );

                checkoutService =
                    moduleRef.get(
                        CheckoutService,
                    );

                config =
                    moduleRef.get(
                        ConfigService,
                    );


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


                successOrderId =
                    `PIPELINE-SUCCESS-${Date.now()}-${randomUUID()}`;

                failedOrderId =
                    `PIPELINE-FAILED-${Date.now()}-${randomUUID()}`;


                /*
                 * =====================================================
                 * שמירת מצב קיים
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


                const enabledGroupingStrategies =
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
                    enabledGroupingStrategies.map(
                        (row) =>
                            row.id,
                    );


                /*
                 * =====================================================
                 * Isolation
                 * =====================================================
                 *
                 * מכבים זמנית config קיים ב-Tenant A
                 * כדי שהתוצאה תהיה deterministic.
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
                            'pipeline-mock',
                            'Pipeline Mock',
                            'mock',
                            true,
                            true,
                            0.70
                        ),
                        (
                            $2,
                            'pipeline-yango',
                            'Pipeline Yango',
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
                 * Decision Priority Cards
                 * =====================================================
                 *
                 * Price = rank 1
                 * Speed = rank 2
                 *
                 * לכן הזול אמור לנצח.
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
                            'Pipeline Price',
                            1,
                            true,
                            '{}'::jsonb
                        ),
                        (
                            $2,
                            null,
                            'speed',
                            'Pipeline Speed',
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
                 * Grouping Strategy
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
                        'Pipeline Group By Source',
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
                /*
                 * אם ה-beforeAll נכשל לפני שה-DB אותחל,
                 * לא מנסים לבצע cleanup.
                 */

                if (!db) {
                    if (moduleRef) {
                        await moduleRef.close();
                    }

                    return;
                }


                const checkoutIds = [
                    successCheckoutId,
                    failedCheckoutId,
                ].filter(
                    (
                        id,
                    ): id is string =>
                        Boolean(id),
                );


                /*
                 * =====================================================
                 * Cleanup checkout data
                 * =====================================================
                 */

                if (
                    checkoutIds.length >
                    0
                ) {
                    await db.query(
                        `
                        delete from flow_ship_test_a.shipment_stops
                        where shipment_id in (
                            select id
                            from flow_ship_test_a.shipments
                            where checkout_id = any($1::uuid[])
                        )
                        `,
                        [
                            checkoutIds,
                        ],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.shipments
                        where checkout_id = any($1::uuid[])
                        `,
                        [
                            checkoutIds,
                        ],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.shipment_group_items
                        where shipment_group_id in (
                            select id
                            from flow_ship_test_a.shipment_groups
                            where checkout_id = any($1::uuid[])
                        )
                        `,
                        [
                            checkoutIds,
                        ],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.shipment_group_sources
                        where shipment_group_id in (
                            select id
                            from flow_ship_test_a.shipment_groups
                            where checkout_id = any($1::uuid[])
                        )
                        `,
                        [
                            checkoutIds,
                        ],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.shipment_groups
                        where checkout_id = any($1::uuid[])
                        `,
                        [
                            checkoutIds,
                        ],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.shipment_decisions
                        where checkout_id = any($1::uuid[])
                        `,
                        [
                            checkoutIds,
                        ],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.checkout_processing
                        where checkout_id = any($1::uuid[])
                        `,
                        [
                            checkoutIds,
                        ],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.checkout_items
                        where checkout_id = any($1::uuid[])
                        `,
                        [
                            checkoutIds,
                        ],
                    );


                    await db.query(
                        `
                        delete from flow_ship_test_a.checkouts
                        where id = any($1::uuid[])
                        `,
                        [
                            checkoutIds,
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
                    where entity_id = any($1::text[])
                    `,
                    [[
                        successOrderId,
                        failedOrderId,
                    ]],
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
                 * Test configuration rows
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
                 * Restore previous test-schema state
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


                await moduleRef.close();
            },
            30000,
        );


        function createSuccessfulCheckoutDto():
            CreateCheckoutDto {

            return {
                orderId:
                    successOrderId,

                storeId:
                    'PIPELINE-STORE',

                destination: {
                    country:
                        'Israel',

                    city:
                        'Netivot',

                    street:
                        'HaShalom',

                    houseNumber:
                        '10',

                    postalCode:
                        '8770000',
                },

                items: [
                    {
                        sku:
                            'SHIRT-BLACK-M',

                        name:
                            'Pipeline Black Shirt',

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


        function createFailedCheckoutDto():
            CreateCheckoutDto {

            return {
                orderId:
                    failedOrderId,

                storeId:
                    'PIPELINE-STORE',

                destination: {
                    country:
                        'Israel',

                    city:
                        'Netivot',

                    street:
                        'HaShalom',

                    houseNumber:
                        '20',

                    postalCode:
                        '8770000',
                },

                items: [
                    {
                        sku:
                            `NO-INVENTORY-${randomUUID()}`,

                        name:
                            'Product Without Inventory',

                        quantity:
                            1,

                        weight:
                            1,

                        price:
                            50,

                        category:
                            'standard',
                    },
                ],
            };
        }


        async function findCheckoutIdByOrderId(
            orderId: string,
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
                    [
                        orderId,
                    ],
                );


            if (!rows[0]) {
                throw new Error(
                    `Checkout not found for order ${orderId}`,
                );
            }


            return rows[0].id;
        }


        /*
         * =============================================================
         * TEST 1
         * Full pipeline
         * =============================================================
         */

        it(
            'should process a valid checkout through the complete pipeline',
            async () => {

                const result =
                    await checkoutService
                        .createCheckout(
                            createSuccessfulCheckoutDto(),
                            tenantA,
                        );


                successCheckoutId =
                    await findCheckoutIdByOrderId(
                        successOrderId,
                    );


                expect(
                    result.checkout.orderId,
                ).toBe(
                    successOrderId,
                );


                expect(
                    result.checkout.totalItems,
                ).toBe(
                    2,
                );


                expect(
                    result.checkout.totalPrice,
                ).toBe(
                    200,
                );


                /*
                 * Sourcing
                 */
                expect(
                    result.sourcing,
                ).toHaveLength(
                    1,
                );


                expect(
                    result.sourcing[0].sku,
                ).toBe(
                    'SHIRT-BLACK-M',
                );


                expect(
                    result.sourcing[0]
                        .possibleSources
                        .length,
                ).toBeGreaterThan(
                    0,
                );


                /*
                 * Generation
                 */
                expect(
                    result.planning
                        .generation
                        .statistics
                        .generatedPlansCount,
                ).toBeGreaterThan(
                    0,
                );


                /*
                 * Valid plans
                 */
                expect(
                    result.planning
                        .validPlans
                        .length,
                ).toBeGreaterThan(
                    0,
                );


                /*
                 * Evaluated plans
                 */
                expect(
                    result.planning
                        .selectedPlans
                        .length,
                ).toBeGreaterThan(
                    0,
                );


                /*
                 * Quotes
                 */
                expect(
                    result.planning
                        .quotedPlans
                        .length,
                ).toBeGreaterThan(
                    0,
                );


                /*
                 * Delivery options
                 */
                expect(
                    result.planning
                        .deliveryOptions
                        .length,
                ).toBeGreaterThan(
                    0,
                );


                /*
                 * Decision
                 */
                expect(
                    result.planning
                        .decision
                        .winner,
                ).not.toBeNull();


                expect(
                    result.planning
                        .decision
                        .evaluatedOptionsCount,
                ).toBeGreaterThan(
                    0,
                );
            },
            30000,
        );


        /*
         * =============================================================
         * TEST 2
         * Checkout persistence
         * =============================================================
         */

        it(
            'should persist checkout and checkout items in the real database',
            async () => {

                const checkoutRows =
                    await db.query<{
                        id: string;
                        external_order_id:
                        string;
                        status: string;
                        raw_payload:
                        Record<
                            string,
                            any
                        >;
                    }>(
                        `
                        select
                            id,
                            external_order_id,
                            status,
                            raw_payload
                        from flow_ship_test_a.checkouts
                        where id = $1
                        `,
                        [
                            successCheckoutId,
                        ],
                    );


                expect(
                    checkoutRows,
                ).toHaveLength(
                    1,
                );


                expect(
                    checkoutRows[0]
                        .external_order_id,
                ).toBe(
                    successOrderId,
                );


                expect(
                    checkoutRows[0].status,
                ).toBe(
                    'grouped',
                );


                expect(
                    checkoutRows[0]
                        .raw_payload,
                ).toMatchObject({
                    orderId:
                        successOrderId,

                    totalItems:
                        2,

                    totalPrice:
                        200,
                });


                const items =
                    await db.query<{
                        sku: string;
                        name: string;
                        quantity: number;
                        unit_weight:
                        string | number;
                        unit_price:
                        string | number;
                    }>(
                        `
                        select
                            sku,
                            name,
                            quantity,
                            unit_weight,
                            unit_price
                        from flow_ship_test_a.checkout_items
                        where checkout_id = $1
                        `,
                        [
                            successCheckoutId,
                        ],
                    );


                expect(
                    items,
                ).toHaveLength(
                    1,
                );


                expect(
                    items[0],
                ).toMatchObject({
                    sku:
                        'SHIRT-BLACK-M',

                    name:
                        'Pipeline Black Shirt',

                    quantity:
                        2,
                });


                expect(
                    Number(
                        items[0]
                            .unit_weight,
                    ),
                ).toBe(
                    1,
                );


                expect(
                    Number(
                        items[0]
                            .unit_price,
                    ),
                ).toBe(
                    100,
                );
            },
        );


        /*
         * =============================================================
         * TEST 3
         * Checkout processing
         * =============================================================
         */

        it(
            'should mark sourcing and grouping as completed',
            async () => {

                const rows =
                    await db.query<{
                        status: string;
                        current_step:
                        string;
                        sourcing_completed:
                        boolean;
                        grouping_completed:
                        boolean;
                        error_message:
                        string | null;
                    }>(
                        `
                        select
                            status,
                            current_step,
                            sourcing_completed,
                            grouping_completed,
                            error_message
                        from flow_ship_test_a.checkout_processing
                        where checkout_id = $1
                        `,
                        [
                            successCheckoutId,
                        ],
                    );


                expect(
                    rows,
                ).toHaveLength(
                    1,
                );


                expect(
                    rows[0],
                ).toMatchObject({
                    status:
                        'processing',

                    current_step:
                        'awaiting_quotes',

                    sourcing_completed:
                        true,

                    grouping_completed:
                        true,

                    error_message:
                        null,
                });
            },
        );


        /*
         * =============================================================
         * TEST 4
         * Shipment groups
         * =============================================================
         */

        it(
            'should persist shipment group, source and item',
            async () => {

                const groups =
                    await db.query<{
                        id: string;
                        handling_group:
                        string;
                        total_items:
                        number;
                        total_weight:
                        string | number;
                        total_price:
                        string | number;
                        status:
                        string;
                    }>(
                        `
                        select
                            id,
                            handling_group,
                            total_items,
                            total_weight,
                            total_price,
                            status
                        from flow_ship_test_a.shipment_groups
                        where checkout_id = $1
                        `,
                        [
                            successCheckoutId,
                        ],
                    );


                expect(
                    groups,
                ).toHaveLength(
                    1,
                );


                expect(
                    groups[0]
                        .handling_group,
                ).toBe(
                    'standard',
                );


                expect(
                    groups[0]
                        .total_items,
                ).toBe(
                    2,
                );


                expect(
                    Number(
                        groups[0]
                            .total_weight,
                    ),
                ).toBe(
                    2,
                );


                expect(
                    Number(
                        groups[0]
                            .total_price,
                    ),
                ).toBe(
                    200,
                );


                expect(
                    groups[0].status,
                ).toBe(
                    'planned',
                );


                const sources =
                    await db.query<{
                        source_id:
                        string;
                        source_name:
                        string;
                        source_type:
                        string;
                    }>(
                        `
                        select
                            source_id,
                            source_name,
                            source_type
                        from flow_ship_test_a.shipment_group_sources
                        where shipment_group_id = $1
                        `,
                        [
                            groups[0].id,
                        ],
                    );


                expect(
                    sources,
                ).toHaveLength(
                    1,
                );


                expect(
                    sources[0]
                        .source_id,
                ).toBeTruthy();


                expect(
                    sources[0]
                        .source_name,
                ).toBeTruthy();


                const groupItems =
                    await db.query<{
                        sku: string;
                        quantity:
                        number;
                        source_id:
                        string;
                    }>(
                        `
                        select
                            sku,
                            quantity,
                            source_id
                        from flow_ship_test_a.shipment_group_items
                        where shipment_group_id = $1
                        `,
                        [
                            groups[0].id,
                        ],
                    );


                expect(
                    groupItems,
                ).toHaveLength(
                    1,
                );


                expect(
                    groupItems[0],
                ).toMatchObject({
                    sku:
                        'SHIRT-BLACK-M',

                    quantity:
                        2,
                });


                expect(
                    groupItems[0]
                        .source_id,
                ).toBe(
                    sources[0]
                        .source_id,
                );
            },
        );


        /*
         * =============================================================
         * TEST 5
         * Decision persistence
         * =============================================================
         */

        it(
            'should persist the winning shipment decision',
            async () => {

                const rows =
                    await db.query<{
                        checkout_id:
                        string;
                        order_id:
                        string;
                        selected_plan_id:
                        string;
                        selected_delivery_option_id:
                        string;
                        score:
                        string | number;
                        evaluated_options_count:
                        number;
                        priority_cards_snapshot:
                        unknown[];
                    }>(
                        `
                        select
                            checkout_id,
                            order_id,
                            selected_plan_id,
                            selected_delivery_option_id,
                            score,
                            evaluated_options_count,
                            priority_cards_snapshot
                        from flow_ship_test_a.shipment_decisions
                        where checkout_id = $1
                        `,
                        [
                            successCheckoutId,
                        ],
                    );


                expect(
                    rows,
                ).toHaveLength(
                    1,
                );


                expect(
                    rows[0]
                        .checkout_id,
                ).toBe(
                    successCheckoutId,
                );


                expect(
                    rows[0]
                        .order_id,
                ).toBe(
                    successOrderId,
                );


                expect(
                    rows[0]
                        .selected_plan_id,
                ).toBeTruthy();


                expect(
                    rows[0]
                        .selected_delivery_option_id,
                ).toBeTruthy();


                expect(
                    Number(
                        rows[0].score,
                    ),
                ).toBeGreaterThanOrEqual(
                    0,
                );


                expect(
                    rows[0]
                        .evaluated_options_count,
                ).toBeGreaterThan(
                    0,
                );


                expect(
                    rows[0]
                        .priority_cards_snapshot,
                ).toHaveLength(
                    2,
                );
            },
        );


        /*
         * =============================================================
         * TEST 6
         * Shipment creation
         * =============================================================
         */

        it(
            'should create a real shipment with pickup and dropoff stops',
            async () => {

                const shipments =
                    await db.query<{
                        id: string;
                        shipment_group_id:
                        string;
                        selected_plan_id:
                        string;
                        selected_delivery_option_key:
                        string;
                        provider_id:
                        string;
                        provider_code:
                        string;
                        adapter_key:
                        string;
                        carrier_name:
                        string;
                        service_name:
                        string;
                        price:
                        string | number;
                        currency:
                        string;
                        status:
                        string;
                    }>(
                        `
                        select
                            id,
                            shipment_group_id,
                            selected_plan_id,
                            selected_delivery_option_key,
                            provider_id,
                            provider_code,
                            adapter_key,
                            carrier_name,
                            service_name,
                            price,
                            currency,
                            status
                        from flow_ship_test_a.shipments
                        where checkout_id = $1
                        `,
                        [
                            successCheckoutId,
                        ],
                    );


                expect(
                    shipments,
                ).toHaveLength(
                    1,
                );


                /*
                 * בגלל ש-Price הוא priority ראשון,
                 * ה-Mock הזול אמור לנצח.
                 */

                expect(
                    shipments[0],
                ).toMatchObject({
                    provider_id:
                        providerMockId,

                    provider_code:
                        'pipeline-mock',

                    adapter_key:
                        'mock',

                    carrier_name:
                        'Mock Express',

                    service_name:
                        'Budget Delivery',

                    currency:
                        'ILS',

                    status:
                        'created',
                });


                expect(
                    Number(
                        shipments[0]
                            .price,
                    ),
                ).toBe(
                    15,
                );


                const stops =
                    await db.query<{
                        stop_order:
                        number;
                        stop_type:
                        string;
                        address:
                        Record<
                            string,
                            any
                        >;
                    }>(
                        `
                        select
                            stop_order,
                            stop_type,
                            address
                        from flow_ship_test_a.shipment_stops
                        where shipment_id = $1
                        order by stop_order asc
                        `,
                        [
                            shipments[0].id,
                        ],
                    );


                expect(
                    stops,
                ).toHaveLength(
                    2,
                );


                expect(
                    stops[0]
                        .stop_order,
                ).toBe(
                    1,
                );


                expect(
                    stops[0]
                        .stop_type,
                ).toBe(
                    'pickup',
                );


                expect(
                    stops[0]
                        .address
                        .sourceId,
                ).toBeTruthy();


                expect(
                    stops[1]
                        .stop_order,
                ).toBe(
                    2,
                );


                expect(
                    stops[1]
                        .stop_type,
                ).toBe(
                    'dropoff',
                );


                expect(
                    stops[1]
                        .address,
                ).toMatchObject({
                    country:
                        'Israel',

                    city:
                        'Netivot',

                    street:
                        'HaShalom',

                    houseNumber:
                        '10',

                    postalCode:
                        '8770000',
                });
            },
        );


        /*
         * =============================================================
         * TEST 7
         * Read aggregate
         * =============================================================
         */

        it(
            'should return the complete persisted checkout aggregate',
            async () => {

                const checkout =
                    await checkoutService
                        .getCheckoutById(
                            tenantA,
                            successCheckoutId,
                        );


                expect(
                    checkout,
                ).not.toBeNull();


                expect(
                    checkout,
                ).toMatchObject({
                    id:
                        successCheckoutId,

                    orderId:
                        successOrderId,

                    status:
                        'grouped',

                    totalItems:
                        2,

                    totalPrice:
                        200,
                });


                expect(
                    checkout!.items,
                ).toHaveLength(
                    1,
                );


                expect(
                    checkout!
                        .shipmentGroups,
                ).toHaveLength(
                    1,
                );


                expect(
                    checkout!
                        .shipments,
                ).toHaveLength(
                    1,
                );


                expect(
                    checkout!
                        .shipments[0]
                        .stops,
                ).toHaveLength(
                    2,
                );


                expect(
                    checkout!
                        .shipments[0]
                        .providerId,
                ).toBe(
                    providerMockId,
                );
            },
        );


        /*
         * =============================================================
         * TEST 8
         * Multi-Tenant isolation
         * =============================================================
         */

        it(
            'should keep the complete pipeline isolated from Tenant B',
            async () => {

                const checkoutInB =
                    await checkoutService
                        .getCheckoutById(
                            tenantB,
                            successCheckoutId,
                        );


                expect(
                    checkoutInB,
                ).toBeNull();


                const checkouts =
                    await db.query(
                        `
                        select id
                        from flow_ship_test_b.checkouts
                        where id = $1
                        `,
                        [
                            successCheckoutId,
                        ],
                    );


                const groups =
                    await db.query(
                        `
                        select id
                        from flow_ship_test_b.shipment_groups
                        where checkout_id = $1
                        `,
                        [
                            successCheckoutId,
                        ],
                    );


                const shipments =
                    await db.query(
                        `
                        select id
                        from flow_ship_test_b.shipments
                        where checkout_id = $1
                        `,
                        [
                            successCheckoutId,
                        ],
                    );


                const decisions =
                    await db.query(
                        `
                        select checkout_id
                        from flow_ship_test_b.shipment_decisions
                        where checkout_id = $1
                        `,
                        [
                            successCheckoutId,
                        ],
                    );


                expect(
                    checkouts,
                ).toHaveLength(
                    0,
                );


                expect(
                    groups,
                ).toHaveLength(
                    0,
                );


                expect(
                    shipments,
                ).toHaveLength(
                    0,
                );


                expect(
                    decisions,
                ).toHaveLength(
                    0,
                );
            },
        );


        /*
         * =============================================================
         * TEST 9
         * Failure pipeline
         * =============================================================
         */

        it(
            'should mark checkout as failed when no valid shipment plan can be generated',
            async () => {

                await expect(
                    checkoutService
                        .createCheckout(
                            createFailedCheckoutDto(),
                            tenantA,
                        ),
                ).rejects.toThrow(
                    'No valid shipment plans could be generated',
                );


                failedCheckoutId =
                    await findCheckoutIdByOrderId(
                        failedOrderId,
                    );


                /*
                 * Checkout
                 */

                const checkoutRows =
                    await db.query<{
                        status:
                        string;
                    }>(
                        `
                        select status
                        from flow_ship_test_a.checkouts
                        where id = $1
                        `,
                        [
                            failedCheckoutId,
                        ],
                    );


                expect(
                    checkoutRows,
                ).toHaveLength(
                    1,
                );


                expect(
                    checkoutRows[0]
                        .status,
                ).toBe(
                    'failed',
                );


                /*
                 * Processing
                 */

                const processingRows =
                    await db.query<{
                        status:
                        string;
                        current_step:
                        string;
                        sourcing_completed:
                        boolean;
                        grouping_completed:
                        boolean;
                        error_message:
                        string | null;
                    }>(
                        `
                        select
                            status,
                            current_step,
                            sourcing_completed,
                            grouping_completed,
                            error_message
                        from flow_ship_test_a.checkout_processing
                        where checkout_id = $1
                        `,
                        [
                            failedCheckoutId,
                        ],
                    );


                expect(
                    processingRows,
                ).toHaveLength(
                    1,
                );


                expect(
                    processingRows[0]
                        .status,
                ).toBe(
                    'failed',
                );


                expect(
                    processingRows[0]
                        .current_step,
                ).toBe(
                    'grouping',
                );


                expect(
                    processingRows[0]
                        .sourcing_completed,
                ).toBe(
                    true,
                );


                expect(
                    processingRows[0]
                        .grouping_completed,
                ).toBe(
                    false,
                );


                expect(
                    processingRows[0]
                        .error_message,
                ).toContain(
                    'No valid shipment plans could be generated',
                );


                /*
                 * אסור שייווצרו records downstream.
                 */

                const groups =
                    await db.query(
                        `
                        select id
                        from flow_ship_test_a.shipment_groups
                        where checkout_id = $1
                        `,
                        [
                            failedCheckoutId,
                        ],
                    );


                const shipments =
                    await db.query(
                        `
                        select id
                        from flow_ship_test_a.shipments
                        where checkout_id = $1
                        `,
                        [
                            failedCheckoutId,
                        ],
                    );


                const decisions =
                    await db.query(
                        `
                        select checkout_id
                        from flow_ship_test_a.shipment_decisions
                        where checkout_id = $1
                        `,
                        [
                            failedCheckoutId,
                        ],
                    );


                expect(
                    groups,
                ).toHaveLength(
                    0,
                );


                expect(
                    shipments,
                ).toHaveLength(
                    0,
                );


                expect(
                    decisions,
                ).toHaveLength(
                    0,
                );
            },
            30000,
        );


        /*
         * =============================================================
         * TEST 10
         * Audit + Provider logs
         * =============================================================
         */

        it(
            'should create real sourcing audit logs and provider call logs',
            async () => {

                /*
                 * Successful sourcing audit
                 */

                const successAuditLogs =
                    await db.query<{
                        action:
                        string;
                        entity_id:
                        string;
                        status:
                        string;
                    }>(
                        `
                        select
                            action,
                            entity_id,
                            status
                        from flow_ship_test_a.audit_logs
                        where entity_id = $1
                        order by created_at asc
                        `,
                        [
                            successOrderId,
                        ],
                    );


                expect(
                    successAuditLogs.some(
                        (log) =>
                            log.action ===
                            'sourcing.completed' &&
                            log.status ===
                            'success',
                    ),
                ).toBe(
                    true,
                );


                /*
                 * Failed sourcing audit
                 */

                const failedAuditLogs =
                    await db.query<{
                        action:
                        string;
                        entity_id:
                        string;
                        status:
                        string;
                    }>(
                        `
                        select
                            action,
                            entity_id,
                            status
                        from flow_ship_test_a.audit_logs
                        where entity_id = $1
                        order by created_at asc
                        `,
                        [
                            failedOrderId,
                        ],
                    );


                expect(
                    failedAuditLogs.some(
                        (log) =>
                            log.action ===
                            'sourcing.completed' &&
                            log.status ===
                            'failed',
                    ),
                ).toBe(
                    true,
                );


                /*
                 * Carrier provider logs
                 */

                const providerLogs =
                    await db.query<{
                        provider_id:
                        string;
                        action:
                        string;
                        status:
                        string;
                    }>(
                        `
                        select
                            provider_id,
                            action,
                            status
                        from flow_ship_test_a.provider_call_logs
                        where provider_id = any($1::uuid[])
                        `,
                        [[
                            providerMockId,
                            providerYangoId,
                        ]],
                    );


                expect(
                    providerLogs.length,
                ).toBeGreaterThan(
                    0,
                );


                expect(
                    providerLogs.every(
                        (log) =>
                            log.action ===
                            'get_quote',
                    ),
                ).toBe(
                    true,
                );


                expect(
                    providerLogs.every(
                        (log) =>
                            log.status ===
                            'success',
                    ),
                ).toBe(
                    true,
                );


                expect(
                    providerLogs.some(
                        (log) =>
                            log.provider_id ===
                            providerMockId,
                    ),
                ).toBe(
                    true,
                );


                expect(
                    providerLogs.some(
                        (log) =>
                            log.provider_id ===
                            providerYangoId,
                    ),
                ).toBe(
                    true,
                );
            },
        );
    },
);