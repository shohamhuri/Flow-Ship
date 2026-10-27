import { ShipmentCreationService } from './shipment-creation.service';
import { ShipmentsRepository } from './shipments.repository';
import { DbService } from '../../infrastructure/database/db.service';
describe('ShipmentCreationService', () => {
    let service: ShipmentCreationService;

    let createShipmentMock: jest.Mock;
    let createShipmentStopsMock: jest.Mock;

    const tenant = {
        id: 'tenant-1',
        name: 'QUEEN',
        schemaName: 'queen',
        status: 'active',
    } as any;

    const checkout = {
        orderId: 'ORDER-100',

        destination: {
            country: 'Israel',
            city: 'Tel Aviv',
            street: 'Dizengoff',
            houseNumber: '100',
            postalCode: '6100000',
        },
    } as any;

    const createSource = (
        id: string,
        city: string,
        overrides: Record<string, any> = {},
    ) =>
        ({
            id,
            name: `Source ${id}`,
            type: 'warehouse',

            location: {
                country: 'Israel',
                city,
                street: 'Industrial Street',
                houseNumber: '10',
                latitude: 31.5,
                longitude: 34.5,
            },

            ...overrides,
        }) as any;

    const createGroup = (
        groupId: string,
        sources: any[] = [
            createSource('source-1', 'Netivot'),
        ],
    ) =>
        ({
            groupId,
            sources,

            items: sources.map((source, index) => ({
                sku: `SKU-${index + 1}`,
                name: `Item ${index + 1}`,
                quantity: 1,
                unitWeight: 5,
                unitPrice: 100,
                sourceId: source.id,
            })), categories: ['fashion'],
            handlingGroup: 'standard',

            totalItems: 1,
            totalWeight: 5,
            totalPrice: 100,
            groupingReasons: [],
        }) as any;

    const createPlan = (
        id = 'plan-1',
        groups: any[] = [
            createGroup('group-1'),
        ],
    ) =>
        ({
            id,
            status: 'evaluated',
            assignments: [],

            grouping: {
                orderId: 'ORDER-100',
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
        overrides: Record<string, any> = {},
    ) =>
        ({
            carrierName: 'Mock Express',
            serviceName: 'Fast Delivery',

            price: 45,
            currency: 'ILS',
            estimatedDays: 1,

            providerId: 'provider-1',
            providerCode: 'mock',
            adapterKey: 'mock',

            providerPriority: 0.8,

            ...overrides,
        }) as any;

    const createSelectedGroupQuote = (
        groupId: string,
        sourceId: string,
        quote = createQuote(),
    ) => ({
        groupId,
        quote,
        shipments: [
            {
                sourceId,
                vehicleIndex: 0,
                vehicleType: 'car',
                quote,
            },
        ],
    });


    const createDeliveryOption = (
        planId = 'plan-1',
        selectedGroupQuotes: any[] = [
            createSelectedGroupQuote(
                'group-1',
                'source-1',
            ),
        ],
    ) => {
        const normalizedGroups = selectedGroupQuotes.map((group) => {
            if (group.shipments) {
                return group;
            }

            return createSelectedGroupQuote(
                group.groupId,
                group.sourceId ?? (
                    group.groupId === 'group-1'
                        ? 'source-1'
                        : 'source-2'
                ),
                group.quote,
            );
        });

        const shipments = normalizedGroups.flatMap(
            (group) => group.shipments,
        );

        return {
            id: `${planId}-delivery-1`,
            planId,
            selectedGroupQuotes: normalizedGroups,
            metrics: {
                totalShippingPrice: shipments.reduce(
                    (sum, shipment) => sum + shipment.quote.price,
                    0,
                ),
                estimatedDeliveryDays: shipments.length
                    ? Math.max(
                        ...shipments.map(
                            (shipment) => shipment.quote.estimatedDays,
                        ),
                    )
                    : 0,
                averageProviderPriority: shipments.length
                    ? shipments.reduce(
                        (sum, shipment) =>
                            sum + (shipment.quote.providerPriority ?? 0),
                        0,
                    ) / shipments.length
                    : 0,
                shipmentCount: shipments.length,
            },
        } as any;
    };

    beforeEach(() => {
        createShipmentMock = jest
            .fn()
            .mockResolvedValue('shipment-1');

        createShipmentStopsMock = jest
            .fn()
            .mockResolvedValue(undefined);

        const repositoryMock = {
            createShipment:
                createShipmentMock,

            createShipmentStops:
                createShipmentStopsMock,
        } as unknown as ShipmentsRepository;
        const dbMock = {
            transaction: jest.fn(
                async (callback) => {
                    return callback({
                        query: jest.fn(),
                    });
                },
            ),
        } as unknown as DbService;
        service =
            new ShipmentCreationService(
                repositoryMock,
                dbMock,
            );
    });

    it('should throw when the winning plan has no grouping result', async () => {
        const plan = {
            id: 'plan-1',
            status: 'evaluated',
            assignments: [],
        } as any;

        const option =
            createDeliveryOption();

        await expect(
            service.createShipments(
                tenant,
                'checkout-1',
                checkout,
                plan,
                option,
            ),
        ).rejects.toThrow(
            'Cannot create shipments: plan plan-1 has no grouping result',
        );

        expect(
            createShipmentMock,
        ).not.toHaveBeenCalled();

        expect(
            createShipmentStopsMock,
        ).not.toHaveBeenCalled();
    });

    it('should throw when the delivery option belongs to another plan', async () => {
        const plan =
            createPlan('plan-1');

        const option =
            createDeliveryOption(
                'plan-2',
            );

        await expect(
            service.createShipments(
                tenant,
                'checkout-1',
                checkout,
                plan,
                option,
            ),
        ).rejects.toThrow(
            'Delivery option plan-2-delivery-1 does not belong to plan plan-1',
        );

        expect(
            createShipmentMock,
        ).not.toHaveBeenCalled();
    });

    it('should throw when the selected shipment group does not exist in the winning plan', async () => {
        const plan =
            createPlan(
                'plan-1',
                [
                    createGroup(
                        'group-1',
                    ),
                ],
            );

        const option =
            createDeliveryOption(
                'plan-1',
                [
                    {
                        groupId:
                            'missing-group',
                        quote:
                            createQuote(),
                    },
                ],
            );

        await expect(
            service.createShipments(
                tenant,
                'checkout-1',
                checkout,
                plan,
                option,
            ),
        ).rejects.toThrow(
            'Shipment group missing-group was not found in plan plan-1',
        );

        expect(
            createShipmentMock,
        ).not.toHaveBeenCalled();
    });

    it('should create a shipment with the correct checkout, plan and quote data', async () => {
        const plan =
            createPlan();

        const quote =
            createQuote();

        const option =
            createDeliveryOption(
                'plan-1',
                [
                    {
                        groupId:
                            'group-1',
                        quote,
                    },
                ],
            );

        await service.createShipments(
            tenant,
            'checkout-123',
            checkout,
            plan,
            option,
        );

        expect(
            createShipmentMock,
        ).toHaveBeenCalledWith(
            tenant,
            {
                checkoutId:
                    'checkout-123',
                metadata: {
                    sourceId: 'source-1',
                    vehicleIndex: 0,
                    vehicleType: 'car',
                    assignedWeightKg: undefined,
                    items: undefined,
                    deliveryMethod: 'carrier',
                },
                orderId:
                    'ORDER-100',

                shipmentGroupId:
                    'group-1',

                selectedPlanId:
                    'plan-1',

                selectedDeliveryOptionKey:
                    'plan-1-delivery-1',

                providerId:
                    'provider-1',

                providerCode:
                    'mock',

                adapterKey:
                    'mock',

                carrierName:
                    'Mock Express',

                serviceName:
                    'Fast Delivery',

                price: 45,

                currency:
                    'ILS',

                estimatedDeliveryDays: 1,

                status:
                    'created',
            },
            expect.objectContaining({
                query: expect.any(Function),
            }),
        );
    });

    it('should pass the tenant to the shipments repository', async () => {
        const plan =
            createPlan();

        const option =
            createDeliveryOption();

        await service.createShipments(
            tenant,
            'checkout-1',
            checkout,
            plan,
            option,
        );

        expect(
            createShipmentMock.mock
                .calls[0][0],
        ).toBe(tenant);

        expect(
            createShipmentStopsMock.mock
                .calls[0][0],
        ).toBe(tenant);
    });

    it('should create a pickup address from the shipment group source', async () => {
        const source =
            createSource(
                'warehouse-1',
                'Netivot',
            );

        const plan =
            createPlan(
                'plan-1',
                [
                    createGroup(
                        'group-1',
                        [source],
                    ),
                ],
            );

        const option = createDeliveryOption(
            'plan-1',
            [
                createSelectedGroupQuote(
                    'group-1',
                    'warehouse-1',
                ),
            ],
        );

        await service.createShipments(
            tenant,
            'checkout-1',
            checkout,
            plan,
            option,
        );

        const pickupAddresses =
            createShipmentStopsMock
                .mock.calls[0][2];

        expect(
            pickupAddresses,
        ).toEqual([
            {
                sourceId:
                    'warehouse-1',

                sourceName:
                    'Source warehouse-1',

                sourceType:
                    'warehouse',

                country:
                    'Israel',

                city:
                    'Netivot',

                street:
                    'Industrial Street',

                houseNumber:
                    '10',

                latitude:
                    31.5,

                longitude:
                    34.5,
            },
        ]);
    });


    it('creates separate shipments for two pickup sources', async () => {
        const sources = [
            createSource('warehouse-1', 'Netivot'),
            createSource('branch-1', 'Beer Sheva'),
        ];

        const plan = createPlan('plan-1', [
            createGroup('group-1', sources),
        ]);

        const option = createDeliveryOption('plan-1', [
            {
                groupId: 'group-1',
                quote: createQuote({ price: 75 }),
                shipments: [
                    {
                        sourceId: 'warehouse-1',
                        vehicleIndex: 0,
                        vehicleType: 'car',
                        quote: createQuote({ price: 30 }),
                    },
                    {
                        sourceId: 'branch-1',
                        vehicleIndex: 0,
                        vehicleType: 'car',
                        quote: createQuote({ price: 45 }),
                    },
                ],
            },
        ]);

        createShipmentMock
            .mockResolvedValueOnce('shipment-1')
            .mockResolvedValueOnce('shipment-2');

        const result = await service.createShipments(
            tenant,
            'checkout-1',
            checkout,
            plan,
            option,
        );

        expect(result).toHaveLength(2);
        expect(createShipmentMock).toHaveBeenCalledTimes(2);
        expect(createShipmentStopsMock).toHaveBeenCalledTimes(2);

        expect(createShipmentStopsMock.mock.calls[0][2])
            .toHaveLength(1);

        expect(createShipmentStopsMock.mock.calls[1][2])
            .toHaveLength(1);

        expect(createShipmentStopsMock.mock.calls[0][2][0].sourceId)
            .toBe('warehouse-1');

        expect(createShipmentStopsMock.mock.calls[1][2][0].sourceId)
            .toBe('branch-1');

        expect(createShipmentMock.mock.calls[0][1].price)
            .toBe(30);

        expect(createShipmentMock.mock.calls[1][1].price)
            .toBe(45);

        expect(createShipmentStopsMock.mock.calls[0][3])
            .toEqual(createShipmentStopsMock.mock.calls[1][3]);
    });

    it('should create the dropoff address from checkout destination', async () => {
        await service.createShipments(
            tenant,
            'checkout-1',
            checkout,
            createPlan(),
            createDeliveryOption(),
        );

        const dropoffAddress =
            createShipmentStopsMock
                .mock.calls[0][3];

        expect(
            dropoffAddress,
        ).toEqual({
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
        });
    });

    it('should use the shipment id returned by createShipment when creating shipment stops', async () => {
        createShipmentMock
            .mockResolvedValueOnce(
                'shipment-999',
            );

        await service.createShipments(
            tenant,
            'checkout-1',
            checkout,
            createPlan(),
            createDeliveryOption(),
        );

        expect(
            createShipmentStopsMock
                .mock.calls[0][1],
        ).toBe(
            'shipment-999',
        );
    });

    it('should create one shipment for every selected group quote', async () => {
        const groups = [
            createGroup(
                'group-1',
                [
                    createSource(
                        'source-1',
                        'Netivot',
                    ),
                ],
            ),

            createGroup(
                'group-2',
                [
                    createSource(
                        'source-2',
                        'Jerusalem',
                    ),
                ],
            ),
        ];

        const plan =
            createPlan(
                'plan-1',
                groups,
            );

        const option =
            createDeliveryOption(
                'plan-1',
                [
                    {
                        groupId:
                            'group-1',

                        quote:
                            createQuote({
                                providerCode:
                                    'mock',
                            }),
                    },

                    {
                        groupId:
                            'group-2',

                        quote:
                            createQuote({
                                providerCode:
                                    'yango',
                            }),
                    },
                ],
            );

        createShipmentMock
            .mockResolvedValueOnce(
                'shipment-1',
            )
            .mockResolvedValueOnce(
                'shipment-2',
            );

        const result =
            await service.createShipments(
                tenant,
                'checkout-1',
                checkout,
                plan,
                option,
            );

        expect(
            createShipmentMock,
        ).toHaveBeenCalledTimes(2);

        expect(
            createShipmentStopsMock,
        ).toHaveBeenCalledTimes(2);

        expect(result)
            .toHaveLength(2);
    });

    it('should return the created shipment ids together with their group ids', async () => {
        const groups = [
            createGroup(
                'group-1',
            ),

            createGroup(
                'group-2',
                [
                    createSource(
                        'source-2',
                        'Jerusalem',
                    ),
                ],
            ),
        ];

        const plan =
            createPlan(
                'plan-1',
                groups,
            );

        const option =
            createDeliveryOption(
                'plan-1',
                [
                    {
                        groupId:
                            'group-1',

                        quote:
                            createQuote(),
                    },

                    {
                        groupId:
                            'group-2',

                        quote:
                            createQuote(),
                    },
                ],
            );

        createShipmentMock
            .mockResolvedValueOnce(
                'shipment-101',
            )
            .mockResolvedValueOnce(
                'shipment-202',
            );

        const result =
            await service.createShipments(
                tenant,
                'checkout-1',
                checkout,
                plan,
                option,
            );

        expect(result).toEqual([
            {
                shipmentId:
                    'shipment-101',

                shipmentGroupId:
                    'group-1',
            },

            {
                shipmentId:
                    'shipment-202',

                shipmentGroupId:
                    'group-2',
            },
        ]);
    });

    it('should use the correct quote data for each shipment independently', async () => {
        const groups = [
            createGroup(
                'group-1',
            ),

            createGroup(
                'group-2',
                [
                    createSource(
                        'source-2',
                        'Jerusalem',
                    ),
                ],
            ),
        ];

        const plan =
            createPlan(
                'plan-1',
                groups,
            );

        const option =
            createDeliveryOption(
                'plan-1',
                [
                    {
                        groupId:
                            'group-1',

                        quote:
                            createQuote({
                                providerId:
                                    'provider-mock',

                                providerCode:
                                    'mock',

                                carrierName:
                                    'Mock Express',

                                price:
                                    25,

                                estimatedDays:
                                    3,
                            }),
                    },

                    {
                        groupId:
                            'group-2',

                        quote:
                            createQuote({
                                providerId:
                                    'provider-yango',

                                providerCode:
                                    'yango',

                                adapterKey:
                                    'yango',

                                carrierName:
                                    'Yango',

                                serviceName:
                                    'Same Day',

                                price:
                                    55,

                                estimatedDays:
                                    0,
                            }),
                    },
                ],
            );

        await service.createShipments(
            tenant,
            'checkout-1',
            checkout,
            plan,
            option,
        );

        expect(
            createShipmentMock
                .mock.calls[0][1],
        ).toEqual(
            expect.objectContaining({
                shipmentGroupId:
                    'group-1',

                providerId:
                    'provider-mock',

                providerCode:
                    'mock',

                carrierName:
                    'Mock Express',

                price:
                    25,

                estimatedDeliveryDays:
                    3,
            }),
        );

        expect(
            createShipmentMock
                .mock.calls[1][1],
        ).toEqual(
            expect.objectContaining({
                shipmentGroupId:
                    'group-2',

                providerId:
                    'provider-yango',

                providerCode:
                    'yango',

                carrierName:
                    'Yango',

                serviceName:
                    'Same Day',

                price:
                    55,

                estimatedDeliveryDays:
                    0,
            }),
        );
    });

    it('should return an empty array when the delivery option contains no selected groups', async () => {
        const result =
            await service.createShipments(
                tenant,
                'checkout-1',
                checkout,
                createPlan(),
                createDeliveryOption(
                    'plan-1',
                    [],
                ),
            );

        expect(result)
            .toEqual([]);

        expect(
            createShipmentMock,
        ).not.toHaveBeenCalled();

        expect(
            createShipmentStopsMock,
        ).not.toHaveBeenCalled();
    });

    it('should throw when a shipment group has no supply sources', async () => {
        const plan =
            createPlan(
                'plan-1',
                [
                    createGroup(
                        'group-1',
                        [],
                    ),
                ],
            );

        await expect(
            service.createShipments(
                tenant,
                'checkout-1',
                checkout,
                plan,
                createDeliveryOption(),
            ),
        ).rejects.toThrow(
            'Shipment group group-1 has no supply sources',
        );

        expect(
            createShipmentStopsMock,
        ).not.toHaveBeenCalled();
    });

    it('should not create a shipment record when the shipment group has no supply sources', async () => {
        const plan =
            createPlan(
                'plan-1',
                [
                    createGroup(
                        'group-1',
                        [],
                    ),
                ],
            );

        await expect(
            service.createShipments(
                tenant,
                'checkout-1',
                checkout,
                plan,
                createDeliveryOption(),
            ),
        ).rejects.toThrow(
            'Shipment group group-1 has no supply sources',
        );

        expect(
            createShipmentMock,
        ).not.toHaveBeenCalled();

        expect(
            createShipmentStopsMock,
        ).not.toHaveBeenCalled();
    });
    it('creates separate shipments for two vehicles from the same source', async () => {
        const plan = createPlan();

        const option = createDeliveryOption('plan-1', [
            {
                groupId: 'group-1',
                quote: createQuote({ price: 80 }),
                shipments: [
                    {
                        sourceId: 'source-1',
                        vehicleIndex: 0,
                        vehicleType: 'car',
                        quote: createQuote({ price: 35 }),
                    },
                    {
                        sourceId: 'source-1',
                        vehicleIndex: 1,
                        vehicleType: 'car',
                        quote: createQuote({ price: 45 }),
                    },
                ],
            },
        ]);

        createShipmentMock
            .mockResolvedValueOnce('shipment-1')
            .mockResolvedValueOnce('shipment-2');

        const result = await service.createShipments(
            tenant,
            'checkout-1',
            checkout,
            plan,
            option,
        );

        expect(result).toHaveLength(2);
        expect(createShipmentMock).toHaveBeenCalledTimes(2);
        expect(createShipmentStopsMock).toHaveBeenCalledTimes(2);

        for (const call of createShipmentStopsMock.mock.calls) {
            expect(call[2]).toHaveLength(1);
            expect(call[2][0].sourceId).toBe('source-1');
            expect(call[3].city).toBe('Tel Aviv');
        }

        expect(createShipmentMock.mock.calls[0][1].price).toBe(35);
        expect(createShipmentMock.mock.calls[1][1].price).toBe(45);
    });
    it('rejects delivery options that omit a required shipment group', async () => {
        const plan = createPlan('plan-1', [
            createGroup('group-1'),
            createGroup('group-2', [
                createSource('source-2', 'Jerusalem'),
            ]),
        ]);

        const option = createDeliveryOption('plan-1', [
            createSelectedGroupQuote('group-1', 'source-1'),
        ]);

        await expect(
            service.createShipments(
                tenant,
                'checkout-1',
                checkout,
                plan,
                option,
            ),
        ).rejects.toThrow('Incomplete shipment group coverage');

        expect(createShipmentMock).not.toHaveBeenCalled();
        expect(createShipmentStopsMock).not.toHaveBeenCalled();
    });
    it('rejects duplicate physical shipments for the same vehicle', async () => {
        const quote = createQuote();

        const option = createDeliveryOption('plan-1', [
            {
                groupId: 'group-1',
                quote,
                shipments: [
                    {
                        sourceId: 'source-1',
                        vehicleIndex: 0,
                        vehicleType: 'car',
                        quote,
                    },
                    {
                        sourceId: 'source-1',
                        vehicleIndex: 0,
                        vehicleType: 'car',
                        quote,
                    },
                ],
            },
        ]);

        await expect(
            service.createShipments(
                tenant,
                'checkout-1',
                checkout,
                createPlan(),
                option,
            ),
        ).rejects.toThrow(
            'Duplicate physical shipment source-1:0 in group group-1',
        );

        expect(createShipmentMock).not.toHaveBeenCalled();
        expect(createShipmentStopsMock).not.toHaveBeenCalled();
    });
    it('does not write any shipments when a later group has an invalid source', async () => {
        const plan = createPlan('plan-1', [
            createGroup('group-1'),
            createGroup('group-2', [
                createSource('source-2', 'Jerusalem'),
            ]),
        ]);

        const option = createDeliveryOption('plan-1', [
            createSelectedGroupQuote('group-1', 'source-1'),
            createSelectedGroupQuote('group-2', 'invalid-source'),
        ]);

        await expect(
            service.createShipments(
                tenant,
                'checkout-1',
                checkout,
                plan,
                option,
            ),
        ).rejects.toThrow(
            'Incomplete shipment coverage for group group-2',
        );

        expect(createShipmentMock).not.toHaveBeenCalled();
        expect(createShipmentStopsMock).not.toHaveBeenCalled();
    });
    it('preserves separate items and weights for two vehicles from the same source', async () => {
        const plan = createPlan();

        const option = createDeliveryOption('plan-1', [
            {
                groupId: 'group-1',
                quote: createQuote({ price: 80 }),
                shipments: [
                    {
                        sourceId: 'source-1',
                        vehicleIndex: 0,
                        vehicleType: 'scooter',
                        assignedWeightKg: 1.608,
                        items: [
                            {
                                sku: 'TEST-SKU',
                                quantity: 2,
                                unitWeightKg: 0.804,
                            },
                        ],
                        quote: createQuote({ price: 40 }),
                    },
                    {
                        sourceId: 'source-1',
                        vehicleIndex: 1,
                        vehicleType: 'scooter',
                        assignedWeightKg: 1.608,
                        items: [
                            {
                                sku: 'TEST-SKU',
                                quantity: 2,
                                unitWeightKg: 0.804,
                            },
                        ],
                        quote: createQuote({ price: 40 }),
                    },
                ],
            },
        ]);

        createShipmentMock
            .mockResolvedValueOnce('shipment-1')
            .mockResolvedValueOnce('shipment-2');

        const result = await service.createShipments(
            tenant,
            'checkout-1',
            checkout,
            plan,
            option,
        );

        expect(result).toHaveLength(2);
        expect(createShipmentMock).toHaveBeenCalledTimes(2);
        expect(createShipmentStopsMock).toHaveBeenCalledTimes(2);

        const first = createShipmentMock.mock.calls[0][1];
        const second = createShipmentMock.mock.calls[1][1];

        expect(first.metadata).toEqual({
            deliveryMethod: 'carrier',
            sourceId: 'source-1',
            vehicleIndex: 0,
            vehicleType: 'scooter',
            assignedWeightKg: 1.608,
            items: [
                {
                    sku: 'TEST-SKU',
                    quantity: 2,
                    unitWeightKg: 0.804,
                },
            ],
        });

        expect(second.metadata).toEqual({
            sourceId: 'source-1',
            vehicleIndex: 1,
            vehicleType: 'scooter',
            assignedWeightKg: 1.608,
            items: [
                {
                    sku: 'TEST-SKU',
                    quantity: 2,
                    unitWeightKg: 0.804,
                },
            ],
            deliveryMethod: 'carrier',
        });

        expect(
            createShipmentStopsMock.mock.calls.map(
                (call) => call[1],
            ),
        ).toEqual(['shipment-1', 'shipment-2']);

        for (const call of createShipmentStopsMock.mock.calls) {
            expect(call[2]).toHaveLength(1);
            expect(call[2][0].sourceId).toBe('source-1');
            expect(call[3]).toEqual(checkout.destination);
        }
    });
    it('creates 3 separate shipments for 2 sources and 3 vehicles', async () => {
        const plan = createPlan('plan-1', [
            createGroup('group-1', [
                createSource('warehouse-A', 'Netivot'),
                createSource('warehouse-B', 'Beer Sheva'),
            ]),
        ]);

        const option = createDeliveryOption('plan-1', [
            {
                groupId: 'group-1',
                quote: createQuote({ price: 120 }),
                shipments: [
                    {
                        sourceId: 'warehouse-A',
                        vehicleIndex: 0,
                        vehicleType: 'scooter',
                        assignedWeightKg: 1.608,
                        items: [
                            { sku: 'SHIRT', quantity: 2, unitWeightKg: 0.804 },
                        ],
                        quote: createQuote({ price: 30 }),
                    },
                    {
                        sourceId: 'warehouse-A',
                        vehicleIndex: 1,
                        vehicleType: 'scooter',
                        assignedWeightKg: 1.608,
                        items: [
                            { sku: 'SHIRT', quantity: 2, unitWeightKg: 0.804 },
                        ],
                        quote: createQuote({ price: 30 }),
                    },
                    {
                        sourceId: 'warehouse-B',
                        vehicleIndex: 0,
                        vehicleType: 'car',
                        assignedWeightKg: 4,
                        items: [
                            { sku: 'SHOES', quantity: 2, unitWeightKg: 2 },
                        ],
                        quote: createQuote({ price: 60 }),
                    },
                ],
            },
        ]);

        createShipmentMock
            .mockResolvedValueOnce('shipment-A0')
            .mockResolvedValueOnce('shipment-A1')
            .mockResolvedValueOnce('shipment-B0');

        const result = await service.createShipments(
            tenant, 'checkout-1', checkout, plan, option,
        );

        expect(result).toHaveLength(3);
        expect(createShipmentMock).toHaveBeenCalledTimes(3);
        expect(createShipmentStopsMock).toHaveBeenCalledTimes(3);

        const expected = [
            { sourceId: 'warehouse-A', vehicleIndex: 0, sku: 'SHIRT', quantity: 2 },
            { sourceId: 'warehouse-A', vehicleIndex: 1, sku: 'SHIRT', quantity: 2 },
            { sourceId: 'warehouse-B', vehicleIndex: 0, sku: 'SHOES', quantity: 2 },
        ];

        expected.forEach((item, index) => {
            const metadata = createShipmentMock.mock.calls[index][1].metadata;
            const stops = createShipmentStopsMock.mock.calls[index];

            expect(metadata?.sourceId).toBe(item.sourceId);
            expect(metadata?.vehicleIndex).toBe(item.vehicleIndex);
            expect(metadata?.items?.[0]).toEqual(
                expect.objectContaining({
                    sku: item.sku,
                    quantity: item.quantity,
                }),
            );

            expect(stops[2]).toHaveLength(1);
            expect(stops[2][0].sourceId).toBe(item.sourceId);
            expect(stops[3]).toEqual(checkout.destination);
        });

        const totalQuantity = createShipmentMock.mock.calls.reduce(
            (sum, call) =>
                sum + (call[1].metadata?.items ?? []).reduce(
                    (n, item) => n + item.quantity, 0,
                ),
            0,
        );

        expect(totalQuantity).toBe(6);
    });
    it('should create self-delivery shipment with one pickup and one dropoff', async () => {
        const plan = createPlan();

        const quote = createQuote({
            carrierName: 'Source Self Delivery',
            serviceName: 'Self Delivery',
            price: 25,
            providerId: undefined,
            providerCode: undefined,
            adapterKey: undefined,
        });

        const option = createDeliveryOption('plan-1', [
            {
                groupId: 'group-1',
                quote,
                shipments: [
                    {
                        sourceId: 'source-1',
                        deliveryMethod: 'self_delivery',
                        vehicleIndex: 0,
                        quote,
                    },
                ],
            },
        ]);

        await service.createShipments(
            tenant,
            'checkout-1',
            checkout,
            plan,
            option,
        );

        expect(createShipmentMock).toHaveBeenCalledWith(
            tenant,
            expect.objectContaining({
                providerId: undefined,
                providerCode: undefined,
                adapterKey: undefined,
                price: 25,
                metadata: expect.objectContaining({
                    sourceId: 'source-1',
                    deliveryMethod: 'self_delivery',
                }),
            }),
            expect.anything(),
        );

        expect(createShipmentStopsMock).toHaveBeenCalledTimes(1);

        const stopsCall = createShipmentStopsMock.mock.calls[0];

        expect(stopsCall[2]).toHaveLength(1);
        expect(stopsCall[2][0].sourceId).toBe('source-1');
        expect(stopsCall[3].city).toBe('Tel Aviv');
    });
});