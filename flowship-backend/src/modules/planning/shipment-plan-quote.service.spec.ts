import { ShipmentPlanQuoteService } from './shipment-plan-quote.service';
import { CarriersService } from '../carriers/carriers.service';
import { DistanceProvider } from
    '../sourcing/interfaces/distance-provider.interface';
import { SourceDeliveryPermissionsService } from
    '../sourcing/source-delivery-permissions.service';
import { DeliverySettingsService } from
    './delivery-settings.service';
import { CapacityPlanningService } from
    '../checkout/capacity-planning.service';
import type { SelfDeliveryProvider } from
    '../sourcing/interfaces/self-delivery-provider.interface';
describe('ShipmentPlanQuoteService', () => {
    let service: ShipmentPlanQuoteService;
    const destination = {
        country: 'Israel',
        city: 'Tel Aviv',
        street: 'Dizengoff',
        houseNumber: '50',
        postalCode: '6433222',
    };
    const carriersServiceMock = {
        getQuotes: jest.fn(),
        getActiveProviders: jest.fn(),
    };
    const capacityPlanningServiceMock = {
        planVehiclesForProviders: jest.fn(),
        planVehicleTraceForProvider: jest.fn(),
    };
    const tenant = {
        id: 'tenant-1',
        name: 'Queen',
        schemaName: 'queen',
        timezone: 'Asia/Jerusalem',
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
                country: 'Israel',
                city,
                street: 'Test Street',
                houseNumber: '10',
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
            items: sources.map((source, index) => ({
                sku: `SKU-${index + 1}`,
                name: `Item ${index + 1}`,
                quantity: 1,
                unitWeight: totalWeight / sources.length,
                unitPrice: 100 / sources.length,
                sourceId: source.id,
            })),
            totalItems: sources.length,
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

    const createConfirmations = (plans: any[]) =>
        plans.map((plan) => {
            const sources = new Map<string, any>();

            for (
                const group of
                plan.grouping?.shipmentGroups ?? []
            ) {
                for (const source of group.sources) {
                    sources.set(source.id, source);
                }
            }

            return {
                plan,
                confirmed: true,
                confirmations: Array.from(
                    sources.values(),
                ).map((source) => ({
                    sourceId: source.id,
                    available: true,
                    preparationMinutes: 25,
                    confirmedAt:
                        '2026-09-27T07:00:00.000Z',
                    items: [],
                })),
            };
        });

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
    let getSettingsForStoreMock: jest.Mock; let selfDeliveryGetQuoteMock: jest.Mock;
    beforeEach(() => {
        jest.resetAllMocks();
        getSettingsForStoreMock = jest.fn().mockResolvedValue(new Map()); carriersServiceMock.getActiveProviders.mockResolvedValue([]);
        capacityPlanningServiceMock.planVehiclesForProviders.mockReturnValue([]);
        const distanceProviderMock = {
            getDistance: jest.fn().mockResolvedValue({
                distanceKm: 15,
                durationMinutes: 25,
            }),
        };

        const deliverySettingsServiceMock = {
            getSettings: jest.fn().mockResolvedValue({
                expressMaxMinutes: 180,
                sameDayMaxMinutes: 1440,
                pickupLeadTimeMinutes: 0,
                expressCutoffTime: null,
                expressAfterCutoffMode: 'extended',
                expressAfterCutoffMaxMinutes: null,
            }),
        };
        selfDeliveryGetQuoteMock = jest.fn().mockResolvedValue({
            sourceId: 'WAREHOUSE-SOUTH',
            accepted: true,
            price: 25,
            currency: 'ILS',
            estimatedDeliveryAt: '2026-10-26T12:00:00.000Z',
        });
        service = new ShipmentPlanQuoteService(
            carriersServiceMock as unknown as CarriersService,
            distanceProviderMock as unknown as DistanceProvider,
            deliverySettingsServiceMock as unknown as DeliverySettingsService,
            capacityPlanningServiceMock as unknown as CapacityPlanningService,
            {
                getSettingsForStore: getSettingsForStoreMock,
            } as unknown as SourceDeliveryPermissionsService,
            {
                getQuote: selfDeliveryGetQuoteMock,
            } as unknown as SelfDeliveryProvider,
        );
        const originalGetQuotesForPlans =
            service.getQuotesForPlans.bind(service);

        jest.spyOn(
            service,
            'getQuotesForPlans',
        )
            .mockImplementation(
                (
                    plans,
                    destination,
                    tenant,
                    confirmations,
                    orderCreatedAt,
                    storeId,
                ) =>
                    originalGetQuotesForPlans(
                        plans,
                        destination,
                        tenant,
                        confirmations ??
                        createConfirmations(plans),
                        orderCreatedAt,
                        storeId,
                    ),
            );


    });
    it('should request self-delivery quote when source and store allow it', async () => {
        const source = {
            ...createSource('WAREHOUSE-SOUTH', 'Ashdod'),
            selfDeliveryEnabled: true,
        };

        getSettingsForStoreMock.mockResolvedValue(
            new Map([['WAREHOUSE-SOUTH', { selfDeliveryAllowed: true, selfDeliveryPrice: 40 }]]),
        );

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [createQuote('MockCarrier', 40)],
            failedProviders: [],
        });

        const plan = createPlan('plan-1', [
            createGroup({
                groupId: 'group-1',
                sources: [source],
            }),
        ]);

        const results = await service.getQuotesForPlans(
            [plan],
            destination,
            tenant,
            createConfirmations([plan]),
            undefined,
            'store-1',
        );
        expect(getSettingsForStoreMock).toHaveBeenCalledWith(
            tenant,
            'store-1',
        );
        expect(selfDeliveryGetQuoteMock).toHaveBeenCalledTimes(1);
        const quoteRequest = selfDeliveryGetQuoteMock.mock.calls[0][0];

        expect(quoteRequest.signal).toBeDefined();
        expect(quoteRequest.signal).toBeInstanceOf(AbortSignal);
        expect(quoteRequest.signal.aborted).toBe(false);
        expect(selfDeliveryGetQuoteMock).toHaveBeenCalledWith(
            expect.objectContaining({
                storeId: 'store-1',
                sourceId: 'WAREHOUSE-SOUTH',
            }),
        );

        expect(results[0]?.groupQuotes[0]?.sourceDirectQuotes?.[0]?.selfDeliveryQuote).toEqual(expect.objectContaining({
            accepted: true,
            price: 40, currency: 'ILS',
        }));
    });
    it('should allow free self-delivery with configured zero price', async () => {
        const source = {
            ...createSource('WAREHOUSE-SOUTH', 'Ashdod'),
            selfDeliveryEnabled: true,
        };

        getSettingsForStoreMock.mockResolvedValue(
            new Map([['WAREHOUSE-SOUTH', {
                selfDeliveryAllowed: true,
                selfDeliveryPrice: 0,
            }]]),
        );

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [createQuote('MockCarrier', 40)],
            failedProviders: [],
        });

        const plan = createPlan('plan-free', [
            createGroup({
                groupId: 'group-free',
                sources: [source],
            }),
        ]);

        const results = await service.getQuotesForPlans(
            [plan],
            destination,
            tenant,
            createConfirmations([plan]),
            undefined,
            'store-1',
        );

        expect(selfDeliveryGetQuoteMock).toHaveBeenCalledTimes(1);
        expect(
            results[0]?.groupQuotes[0]?.sourceDirectQuotes?.[0]?.selfDeliveryQuote,
        ).toEqual(expect.objectContaining({
            accepted: true,
            price: 0,
            currency: 'ILS',
        }));
    });

    it('should not offer self-delivery without a configured price', async () => {
        const source = {
            ...createSource('WAREHOUSE-SOUTH', 'Ashdod'),
            selfDeliveryEnabled: true,
        };

        getSettingsForStoreMock.mockResolvedValue(
            new Map([['WAREHOUSE-SOUTH', {
                selfDeliveryAllowed: true,
                selfDeliveryPrice: null,
            }]]),
        );

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [createQuote('MockCarrier', 40)],
            failedProviders: [],
        });

        const plan = createPlan('plan-no-price', [
            createGroup({
                groupId: 'group-no-price',
                sources: [source],
            }),
        ]);

        const results = await service.getQuotesForPlans(
            [plan],
            destination,
            tenant,
            createConfirmations([plan]),
            undefined,
            'store-1',
        );

        expect(selfDeliveryGetQuoteMock).not.toHaveBeenCalled();

        const sourceResult =
            results[0]?.groupQuotes[0]?.sourceDirectQuotes?.[0];

        expect(sourceResult?.selfDeliveryQuote).toBeFalsy();
        expect(sourceResult?.quotes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    carrierName: 'MockCarrier',
                    price: 40,
                }),
            ]),
        );
    });
    it('should return an empty array when there are no plans', async () => {
        const result =
            await service.getQuotesForPlans(
                [],
                destination,
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
            destination,
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
                pickupAddress:
                    'Test Street 10, Jerusalem',
                destinationAddress:
                    'Dizengoff 50, Tel Aviv',
                readyAt: '2026-09-27T07:25:00.000Z',

                pickupSources: [
                    {
                        sourceId: 'source-1',
                        address: 'Test Street 10, Jerusalem',
                        readyAt: '2026-09-27T07:25:00.000Z',
                    },
                ],
                allowedUrgencies: ['standard'],
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
            destination,
            tenant,
        );

        expect(
            carriersServiceMock.getQuotes,
        ).toHaveBeenCalledTimes(2);

        expect(
            carriersServiceMock.getQuotes,
        ).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                pickupCities: ['Netivot'],
                weightKg: 6,
                pickupSources: [
                    expect.objectContaining({
                        sourceId: 'source-1',
                    }),
                ],
            }),
            tenant,
        );

        expect(
            carriersServiceMock.getQuotes,
        ).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                pickupCities: ['Beer Sheva'],
                weightKg: 6,
                pickupSources: [
                    expect.objectContaining({
                        sourceId: 'source-2',
                    }),
                ],
            }),
            tenant,
        );
    });
    it('should not request self-delivery quote when store denies permission', async () => {
        const source = {
            ...createSource('WAREHOUSE-SOUTH', 'Ashdod'),
            selfDeliveryEnabled: true,
        };

        getSettingsForStoreMock.mockResolvedValue(
            new Map([['WAREHOUSE-SOUTH', { selfDeliveryAllowed: false, selfDeliveryPrice: 40 }]]),
        );

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [createQuote('MockCarrier', 40)],
            failedProviders: [],
        });

        const plan = createPlan('plan-1', [
            createGroup({
                groupId: 'group-1',
                sources: [source],
            }),
        ]);

        const results = await service.getQuotesForPlans(
            [plan],
            destination,
            tenant,
            createConfirmations([plan]),
            undefined,
            'store-1',
        );

        expect(selfDeliveryGetQuoteMock).not.toHaveBeenCalled();

        expect(
            results[0]?.groupQuotes[0]?.sourceDirectQuotes?.[0]?.quotes,
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    carrierName: 'MockCarrier',
                    price: 40,
                }),
            ]),
        );
    });
    it('should not request self-delivery quote when source disables it', async () => {
        const source = {
            ...createSource('WAREHOUSE-SOUTH', 'Ashdod'),
            selfDeliveryEnabled: false,
        };

        getSettingsForStoreMock.mockResolvedValue(
            new Map([['WAREHOUSE-SOUTH', { selfDeliveryAllowed: true, selfDeliveryPrice: 40 }]]),
        );

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [createQuote('MockCarrier', 40)],
            failedProviders: [],
        });

        const plan = createPlan('plan-1', [
            createGroup({
                groupId: 'group-1',
                sources: [source],
            }),
        ]);

        const results = await service.getQuotesForPlans(
            [plan],
            destination,
            tenant,
            createConfirmations([plan]),
            undefined,
            'store-1',
        );

        expect(selfDeliveryGetQuoteMock).not.toHaveBeenCalled();

        expect(
            results[0]?.groupQuotes[0]?.sourceDirectQuotes?.[0]?.quotes,
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    carrierName: 'MockCarrier',
                    price: 40,
                }),
            ]),
        );
    });
    it('should preserve carrier quotes when source rejects self-delivery', async () => {
        const source = {
            ...createSource('WAREHOUSE-SOUTH', 'Ashdod'),
            selfDeliveryEnabled: true,
        };

        getSettingsForStoreMock.mockResolvedValue(
            new Map([['WAREHOUSE-SOUTH', { selfDeliveryAllowed: true, selfDeliveryPrice: 40 }]]),
        );

        selfDeliveryGetQuoteMock.mockResolvedValue({
            sourceId: 'WAREHOUSE-SOUTH',
            accepted: false,
            price: null,
            currency: 'ILS',
            estimatedDeliveryAt: null,
        });

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [createQuote('MockCarrier', 40)],
            failedProviders: [],
        });

        const plan = createPlan('plan-1', [
            createGroup({
                groupId: 'group-1',
                sources: [source],
            }),
        ]);

        const results = await service.getQuotesForPlans(
            [plan],
            destination,
            tenant,
            createConfirmations([plan]),
            undefined,
            'store-1',
        );

        const sourceResult =
            results[0]?.groupQuotes[0]?.sourceDirectQuotes?.[0];

        expect(selfDeliveryGetQuoteMock).toHaveBeenCalledTimes(1);

        expect(sourceResult?.selfDeliveryQuote).toEqual(
            expect.objectContaining({
                accepted: false,
                price: null,
                estimatedDeliveryAt: null,
            }),
        );

        expect(sourceResult?.quotes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    carrierName: 'MockCarrier',
                    price: 40,
                }),
            ]),
        );
    });
    it('should preserve carrier quotes when self-delivery provider fails', async () => {
        const source = {
            ...createSource('WAREHOUSE-SOUTH', 'Ashdod'),
            selfDeliveryEnabled: true,
        };

        getSettingsForStoreMock.mockResolvedValue(
            new Map([['WAREHOUSE-SOUTH', { selfDeliveryAllowed: true, selfDeliveryPrice: 40 }]]),
        );

        selfDeliveryGetQuoteMock.mockRejectedValue(
            new Error('Self-delivery provider unavailable'),
        );

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [createQuote('MockCarrier', 40)],
            failedProviders: [],
        });

        const plan = createPlan('plan-1', [
            createGroup({
                groupId: 'group-1',
                sources: [source],
            }),
        ]);

        const results = await service.getQuotesForPlans(
            [plan],
            destination,
            tenant,
            createConfirmations([plan]),
            undefined,
            'store-1',
        );

        const sourceResult =
            results[0]?.groupQuotes[0]?.sourceDirectQuotes?.[0];

        expect(selfDeliveryGetQuoteMock).toHaveBeenCalledTimes(1);

        expect(sourceResult?.quotes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    carrierName: 'MockCarrier',
                    price: 40,
                }),
            ]),
        );
    });
    it('should preserve carrier quotes when self-delivery times out', async () => {
        jest.useFakeTimers();

        try {
            const source = {
                ...createSource('WAREHOUSE-SOUTH', 'Ashdod'),
                selfDeliveryEnabled: true,
            };

            getSettingsForStoreMock.mockResolvedValue(
                new Map([['WAREHOUSE-SOUTH', { selfDeliveryAllowed: true, selfDeliveryPrice: 40 }]]),
            );

            selfDeliveryGetQuoteMock.mockImplementation(
                () => new Promise(() => { }),
            );

            carriersServiceMock.getQuotes.mockResolvedValue({
                quotes: [createQuote('MockCarrier', 40)],
                failedProviders: [],
            });

            const plan = createPlan('plan-1', [
                createGroup({
                    groupId: 'group-1',
                    sources: [source],
                }),
            ]);

            const resultPromise = service.getQuotesForPlans(
                [plan],
                destination,
                tenant,
                createConfirmations([plan]),
                undefined,
                'store-1',
            );

            await jest.advanceTimersByTimeAsync(5000);

            const results = await resultPromise;

            const sourceResult =
                results[0]?.groupQuotes[0]?.sourceDirectQuotes?.[0];

            expect(selfDeliveryGetQuoteMock).toHaveBeenCalledTimes(1);
            const quoteRequest = selfDeliveryGetQuoteMock.mock.calls[0][0];

            expect(quoteRequest.signal).toBeDefined();
            expect(quoteRequest.signal).toBeInstanceOf(AbortSignal);
            expect(quoteRequest.signal.aborted).toBe(true);
            expect(sourceResult?.selfDeliveryQuote).toBeNull();

            expect(sourceResult?.quotes).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        carrierName: 'MockCarrier',
                        price: 40,
                    }),
                ]),
            );
        } finally {
            jest.useRealTimers();
        }
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
                destination,
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
                destination,
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
                destination,
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
                destination,
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
                destination,
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
                destination,
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
                destination,
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
                destination,
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
                destination,
                tenant,
            );

        expect(
            result[0].plan,
        ).toBe(plan);
    });

    it('should pass confirmed pickup readiness to carriers', async () => {
        const group = createGroup({
            groupId: 'group-1',
            sources: [
                createSource('source-1', 'Jerusalem'),
            ],
            totalWeight: 7,
        });

        const plan = createPlan('plan-1', [group]);

        const confirmations = [{
            plan,
            confirmed: true,
            confirmations: [{
                sourceId: 'source-1',
                available: true,
                preparationMinutes: 25,
                confirmedAt: '2026-09-27T07:00:00.000Z',
                items: [],
            }],
        }];

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [createQuote('Mock', 25)],
            failedProviders: [],
        });

        await service.getQuotesForPlans(
            [plan],
            destination,
            tenant,
            confirmations,
        );

        expect(
            carriersServiceMock.getQuotes,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                weightKg: 7,
                readyAt: '2026-09-27T07:25:00.000Z',
                pickupSources: [{
                    sourceId: 'source-1',
                    address: 'Test Street 10, Jerusalem',
                    readyAt: '2026-09-27T07:25:00.000Z',
                }],
                allowedUrgencies: ['standard'],
            }),
            tenant,
        );
    });
    it('should reject express delivery when preparation and travel exceed 3 hours', async () => {
        jest.spyOn(
            service['distanceProvider'],
            'getDistance',
        ).mockResolvedValue({
            distanceKm: 15,
            durationMinutes: 40,
        });
        const group = createGroup({
            groupId: 'group-1',
            sources: [
                createSource('source-1', 'Jerusalem'),
            ],
            totalWeight: 3,
        });

        const plan = createPlan('plan-1', [group]);

        const confirmations = [{
            plan,
            confirmed: true,
            confirmations: [{
                sourceId: 'source-1',
                available: true,
                preparationMinutes: 150,
                confirmedAt: '2026-09-27T07:00:00.000Z',
                items: [],
            }],
        }];

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [createQuote('Mock', 25)],
            failedProviders: [],
        });

        await service.getQuotesForPlans(
            [plan],
            destination,
            tenant,
            confirmations,
            new Date('2026-09-27T07:00:00.000Z'),
        );

        expect(
            carriersServiceMock.getQuotes,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                allowedUrgencies: ['express', 'standard'],
            }),
            tenant,
        );
    });
    it('should reject urgent when pickup lead time exceeds the limit', async () => {
        jest.spyOn(
            service['deliverySettingsService'],
            'getSettings',
        ).mockResolvedValue({
            expressMaxMinutes: 180,
            sameDayMaxMinutes: 1440,
            pickupLeadTimeMinutes: 60,
            expressCutoffTime: null,
            expressAfterCutoffMode: 'extended',
            expressAfterCutoffMaxMinutes: null,
        });

        jest.spyOn(
            service['distanceProvider'],
            'getDistance',
        ).mockResolvedValue({
            distanceKm: 15,
            durationMinutes: 40,
        });

        const group = createGroup({
            groupId: 'group-1',
            sources: [createSource('source-1', 'Jerusalem')],
            totalWeight: 3,
        });

        const plan = createPlan('plan-1', [group]);

        const confirmations = [{
            plan,
            confirmed: true,
            confirmations: [{
                sourceId: 'source-1',
                available: true,
                preparationMinutes: 100,
                confirmedAt: '2026-09-27T07:00:00.000Z',
                items: [],
            }],
        }];

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [createQuote('Mock', 25)],
            failedProviders: [],
        });

        await service.getQuotesForPlans(
            [plan],
            destination,
            tenant,
            confirmations,
            new Date('2026-09-27T07:00:00.000Z'),
        );

        expect(carriersServiceMock.getQuotes).toHaveBeenCalledWith(
            expect.objectContaining({
                allowedUrgencies: ['express', 'standard'],
            }),
            tenant,
        );
    });
    it('should include pickup lead time and travel in estimated delivery ETA', async () => {
        jest.spyOn(
            service['deliverySettingsService'],
            'getSettings',
        ).mockResolvedValue({
            expressMaxMinutes: 180,
            sameDayMaxMinutes: 1440,
            pickupLeadTimeMinutes: 60,
            expressCutoffTime: null,
            expressAfterCutoffMode: 'extended',
            expressAfterCutoffMaxMinutes: null,
        });

        jest.spyOn(
            service['distanceProvider'],
            'getDistance',
        ).mockResolvedValue({
            distanceKm: 15,
            durationMinutes: 40,
        });

        const group = createGroup({
            groupId: 'group-1',
            sources: [createSource('source-1', 'Jerusalem')],
            totalWeight: 3,
        });

        const plan = createPlan('plan-1', [group]);

        const confirmations = [{
            plan,
            confirmed: true,
            confirmations: [{
                sourceId: 'source-1',
                available: true,
                preparationMinutes: 100,
                confirmedAt: '2026-09-27T07:00:00.000Z',
                items: [],
            }],
        }];

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [createQuote('Mock', 25)],
            failedProviders: [],
        });

        const result = await service.getQuotesForPlans(
            [plan],
            destination,
            tenant,
            confirmations,
            new Date('2026-09-27T07:00:00.000Z'),
        );

        expect(result[0].pickupLeadTimeMinutes).toBe(60);

        expect(
            result[0].groupQuotes[0].sourceDirectQuotes?.[0],
        ).toEqual(
            expect.objectContaining({
                travelMinutes: 40,
                estimatedDeliveryAt: '2026-09-27T10:20:00.000Z',
            }),
        );
    });
    it('should allow express delivery when preparation and travel fit within 3 hours', async () => {
        jest.spyOn(
            service['distanceProvider'],
            'getDistance',
        ).mockResolvedValue({
            distanceKm: 15,
            durationMinutes: 20,
        });

        const group = createGroup({
            groupId: 'group-1',
            sources: [
                createSource('source-1', 'Jerusalem'),
            ],
            totalWeight: 3,
        });

        const plan = createPlan('plan-1', [group]);

        const confirmations = [{
            plan,
            confirmed: true,
            confirmations: [{
                sourceId: 'source-1',
                available: true,
                preparationMinutes: 150,
                confirmedAt: '2026-09-27T07:00:00.000Z',
                items: [],
            }],
        }];

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [createQuote('Mock', 25)],
            failedProviders: [],
        });

        await service.getQuotesForPlans(
            [plan],
            destination,
            tenant,
            confirmations,
            new Date('2026-09-27T07:00:00.000Z'),
        );

        expect(
            service['distanceProvider'].getDistance,
        ).toHaveBeenCalledWith(
            group.sources[0].location,
            destination,
        );

        expect(
            carriersServiceMock.getQuotes,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                allowedUrgencies: [
                    'urgent',
                    'express',
                    'standard',
                ],
            }),
            tenant,
        );
    });
    it('should reject express when Google Routes fails', async () => {
        jest.spyOn(
            service['distanceProvider'],
            'getDistance',
        ).mockRejectedValue(
            new Error('Google Routes unavailable'),
        );

        const group = createGroup({
            groupId: 'group-1',
            sources: [
                createSource('source-1', 'Jerusalem'),
            ],
            totalWeight: 3,
        });

        const plan = createPlan('plan-1', [group]);

        const confirmations = [{
            plan,
            confirmed: true,
            confirmations: [{
                sourceId: 'source-1',
                available: true,
                preparationMinutes: 60,
                confirmedAt: '2026-09-27T07:00:00.000Z',
                items: [],
            }],
        }];

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [createQuote('Mock', 25)],
            failedProviders: [],
        });

        await service.getQuotesForPlans(
            [plan],
            destination,
            tenant,
            confirmations,
            new Date('2026-09-27T07:00:00.000Z'),
        );

        expect(
            carriersServiceMock.getQuotes,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                allowedUrgencies: ['standard'],
            }),
            tenant,
        );
    });
    it('should use the tenant express time limit', async () => {
        jest.spyOn(
            service['deliverySettingsService'],
            'getSettings',
        )

            .mockResolvedValue({
                expressMaxMinutes: 120,
                sameDayMaxMinutes: 1440,
                pickupLeadTimeMinutes: 0,
                expressCutoffTime: null,
                expressAfterCutoffMode: 'extended',
                expressAfterCutoffMaxMinutes: null,
            });

        jest.spyOn(
            service['distanceProvider'],
            'getDistance',
        ).mockResolvedValue({
            distanceKm: 15,
            durationMinutes: 20,
        });

        const group = createGroup({
            groupId: 'group-1',
            sources: [
                createSource('source-1', 'Jerusalem'),
            ],
            totalWeight: 3,
        });

        const plan = createPlan('plan-1', [group]);

        const confirmations = [{
            plan,
            confirmed: true,
            confirmations: [{
                sourceId: 'source-1',
                available: true,
                preparationMinutes: 110,
                confirmedAt: '2026-09-27T07:00:00.000Z',
                items: [],
            }],
        }];

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [createQuote('Mock', 25)],
            failedProviders: [],
        });

        await service.getQuotesForPlans(
            [plan],
            destination,
            tenant,
            confirmations,
            new Date('2026-09-27T07:00:00.000Z'),
        );

        expect(
            service['deliverySettingsService'].getSettings,
        ).toHaveBeenCalledWith(tenant);

        expect(
            carriersServiceMock.getQuotes,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                allowedUrgencies: [
                    'express',
                    'standard',
                ],
            }),
            tenant,
        );
    });
    it('should continue requesting standard quotes when settings fail', async () => {
        jest.spyOn(
            service['deliverySettingsService'],
            'getSettings',
        ).mockRejectedValue(
            new Error('Database unavailable'),
        );

        const group = createGroup({
            groupId: 'group-1',
            sources: [
                createSource('source-1', 'Jerusalem'),
            ],
            totalWeight: 3,
        });

        const plan = createPlan('plan-1', [group]);

        const confirmations = [{
            plan,
            confirmed: true,
            confirmations: [{
                sourceId: 'source-1',
                available: true,
                preparationMinutes: 30,
                confirmedAt: '2026-09-27T07:00:00.000Z',
                items: [],
            }],
        }];

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [createQuote('Mock', 25)],
            failedProviders: [],
        });

        const consoleSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => { });

        try {
            const result = await service.getQuotesForPlans(
                [plan],
                destination,
                tenant,
                confirmations,
                new Date('2026-09-27T07:00:00.000Z'),
            );

            expect(
                carriersServiceMock.getQuotes,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    allowedUrgencies: ['standard'],
                }),
                tenant,
            );

            expect(result[0].groupQuotes[0].quotes)
                .toHaveLength(1);
        } finally {
            consoleSpy.mockRestore();
        }
    });
    it('should request quotes for a planned vehicle from the selected provider', async () => {
        const vehicle = {
            vehicleType: 'car' as const,
            maxWeightKg: 50,
            assignedWeightKg: 45,
            items: [
                {
                    sku: 'SKU-1',
                    quantity: 1,
                    unitWeightKg: 45,
                },
            ],
        };

        const request = {
            pickupCities: ['Netivot'],
            destinationCity: 'Tel Aviv',
            weightKg: 70,
            pickupAddress: 'Test Street 10, Netivot',
            destinationAddress: 'Dizengoff 50, Tel Aviv',
            allowedUrgencies: ['standard' as const],
        };

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [],
            failedProviders: [],
        });

        await service['getQuotesForVehicle'](
            vehicle,
            'provider-1',
            request,
            tenant,
        );

        expect(
            carriersServiceMock.getQuotes,
        ).toHaveBeenCalledWith(
            {
                ...request,
                weightKg: 45,
                vehicleType: 'car',
            },
            tenant,
            'provider-1',
        );
    });
    it('should request quotes separately for every vehicle in a vehicle plan', async () => {
        const providerVehiclePlan = {
            providerId: 'provider-1',
            providerCode: 'delivery-center',
            plan: {
                parts: [],
                vehicles: [
                    {
                        vehicleType: 'scooter' as const,
                        maxWeightKg: 48,
                        assignedWeightKg: 40,
                        items: [],
                    },
                    {
                        vehicleType: 'scooter' as const,
                        maxWeightKg: 48,
                        assignedWeightKg: 30,
                        items: [],
                    },
                ],
            },
        };

        const request = {
            pickupCities: ['Netivot'],
            destinationCity: 'Tel Aviv',
            weightKg: 70,
            pickupAddress: 'Test Street 10, Netivot',
            destinationAddress: 'Dizengoff 50, Tel Aviv',
            allowedUrgencies: ['standard' as const],
        };

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [],
            failedProviders: [],
        });

        const result =
            await service['getQuotesForVehiclePlan'](
                providerVehiclePlan,
                request,
                tenant,
            );

        expect(
            carriersServiceMock.getQuotes,
        ).toHaveBeenCalledTimes(2);

        expect(
            carriersServiceMock.getQuotes,
        ).toHaveBeenNthCalledWith(
            1,
            {
                ...request,
                weightKg: 40,
                vehicleType: 'scooter',
            },
            tenant,
            'provider-1',
        );
        expect(result).toEqual([
            {
                vehicleType: 'scooter',
                assignedWeightKg: 40,
                quotes: [],
                failedProviders: [],
            },
            {
                vehicleType: 'scooter',
                assignedWeightKg: 30,
                quotes: [],
                failedProviders: [],
            },
        ]);
        expect(
            carriersServiceMock.getQuotes,
        ).toHaveBeenNthCalledWith(
            2,
            {
                ...request,
                weightKg: 30,
                vehicleType: 'scooter',
            },
            tenant,
            'provider-1',
        );
    });
    it('should quote capacity vehicle plans for a shipment group', async () => {
        const group = createGroup({
            groupId: 'group-1',
            sources: [
                createSource(
                    'source-1',
                    'Netivot',
                ),
            ],
            totalWeight: 70,
        });
        group.items = [
            {
                sku: 'SKU-1',
                quantity: 1,
                unitWeight: 40,
                sourceId: 'source-1',
            },

            {
                sku: 'SKU-2',
                quantity: 1,
                unitWeight: 30,
                sourceId: 'source-1',
            },
        ] as any;

        carriersServiceMock.getActiveProviders.mockResolvedValue([
            {
                id: 'provider-1',
                code: 'delivery-center',
                name: 'Delivery Center',
                adapter_key: 'delivery-center',
                is_mock: false,
                is_active: true,
                priority_score: 1,
                settings: {},
            },
        ]);

        capacityPlanningServiceMock
            .planVehiclesForProviders
            .mockReturnValue([
                {
                    providerId: 'provider-1',
                    providerCode: 'delivery-center',
                    plan: {
                        parts: [],
                        vehicles: [
                            {
                                vehicleType: 'scooter',
                                maxWeightKg: 48,
                                assignedWeightKg: 40,
                                items: [
                                    {
                                        sku: 'SKU-1',
                                        quantity: 1,
                                        unitWeightKg: 40,
                                    },
                                ],
                            },
                            {
                                vehicleType: 'scooter',
                                maxWeightKg: 48,
                                assignedWeightKg: 30,
                                items: [
                                    {
                                        sku: 'SKU-2',
                                        quantity: 1,
                                        unitWeightKg: 30,
                                    },
                                ],
                            },
                        ],
                    },
                },
            ]);

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [],
            failedProviders: [],
        });

        const plan = createPlan(
            'plan-1',
            [group],
        );

        const result =
            await service.getQuotesForPlans(
                [plan],
                destination,
                tenant,
            );

        const groupQuote =
            result[0].groupQuotes[0];

        expect(groupQuote.vehiclePlans).toEqual([{
            sourceId: 'source-1',
            providerId: 'provider-1',
            providerCode: 'delivery-center',

            plan: {
                parts: [],
                vehicles: [
                    {
                        vehicleType: 'scooter',
                        maxWeightKg: 48,
                        assignedWeightKg: 40,
                        items: [
                            {
                                sku: 'SKU-1',
                                quantity: 1,
                                unitWeightKg: 40,
                            },
                        ],
                    },
                    {
                        vehicleType: 'scooter',
                        maxWeightKg: 48,
                        assignedWeightKg: 30,
                        items: [
                            {
                                sku: 'SKU-2',
                                quantity: 1,
                                unitWeightKg: 30,
                            },
                        ],
                    },
                ],
            },

            alternatives: [],

            vehicleQuotes: [
                {
                    vehicleType: 'scooter',
                    assignedWeightKg: 40,
                    quotes: [],
                    failedProviders: [],
                },
                {
                    vehicleType: 'scooter',
                    assignedWeightKg: 30,
                    quotes: [],
                    failedProviders: [],
                },
            ],
        },
        ]);
        expect(
            carriersServiceMock.getQuotes,
        ).toHaveBeenCalledTimes(2);
        expect(
            groupQuote.vehiclePlans?.[0].alternatives,
        ).toBeDefined();
    });

    it('should not create vehicle plans for providers without vehicle capacity rules', async () => {
        const group = createGroup({
            groupId: 'group-1',
            sources: [
                createSource(
                    'source-1',
                    'Netivot',
                ),
            ],
            totalWeight: 70,
        });

        group.items = [
            {
                sku: 'SKU-1',
                quantity: 1,
                unitWeight: 70,
                sourceId: 'source-1',
            },
        ] as any;

        carriersServiceMock.getActiveProviders.mockResolvedValue([
            {
                id: 'provider-1',
                code: 'provider-without-capacity',
                name: 'Provider Without Capacity',
                adapter_key: 'mock',
                is_mock: true,
                is_active: true,
                priority_score: 1,
                settings: {},
            },
        ]);

        capacityPlanningServiceMock
            .planVehiclesForProviders
            .mockReturnValue([]);
        capacityPlanningServiceMock
            .planVehicleTraceForProvider
            .mockImplementation(
                (provider, weightKg) => ({
                    providerId: provider.id,
                    providerCode: provider.code,
                    weightKg,
                    capacities: [],
                    candidates: [],
                    acceptedPlans: [],
                }),
            );
        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [],
            failedProviders: [],
        });

        const plan = createPlan(
            'plan-1',
            [group],
        );

        const result =
            await service.getQuotesForPlans(
                [plan],
                destination,
                tenant,
            );

        expect(
            result[0].groupQuotes[0].vehiclePlans,
        ).toEqual([]);
    });
    it('should count vehicle plan quotes in plan status and quote metrics', async () => {
        const group = createGroup({
            groupId: 'group-1',
            sources: [
                createSource(
                    'source-1',
                    'Netivot',
                ),
            ],
            totalWeight: 40,
        });

        group.items = [
            {
                sku: 'SKU-1',
                quantity: 1,
                unitWeight: 40,
                sourceId: 'source-1',
            },
        ] as any;

        carriersServiceMock.getActiveProviders.mockResolvedValue([
            {
                id: 'provider-1',
                code: 'delivery-center',
                name: 'Delivery Center',
                adapter_key: 'delivery-center',
                is_mock: false,
                is_active: true,
                priority_score: 1,
                settings: {},
            },
        ]);

        capacityPlanningServiceMock
            .planVehiclesForProviders
            .mockReturnValue([
                {
                    providerId: 'provider-1',
                    providerCode: 'delivery-center',
                    plan: {
                        parts: [],
                        vehicles: [
                            {
                                vehicleType: 'scooter',
                                maxWeightKg: 48,
                                assignedWeightKg: 40,
                                items: [
                                    {
                                        sku: 'SKU-1',
                                        quantity: 1,
                                        unitWeightKg: 40,
                                    },
                                ],
                            },
                        ],
                    },
                },
            ]);

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [
                {
                    ...createQuote('quote-1', 100),
                    urgency: 'standard',
                },
            ],
            failedProviders: [],
        });

        const plan = createPlan(
            'plan-1',
            [group],
        );

        const result =
            await service.getQuotesForPlans(
                [plan],
                destination,
                tenant,
            );

        expect(result[0].status).toBe('quoted');

        expect(result[0].quoteMetrics).toEqual({
            quotedGroupsCount: 1,
            groupsWithoutQuotesCount: 0,
            totalQuotesCount: 1,
        });
    });
    it('should combine vehicle quotes with the same urgency into one alternative', () => {
        const vehicleQuotes = [
            {
                vehicleType: 'scooter' as const,
                assignedWeightKg: 40,
                quotes: [
                    {
                        carrierName: 'Delivery Center',
                        serviceName: 'Standard Delivery',
                        urgency: 'standard' as const,
                        price: 25,
                        currency: 'ILS' as const,
                        estimatedDays: 1,
                    },
                ],
                failedProviders: [],
            },
            {
                vehicleType: 'scooter' as const,
                assignedWeightKg: 30,
                quotes: [
                    {
                        carrierName: 'Delivery Center',
                        serviceName: 'Standard Delivery',
                        urgency: 'standard' as const,
                        price: 20,
                        currency: 'ILS' as const,
                        estimatedDays: 1,
                    },
                ],
                failedProviders: [],
            },
        ];

        const alternatives =
            service['buildVehiclePlanAlternatives'](
                vehicleQuotes,
            );

        expect(alternatives).toEqual([
            {
                urgency: 'standard',
                totalPrice: 45,
                currency: 'ILS',
                vehicleCount: 2,
                estimatedDays: 1,
            },
        ]);
    });
    it('should preserve provider priority in vehicle plan alternative', () => {
        const vehicleQuotes = [
            {
                vehicleType: 'scooter' as const,
                assignedWeightKg: 40,
                quotes: [
                    {
                        carrierName: 'Delivery Center',
                        serviceName: 'Standard Delivery',
                        urgency: 'standard' as const,
                        price: 25,
                        currency: 'ILS' as const,
                        estimatedDays: 1,
                        providerPriority: 0.9,
                    },
                ],
                failedProviders: [],
            },
            {
                vehicleType: 'scooter' as const,
                assignedWeightKg: 30,
                quotes: [
                    {
                        carrierName: 'Delivery Center',
                        serviceName: 'Standard Delivery',
                        urgency: 'standard' as const,
                        price: 20,
                        currency: 'ILS' as const,
                        estimatedDays: 1,
                        providerPriority: 0.9,
                    },
                ],
                failedProviders: [],
            },
        ];

        const alternatives =
            service['buildVehiclePlanAlternatives'](
                vehicleQuotes,
            );

        expect(alternatives).toEqual([
            {
                urgency: 'standard',
                totalPrice: 45,
                currency: 'ILS',
                vehicleCount: 2,
                estimatedDays: 1,
                providerPriority: 0.9,
            },
        ]);
    });
    it('should create separate alternatives for each common urgency', () => {
        const vehicleQuotes = [
            {
                vehicleType: 'scooter' as const,
                assignedWeightKg: 40,
                quotes: [
                    {
                        carrierName: 'Delivery Center',
                        serviceName: 'Urgent Delivery',
                        urgency: 'urgent' as const,
                        price: 40,
                        currency: 'ILS' as const,
                        estimatedDays: 0,
                    },
                    {
                        carrierName: 'Delivery Center',
                        serviceName: 'Standard Delivery',
                        urgency: 'standard' as const,
                        price: 25,
                        currency: 'ILS' as const,
                        estimatedDays: 1,
                    },
                ],
                failedProviders: [],
            },
            {
                vehicleType: 'scooter' as const,
                assignedWeightKg: 30,
                quotes: [
                    {
                        carrierName: 'Delivery Center',
                        serviceName: 'Urgent Delivery',
                        urgency: 'urgent' as const,
                        price: 35,
                        currency: 'ILS' as const,
                        estimatedDays: 0,
                    },
                    {
                        carrierName: 'Delivery Center',
                        serviceName: 'Standard Delivery',
                        urgency: 'standard' as const,
                        price: 20,
                        currency: 'ILS' as const,
                        estimatedDays: 1,
                    },
                ],
                failedProviders: [],
            },
        ];

        const alternatives =
            service['buildVehiclePlanAlternatives'](
                vehicleQuotes,
            );

        expect(alternatives).toEqual([
            {
                urgency: 'urgent',
                totalPrice: 75,
                currency: 'ILS',
                vehicleCount: 2,
                estimatedDays: 0,
            },
            {
                urgency: 'standard',
                totalPrice: 45,
                currency: 'ILS',
                vehicleCount: 2,
                estimatedDays: 1,
            },
        ]);
    });
    it('should not create an alternative when urgency is missing for one vehicle', () => {
        const vehicleQuotes = [
            {
                vehicleType: 'scooter' as const,
                assignedWeightKg: 40,
                quotes: [
                    {
                        carrierName: 'Delivery Center',
                        serviceName: 'Urgent Delivery',
                        urgency: 'urgent' as const,
                        price: 40,
                        currency: 'ILS' as const,
                        estimatedDays: 0,
                    },
                    {
                        carrierName: 'Delivery Center',
                        serviceName: 'Standard Delivery',
                        urgency: 'standard' as const,
                        price: 25,
                        currency: 'ILS' as const,
                        estimatedDays: 1,
                    },
                ],
                failedProviders: [],
            },
            {
                vehicleType: 'scooter' as const,
                assignedWeightKg: 30,
                quotes: [
                    {
                        carrierName: 'Delivery Center',
                        serviceName: 'Standard Delivery',
                        urgency: 'standard' as const,
                        price: 20,
                        currency: 'ILS' as const,
                        estimatedDays: 1,
                    },
                ],
                failedProviders: [],
            },
        ];

        const alternatives =
            service['buildVehiclePlanAlternatives'](
                vehicleQuotes,
            );

        expect(alternatives).toEqual([
            {
                urgency: 'standard',
                totalPrice: 45,
                currency: 'ILS',
                vehicleCount: 2,
                estimatedDays: 1,
            },
        ]);
    });

    describe('Express cutoff by tenant timezone', () => {
        const createTestPlan = () => {
            const group = createGroup({
                groupId: 'cutoff-group',
                sources: [
                    createSource('cutoff-source', 'Jerusalem'),
                ],
            });

            return createPlan('cutoff-plan', [group]);
        };

        const configureSettings = (
            mode: 'extended' | 'disabled',
            timezone = 'Asia/Jerusalem',
        ) => {
            tenant.timezone = timezone;

            jest.spyOn(
                service['deliverySettingsService'],
                'getSettings',
            )
                .mockResolvedValue({
                    expressMaxMinutes: 180,
                    sameDayMaxMinutes: 1440,
                    pickupLeadTimeMinutes: 0,
                    expressCutoffTime: '12:00',
                    expressAfterCutoffMode: mode,
                    expressAfterCutoffMaxMinutes:
                        mode === 'extended' ? 300 : null,
                });
        };

        const getAllowedUrgencies = async (
            orderCreatedAt: string,
        ) => {
            const plan = createTestPlan();

            const confirmations = [{
                plan,
                confirmed: true,
                confirmations: [{
                    sourceId: 'cutoff-source',
                    available: true,
                    preparationMinutes: 25,
                    confirmedAt: orderCreatedAt,
                    items: [],
                }],
            }];

            carriersServiceMock.getQuotes.mockResolvedValue({
                quotes: [],
                failedProviders: [],
            });

            await service.getQuotesForPlans(
                [plan],
                destination,
                tenant,
                confirmations,
                new Date(orderCreatedAt),
            );

            const request =
                carriersServiceMock.getQuotes.mock.calls[0][0];

            return request.allowedUrgencies;
        };

        it('allows regular express before cutoff', async () => {
            configureSettings('disabled');

            // 11:00 in Israel, summer time
            const urgencies = await getAllowedUrgencies(
                '2026-07-01T08:00:00.000Z',
            );

            expect(urgencies).toEqual([
                'urgent',
                'express',
                'standard',
            ]);
        });

        it('applies disabled mode exactly at cutoff', async () => {
            configureSettings('disabled');

            // 12:00 in Israel, summer time
            const urgencies = await getAllowedUrgencies(
                '2026-07-01T09:00:00.000Z',
            );

            expect(urgencies).toEqual([
                'express',
                'standard',
            ]);
        });

        it('keeps express available with extended window', async () => {
            configureSettings('extended');

            // 14:00 in Israel, summer time
            const urgencies = await getAllowedUrgencies(
                '2026-07-01T11:00:00.000Z',
            );

            expect(urgencies).toEqual([
                'urgent',
                'express',
                'standard',
            ]);
        });

        it('uses tenant timezone rather than server timezone', async () => {
            configureSettings('disabled', 'America/New_York');

            // 09:00 in New York, before 12:00 cutoff
            const urgencies = await getAllowedUrgencies(
                '2026-07-01T13:00:00.000Z',
            );

            expect(urgencies).toEqual([
                'urgent',
                'express',
                'standard',
            ]);
        });

        it('handles Israel winter time', async () => {
            configureSettings('disabled');

            // 12:00 in Israel, winter time
            const urgencies = await getAllowedUrgencies(
                '2026-12-01T10:00:00.000Z',
            );

            expect(urgencies).toEqual([
                'express',
                'standard',
            ]);
        });

        it('applies extended minutes to actual delivery feasibility', async () => {
            const orderCreatedAt = '2026-07-01T11:00:00.000Z';
            // 14:00 in Israel - after the 12:00 cutoff

            const plan = createTestPlan();

            const confirmations = [{
                plan,
                confirmed: true,
                confirmations: [{
                    sourceId: 'cutoff-source',
                    available: true,
                    preparationMinutes: 220,
                    confirmedAt: orderCreatedAt,
                    items: [],
                }],
            }];

            jest.spyOn(
                service['distanceProvider'],
                'getDistance',
            ).mockResolvedValue({
                distanceKm: 15,
                durationMinutes: 20,
            });

            carriersServiceMock.getQuotes.mockResolvedValue({
                quotes: [],
                failedProviders: [],
            });

            for (const mode of ['extended', 'disabled'] as const) {
                carriersServiceMock.getQuotes.mockClear();
                configureSettings(mode);

                await service.getQuotesForPlans(
                    [plan],
                    destination,
                    tenant,
                    confirmations,
                    new Date(orderCreatedAt),
                );

                const request =
                    carriersServiceMock.getQuotes.mock.calls[0][0];

                expect(request.allowedUrgencies).toEqual(
                    mode === 'extended'
                        ? ['urgent', 'express', 'standard']
                        : ['express', 'standard'],
                );
            }
        });

    });

});

