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
import { SourcingResultsRepository } from '../src/modules/sourcing/sourcing-results.repository';
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
    'Checkout Failure-State Consistency Integration',
    () => {
        let moduleRef: TestingModule;

        let db: DbService;
        let config: ConfigService;
        let tenantsService: TenantsService;

        let checkoutService:
            CheckoutService;

        let tenant:
            CurrentTenant;


        /*
         * ============================================================
         * Mocked business services
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


        const shipmentGroupsRepositoryMock = {
            saveGroupingResult:
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
                    'failure-state-test-store',

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
                            'Failure State Test Item',

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


        function validGrouping(
            groupId: string,
        ) {
            return {
                orderId:
                    'ORDER-FAILURE-STATE',

                shipmentGroups: [
                    {
                        groupId,

                        sources: [
                            {
                                id:
                                    'SOURCE-1',

                                name:
                                    'Warehouse 1',

                                type:
                                    'warehouse',

                                location: {
                                    country:
                                        'Israel',

                                    city:
                                        'Tel Aviv',

                                    street:
                                        'Test Street',

                                    houseNumber:
                                        '1',

                                    latitude:
                                        32.08,

                                    longitude:
                                        34.78,
                                },
                            },
                        ],

                        items: [
                            {
                                sku:
                                    'SKU-1',

                                name:
                                    'Test Item',

                                quantity:
                                    1,

                                unitWeight:
                                    1,

                                unitPrice:
                                    100,

                                sourceId:
                                    'SOURCE-1',
                            },
                        ],

                        categories:
                            ['general'],

                        totalItems:
                            1,

                        totalWeight:
                            1,

                        totalPrice:
                            100,

                        groupingReasons:
                            [],

                        handlingGroup:
                            'standard',
                    },
                ],

                ungroupedItems:
                    [],

                totalGroups:
                    1,

                totalGroupedItems:
                    1,

                hasUngroupedItems:
                    false,

                splitReasons:
                    [],
            };
        }


        function validPlan(
            planId: string,
            groupId: string,
        ) {
            return {
                id:
                    planId,

                status:
                    'grouped',

                assignments:
                    [],

                grouping:
                    validGrouping(
                        groupId,
                    ),

                metrics: {
                    shipmentCount:
                        1,

                    totalDistance:
                        0,

                    averageSourceScore:
                        1,
                },
            };
        }


        function validDeliveryOption(
            planId: string,
            groupId: string,
        ) {
            return {
                id:
                    `delivery-${randomUUID()}`,

                planId,

                selectedGroupQuotes: [
                    {
                        groupId,

                        pickupCities: [
                            'Tel Aviv',
                        ],

                        destinationCity:
                            'Jerusalem',

                        weightKg:
                            1,

                        quote: {
                            providerId:
                                null,

                            providerCode:
                                'TEST',

                            adapterKey:
                                'mock',

                            carrierName:
                                'Test Carrier',

                            serviceName:
                                'Standard',

                            price:
                                25,

                            currency:
                                'ILS',

                            estimatedDays:
                                2,

                            providerPriority:
                                0.5,
                        },
                    },
                ],

                metrics: {
                    totalShippingPrice:
                        25,

                    estimatedDeliveryDays:
                        2,

                    averageProviderPriority:
                        0.5,

                    shipmentCount:
                        1,
                },
            };
        }


        async function findCheckoutByOrderId(
            orderId: string,
        ) {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            const rows =
                await db.query<{
                    id: string;
                    status: string;
                }>(
                    `
                    select
                        id,
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


            if (!rows[0]) {
                throw new Error(
                    `Checkout not found for ${orderId}`,
                );
            }


            return rows[0];
        }


        async function getProcessing(
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


            if (!rows[0]) {
                throw new Error(
                    `Checkout processing row not found: ${checkoutId}`,
                );
            }


            return rows[0];
        }


        async function assertFailedState(
            orderId: string,
            expectedStage: string,
            expectedError: string,
            expectedSourcingCompleted: boolean,
            expectedGroupingCompleted: boolean,
        ) {
            const checkout =
                await findCheckoutByOrderId(
                    orderId,
                );


            expect(
                checkout.status,
            ).toBe(
                'failed',
            );


            const processing =
                await getProcessing(
                    checkout.id,
                );


            expect(
                processing.status,
            ).toBe(
                'failed',
            );


            expect(
                processing.current_step,
            ).toBe(
                expectedStage,
            );


            expect(
                processing.error_message,
            ).toContain(
                expectedError,
            );


            expect(
                processing.sourcing_completed,
            ).toBe(
                expectedSourcingCompleted,
            );


            expect(
                processing.grouping_completed,
            ).toBe(
                expectedGroupingCompleted,
            );


            expect(
                processing.completed_at,
            ).not.toBeNull();
        }


        async function cleanupOrder(
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


        function resetMocks() {
            jest.clearAllMocks();


            groupingRulesServiceMock
                .getActiveStrategies
                .mockResolvedValue(
                    [],
                );


            sourcingServiceMock
                .findSourcesForCheckout
                .mockResolvedValue(
                    [],
                );


            shipmentPlanGeneratorServiceMock
                .generatePlans
                .mockReturnValue({
                    plans:
                        [],

                    unresolvedItems:
                        [],

                    statistics: {
                        theoreticalCombinations:
                            0,

                        generatedCombinations:
                            0,

                        generationLimitReached:
                            false,
                    },
                });


            shipmentPlanBuilderServiceMock
                .buildPlans
                .mockReturnValue(
                    [],
                );


            shipmentPlanEvaluatorServiceMock
                .evaluateAndSelect
                .mockImplementation(
                    (plans: any[]) =>
                        plans,
                );


            shipmentPlanQuoteServiceMock
                .getQuotesForPlans
                .mockResolvedValue(
                    [],
                );


            shipmentPlanDeliveryOptionsServiceMock
                .generateForPlans
                .mockReturnValue(
                    [],
                );


            decisionServiceMock
                .getActivePriorityCards
                .mockResolvedValue(
                    [],
                );


            decisionServiceMock
                .selectBestDeliveryOption
                .mockReturnValue(
                    null,
                );


            decisionServiceMock
                .saveShipmentDecision
                .mockResolvedValue(
                    undefined,
                );


            shipmentGroupsRepositoryMock
                .saveGroupingResult
                .mockResolvedValue(
                    undefined,
                );


            shipmentCreationServiceMock
                .createShipments
                .mockResolvedValue(
                    [],
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
                                SourcingResultsRepository,
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
            },
            30000,
        );


        beforeEach(
            () => {
                resetMocks();
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
         * Failure during sourcing.
         * ============================================================
         */

        it(
            'should mark checkout and processing as failed at sourcing stage',
            async () => {
                const orderId =
                    `FAIL-SOURCING-${randomUUID()}`;


                sourcingServiceMock
                    .findSourcesForCheckout
                    .mockRejectedValueOnce(
                        new Error(
                            'SIMULATED_SOURCING_FAILURE',
                        ),
                    );


                try {
                    await expect(
                        checkoutService
                            .createCheckout(
                                createDto(
                                    orderId,
                                ) as any,

                                tenant,
                            ),
                    ).rejects.toThrow(
                        'SIMULATED_SOURCING_FAILURE',
                    );


                    await assertFailedState(
                        orderId,
                        'sourcing',
                        'SIMULATED_SOURCING_FAILURE',
                        false,
                        false,
                    );
                } finally {
                    await cleanupOrder(
                        orderId,
                    );
                }
            },
        );


        /*
         * ============================================================
         * TEST 2
         * Sourcing succeeds but no valid shipment plan exists.
         * ============================================================
         */

        it(
            'should mark checkout as failed at grouping stage when no valid plan can be generated',
            async () => {
                const orderId =
                    `FAIL-NO-PLAN-${randomUUID()}`;
                const dto =
                    createDto(
                        orderId,
                    );

                const sku =
                    dto.items[0].sku;

                sourcingServiceMock
                    .findSourcesForCheckout
                    .mockResolvedValueOnce(
                        [
                            {
                                itemIndex:
                                    0,

                                sku:
                                    sku,
                                requestedQuantity:
                                    1,
                                possibleSources:
                                    [],

                                rejectedSources:
                                    [],
                            },
                        ],
                    );


                shipmentPlanGeneratorServiceMock
                    .generatePlans
                    .mockReturnValueOnce({
                        plans:
                            [],

                        unresolvedItems: [
                            {
                                itemIndex:
                                    0,

                                sku:
                                    'SKU-1',

                                requestedQuantity:
                                    1,
                            },
                        ],

                        statistics: {
                            theoreticalCombinations:
                                0,

                            generatedCombinations:
                                0,

                            generationLimitReached:
                                false,
                        },
                    });


                shipmentPlanBuilderServiceMock
                    .buildPlans
                    .mockReturnValueOnce(
                        [],
                    );


                try {
                    await expect(
                        checkoutService
                            .createCheckout(
                                dto as any,
                                tenant,
                            ),
                    ).rejects.toThrow(
                        'No valid shipment plans could be generated',
                    );


                    await assertFailedState(
                        orderId,
                        'grouping',
                        'No valid shipment plans could be generated',
                        true,
                        false,
                    );
                } finally {
                    await cleanupOrder(
                        orderId,
                    );
                }
            },
        );


        /*
         * ============================================================
         * TEST 3
         * Failure while retrieving quotes.
         *
         * Expected business stage:
         * awaiting_quotes
         * ============================================================
         */

        it(
            'should mark checkout as failed at awaiting_quotes stage when quote retrieval fails',
            async () => {
                const orderId =
                    `FAIL-QUOTES-${randomUUID()}`;
                const dto =
                    createDto(
                        orderId,
                    );

                const sku =
                    dto.items[0].sku;
                const planId =
                    `PLAN-${randomUUID()}`;

                const groupId =
                    randomUUID();

                const plan =
                    validPlan(
                        planId,
                        groupId,
                    );


                sourcingServiceMock
                    .findSourcesForCheckout
                    .mockResolvedValueOnce(
                        [
                            {
                                itemIndex:
                                    0,

                                sku,

                                requestedQuantity:
                                    1,

                                possibleSources:
                                    [],

                                rejectedSources:
                                    [],
                            },
                        ],
                    );


                shipmentPlanGeneratorServiceMock
                    .generatePlans
                    .mockReturnValueOnce({
                        plans: [
                            {
                                id:
                                    planId,
                            },
                        ],

                        unresolvedItems:
                            [],

                        statistics: {
                            theoreticalCombinations:
                                1,

                            generatedCombinations:
                                1,

                            generationLimitReached:
                                false,
                        },
                    });


                shipmentPlanBuilderServiceMock
                    .buildPlans
                    .mockReturnValueOnce(
                        [
                            plan,
                        ],
                    );


                shipmentPlanEvaluatorServiceMock
                    .evaluateAndSelect
                    .mockReturnValueOnce(
                        [
                            plan,
                        ],
                    );


                shipmentPlanQuoteServiceMock
                    .getQuotesForPlans
                    .mockRejectedValueOnce(
                        new Error(
                            'SIMULATED_QUOTES_FAILURE',
                        ),
                    );


                try {
                    await expect(
                        checkoutService
                            .createCheckout(
                                dto as any,
                                tenant,
                            ),
                    ).rejects.toThrow(
                        'SIMULATED_QUOTES_FAILURE',
                    );


                    await assertFailedState(
                        orderId,
                        'awaiting_quotes',
                        'SIMULATED_QUOTES_FAILURE',
                        true,
                        false,
                    );
                } finally {
                    await cleanupOrder(
                        orderId,
                    );
                }
            },
        );


        /*
         * ============================================================
         * TEST 4
         * Quotes succeed but DecisionService cannot select an option.
         * ============================================================
         */

        it(
            'should mark checkout as failed at carrier_selection stage when no delivery option is selected',
            async () => {
                const orderId =
                    `FAIL-CARRIER-SELECTION-${randomUUID()}`;

                const planId =
                    `PLAN-${randomUUID()}`;

                const groupId =
                    randomUUID();

                const plan =
                    validPlan(
                        planId,
                        groupId,
                    );


                sourcingServiceMock
                    .findSourcesForCheckout
                    .mockResolvedValueOnce(
                        [],
                    );


                shipmentPlanGeneratorServiceMock
                    .generatePlans
                    .mockReturnValueOnce({
                        plans: [
                            {
                                id:
                                    planId,
                            },
                        ],

                        unresolvedItems:
                            [],

                        statistics: {
                            theoreticalCombinations:
                                1,

                            generatedCombinations:
                                1,

                            generationLimitReached:
                                false,
                        },
                    });


                shipmentPlanBuilderServiceMock
                    .buildPlans
                    .mockReturnValueOnce(
                        [
                            plan,
                        ],
                    );


                shipmentPlanEvaluatorServiceMock
                    .evaluateAndSelect
                    .mockReturnValueOnce(
                        [
                            plan,
                        ],
                    );


                shipmentPlanQuoteServiceMock
                    .getQuotesForPlans
                    .mockResolvedValueOnce(
                        [
                            {
                                plan,

                                status:
                                    'quoted',

                                groupQuotes:
                                    [],

                                quoteMetrics:
                                    {},
                            },
                        ],
                    );


                shipmentPlanDeliveryOptionsServiceMock
                    .generateForPlans
                    .mockReturnValueOnce(
                        [
                            {
                                quotedPlan: {
                                    plan,
                                },

                                statistics: {
                                    theoreticalCombinations:
                                        0,

                                    generatedCombinations:
                                        0,

                                    generationLimitReached:
                                        false,
                                },

                                deliveryOptions:
                                    [],
                            },
                        ],
                    );


                decisionServiceMock
                    .getActivePriorityCards
                    .mockResolvedValueOnce(
                        [],
                    );


                decisionServiceMock
                    .selectBestDeliveryOption
                    .mockReturnValueOnce(
                        null,
                    );


                try {
                    await expect(
                        checkoutService
                            .createCheckout(
                                createDto(
                                    orderId,
                                ) as any,

                                tenant,
                            ),
                    ).rejects.toThrow(
                        'No delivery option could be selected',
                    );


                    await assertFailedState(
                        orderId,
                        'carrier_selection',
                        'No delivery option could be selected',
                        true,
                        false,
                    );
                } finally {
                    await cleanupOrder(
                        orderId,
                    );
                }
            },
        );


        /*
         * ============================================================
         * TEST 5
         * Everything succeeds until shipment creation.
         * ============================================================
         */

        it(
            'should mark checkout as failed at shipment_creation stage when shipment creation fails',
            async () => {
                const orderId =
                    `FAIL-SHIPMENT-CREATION-${randomUUID()}`;

                const planId =
                    `PLAN-${randomUUID()}`;

                const groupId =
                    randomUUID();

                const plan =
                    validPlan(
                        planId,
                        groupId,
                    );

                const selectedOption =
                    validDeliveryOption(
                        planId,
                        groupId,
                    );


                sourcingServiceMock
                    .findSourcesForCheckout
                    .mockResolvedValueOnce(
                        [],
                    );


                shipmentPlanGeneratorServiceMock
                    .generatePlans
                    .mockReturnValueOnce({
                        plans: [
                            {
                                id:
                                    planId,
                            },
                        ],

                        unresolvedItems:
                            [],

                        statistics: {
                            theoreticalCombinations:
                                1,

                            generatedCombinations:
                                1,

                            generationLimitReached:
                                false,
                        },
                    });


                shipmentPlanBuilderServiceMock
                    .buildPlans
                    .mockReturnValueOnce(
                        [
                            plan,
                        ],
                    );


                shipmentPlanEvaluatorServiceMock
                    .evaluateAndSelect
                    .mockReturnValueOnce(
                        [
                            plan,
                        ],
                    );


                shipmentPlanQuoteServiceMock
                    .getQuotesForPlans
                    .mockResolvedValueOnce(
                        [
                            {
                                plan,

                                status:
                                    'quoted',

                                groupQuotes:
                                    [],

                                quoteMetrics:
                                    {},
                            },
                        ],
                    );


                shipmentPlanDeliveryOptionsServiceMock
                    .generateForPlans
                    .mockReturnValueOnce(
                        [
                            {
                                quotedPlan: {
                                    plan,
                                },

                                statistics: {
                                    theoreticalCombinations:
                                        1,

                                    generatedCombinations:
                                        1,

                                    generationLimitReached:
                                        false,
                                },

                                deliveryOptions: [
                                    selectedOption,
                                ],
                            },
                        ],
                    );


                decisionServiceMock
                    .getActivePriorityCards
                    .mockResolvedValueOnce(
                        [],
                    );


                decisionServiceMock
                    .selectBestDeliveryOption
                    .mockReturnValueOnce(
                        selectedOption,
                    );


                decisionServiceMock
                    .saveShipmentDecision
                    .mockResolvedValueOnce(
                        undefined,
                    );


                shipmentGroupsRepositoryMock
                    .saveGroupingResult
                    .mockResolvedValueOnce(
                        undefined,
                    );


                shipmentCreationServiceMock
                    .createShipments
                    .mockRejectedValueOnce(
                        new Error(
                            'SIMULATED_SHIPMENT_CREATION_FAILURE',
                        ),
                    );


                try {
                    await expect(
                        checkoutService
                            .createCheckout(
                                createDto(
                                    orderId,
                                ) as any,

                                tenant,
                            ),
                    ).rejects.toThrow(
                        'SIMULATED_SHIPMENT_CREATION_FAILURE',
                    );


                    await assertFailedState(
                        orderId,
                        'shipment_creation',
                        'SIMULATED_SHIPMENT_CREATION_FAILURE',
                        true,
                        false,
                    );
                } finally {
                    await cleanupOrder(
                        orderId,
                    );
                }
            },
        );
    },
);