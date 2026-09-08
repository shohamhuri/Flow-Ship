import { ShipmentCreationService } from './shipment-creation.service';
import { ShipmentsRepository } from './shipments.repository';

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

            items: [],
            categories: ['fashion'],
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

    const createDeliveryOption = (
        planId = 'plan-1',
        selectedGroupQuotes: any[] = [
            {
                groupId: 'group-1',
                quote: createQuote(),
            },
        ],
    ) =>
        ({
            id: `${planId}-delivery-1`,
            planId,
            selectedGroupQuotes,

            metrics: {
                totalShippingPrice: 45,
                estimatedDeliveryDays: 1,
                averageProviderPriority: 0.8,
                shipmentCount:
                    selectedGroupQuotes.length,
            },
        }) as any;

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

        service =
            new ShipmentCreationService(
                repositoryMock,
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

        const option =
            createDeliveryOption();

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

    it('should create multiple pickup addresses for a multi-source shipment group', async () => {
        const sources = [
            createSource(
                'warehouse-1',
                'Netivot',
            ),

            createSource(
                'branch-1',
                'Beer Sheva',
                {
                    name:
                        'Beer Sheva Branch',
                    type:
                        'branch',
                },
            ),
        ];

        const plan =
            createPlan(
                'plan-1',
                [
                    createGroup(
                        'group-1',
                        sources,
                    ),
                ],
            );

        await service.createShipments(
            tenant,
            'checkout-1',
            checkout,
            plan,
            createDeliveryOption(),
        );

        const pickupAddresses =
            createShipmentStopsMock
                .mock.calls[0][2];

        expect(
            pickupAddresses,
        ).toHaveLength(2);

        expect(
            pickupAddresses[0]
                .sourceId,
        ).toBe(
            'warehouse-1',
        );

        expect(
            pickupAddresses[1]
                .sourceId,
        ).toBe(
            'branch-1',
        );

        expect(
            pickupAddresses[1]
                .city,
        ).toBe(
            'Beer Sheva',
        );
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
});