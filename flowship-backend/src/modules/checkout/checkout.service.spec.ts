import {
    CheckoutService,
} from './checkout.service';

import {
    CheckoutRepository,
} from './checkout.repository';

import {
    CheckoutProcessingRepository,
} from './checkout-processing.repository';

import {
    ShipmentGroupsRepository,
} from '../grouping/shipment-groups.repository';

import {
    SourcingService,
} from '../sourcing/sourcing.service';

import {
    GroupingService,
} from '../grouping/grouping.service';

import {
    GroupingRulesService,
} from '../grouping/grouping-rules.service';

import {
    ShipmentPlanGeneratorService,
} from '../planning/shipment-plan-generator.service';

import {
    ShipmentPlanBuilderService,
} from '../planning/shipment-plan-builder.service';

import {
    ShipmentPlanEvaluatorService,
} from '../planning/shipment-plan-evaluator.service';

import {
    ShipmentPlanQuoteService,
} from '../planning/shipment-plan-quote.service';

import {
    ShipmentPlanDeliveryOptionsService,
} from '../planning/shipment-plan-delivery-options.service';

import {
    DecisionService,
} from '../decision/decision.service';

import {
    ShipmentCreationService,
} from '../shipments/shipment-creation.service';

import {
    CurrentTenant,
} from '../tenants/tenants.service';

