import { ShipmentPlanDeliveryOptionsService } from './shipment-plan-delivery-options.service';

describe('ShipmentPlanDeliveryOptionsService', () => {
    let service: ShipmentPlanDeliveryOptionsService;

    const createQuote = (
        providerCode: string,
        price: number,
        estimatedDays: number,
        providerPriority?: number,
    ) =>
        ({
            providerCode,
            price,
            estimatedDays,
            providerPriority,
        }) as any;


    const createGroupQuote = (
        groupId: string,
        quotes: any[],
    ) => {
        const sourceId = `source-${groupId}`;

        return {
            groupId,
            pickupCities: [`Pickup ${groupId}`],
            destinationCity: 'Tel Aviv',
            weightKg: 5,
            quotes,
            sourceDirectQuotes: [
                {
                    sourceId,
                    quotes,
                },
            ],
            vehiclePlans: [],
        } as any;
    };

    const createQuotedPlan = (
        planId: string,
        groupQuotes: any[],
    ) => ({
        plan: {
            id: planId,
            grouping: {
                shipmentGroups: groupQuotes.map((groupQuote) => ({
                    groupId: groupQuote.groupId,
                    items: [
                        {
                            sku: `SKU-${groupQuote.groupId}`,
                            sourceId: `source-${groupQuote.groupId}`,
                            quantity: 1,
                            unitWeight: 5,
                        },
                    ],
                })),
            },
        },
        groupQuotes,
    }) as any;


    beforeEach(() => {
        service =
            new ShipmentPlanDeliveryOptionsService();
    });
    it('should include accepted self-delivery alongside carrier options', () => {
        const groupQuote = createGroupQuote('group-1', [
            createQuote('carrier-a', 40, 2, 0.8),
        ]);

        const eta = new Date(
            Date.now() + 2 * 60 * 60 * 1000,
        ).toISOString();

        groupQuote.sourceDirectQuotes[0].selfDeliveryQuote = {
            sourceId: 'source-group-1',
            accepted: true,
            price: 25,
            currency: 'ILS',
            estimatedDeliveryAt: eta,
        };

        const quotedPlan = createQuotedPlan('plan-1', [groupQuote]);

        const result = service.generateForPlans([quotedPlan]);
        const options = result[0].deliveryOptions;

        expect(options).toHaveLength(2);

        const shipments = options.map(
            (option) => option.selectedGroupQuotes[0].shipments![0],
        );

        expect(shipments).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    sourceId: 'source-group-1',
                    deliveryMethod: 'carrier',
                    quote: expect.objectContaining({
                        price: 40,
                    }),
                }),
                expect.objectContaining({
                    sourceId: 'source-group-1',
                    deliveryMethod: 'self_delivery',
                    estimatedDeliveryAt: eta,
                    quote: expect.objectContaining({
                        price: 25,
                        currency: 'ILS',
                    }),
                }),
            ]),
        );

        expect(shipments).toHaveLength(2);
        expect(
            options.every(
                (option) =>
                    option.selectedGroupQuotes[0].shipments?.length === 1,
            ),
        ).toBe(true);
    });
    it('should preserve carrier options when self-delivery is rejected', () => {
        const groupQuote = createGroupQuote('group-1', [
            createQuote('carrier-a', 40, 2, 0.8),
        ]);

        groupQuote.sourceDirectQuotes[0].selfDeliveryQuote = {
            sourceId: 'source-group-1',
            accepted: false,
            price: null,
            currency: 'ILS',
            estimatedDeliveryAt: null,
        };

        const quotedPlan = createQuotedPlan('plan-1', [groupQuote]);
        const result = service.generateForPlans([quotedPlan]);

        const options = result[0].deliveryOptions;

        expect(options).toHaveLength(1);

        const shipment = options[0].selectedGroupQuotes[0].shipments![0];

        expect(shipment.deliveryMethod).toBe('carrier');
        expect(shipment.quote.price).toBe(40);
        expect(shipment.sourceId).toBe('source-group-1');
    });
    it('should reject self-delivery with a negative price', () => {
        const groupQuote = createGroupQuote('group-1', [
            createQuote('carrier-a', 40, 2, 0.8),
        ]);

        groupQuote.sourceDirectQuotes[0].selfDeliveryQuote = {
            sourceId: 'source-group-1',
            accepted: true,
            price: -10,
            currency: 'ILS',
            estimatedDeliveryAt: new Date(
                Date.now() + 2 * 60 * 60 * 1000,
            ).toISOString(),
        };

        const quotedPlan = createQuotedPlan('plan-1', [groupQuote]);
        const result = service.generateForPlans([quotedPlan]);

        const options = result[0].deliveryOptions;

        expect(options).toHaveLength(1);

        const shipment = options[0].selectedGroupQuotes[0].shipments![0];

        expect(shipment.deliveryMethod).toBe('carrier');
        expect(shipment.quote.price).toBe(40);
    });
    it('should reject self-delivery with an invalid ETA', () => {
        const groupQuote = createGroupQuote('group-1', [
            createQuote('carrier-a', 40, 2, 0.8),
        ]);

        groupQuote.sourceDirectQuotes[0].selfDeliveryQuote = {
            sourceId: 'source-group-1',
            accepted: true,
            price: 25,
            currency: 'ILS',
            estimatedDeliveryAt: 'invalid-date',
        };

        const quotedPlan = createQuotedPlan('plan-1', [groupQuote]);
        const result = service.generateForPlans([quotedPlan]);

        const options = result[0].deliveryOptions;

        expect(options).toHaveLength(1);

        const shipment = options[0].selectedGroupQuotes[0].shipments![0];

        expect(shipment.deliveryMethod).toBe('carrier');
        expect(shipment.quote.price).toBe(40);
    });
    it('should reject self-delivery with an ETA in the past', () => {
        const groupQuote = createGroupQuote('group-1', [
            createQuote('carrier-a', 40, 2, 0.8),
        ]);

        groupQuote.sourceDirectQuotes[0].selfDeliveryQuote = {
            sourceId: 'source-group-1',
            accepted: true,
            price: 25,
            currency: 'ILS',
            estimatedDeliveryAt: new Date(
                Date.now() - 60 * 60 * 1000,
            ).toISOString(),
        };

        const quotedPlan = createQuotedPlan('plan-1', [groupQuote]);
        const result = service.generateForPlans([quotedPlan]);

        const options = result[0].deliveryOptions;

        expect(options).toHaveLength(1);

        const shipment = options[0].selectedGroupQuotes[0].shipments![0];

        expect(shipment.deliveryMethod).toBe('carrier');
        expect(shipment.quote.price).toBe(40);
    });
    it('should generate one delivery option for one group with one quote', () => {
        const quotedPlan = createQuotedPlan(
            'plan-1',
            [
                createGroupQuote('group-1', [
                    createQuote(
                        'carrier-a',
                        25,
                        2,
                        0.8,
                    ),
                ]),
            ],
        );

        const result =
            service.generateForPlans([
                quotedPlan,
            ]);

        expect(result).toHaveLength(1);

        expect(
            result[0].deliveryOptions,
        ).toHaveLength(1);

        expect(
            result[0].deliveryOptions[0].id,
        ).toBe(
            'plan-1-delivery-1',
        );

        expect(
            result[0].deliveryOptions[0].planId,
        ).toBe('plan-1');
    });

    it('should generate all combinations across shipment groups', () => {
        const quotedPlan = createQuotedPlan(
            'plan-1',
            [
                createGroupQuote('group-1', [
                    createQuote(
                        'carrier-a',
                        20,
                        1,
                    ),
                    createQuote(
                        'carrier-b',
                        30,
                        2,
                    ),
                ]),

                createGroupQuote('group-2', [
                    createQuote(
                        'carrier-c',
                        40,
                        1,
                    ),
                    createQuote(
                        'carrier-d',
                        50,
                        3,
                    ),
                ]),
            ],
        );

        const result =
            service.generateForPlans([
                quotedPlan,
            ]);

        expect(
            result[0].deliveryOptions,
        ).toHaveLength(4);

        expect(
            result[0].statistics
                .theoreticalCombinations,
        ).toBe(4);

        expect(
            result[0].statistics
                .generatedCombinations,
        ).toBe(4);
    });
    it('should use the latest ETA across multiple shipment sources', () => {
        const firstGroup = createGroupQuote('group-1', [
            createQuote('carrier-a', 25, 1),
        ]);

        firstGroup.sourceDirectQuotes[0].estimatedDeliveryAt =
            '2026-09-27T10:20:00.000Z';

        const secondGroup = createGroupQuote('group-2', [
            createQuote('carrier-b', 30, 1),
        ]);

        secondGroup.sourceDirectQuotes[0].estimatedDeliveryAt =
            '2026-09-27T11:45:00.000Z';

        const quotedPlan = createQuotedPlan(
            'plan-1',
            [firstGroup, secondGroup],
        );

        quotedPlan.pickupLeadTimeMinutes = 60;

        const result = service.generateForPlans([quotedPlan]);

        expect(result[0].deliveryOptions).toHaveLength(1);

        expect(
            result[0].deliveryOptions[0].metrics,
        ).toEqual(
            expect.objectContaining({
                pickupLeadTimeMinutes: 60,
                estimatedDeliveryAt: '2026-09-27T11:45:00.000Z',
                shipmentCount: 2,
            }),
        );
    });
    it('should return no delivery options when one group has no quotes', () => {
        const quotedPlan = createQuotedPlan(
            'plan-1',
            [
                createGroupQuote('group-1', [
                    createQuote(
                        'carrier-a',
                        20,
                        1,
                    ),
                ]),

                createGroupQuote(
                    'group-2',
                    [],
                ),
            ],
        );

        const result =
            service.generateForPlans([
                quotedPlan,
            ]);

        expect(
            result[0].deliveryOptions,
        ).toEqual([]);

        expect(
            result[0].statistics,
        ).toEqual({
            theoreticalCombinations: 0,
            generatedCombinations: 0,
            generationLimitReached: false,
        });
    });
    it('should not provide overall ETA when one shipment has no ETA', () => {
        const firstGroup = createGroupQuote('group-1', [
            createQuote('carrier-a', 25, 1),
        ]);

        firstGroup.sourceDirectQuotes[0].estimatedDeliveryAt =
            '2026-09-27T10:20:00.000Z';

        const secondGroup = createGroupQuote('group-2', [
            createQuote('carrier-b', 30, 1),
        ]);

        const quotedPlan = createQuotedPlan(
            'plan-1',
            [firstGroup, secondGroup],
        );

        const result = service.generateForPlans([quotedPlan]);

        expect(result[0].deliveryOptions).toHaveLength(1);

        expect(
            result[0].deliveryOptions[0].metrics.estimatedDeliveryAt,
        ).toBeUndefined();

        expect(
            result[0].deliveryOptions[0].metrics.shipmentCount,
        ).toBe(2);
    });
    it('should return no delivery options when there are no quotable groups', () => {
        const quotedPlan = createQuotedPlan(
            'plan-1',
            [],
        );

        const result =
            service.generateForPlans([
                quotedPlan,
            ]);

        expect(
            result[0].deliveryOptions,
        ).toEqual([]);

        expect(
            result[0].statistics
                .theoreticalCombinations,
        ).toBe(0);
    });

    it('should calculate total shipping price correctly', () => {
        const quotedPlan = createQuotedPlan(
            'plan-1',
            [
                createGroupQuote('group-1', [
                    createQuote(
                        'carrier-a',
                        25,
                        1,
                    ),
                ]),

                createGroupQuote('group-2', [
                    createQuote(
                        'carrier-b',
                        40,
                        2,
                    ),
                ]),
            ],
        );

        const result =
            service.generateForPlans([
                quotedPlan,
            ]);

        expect(
            result[0].deliveryOptions[0]
                .metrics.totalShippingPrice,
        ).toBe(65);
    });

    it('should use the slowest shipment as estimated delivery days', () => {
        const quotedPlan = createQuotedPlan(
            'plan-1',
            [
                createGroupQuote('group-1', [
                    createQuote(
                        'carrier-a',
                        25,
                        2,
                    ),
                ]),

                createGroupQuote('group-2', [
                    createQuote(
                        'carrier-b',
                        40,
                        5,
                    ),
                ]),

                createGroupQuote('group-3', [
                    createQuote(
                        'carrier-c',
                        15,
                        1,
                    ),
                ]),
            ],
        );

        const result =
            service.generateForPlans([
                quotedPlan,
            ]);

        expect(
            result[0].deliveryOptions[0]
                .metrics.estimatedDeliveryDays,
        ).toBe(5);
    });

    it('should calculate average provider priority correctly', () => {
        const quotedPlan = createQuotedPlan(
            'plan-1',
            [
                createGroupQuote('group-1', [
                    createQuote(
                        'carrier-a',
                        20,
                        1,
                        0.8,
                    ),
                ]),

                createGroupQuote('group-2', [
                    createQuote(
                        'carrier-b',
                        20,
                        1,
                        0.4,
                    ),
                ]),
            ],
        );

        const result =
            service.generateForPlans([
                quotedPlan,
            ]);

        expect(
            result[0].deliveryOptions[0]
                .metrics.averageProviderPriority,
        ).toBeCloseTo(0.6);
    });

    it('should treat missing provider priority as zero', () => {
        const quotedPlan = createQuotedPlan(
            'plan-1',
            [
                createGroupQuote('group-1', [
                    createQuote(
                        'carrier-a',
                        20,
                        1,
                        0.8,
                    ),
                ]),

                createGroupQuote('group-2', [
                    createQuote(
                        'carrier-b',
                        20,
                        1,
                    ),
                ]),
            ],
        );

        const result =
            service.generateForPlans([
                quotedPlan,
            ]);

        expect(
            result[0].deliveryOptions[0]
                .metrics.averageProviderPriority,
        ).toBeCloseTo(0.4);
    });

    it('should set shipment count to number of selected group quotes', () => {
        const quotedPlan = createQuotedPlan(
            'plan-1',
            [
                createGroupQuote('group-1', [
                    createQuote(
                        'carrier-a',
                        20,
                        1,
                    ),
                ]),

                createGroupQuote('group-2', [
                    createQuote(
                        'carrier-b',
                        20,
                        1,
                    ),
                ]),

                createGroupQuote('group-3', [
                    createQuote(
                        'carrier-c',
                        20,
                        1,
                    ),
                ]),
            ],
        );

        const result =
            service.generateForPlans([
                quotedPlan,
            ]);

        expect(
            result[0].deliveryOptions[0]
                .metrics.shipmentCount,
        ).toBe(3);
    });

    it('should preserve group quote metadata in selectedGroupQuotes', () => {
        const quotedPlan = createQuotedPlan(
            'plan-1',
            [
                createGroupQuote('group-1', [
                    createQuote(
                        'carrier-a',
                        25,
                        2,
                        0.7,
                    ),
                ]),
            ],
        );

        const result =
            service.generateForPlans([
                quotedPlan,
            ]);

        const selected =
            result[0].deliveryOptions[0]
                .selectedGroupQuotes[0];

        expect(selected.groupId)
            .toBe('group-1');

        expect(selected.pickupCities)
            .toEqual([
                'Pickup group-1',
            ]);

        expect(selected.destinationCity)
            .toBe('Tel Aviv');

        expect(selected.weightKg)
            .toBe(5);

        expect(selected.shipments).toHaveLength(1);

        expect(selected.shipments?.[0].quote.providerCode)
            .toBe('carrier-a');

        expect(selected.shipments?.[0].sourceId)
            .toBe('source-group-1');
    });

    it('should generate sequential delivery option ids', () => {
        const quotedPlan = createQuotedPlan(
            'plan-7',
            [
                createGroupQuote('group-1', [
                    createQuote(
                        'carrier-a',
                        20,
                        1,
                    ),
                    createQuote(
                        'carrier-b',
                        30,
                        2,
                    ),
                    createQuote(
                        'carrier-c',
                        40,
                        3,
                    ),
                ]),
            ],
        );

        const result =
            service.generateForPlans([
                quotedPlan,
            ]);

        expect(
            result[0].deliveryOptions.map(
                (option) => option.id,
            ),
        ).toEqual([
            'plan-7-delivery-1',
            'plan-7-delivery-2',
            'plan-7-delivery-3',
        ]);
    });

    it('should never generate more than 100 delivery options', () => {
        const quotes = Array.from(
            { length: 11 },
            (_, index) =>
                createQuote(
                    `carrier-${index}`,
                    10 + index,
                    1,
                ),
        );

        const quotedPlan = createQuotedPlan(
            'plan-1',
            [
                createGroupQuote(
                    'group-1',
                    quotes,
                ),
                createGroupQuote(
                    'group-2',
                    quotes,
                ),
            ],
        );

        const result =
            service.generateForPlans([
                quotedPlan,
            ]);

        expect(
            result[0].statistics
                .theoreticalCombinations,
        ).toBe(121);

        expect(
            result[0].deliveryOptions,
        ).toHaveLength(100);

        expect(
            result[0].statistics
                .generatedCombinations,
        ).toBe(100);

        expect(
            result[0].statistics
                .generationLimitReached,
        ).toBe(true);
    });

    it('should not mark generation limit reached when exactly 100 combinations exist', () => {
        const quotesA = Array.from(
            { length: 10 },
            (_, index) =>
                createQuote(
                    `a-${index}`,
                    10,
                    1,
                ),
        );

        const quotesB = Array.from(
            { length: 10 },
            (_, index) =>
                createQuote(
                    `b-${index}`,
                    10,
                    1,
                ),
        );

        const quotedPlan = createQuotedPlan(
            'plan-1',
            [
                createGroupQuote(
                    'group-1',
                    quotesA,
                ),
                createGroupQuote(
                    'group-2',
                    quotesB,
                ),
            ],
        );

        const result =
            service.generateForPlans([
                quotedPlan,
            ]);

        expect(
            result[0].deliveryOptions,
        ).toHaveLength(100);

        expect(
            result[0].statistics
                .theoreticalCombinations,
        ).toBe(100);

        expect(
            result[0].statistics
                .generationLimitReached,
        ).toBe(false);
    });

    it('should process multiple quoted plans independently', () => {
        const plan1 = createQuotedPlan(
            'plan-1',
            [
                createGroupQuote('group-1', [
                    createQuote(
                        'carrier-a',
                        20,
                        1,
                    ),
                ]),
            ],
        );

        const plan2 = createQuotedPlan(
            'plan-2',
            [
                createGroupQuote('group-1', [
                    createQuote(
                        'carrier-b',
                        30,
                        2,
                    ),
                    createQuote(
                        'carrier-c',
                        40,
                        3,
                    ),
                ]),
            ],
        );

        const result =
            service.generateForPlans([
                plan1,
                plan2,
            ]);

        expect(result)
            .toHaveLength(2);

        expect(
            result[0].deliveryOptions,
        ).toHaveLength(1);

        expect(
            result[1].deliveryOptions,
        ).toHaveLength(2);
    });

    it('should return an empty array when there are no quoted plans', () => {
        const result =
            service.generateForPlans([]);

        expect(result).toEqual([]);
    });
    it('should generate a delivery option from a vehicle plan alternative', () => {
        const groupQuote = createGroupQuote(
            'group-1',
            [],
        );


        groupQuote.vehiclePlans = [
            {
                sourceId: 'source-group-1',
                providerId: 'provider-1',
                providerCode: 'delivery-center',
                plan: {
                    parts: [],
                    vehicles: [
                        {
                            vehicleType: 'car',
                            maxWeightKg: 10,
                            assignedWeightKg: 2,
                            items: [],
                        },
                        {
                            vehicleType: 'car',
                            maxWeightKg: 10,
                            assignedWeightKg: 3,
                            items: [],
                        },
                    ],
                },
                vehicleQuotes: [
                    {
                        vehicleType: 'car',
                        assignedWeightKg: 2,
                        failedProviders: [],
                        quotes: [{
                            carrierName: 'Delivery Center',
                            serviceName: 'Standard',
                            providerId: 'provider-1',
                            providerCode: 'delivery-center',
                            price: 20,
                            currency: 'ILS',
                            estimatedDays: 1,
                            urgency: 'standard',
                            providerPriority: 0.9,
                        }],
                    },
                    {
                        vehicleType: 'car',
                        assignedWeightKg: 3,
                        failedProviders: [],
                        quotes: [{
                            carrierName: 'Delivery Center',
                            serviceName: 'Standard',
                            providerId: 'provider-1',
                            providerCode: 'delivery-center',
                            price: 25,
                            currency: 'ILS',
                            estimatedDays: 1,
                            urgency: 'standard',
                            providerPriority: 0.9,
                        }],
                    },
                ],
                alternatives: [{
                    urgency: 'standard',
                    totalPrice: 45,
                    currency: 'ILS',
                    vehicleCount: 2,
                    estimatedDays: 1,
                    providerPriority: 0.9,
                }],
            },
        ];


        const quotedPlan = createQuotedPlan(
            'plan-1',
            [groupQuote],
        );

        const result =
            service.generateForPlans([
                quotedPlan,
            ]);

        expect(
            result[0].deliveryOptions,
        ).toHaveLength(1);

        expect(
            result[0].deliveryOptions[0].metrics,
        ).toEqual({
            totalShippingPrice: 45,
            estimatedDeliveryDays: 1,
            averageProviderPriority: 0.9,
            shipmentCount: 2,
        });
    });
    it('should count vehicle plan alternatives in theoretical combinations', () => {
        const groupQuote = createGroupQuote(
            'group-1',
            [],
        );


        groupQuote.vehiclePlans = [
            {
                sourceId: 'source-group-1',
                providerId: 'provider-1',
                providerCode: 'delivery-center',
                plan: {
                    parts: [],
                    vehicles: [
                        {
                            vehicleType: 'car',
                            maxWeightKg: 10,
                            assignedWeightKg: 2,
                            items: [],
                        },
                        {
                            vehicleType: 'car',
                            maxWeightKg: 10,
                            assignedWeightKg: 3,
                            items: [],
                        },
                    ],
                },
                vehicleQuotes: [
                    {
                        vehicleType: 'car',
                        assignedWeightKg: 2,
                        failedProviders: [],
                        quotes: [{
                            carrierName: 'Delivery Center',
                            serviceName: 'Standard',
                            providerId: 'provider-1',
                            providerCode: 'delivery-center',
                            price: 20,
                            currency: 'ILS',
                            estimatedDays: 1,
                            urgency: 'standard',
                            providerPriority: 0.9,
                        }],
                    },
                    {
                        vehicleType: 'car',
                        assignedWeightKg: 3,
                        failedProviders: [],
                        quotes: [{
                            carrierName: 'Delivery Center',
                            serviceName: 'Standard',
                            providerId: 'provider-1',
                            providerCode: 'delivery-center',
                            price: 25,
                            currency: 'ILS',
                            estimatedDays: 1,
                            urgency: 'standard',
                            providerPriority: 0.9,
                        }],
                    },
                ],
                alternatives: [{
                    urgency: 'standard',
                    totalPrice: 45,
                    currency: 'ILS',
                    vehicleCount: 2,
                    estimatedDays: 1,
                    providerPriority: 0.9,
                }],
            },
        ];

        const quotedPlan = createQuotedPlan(
            'plan-1',
            [groupQuote],
        );

        const result =
            service.generateForPlans([
                quotedPlan,
            ]);

        expect(
            result[0].statistics
                .theoreticalCombinations,
        ).toBe(1);
    });
    it('preserves items and weights for each selected vehicle', () => {
        const groupQuote = createGroupQuote('group-1', []);

        const quote = {
            ...createQuote('delivery-center', 30, 1),
            urgency: 'standard',
        };

        groupQuote.vehiclePlans = [
            {
                sourceId: 'source-group-1',
                plan: {
                    vehicles: [
                        {
                            vehicleType: 'scooter',
                            assignedWeightKg: 1.608,
                            items: [
                                {
                                    sku: 'SHIRT',
                                    quantity: 2,
                                    unitWeightKg: 0.804,
                                },
                            ],
                        },
                        {
                            vehicleType: 'scooter',
                            assignedWeightKg: 1.608,
                            items: [
                                {
                                    sku: 'SHIRT',
                                    quantity: 2,
                                    unitWeightKg: 0.804,
                                },
                            ],
                        },
                    ],
                },
                vehicleQuotes: [
                    { quotes: [quote] },
                    { quotes: [quote] },
                ],
                alternatives: [
                    { urgency: 'standard' },
                ],
            },
        ];

        const quotedPlan = createQuotedPlan('plan-1', [groupQuote]);

        const result = service.generateForPlans([quotedPlan]);

        const option = result[0].deliveryOptions[0];
        const shipments = option.selectedGroupQuotes[0].shipments!;

        expect(shipments).toHaveLength(2);
        expect(option.metrics.shipmentCount).toBe(2);

        expect(shipments.map((shipment) => shipment.vehicleIndex))
            .toEqual([0, 1]);

        expect(shipments.map((shipment) => shipment.assignedWeightKg))
            .toEqual([1.608, 1.608]);

        expect(shipments.map((shipment) => shipment.items))
            .toEqual([
                [{ sku: 'SHIRT', quantity: 2, unitWeightKg: 0.804 }],
                [{ sku: 'SHIRT', quantity: 2, unitWeightKg: 0.804 }],
            ]);

        const totalQuantity = shipments.reduce(
            (sum, shipment) =>
                sum + (shipment.items ?? []).reduce(
                    (total, item) => total + item.quantity,
                    0,
                ),
            0,
        );

        expect(totalQuantity).toBe(4);
    });
    it('preserves separate items and weights for two direct quote sources', () => {
        const groupQuote = createGroupQuote('group-1', []);

        groupQuote.sourceDirectQuotes = [
            {
                sourceId: 'WAREHOUSE-A',
                quotes: [createQuote('carrier-a', 25, 1)],
            },
            {
                sourceId: 'WAREHOUSE-B',
                quotes: [createQuote('carrier-b', 35, 2)],
            },
        ];

        const quotedPlan = createQuotedPlan('plan-1', [groupQuote]);

        quotedPlan.plan.grouping.shipmentGroups[0].items = [
            {
                sku: 'SHIRT',
                name: 'Shirt',
                sourceId: 'WAREHOUSE-A',
                quantity: 4,
                unitWeight: 0.5,
                unitPrice: 50,
            },
            {
                sku: 'SHOES',
                name: 'Shoes',
                sourceId: 'WAREHOUSE-B',
                quantity: 2,
                unitWeight: 1.5,
                unitPrice: 200,
            },
        ];

        const result = service.generateForPlans([quotedPlan]);

        expect(result[0].deliveryOptions).toHaveLength(1);

        const option = result[0].deliveryOptions[0];
        const shipments = option.selectedGroupQuotes[0].shipments!;

        expect(shipments).toHaveLength(2);
        expect(option.metrics.shipmentCount).toBe(2);
        expect(option.metrics.totalShippingPrice).toBe(60);

        expect(shipments).toEqual([
            expect.objectContaining({
                sourceId: 'WAREHOUSE-A',
                vehicleIndex: 0,
                assignedWeightKg: 2,
                items: [
                    {
                        sku: 'SHIRT',
                        quantity: 4,
                        unitWeightKg: 0.5,
                    },
                ],
            }),
            expect.objectContaining({
                sourceId: 'WAREHOUSE-B',
                vehicleIndex: 0,
                assignedWeightKg: 3,
                items: [
                    {
                        sku: 'SHOES',
                        quantity: 2,
                        unitWeightKg: 1.5,
                    },
                ],
            }),
        ]);

        const totalQuantity = shipments.reduce(
            (sum, shipment) =>
                sum + (shipment.items ?? []).reduce(
                    (total, item) => total + item.quantity,
                    0,
                ),
            0,
        );

        expect(totalQuantity).toBe(6);
    });
});