import { ShipmentPlanQuoteService } from './shipment-plan-quote.service';
import { CarriersService } from '../carriers/carriers.service';

describe('ShipmentPlanQuoteService', () => {
    let service: ShipmentPlanQuoteService;

    const carriersServiceMock = {
        getQuotes: jest.fn(),
    };

    const tenant = {
        id: 'tenant-1',
        name: 'Queen',
        schemaName: 'queen',
    } as any;

    const createSource = (
        id: string,
        city: string,
    ) =>
        ({
            id,
            name: `Source ${id}`,
            type: 'warehouse',
            isActive: true,
            priority: 0.8,
            location: {
                city,
            },
        }) as any;

    const createGroup = ({
        groupId,
        sources,
        totalWeight = 5,
    }: {
        groupId: string;
        sources: any[];
        totalWeight?: number;
    }) =>
        ({
            groupId,
            sources,
            categories: ['fashion'],
            handlingGroup: 'standard',
            items: [],
            totalItems: 1,
            totalWeight,
            totalPrice: 100,
            groupingReasons: [
                'COMPATIBLE_HANDLING_GROUP',
            ],
        }) as any;

    const createPlan = (
        id: string,
        groups: any[],
    ) =>
        ({
            id,
            status: 'evaluated',

            assignments: [],

            grouping: {
                orderId: 'order-1',
                shipmentGroups: groups,
                ungroupedItems: [],
                totalGroups: groups.length,
                totalGroupedItems: groups.length,
                hasUngroupedItems: false,
                splitReasons: [],
            },

            metrics: {
                shipmentCount: groups.length,
                totalSourceScore: 0.8,
                averageSourceScore: 0.8,
            },
        }) as any;

    const createQuote = (
        carrierName: string,
        price: number,
        estimatedDays = 1,
    ) =>
        ({
            carrierName,
            serviceName: `${carrierName} Delivery`,
            price,
            currency: 'ILS',
            estimatedDays,
            providerPriority: 0.8,
            providerCode: carrierName.toLowerCase(),
            providerId: `provider-${carrierName}`,
            adapterKey: carrierName.toLowerCase(),
        }) as any;

    beforeEach(() => {
        jest.clearAllMocks();

        service = new ShipmentPlanQuoteService(
            carriersServiceMock as unknown as CarriersService,
        );
    });

    it('should return an empty array when there are no plans', async () => {
        const result =
            await service.getQuotesForPlans(
                [],
                'Tel Aviv',
                tenant,
            );

        expect(result).toEqual([]);

        expect(
            carriersServiceMock.getQuotes,
        ).not.toHaveBeenCalled();
    });

    it('should request quotes for a shipment group', async () => {
        const group = createGroup({
            groupId: 'group-1',
            sources: [
                createSource(
                    'source-1',
                    'Jerusalem',
                ),
            ],
            totalWeight: 7,
        });

        const plan = createPlan(
            'plan-1',
            [group],
        );

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [
                createQuote(
                    'Mock',
                    25,
                ),
            ],
            failedProviders: [],
        });

        await service.getQuotesForPlans(
            [plan],
            'Tel Aviv',
            tenant,
        );

        expect(
            carriersServiceMock.getQuotes,
        ).toHaveBeenCalledWith(
            {
                pickupCities: [
                    'Jerusalem',
                ],
                destinationCity:
                    'Tel Aviv',
                weightKg: 7,
            },
            tenant,
        );
    });

    it('should support multiple pickup cities in the same shipment group', async () => {
        const group = createGroup({
            groupId: 'group-1',
            sources: [
                createSource(
                    'source-1',
                    'Netivot',
                ),
                createSource(
                    'source-2',
                    'Beer Sheva',
                ),
            ],
            totalWeight: 12,
        });

        const plan = createPlan(
            'plan-1',
            [group],
        );

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [
                createQuote(
                    'Mock',
                    30,
                ),
            ],
            failedProviders: [],
        });

        await service.getQuotesForPlans(
            [plan],
            'Tel Aviv',
            tenant,
        );

        expect(
            carriersServiceMock.getQuotes,
        ).toHaveBeenCalledWith(
            {
                pickupCities: [
                    'Netivot',
                    'Beer Sheva',
                ],
                destinationCity:
                    'Tel Aviv',
                weightKg: 12,
            },
            tenant,
        );
    });

    it('should store carrier quotes in the matching group quote', async () => {
        const group = createGroup({
            groupId: 'group-1',
            sources: [
                createSource(
                    'source-1',
                    'Netivot',
                ),
            ],
        });

        const plan = createPlan(
            'plan-1',
            [group],
        );

        const quotes = [
            createQuote(
                'Mock',
                25,
                3,
            ),
            createQuote(
                'Yango',
                40,
                1,
            ),
        ];

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes,
            failedProviders: [],
        });

        const result =
            await service.getQuotesForPlans(
                [plan],
                'Tel Aviv',
                tenant,
            );

        expect(
            result[0].groupQuotes,
        ).toHaveLength(1);

        expect(
            result[0].groupQuotes[0].quotes,
        ).toEqual(quotes);

        expect(
            result[0].groupQuotes[0].groupId,
        ).toBe('group-1');
    });

    it('should preserve failed providers returned by CarriersService', async () => {
        const group = createGroup({
            groupId: 'group-1',
            sources: [
                createSource(
                    'source-1',
                    'Netivot',
                ),
            ],
        });

        const plan = createPlan(
            'plan-1',
            [group],
        );

        const failedProviders = [
            {
                providerCode: 'yango',
                providerName: 'Yango',
                error: 'timeout',
            },
        ];

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [
                createQuote(
                    'Mock',
                    25,
                ),
            ],
            failedProviders,
        });

        const result =
            await service.getQuotesForPlans(
                [plan],
                'Tel Aviv',
                tenant,
            );

        expect(
            result[0]
                .groupQuotes[0]
                .failedProviders,
        ).toEqual(
            failedProviders,
        );
    });

    it('should mark plan as quoted when every group has at least one quote', async () => {
        const plan = createPlan(
            'plan-1',
            [
                createGroup({
                    groupId: 'group-1',
                    sources: [
                        createSource(
                            'source-1',
                            'Netivot',
                        ),
                    ],
                }),

                createGroup({
                    groupId: 'group-2',
                    sources: [
                        createSource(
                            'source-2',
                            'Jerusalem',
                        ),
                    ],
                }),
            ],
        );

        carriersServiceMock.getQuotes
            .mockResolvedValueOnce({
                quotes: [
                    createQuote(
                        'Mock',
                        25,
                    ),
                ],
                failedProviders: [],
            })
            .mockResolvedValueOnce({
                quotes: [
                    createQuote(
                        'Yango',
                        30,
                    ),
                ],
                failedProviders: [],
            });

        const result =
            await service.getQuotesForPlans(
                [plan],
                'Tel Aviv',
                tenant,
            );

        expect(
            result[0].status,
        ).toBe('quoted');
    });

    it('should mark plan as partially_quoted when only some groups have quotes', async () => {
        const plan = createPlan(
            'plan-1',
            [
                createGroup({
                    groupId: 'group-1',
                    sources: [
                        createSource(
                            'source-1',
                            'Netivot',
                        ),
                    ],
                }),

                createGroup({
                    groupId: 'group-2',
                    sources: [
                        createSource(
                            'source-2',
                            'Jerusalem',
                        ),
                    ],
                }),
            ],
        );

        carriersServiceMock.getQuotes
            .mockResolvedValueOnce({
                quotes: [
                    createQuote(
                        'Mock',
                        25,
                    ),
                ],
                failedProviders: [],
            })
            .mockResolvedValueOnce({
                quotes: [],
                failedProviders: [],
            });

        const result =
            await service.getQuotesForPlans(
                [plan],
                'Tel Aviv',
                tenant,
            );

        expect(
            result[0].status,
        ).toBe(
            'partially_quoted',
        );
    });

    it('should mark plan as quote_failed when no group has quotes', async () => {
        const plan = createPlan(
            'plan-1',
            [
                createGroup({
                    groupId: 'group-1',
                    sources: [
                        createSource(
                            'source-1',
                            'Netivot',
                        ),
                    ],
                }),

                createGroup({
                    groupId: 'group-2',
                    sources: [
                        createSource(
                            'source-2',
                            'Jerusalem',
                        ),
                    ],
                }),
            ],
        );

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [],
            failedProviders: [],
        });

        const result =
            await service.getQuotesForPlans(
                [plan],
                'Tel Aviv',
                tenant,
            );

        expect(
            result[0].status,
        ).toBe('quote_failed');
    });

    it('should calculate quote metrics correctly', async () => {
        const plan = createPlan(
            'plan-1',
            [
                createGroup({
                    groupId: 'group-1',
                    sources: [
                        createSource(
                            'source-1',
                            'Netivot',
                        ),
                    ],
                }),

                createGroup({
                    groupId: 'group-2',
                    sources: [
                        createSource(
                            'source-2',
                            'Jerusalem',
                        ),
                    ],
                }),
            ],
        );

        carriersServiceMock.getQuotes
            .mockResolvedValueOnce({
                quotes: [
                    createQuote(
                        'Mock',
                        20,
                    ),
                    createQuote(
                        'Yango',
                        30,
                    ),
                ],
                failedProviders: [],
            })
            .mockResolvedValueOnce({
                quotes: [],
                failedProviders: [],
            });

        const result =
            await service.getQuotesForPlans(
                [plan],
                'Tel Aviv',
                tenant,
            );

        expect(
            result[0].quoteMetrics,
        ).toEqual({
            quotedGroupsCount: 1,
            groupsWithoutQuotesCount: 1,
            totalQuotesCount: 2,
        });
    });

    it('should request quotes separately for every shipment group', async () => {
        const plan = createPlan(
            'plan-1',
            [
                createGroup({
                    groupId: 'group-1',
                    sources: [
                        createSource(
                            'source-1',
                            'Netivot',
                        ),
                    ],
                    totalWeight: 5,
                }),

                createGroup({
                    groupId: 'group-2',
                    sources: [
                        createSource(
                            'source-2',
                            'Haifa',
                        ),
                    ],
                    totalWeight: 9,
                }),

                createGroup({
                    groupId: 'group-3',
                    sources: [
                        createSource(
                            'source-3',
                            'Eilat',
                        ),
                    ],
                    totalWeight: 12,
                }),
            ],
        );

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [
                createQuote(
                    'Mock',
                    20,
                ),
            ],
            failedProviders: [],
        });

        const result =
            await service.getQuotesForPlans(
                [plan],
                'Tel Aviv',
                tenant,
            );

        expect(
            carriersServiceMock.getQuotes,
        ).toHaveBeenCalledTimes(3);

        expect(
            result[0].groupQuotes,
        ).toHaveLength(3);

        expect(
            result[0].quoteMetrics
                .quotedGroupsCount,
        ).toBe(3);
    });

    it('should process multiple plans independently', async () => {
        const plan1 = createPlan(
            'plan-1',
            [
                createGroup({
                    groupId: 'group-1',
                    sources: [
                        createSource(
                            'source-1',
                            'Netivot',
                        ),
                    ],
                }),
            ],
        );

        const plan2 = createPlan(
            'plan-2',
            [
                createGroup({
                    groupId: 'group-2',
                    sources: [
                        createSource(
                            'source-2',
                            'Jerusalem',
                        ),
                    ],
                }),
            ],
        );

        carriersServiceMock.getQuotes
            .mockResolvedValueOnce({
                quotes: [
                    createQuote(
                        'Mock',
                        20,
                    ),
                ],
                failedProviders: [],
            })
            .mockResolvedValueOnce({
                quotes: [],
                failedProviders: [],
            });

        const result =
            await service.getQuotesForPlans(
                [
                    plan1,
                    plan2,
                ],
                'Tel Aviv',
                tenant,
            );

        expect(result)
            .toHaveLength(2);

        expect(result[0].plan.id)
            .toBe('plan-1');

        expect(result[0].status)
            .toBe('quoted');

        expect(result[1].plan.id)
            .toBe('plan-2');

        expect(result[1].status)
            .toBe('quote_failed');
    });

    it('should preserve the original shipment plan in the result', async () => {
        const plan = createPlan(
            'plan-123',
            [
                createGroup({
                    groupId: 'group-1',
                    sources: [
                        createSource(
                            'source-1',
                            'Netivot',
                        ),
                    ],
                }),
            ],
        );

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [
                createQuote(
                    'Mock',
                    25,
                ),
            ],
            failedProviders: [],
        });

        const result =
            await service.getQuotesForPlans(
                [plan],
                'Tel Aviv',
                tenant,
            );

        expect(
            result[0].plan,
        ).toBe(plan);
    });
});