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
    ) =>
        ({
            groupId,
            pickupCities: [`Pickup ${groupId}`],
            destinationCity: 'Tel Aviv',
            weightKg: 5,
            quotes,
        }) as any;

    const createQuotedPlan = (
        planId: string,
        groupQuotes: any[],
    ) =>
        ({
            plan: {
                id: planId,
            },
            groupQuotes,
        }) as any;

    beforeEach(() => {
        service =
            new ShipmentPlanDeliveryOptionsService();
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

        expect(selected.quote.providerCode)
            .toBe('carrier-a');
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
});