describe('CheckoutService', () => {
    let service: CheckoutService;

    let sourcingServiceMock: {
        findSourcesForCheckout: jest.Mock;
    };

    let groupingServiceMock: Record<string, jest.Mock>;

    let shipmentPlanGeneratorServiceMock: {
        generatePlans: jest.Mock;
    };

    let shipmentPlanBuilderServiceMock: {
        buildPlans: jest.Mock;
    };

    let checkoutRepositoryMock: {
        getCheckouts: jest.Mock;
        getCheckoutById: jest.Mock;
        saveCheckout: jest.Mock;
        saveCheckoutItems: jest.Mock;
        updateGroupingSplitReasons: jest.Mock;
        updateStatus: jest.Mock;
    };

    let checkoutProcessingRepositoryMock: {
        create: jest.Mock;
        markSourcingCompleted: jest.Mock;
        markGroupingCompleted: jest.Mock;
        markFailed: jest.Mock;
    };

    let shipmentGroupsRepositoryMock: {
        saveGroupingResult: jest.Mock;
    };

    let shipmentPlanEvaluatorServiceMock: {
        evaluateAndSelect: jest.Mock;
    };

    let shipmentPlanQuoteServiceMock: {
        getQuotesForPlans: jest.Mock;
    };

    let shipmentPlanDeliveryOptionsServiceMock: {
        generateForPlans: jest.Mock;
    };

    let decisionServiceMock: {
        getActivePriorityCards: jest.Mock;
        selectBestDeliveryOption: jest.Mock;
        saveShipmentDecision: jest.Mock;
    };

    let groupingRulesServiceMock: {
        getActiveStrategies: jest.Mock;
    };

    let shipmentCreationServiceMock: {
        createShipments: jest.Mock;
    };

    const tenant: CurrentTenant = {
        id: 'tenant-1',
        name: 'QUEEN',
        schemaName: 'queen',
        status: 'active',
    };

    const checkoutDto = {
        orderId: 'order-100',
        storeId: 'store-1',

        destination: {
            country: 'Israel',
            city: 'Tel Aviv',
            street: 'Dizengoff',
            houseNumber: '100',
            postalCode: '6100000',
        },

        items: [
            {
                sku: 'SKU-1',
                name: 'Product 1',
                quantity: 2,
                weight: 1.5,
                supplierId: 'supplier-1',
                category: 'fashion',
                price: 50,
            },
            {
                sku: 'SKU-2',
                name: 'Product 2',
                quantity: 3,
                weight: 2,
                supplierId: 'supplier-2',
                category: 'electronics',
                price: 20,
            },
        ],
    } as any;

    const sourcing = [
        {
            itemIndex: 0,
            sku: 'SKU-1',
            requestedQuantity: 2,

            selectedSource: {
                source: {
                    id: 'source-1',
                    name: 'Source 1',
                    type: 'store',
                },

                totalScore: 0.9,
            },
        },
        {
            itemIndex: 1,
            sku: 'SKU-2',
            requestedQuantity: 3,

            selectedSource: {
                source: {
                    id: 'source-2',
                    name: 'Source 2',
                    type: 'warehouse',
                },

                totalScore: 0.8,
            },
        },
    ] as any;

    const groupingResult = {
        shipmentGroups: [
            {
                groupId: 'group-1',

                sources: [
                    {
                        id: 'source-1',
                        name: 'Source 1',
                        type: 'store',
                    },
                ],

                handlingGroup: 'standard',
                totalItems: 5,
                totalWeight: 9,

                items: [
                    {
                        sku: 'SKU-1',
                        quantity: 2,
                        sourceId: 'source-1',
                        supplierId: 'supplier-1',
                    },
                ],
            },
        ],

        totalGroups: 1,

        hasUngroupedItems: false,

        splitReasons: [
            'different_sources',
        ],
    } as any;

    const validPlan = {
        id: 'plan-1',

        status: 'grouped',

        assignments: [
            {
                itemIndex: 0,
                sku: 'SKU-1',

                selectedSource: {
                    source: {
                        id: 'source-1',
                        name: 'Source 1',
                        type: 'store',
                    },

                    totalScore: 0.9,
                },
            },
        ],

        grouping: groupingResult,

        metrics: {
            shipmentCount: 1,
            averageSourceScore: 0.9,
        },
    } as any;

    const rejectedPlan = {
        id: 'plan-rejected',

        status: 'rejected',

        assignments: [],

        grouping: undefined,

        metrics: {
            shipmentCount: 0,
            averageSourceScore: 0,
        },
    } as any;

    const generationResult = {
        plans: [
            {
                id: 'generated-plan-1',
            },
        ],

        unresolvedItems: [],

        statistics: {
            generatedPlansCount: 1,
        },
    } as any;

    const activeStrategies = [
        {
            id: 'strategy-1',
            strategyKey: 'group_by_source',
            config: {},
        },
    ] as any;

    const quotedPlans = [
        {
            plan: validPlan,

            status: 'quoted',

            quoteMetrics: {
                quotedGroupsCount: 1,
                totalGroupsCount: 1,
            },

            groupQuotes: [
                {
                    groupId: 'group-1',

                    pickupCities: [
                        'Tel Aviv',
                    ],

                    destinationCity:
                        'Tel Aviv',

                    weightKg: 9,

                    quotes: [
                        {
                            carrierName:
                                'Mock Carrier',

                            serviceName:
                                'Same Day',

                            price: 30,

                            estimatedDays: 1,
                        },
                    ],

                    failedProviders: [],
                },
            ],
        },
    ] as any;

    const deliveryOption = {
        id: 'delivery-option-1',

        planId: 'plan-1',

        metrics: {
            totalShippingPrice: 30,
            estimatedDeliveryDays: 1,
            averageProviderPriority: 0.8,
            shipmentCount: 1,
        },

        selectedGroupQuotes: [
            {
                groupId: 'group-1',

                quote: {
                    carrierName:
                        'Mock Carrier',

                    serviceName:
                        'Same Day',

                    price: 30,

                    estimatedDays: 1,
                },
            },
        ],
    } as any;

    const deliveryOptionsResult = [
        {
            quotedPlan:
                quotedPlans[0],

            statistics: {
                theoreticalCombinationsCount: 1,
                generatedOptionsCount: 1,
            },

            deliveryOptions: [
                deliveryOption,
            ],
        },
    ] as any;

    const priorityCards = [
        {
            id: 'priority-1',
            priorityKey: 'price',
            weight: 1,
        },
    ] as any;

    beforeEach(() => {
        jest.useFakeTimers();

        jest.setSystemTime(
            new Date(
                '2026-09-07T12:00:00.000Z',
            ),
        );

        jest.spyOn(
            console,
            'dir',
        ).mockImplementation(
            () => undefined,
        );

        jest.spyOn(
            console,
            'log',
        ).mockImplementation(
            () => undefined,
        );

        sourcingServiceMock = {
            findSourcesForCheckout:
                jest.fn(),
        };

        groupingServiceMock = {};

        shipmentPlanGeneratorServiceMock = {
            generatePlans:
                jest.fn(),
        };

        shipmentPlanBuilderServiceMock = {
            buildPlans:
                jest.fn(),
        };

        checkoutRepositoryMock = {
            getCheckouts:
                jest.fn(),

            getCheckoutById:
                jest.fn(),

            saveCheckout:
                jest.fn(),

            saveCheckoutItems:
                jest.fn(),

            updateGroupingSplitReasons:
                jest.fn(),

            updateStatus:
                jest.fn(),
        };

        checkoutProcessingRepositoryMock = {
            create:
                jest.fn(),

            markSourcingCompleted:
                jest.fn(),

            markGroupingCompleted:
                jest.fn(),

            markFailed:
                jest.fn(),
        };

        shipmentGroupsRepositoryMock = {
            saveGroupingResult:
                jest.fn(),
        };

        shipmentPlanEvaluatorServiceMock = {
            evaluateAndSelect:
                jest.fn(),
        };

        shipmentPlanQuoteServiceMock = {
            getQuotesForPlans:
                jest.fn(),
        };

        shipmentPlanDeliveryOptionsServiceMock = {
            generateForPlans:
                jest.fn(),
        };

        decisionServiceMock = {
            getActivePriorityCards:
                jest.fn(),

            selectBestDeliveryOption:
                jest.fn(),

            saveShipmentDecision:
                jest.fn(),
        };

        groupingRulesServiceMock = {
            getActiveStrategies:
                jest.fn(),
        };

        shipmentCreationServiceMock = {
            createShipments:
                jest.fn(),
        };

        service = new CheckoutService(
            sourcingServiceMock as unknown as SourcingService,

            groupingServiceMock as unknown as GroupingService,

            shipmentPlanGeneratorServiceMock as unknown as
            ShipmentPlanGeneratorService,

            shipmentPlanBuilderServiceMock as unknown as
            ShipmentPlanBuilderService,

            checkoutRepositoryMock as unknown as
            CheckoutRepository,

            checkoutProcessingRepositoryMock as unknown as
            CheckoutProcessingRepository,

            shipmentGroupsRepositoryMock as unknown as
            ShipmentGroupsRepository,

            shipmentPlanEvaluatorServiceMock as unknown as
            ShipmentPlanEvaluatorService,

            shipmentPlanQuoteServiceMock as unknown as
            ShipmentPlanQuoteService,

            shipmentPlanDeliveryOptionsServiceMock as unknown as
            ShipmentPlanDeliveryOptionsService,

            decisionServiceMock as unknown as
            DecisionService,

            groupingRulesServiceMock as unknown as
            GroupingRulesService,

            shipmentCreationServiceMock as unknown as
            ShipmentCreationService,
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    const setupHappyPath = () => {
        checkoutRepositoryMock
            .saveCheckout
            .mockResolvedValue(
                'checkout-1',
            );

        checkoutRepositoryMock
            .saveCheckoutItems
            .mockResolvedValue({
                'SKU-1': [
                    'checkout-item-1',
                ],

                'SKU-2': [
                    'checkout-item-2',
                ],
            });

        checkoutProcessingRepositoryMock
            .create
            .mockResolvedValue(
                undefined,
            );

        sourcingServiceMock
            .findSourcesForCheckout
            .mockResolvedValue(
                sourcing,
            );

        groupingRulesServiceMock
            .getActiveStrategies
            .mockResolvedValue(
                activeStrategies,
            );

        checkoutProcessingRepositoryMock
            .markSourcingCompleted
            .mockResolvedValue(
                undefined,
            );

        shipmentPlanGeneratorServiceMock
            .generatePlans
            .mockReturnValue(
                generationResult,
            );

        shipmentPlanBuilderServiceMock
            .buildPlans
            .mockReturnValue([
                validPlan,
                rejectedPlan,
            ]);

        shipmentPlanEvaluatorServiceMock
            .evaluateAndSelect
            .mockReturnValue([
                validPlan,
            ]);

        shipmentPlanQuoteServiceMock
            .getQuotesForPlans
            .mockResolvedValue(
                quotedPlans,
            );

        shipmentPlanDeliveryOptionsServiceMock
            .generateForPlans
            .mockReturnValue(
                deliveryOptionsResult,
            );

        decisionServiceMock
            .getActivePriorityCards
            .mockResolvedValue(
                priorityCards,
            );

        decisionServiceMock
            .selectBestDeliveryOption
            .mockReturnValue(
                deliveryOption,
            );

        decisionServiceMock
            .saveShipmentDecision
            .mockResolvedValue(
                undefined,
            );

        checkoutRepositoryMock
            .updateGroupingSplitReasons
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
            .mockResolvedValue([
                {
                    shipmentId:
                        'shipment-1',

                    groupId:
                        'group-1',
                },
            ]);

        checkoutProcessingRepositoryMock
            .markGroupingCompleted
            .mockResolvedValue(
                undefined,
            );

        checkoutRepositoryMock
            .updateStatus
            .mockResolvedValue(
                undefined,
            );

        checkoutProcessingRepositoryMock
            .markFailed
            .mockResolvedValue(
                undefined,
            );
    };

    describe('getCheckouts', () => {
        it('should return checkouts from repository', async () => {
            const checkouts = [
                {
                    id: 'checkout-1',
                },
                {
                    id: 'checkout-2',
                },
            ];

            checkoutRepositoryMock
                .getCheckouts
                .mockResolvedValue(
                    checkouts,
                );

            const result =
                await service
                    .getCheckouts(
                        tenant,
                    );

            expect(
                checkoutRepositoryMock
                    .getCheckouts,
            ).toHaveBeenCalledWith(
                tenant,
            );

            expect(result).toBe(
                checkouts,
            );
        });
    });

    describe('getCheckoutById', () => {
        it('should return checkout by id from repository', async () => {
            const checkout = {
                id: 'checkout-1',
            };

            checkoutRepositoryMock
                .getCheckoutById
                .mockResolvedValue(
                    checkout,
                );

            const result =
                await service
                    .getCheckoutById(
                        tenant,
                        'checkout-1',
                    );

            expect(
                checkoutRepositoryMock
                    .getCheckoutById,
            ).toHaveBeenCalledWith(
                tenant,
                'checkout-1',
            );

            expect(result).toBe(
                checkout,
            );
        });

        it('should return null when checkout does not exist', async () => {
            checkoutRepositoryMock
                .getCheckoutById
                .mockResolvedValue(
                    null,
                );

            const result =
                await service
                    .getCheckoutById(
                        tenant,
                        'missing-checkout',
                    );

            expect(result).toBeNull();
        });
    });

    describe('createCheckout mapping and persistence', () => {
        it('should map checkout DTO to internal checkout structure', async () => {
            setupHappyPath();

            await service.createCheckout(
                checkoutDto,
                tenant,
            );

            const savedCheckout =
                checkoutRepositoryMock
                    .saveCheckout
                    .mock.calls[0][1];

            expect(
                savedCheckout,
            ).toEqual({
                orderId:
                    'order-100',

                storeId:
                    'store-1',

                destination: {
                    country:
                        'Israel',

                    city:
                        'Tel Aviv',

                    street:
                        'Dizengoff',

                    houseNumber:
                        '100',

                    postalCode:
                        '6100000',
                },

                items: [
                    {
                        sku:
                            'SKU-1',

                        name:
                            'Product 1',

                        quantity:
                            2,

                        unitWeight:
                            1.5,

                        supplierId:
                            'supplier-1',

                        category:
                            'fashion',

                        unitPrice:
                            50,
                    },
                    {
                        sku:
                            'SKU-2',

                        name:
                            'Product 2',

                        quantity:
                            3,

                        unitWeight:
                            2,

                        supplierId:
                            'supplier-2',

                        category:
                            'electronics',

                        unitPrice:
                            20,
                    },
                ],

                totalItems: 5,

                totalPrice: 160,

                createdAt:
                    new Date(
                        '2026-09-07T12:00:00.000Z',
                    ),
            });
        });

        it('should calculate totalItems from item quantities', async () => {
            setupHappyPath();

            await service.createCheckout(
                checkoutDto,
                tenant,
            );

            const checkout =
                checkoutRepositoryMock
                    .saveCheckout
                    .mock.calls[0][1];

            expect(
                checkout.totalItems,
            ).toBe(5);
        });

        it('should calculate totalPrice using price multiplied by quantity', async () => {
            setupHappyPath();

            await service.createCheckout(
                checkoutDto,
                tenant,
            );

            const checkout =
                checkoutRepositoryMock
                    .saveCheckout
                    .mock.calls[0][1];

            expect(
                checkout.totalPrice,
            ).toBe(160);
        });

        it('should save checkout with manual source', async () => {
            setupHappyPath();

            await service.createCheckout(
                checkoutDto,
                tenant,
            );

            expect(
                checkoutRepositoryMock
                    .saveCheckout,
            ).toHaveBeenCalledWith(
                tenant,
                expect.any(Object),
                'manual',
            );
        });

        it('should save checkout items and create processing record using generated checkout id', async () => {
            setupHappyPath();

            await service.createCheckout(
                checkoutDto,
                tenant,
            );

            const internalCheckout =
                checkoutRepositoryMock
                    .saveCheckout
                    .mock.calls[0][1];

            expect(
                checkoutRepositoryMock
                    .saveCheckoutItems,
            ).toHaveBeenCalledWith(
                tenant,
                'checkout-1',
                internalCheckout,
            );

            expect(
                checkoutProcessingRepositoryMock
                    .create,
            ).toHaveBeenCalledWith(
                tenant,
                'checkout-1',
            );
        });
    });

    describe('sourcing and planning', () => {
        it('should find sources using the internal checkout and tenant', async () => {
            setupHappyPath();

            await service.createCheckout(
                checkoutDto,
                tenant,
            );

            const internalCheckout =
                checkoutRepositoryMock
                    .saveCheckout
                    .mock.calls[0][1];

            expect(
                sourcingServiceMock
                    .findSourcesForCheckout,
            ).toHaveBeenCalledWith(
                internalCheckout,
                tenant,
            );
        });

        it('should load active grouping strategies', async () => {
            setupHappyPath();

            await service.createCheckout(
                checkoutDto,
                tenant,
            );

            expect(
                groupingRulesServiceMock
                    .getActiveStrategies,
            ).toHaveBeenCalledWith(
                tenant,
            );
        });

        it('should mark sourcing as completed after successful sourcing', async () => {
            setupHappyPath();

            await service.createCheckout(
                checkoutDto,
                tenant,
            );

            expect(
                checkoutProcessingRepositoryMock
                    .markSourcingCompleted,
            ).toHaveBeenCalledWith(
                tenant,
                'checkout-1',
            );
        });

        it('should generate plans from sourcing and build them using checkout and active strategies', async () => {
            setupHappyPath();

            await service.createCheckout(
                checkoutDto,
                tenant,
            );

            expect(
                shipmentPlanGeneratorServiceMock
                    .generatePlans,
            ).toHaveBeenCalledWith(
                sourcing,
            );

            const internalCheckout =
                checkoutRepositoryMock
                    .saveCheckout
                    .mock.calls[0][1];

            expect(
                shipmentPlanBuilderServiceMock
                    .buildPlans,
            ).toHaveBeenCalledWith(
                internalCheckout,
                generationResult.plans,
                activeStrategies,
            );
        });

        it('should send only grouped plans to evaluator', async () => {
            setupHappyPath();

            await service.createCheckout(
                checkoutDto,
                tenant,
            );

            expect(
                shipmentPlanEvaluatorServiceMock
                    .evaluateAndSelect,
            ).toHaveBeenCalledWith([
                validPlan,
            ]);
        });
    });

    describe('quotes and decision', () => {
        it('should request quotes for selected plans using destination city and tenant', async () => {
            setupHappyPath();

            await service.createCheckout(
                checkoutDto,
                tenant,
            );

            expect(
                shipmentPlanQuoteServiceMock
                    .getQuotesForPlans,
            ).toHaveBeenCalledWith(
                [
                    validPlan,
                ],
                'Tel Aviv',
                tenant,
            );
        });

        it('should generate delivery options from quoted plans', async () => {
            setupHappyPath();

            await service.createCheckout(
                checkoutDto,
                tenant,
            );

            expect(
                shipmentPlanDeliveryOptionsServiceMock
                    .generateForPlans,
            ).toHaveBeenCalledWith(
                quotedPlans,
            );
        });

        it('should load priority cards and evaluate all delivery options', async () => {
            setupHappyPath();

            const secondOption = {
                ...deliveryOption,

                id:
                    'delivery-option-2',

                metrics: {
                    ...deliveryOption.metrics,

                    totalShippingPrice:
                        40,
                },
            };

            shipmentPlanDeliveryOptionsServiceMock
                .generateForPlans
                .mockReturnValue([
                    {
                        ...deliveryOptionsResult[0],

                        deliveryOptions: [
                            deliveryOption,
                            secondOption,
                        ],
                    },
                ]);

            await service.createCheckout(
                checkoutDto,
                tenant,
            );

            expect(
                decisionServiceMock
                    .getActivePriorityCards,
            ).toHaveBeenCalledWith(
                tenant,
            );

            expect(
                decisionServiceMock
                    .selectBestDeliveryOption,
            ).toHaveBeenCalledWith(
                [
                    deliveryOption,
                    secondOption,
                ],
                priorityCards,
            );
        });

        it('should throw when no delivery option can be selected', async () => {
            setupHappyPath();

            decisionServiceMock
                .selectBestDeliveryOption
                .mockReturnValue(
                    null,
                );

            await expect(
                service.createCheckout(
                    checkoutDto,
                    tenant,
                ),
            ).rejects.toThrow(
                'No delivery option could be selected',
            );

            expect(
                checkoutProcessingRepositoryMock
                    .markFailed,
            ).toHaveBeenCalledWith(
                tenant,
                'checkout-1',
                'carrier_selection',
                'No delivery option could be selected',
            );
        });

        it('should save the selected shipment decision with evaluated options count', async () => {
            setupHappyPath();

            await service.createCheckout(
                checkoutDto,
                tenant,
            );

            expect(
                decisionServiceMock
                    .saveShipmentDecision,
            ).toHaveBeenCalledWith(
                tenant,
                'checkout-1',
                'order-100',
                deliveryOption,
                priorityCards,
                1,
            );
        });
    });

    describe('winning plan and shipment creation', () => {
        it('should throw when winning shipment plan cannot be found', async () => {
            setupHappyPath();

            decisionServiceMock
                .selectBestDeliveryOption
                .mockReturnValue({
                    ...deliveryOption,

                    planId:
                        'missing-plan',
                });

            await expect(
                service.createCheckout(
                    checkoutDto,
                    tenant,
                ),
            ).rejects.toThrow(
                'Winning shipment plan not found: missing-plan',
            );

            expect(
                checkoutRepositoryMock
                    .updateStatus,
            ).toHaveBeenCalledWith(
                tenant,
                'checkout-1',
                'failed',
            );
        });

        it('should throw when winning shipment plan has no grouping result', async () => {
            setupHappyPath();

            const planWithoutGrouping = {
                ...validPlan,

                grouping:
                    undefined,
            };

            shipmentPlanBuilderServiceMock
                .buildPlans
                .mockReturnValue([
                    planWithoutGrouping,
                ]);

            shipmentPlanEvaluatorServiceMock
                .evaluateAndSelect
                .mockReturnValue([
                    planWithoutGrouping,
                ]);

            decisionServiceMock
                .selectBestDeliveryOption
                .mockReturnValue({
                    ...deliveryOption,

                    planId:
                        planWithoutGrouping.id,
                });

            await expect(
                service.createCheckout(
                    checkoutDto,
                    tenant,
                ),
            ).rejects.toThrow(
                `Winning shipment plan has no grouping result: ${planWithoutGrouping.id}`,
            );
        });

        it('should persist winning grouping and then create shipments', async () => {
            setupHappyPath();

            const itemIds = {
                'SKU-1': [
                    'checkout-item-1',
                ],

                'SKU-2': [
                    'checkout-item-2',
                ],
            };

            checkoutRepositoryMock
                .saveCheckoutItems
                .mockResolvedValue(
                    itemIds,
                );

            await service.createCheckout(
                checkoutDto,
                tenant,
            );

            expect(
                checkoutRepositoryMock
                    .updateGroupingSplitReasons,
            ).toHaveBeenCalledWith(
                tenant,
                'checkout-1',
                groupingResult.splitReasons,
            );

            expect(
                shipmentGroupsRepositoryMock
                    .saveGroupingResult,
            ).toHaveBeenCalledWith(
                tenant,
                'checkout-1',
                groupingResult,
                itemIds,
            );

            expect(
                shipmentCreationServiceMock
                    .createShipments,
            ).toHaveBeenCalledWith(
                tenant,
                'checkout-1',
                expect.any(Object),
                validPlan,
                deliveryOption,
            );

            const saveGroupingOrder =
                shipmentGroupsRepositoryMock
                    .saveGroupingResult
                    .mock.invocationCallOrder[0];

            const createShipmentsOrder =
                shipmentCreationServiceMock
                    .createShipments
                    .mock.invocationCallOrder[0];

            expect(
                saveGroupingOrder,
            ).toBeLessThan(
                createShipmentsOrder,
            );
        });

        it('should mark grouping completed and update checkout status according to ungrouped items', async () => {
            setupHappyPath();

            await service.createCheckout(
                checkoutDto,
                tenant,
            );

            expect(
                checkoutProcessingRepositoryMock
                    .markGroupingCompleted,
            ).toHaveBeenCalledWith(
                tenant,
                'checkout-1',
            );

            expect(
                checkoutRepositoryMock
                    .updateStatus,
            ).toHaveBeenCalledWith(
                tenant,
                'checkout-1',
                'grouped',
            );

            const partiallyGroupedResult = {
                ...groupingResult,

                hasUngroupedItems:
                    true,
            };

            const partiallyGroupedPlan = {
                ...validPlan,

                grouping:
                    partiallyGroupedResult,
            };

            shipmentPlanBuilderServiceMock
                .buildPlans
                .mockReturnValue([
                    partiallyGroupedPlan,
                ]);

            shipmentPlanEvaluatorServiceMock
                .evaluateAndSelect
                .mockReturnValue([
                    partiallyGroupedPlan,
                ]);

            decisionServiceMock
                .selectBestDeliveryOption
                .mockReturnValue({
                    ...deliveryOption,

                    planId:
                        partiallyGroupedPlan.id,
                });

            checkoutRepositoryMock
                .updateStatus
                .mockClear();

            await service.createCheckout(
                checkoutDto,
                tenant,
            );

            expect(
                checkoutRepositoryMock
                    .updateStatus,
            ).toHaveBeenCalledWith(
                tenant,
                'checkout-1',
                'partially_grouped',
            );
        });
    });

    describe('error handling', () => {
        it('should fail with unresolved items when no valid shipment plans can be generated', async () => {
            setupHappyPath();

            const generationWithUnresolvedItems = {
                ...generationResult,

                unresolvedItems: [
                    {
                        sku:
                            'SKU-MISSING',

                        itemIndex:
                            0,

                        requestedQuantity:
                            4,
                    },
                ],
            };

            shipmentPlanGeneratorServiceMock
                .generatePlans
                .mockReturnValue(
                    generationWithUnresolvedItems,
                );

            shipmentPlanBuilderServiceMock
                .buildPlans
                .mockReturnValue([]);

            shipmentPlanEvaluatorServiceMock
                .evaluateAndSelect
                .mockReturnValue([]);

            shipmentPlanQuoteServiceMock
                .getQuotesForPlans
                .mockResolvedValue([]);

            shipmentPlanDeliveryOptionsServiceMock
                .generateForPlans
                .mockReturnValue([]);

            decisionServiceMock
                .selectBestDeliveryOption
                .mockReturnValue(null);

            await expect(
                service.createCheckout(
                    checkoutDto,
                    tenant,
                ),
            ).rejects.toThrow(
                'No valid shipment plans could be generated. Unresolved items: SKU-MISSING (itemIndex: 0, quantity: 4)',
            );
        });

        it('should mark processing and checkout as failed and rethrow the original error', async () => {
            setupHappyPath();

            const originalError =
                new Error(
                    'Sourcing exploded',
                );

            sourcingServiceMock
                .findSourcesForCheckout
                .mockRejectedValue(
                    originalError,
                );

            let caughtError:
                unknown;

            try {
                await service
                    .createCheckout(
                        checkoutDto,
                        tenant,
                    );
            } catch (error) {
                caughtError =
                    error;
            }

            expect(
                caughtError,
            ).toBe(
                originalError,
            );

            expect(
                checkoutProcessingRepositoryMock
                    .markFailed,
            ).toHaveBeenCalledWith(
                tenant,
                'checkout-1',
                'sourcing',
                'Sourcing exploded',
            );

            expect(
                checkoutRepositoryMock
                    .updateStatus,
            ).toHaveBeenCalledWith(
                tenant,
                'checkout-1',
                'failed',
            );
        });
    });
});