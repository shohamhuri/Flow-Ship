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
    CheckoutService,
} from '../src/modules/checkout/checkout.service';

import {
    CheckoutRepository,
} from '../src/modules/checkout/checkout.repository';

import {
    CheckoutProcessingRepository,
} from '../src/modules/checkout/checkout-processing.repository';

import {
    SourcingService,
} from '../src/modules/sourcing/sourcing.service';

import {
    GroupingService,
} from '../src/modules/grouping/grouping.service';

import {
    GroupingRulesService,
} from '../src/modules/grouping/grouping-rules.service';

import {
    ShipmentGroupsRepository,
} from '../src/modules/grouping/shipment-groups.repository';

import {
    ShipmentPlanGeneratorService,
} from '../src/modules/planning/shipment-plan-generator.service';

import {
    ShipmentPlanBuilderService,
} from '../src/modules/planning/shipment-plan-builder.service';

import {
    ShipmentPlanEvaluatorService,
} from '../src/modules/planning/shipment-plan-evaluator.service';

import {
    ShipmentPlanQuoteService,
} from '../src/modules/planning/shipment-plan-quote.service';

import {
    ShipmentPlanDeliveryOptionsService,
} from '../src/modules/planning/shipment-plan-delivery-options.service';

import {
    DecisionService,
} from '../src/modules/decision/decision.service';

import {
    ShipmentCreationService,
} from '../src/modules/shipments/shipment-creation.service';


describe(
    'Checkout Failure Tenant Isolation Integration',
    () => {
        let moduleRef:
            TestingModule;

        let db:
            DbService;

        let config:
            ConfigService;

        let tenantsService:
            TenantsService;

        let checkoutService:
            CheckoutService;

        let tenantA:
            CurrentTenant;

        let tenantB:
            CurrentTenant;


        /*
         * ============================================================
         * Mocks
         *
         * Only sourcing is important for these tests.
         * The remaining dependencies only allow CheckoutService
         * to be constructed.
         * ============================================================
         */

        const sourcingServiceMock = {
            findSourcesForCheckout:
                jest.fn(),
        };


        const groupingServiceMock = {};


        const groupingRulesServiceMock = {
            getActiveStrategies:
                jest.fn(),
        };


        const shipmentPlanGeneratorServiceMock = {
            generatePlans:
                jest.fn(),
        };


        const shipmentPlanBuilderServiceMock = {
            buildPlans:
                jest.fn(),
        };


        const shipmentGroupsRepositoryMock = {
            saveGroupingResult:
                jest.fn(),
        };


        const shipmentPlanEvaluatorServiceMock = {
            evaluateAndSelect:
                jest.fn(),
        };


        const shipmentPlanQuoteServiceMock = {
            getQuotesForPlans:
                jest.fn(),
        };


        const shipmentPlanDeliveryOptionsServiceMock = {
            generateForPlans:
                jest.fn(),
        };


        const decisionServiceMock = {
            getActivePriorityCards:
                jest.fn(),

            selectBestDeliveryOption:
                jest.fn(),

            saveShipmentDecision:
                jest.fn(),
        };


        const shipmentCreationServiceMock = {
            createShipments:
                jest.fn(),
        };


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


        function createDto(
            orderId: string,
        ) {
            return {
                orderId,

                storeId:
                    'tenant-isolation-test',

                destination: {
                    country:
                        'Israel',

                    city:
                        'Jerusalem',

                    street:
                        'Jaffa',

                    houseNumber:
                        '10',

                    postalCode:
                        '91000',
                },

                items: [
                    {
                        sku:
                            `SKU-${randomUUID()}`,

                        name:
                            'Tenant Isolation Item',

                        quantity:
                            1,

                        weight:
                            1,

                        supplierId:
                            'SUPPLIER-TEST',

                        category:
                            'general',

                        price:
                            100,
                    },
                ],
            };
        }


        async function getCheckout(
            tenant: CurrentTenant,
            orderId: string,
        ) {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            const rows =
                await db.query<{
                    id: string;
                    external_order_id: string;
                    status: string;
                }>(
                    `
                    select
                        id,
                        external_order_id,
                        status
                    from ${schema}.checkouts
                    where external_order_id = $1
                    order by created_at desc
                    limit 1
                    `,
                    [
                        orderId,
                    ],
                );


            return rows[0] ?? null;
        }


        async function getProcessing(
            tenant: CurrentTenant,
            checkoutId: string,
        ) {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            const rows =
                await db.query<{
                    status: string;
                    current_step: string;
                    error_message: string | null;
                    sourcing_completed: boolean;
                    grouping_completed: boolean;
                    completed_at: Date | null;
                }>(
                    `
                    select
                        status,
                        current_step,
                        error_message,
                        sourcing_completed,
                        grouping_completed,
                        completed_at
                    from ${schema}.checkout_processing
                    where checkout_id = $1
                    limit 1
                    `,
                    [
                        checkoutId,
                    ],
                );


            return rows[0] ?? null;
        }


        async function cleanupOrder(
            tenant: CurrentTenant,
            orderId: string,
        ) {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            const rows =
                await db.query<{
                    id: string;
                }>(
                    `
                    select id
                    from ${schema}.checkouts
                    where external_order_id = $1
                    `,
                    [
                        orderId,
                    ],
                );


            const checkoutIds =
                rows.map(
                    (row) =>
                        row.id,
                );


            if (
                checkoutIds.length === 0
            ) {
                return;
            }


            await db.query(
                `
                delete from ${schema}.checkout_processing
                where checkout_id =
                    any($1::uuid[])
                `,
                [
                    checkoutIds,
                ],
            );


            await db.query(
                `
                delete from ${schema}.checkout_items
                where checkout_id =
                    any($1::uuid[])
                `,
                [
                    checkoutIds,
                ],
            );


            await db.query(
                `
                delete from ${schema}.checkouts
                where id =
                    any($1::uuid[])
                `,
                [
                    checkoutIds,
                ],
            );
        }


        async function seedProcessingCheckout(
            tenant: CurrentTenant,
            orderId: string,
        ) {
            const checkoutId =
                randomUUID();


            const schema =
                qSchema(
                    tenant.schemaName,
                );


            await db.query(
                `
                insert into ${schema}.checkouts (
                    id,
                    platform,
                    external_checkout_id,
                    external_order_id,
                    customer,
                    cart,
                    destination,
                    raw_payload,
                    status
                )
                values (
                    $1,
                    'manual',
                    $2,
                    $2,
                    '{}'::jsonb,
                    '[]'::jsonb,
                    '{}'::jsonb,
                    '{}'::jsonb,
                    'processing'
                )
                `,
                [
                    checkoutId,
                    orderId,
                ],
            );


            await db.query(
                `
                insert into ${schema}.checkout_processing (
                    id,
                    checkout_id,
                    status,
                    current_step
                )
                values (
                    $1,
                    $2,
                    'processing',
                    'checkout_received'
                )
                `,
                [
                    randomUUID(),
                    checkoutId,
                ],
            );


            return checkoutId;
        }


        async function failCheckout(
            tenant: CurrentTenant,
            orderId: string,
            errorMessage: string,
        ) {
            sourcingServiceMock
                .findSourcesForCheckout
                .mockRejectedValueOnce(
                    new Error(
                        errorMessage,
                    ),
                );


            await expect(
                checkoutService
                    .createCheckout(
                        createDto(
                            orderId,
                        ) as any,

                        tenant,
                    ),
            ).rejects.toThrow(
                errorMessage,
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
                                ConfigModule.forRoot({
                                    isGlobal:
                                        true,
                                }),
                            ],

                            providers: [
                                DbService,
                                ConfigService,
                                TenantsService,

                                CheckoutRepository,
                                CheckoutProcessingRepository,

                                CheckoutService,

                                {
                                    provide:
                                        SourcingService,

                                    useValue:
                                        sourcingServiceMock,
                                },

                                {
                                    provide:
                                        GroupingService,

                                    useValue:
                                        groupingServiceMock,
                                },

                                {
                                    provide:
                                        GroupingRulesService,

                                    useValue:
                                        groupingRulesServiceMock,
                                },

                                {
                                    provide:
                                        ShipmentPlanGeneratorService,

                                    useValue:
                                        shipmentPlanGeneratorServiceMock,
                                },

                                {
                                    provide:
                                        ShipmentPlanBuilderService,

                                    useValue:
                                        shipmentPlanBuilderServiceMock,
                                },

                                {
                                    provide:
                                        ShipmentGroupsRepository,

                                    useValue:
                                        shipmentGroupsRepositoryMock,
                                },

                                {
                                    provide:
                                        ShipmentPlanEvaluatorService,

                                    useValue:
                                        shipmentPlanEvaluatorServiceMock,
                                },

                                {
                                    provide:
                                        ShipmentPlanQuoteService,

                                    useValue:
                                        shipmentPlanQuoteServiceMock,
                                },

                                {
                                    provide:
                                        ShipmentPlanDeliveryOptionsService,

                                    useValue:
                                        shipmentPlanDeliveryOptionsServiceMock,
                                },

                                {
                                    provide:
                                        DecisionService,

                                    useValue:
                                        decisionServiceMock,
                                },

                                {
                                    provide:
                                        ShipmentCreationService,

                                    useValue:
                                        shipmentCreationServiceMock,
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


                checkoutService =
                    moduleRef.get(
                        CheckoutService,
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


                expect(
                    tenantA.schemaName,
                ).not.toBe(
                    tenantB.schemaName,
                );
            },
            30000,
        );


        beforeEach(
            () => {
                jest.clearAllMocks();
            },
        );


        afterAll(
            async () => {
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
         * Tenant A fails.
         *
         * Tenant B has an existing checkout with the SAME order id.
         *
         * Only A may become failed.
         * ============================================================
         */

        it(
            'should mark only Tenant A checkout as failed',
            async () => {
                const orderId =
                    `TENANT-FAIL-${randomUUID()}`;


                try {
                    await seedProcessingCheckout(
                        tenantB,
                        orderId,
                    );


                    await failCheckout(
                        tenantA,
                        orderId,
                        'TENANT_A_SOURCING_FAILURE',
                    );


                    const checkoutA =
                        await getCheckout(
                            tenantA,
                            orderId,
                        );


                    const checkoutB =
                        await getCheckout(
                            tenantB,
                            orderId,
                        );


                    expect(
                        checkoutA,
                    ).not.toBeNull();


                    expect(
                        checkoutB,
                    ).not.toBeNull();


                    expect(
                        checkoutA!.status,
                    ).toBe(
                        'failed',
                    );


                    expect(
                        checkoutB!.status,
                    ).toBe(
                        'processing',
                    );
                } finally {
                    await cleanupOrder(
                        tenantA,
                        orderId,
                    );


                    await cleanupOrder(
                        tenantB,
                        orderId,
                    );
                }
            },
        );


        /*
         * ============================================================
         * TEST 2
         *
         * Processing row in Tenant B must remain untouched.
         * ============================================================
         */

        it(
            'should not change Tenant B checkout_processing when Tenant A fails',
            async () => {
                const orderId =
                    `TENANT-PROCESSING-${randomUUID()}`;


                try {
                    const checkoutBId =
                        await seedProcessingCheckout(
                            tenantB,
                            orderId,
                        );


                    await failCheckout(
                        tenantA,
                        orderId,
                        'A_PROCESSING_FAILURE',
                    );


                    const processingB =
                        await getProcessing(
                            tenantB,
                            checkoutBId,
                        );


                    expect(
                        processingB,
                    ).not.toBeNull();


                    expect(
                        processingB!.status,
                    ).toBe(
                        'processing',
                    );


                    expect(
                        processingB!.current_step,
                    ).toBe(
                        'checkout_received',
                    );


                    expect(
                        processingB!.error_message,
                    ).toBeNull();


                    expect(
                        processingB!.completed_at,
                    ).toBeNull();
                } finally {
                    await cleanupOrder(
                        tenantA,
                        orderId,
                    );


                    await cleanupOrder(
                        tenantB,
                        orderId,
                    );
                }
            },
        );


        /*
         * ============================================================
         * TEST 3
         *
         * Same external_order_id is deliberately used in both schemas.
         *
         * Each tenant must still resolve its own checkout.
         * ============================================================
         */

        it(
            'should isolate identical order ids across tenants',
            async () => {
                const orderId =
                    `SAME-ORDER-${randomUUID()}`;


                try {
                    const checkoutBId =
                        await seedProcessingCheckout(
                            tenantB,
                            orderId,
                        );


                    await failCheckout(
                        tenantA,
                        orderId,
                        'A_SAME_ORDER_FAILURE',
                    );


                    const checkoutA =
                        await getCheckout(
                            tenantA,
                            orderId,
                        );


                    const checkoutB =
                        await getCheckout(
                            tenantB,
                            orderId,
                        );


                    expect(
                        checkoutA,
                    ).not.toBeNull();


                    expect(
                        checkoutB,
                    ).not.toBeNull();


                    expect(
                        checkoutA!.id,
                    ).not.toBe(
                        checkoutB!.id,
                    );


                    expect(
                        checkoutB!.id,
                    ).toBe(
                        checkoutBId,
                    );


                    expect(
                        checkoutA!
                            .external_order_id,
                    ).toBe(
                        orderId,
                    );


                    expect(
                        checkoutB!
                            .external_order_id,
                    ).toBe(
                        orderId,
                    );
                } finally {
                    await cleanupOrder(
                        tenantA,
                        orderId,
                    );


                    await cleanupOrder(
                        tenantB,
                        orderId,
                    );
                }
            },
        );


        /*
         * ============================================================
         * TEST 4
         *
         * A's error message must never leak into B's processing table.
         * ============================================================
         */

        it(
            'should not leak Tenant A failure message into Tenant B',
            async () => {
                const orderId =
                    `TENANT-ERROR-${randomUUID()}`;


                const errorA =
                    `SECRET_A_ERROR_${randomUUID()}`;


                try {
                    const checkoutBId =
                        await seedProcessingCheckout(
                            tenantB,
                            orderId,
                        );


                    await failCheckout(
                        tenantA,
                        orderId,
                        errorA,
                    );


                    const checkoutA =
                        await getCheckout(
                            tenantA,
                            orderId,
                        );


                    const processingA =
                        await getProcessing(
                            tenantA,
                            checkoutA!.id,
                        );


                    const processingB =
                        await getProcessing(
                            tenantB,
                            checkoutBId,
                        );


                    expect(
                        processingA,
                    ).not.toBeNull();


                    expect(
                        processingB,
                    ).not.toBeNull();


                    expect(
                        processingA!
                            .error_message,
                    ).toContain(
                        errorA,
                    );


                    expect(
                        processingB!
                            .error_message,
                    ).toBeNull();



                } finally {
                    await cleanupOrder(
                        tenantA,
                        orderId,
                    );


                    await cleanupOrder(
                        tenantB,
                        orderId,
                    );
                }
            },
        );


        /*
         * ============================================================
         * TEST 5
         *
         * First A processes and fails.
         *
         * Then B independently processes the SAME order id and gets
         * its own completely different failure.
         *
         * Each schema must retain only its own state/error.
         * ============================================================
         */

        it(
            'should allow Tenant B to process independently after Tenant A failure',
            async () => {
                const orderId =
                    `INDEPENDENT-${randomUUID()}`;


                const errorA =
                    `TENANT_A_ERROR_${randomUUID()}`;


                const errorB =
                    `TENANT_B_ERROR_${randomUUID()}`;


                try {
                    /*
                     * Attempt in Tenant A.
                     */
                    await failCheckout(
                        tenantA,
                        orderId,
                        errorA,
                    );


                    /*
                     * Completely independent attempt
                     * using Tenant B.
                     */
                    await failCheckout(
                        tenantB,
                        orderId,
                        errorB,
                    );


                    const checkoutA =
                        await getCheckout(
                            tenantA,
                            orderId,
                        );


                    const checkoutB =
                        await getCheckout(
                            tenantB,
                            orderId,
                        );


                    expect(
                        checkoutA,
                    ).not.toBeNull();


                    expect(
                        checkoutB,
                    ).not.toBeNull();


                    expect(
                        checkoutA!.status,
                    ).toBe(
                        'failed',
                    );


                    expect(
                        checkoutB!.status,
                    ).toBe(
                        'failed',
                    );


                    const processingA =
                        await getProcessing(
                            tenantA,
                            checkoutA!.id,
                        );


                    const processingB =
                        await getProcessing(
                            tenantB,
                            checkoutB!.id,
                        );


                    expect(
                        processingA!
                            .current_step,
                    ).toBe(
                        'sourcing',
                    );


                    expect(
                        processingB!
                            .current_step,
                    ).toBe(
                        'sourcing',
                    );


                    expect(
                        processingA!
                            .error_message,
                    ).toContain(
                        errorA,
                    );


                    expect(
                        processingA!
                            .error_message,
                    ).not.toContain(
                        errorB,
                    );


                    expect(
                        processingB!
                            .error_message,
                    ).toContain(
                        errorB,
                    );


                    expect(
                        processingB!
                            .error_message,
                    ).not.toContain(
                        errorA,
                    );
                } finally {
                    await cleanupOrder(
                        tenantA,
                        orderId,
                    );


                    await cleanupOrder(
                        tenantB,
                        orderId,
                    );
                }
            },
        );
    },
);