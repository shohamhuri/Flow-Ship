import { SourcingService } from './sourcing.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import type { InventoryProvider } from './interfaces/inventory-provider.interface';

describe('SourcingService', () => {
    let service: SourcingService;

    const auditLogsServiceMock = {
        createLog: jest.fn(),
    };

    const inventoryProviderMock = {
        getSources: jest.fn(),
        getInventory: jest.fn(),
    };

    const tenant = {
        id: 'tenant-1',
        name: 'Queen',
        schemaName: 'queen',
    } as any;

    const createCheckout = (
        items: any[],
        destinationCity = 'Tel Aviv',
    ) =>
        ({
            orderId: 'order-1',
            storeId: 'store-1',
            destination: {
                city: destinationCity,
            },
            items,
        }) as any;

    const createItem = (
        sku: string,
        quantity = 1,
    ) => ({
        sku,
        name: `Product ${sku}`,
        quantity,
    });

    const createSource = ({
        id,
        city = 'Tel Aviv',
        priority = 0.5,
        isActive = true,
    }: {
        id: string;
        city?: string;
        priority?: number;
        isActive?: boolean;
    }) =>
        ({
            id,
            name: `Source ${id}`,
            type: 'warehouse',
            isActive,
            priority,
            location: {
                city,
            },
        }) as any;

    const createInventory = (
        sourceId: string,
        sku: string,
        availableQuantity: number,
    ) =>
        ({
            sourceId,
            sku,
            availableQuantity,
        }) as any;
    const distanceProviderMock = {
        getDistance: jest.fn(),
    };
    beforeEach(() => {
        jest.clearAllMocks();
        distanceProviderMock.getDistance.mockResolvedValue({
            distanceKm: 20,
            durationMinutes: 30,
        });
        service = new SourcingService(
            auditLogsServiceMock as unknown as AuditLogsService,
            inventoryProviderMock as unknown as InventoryProvider,
            distanceProviderMock,
        );
        auditLogsServiceMock.createLog.mockResolvedValue(
            undefined,
        );
    });

    it('should request sources and inventory for the checkout store', async () => {
        const checkout = createCheckout([
            createItem('SKU-1'),
            createItem('SKU-2'),
        ]);

        inventoryProviderMock.getSources.mockResolvedValue([]);
        inventoryProviderMock.getInventory.mockResolvedValue([]);

        await service.findSourcesForCheckout(
            checkout,
            tenant,
        );

        expect(
            inventoryProviderMock.getSources,
        ).toHaveBeenCalledWith('store-1');

        expect(
            inventoryProviderMock.getInventory,
        ).toHaveBeenCalledWith(
            'store-1',
            ['SKU-1', 'SKU-2'],
        );
    });

    it('should select a valid source with enough inventory', async () => {
        const checkout = createCheckout([
            createItem('SKU-1', 2),
        ]);

        const source = createSource({
            id: 'source-1',
        });

        inventoryProviderMock.getSources.mockResolvedValue([
            source,
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            createInventory(
                'source-1',
                'SKU-1',
                10,
            ),
        ]);

        const result =
            await service.findSourcesForCheckout(
                checkout,
                tenant,
            );

        expect(result[0].selectedSource).not.toBeNull();

        expect(
            result[0].selectedSource!.source.id,
        ).toBe('source-1');

        expect(
            result[0].selectedSource!.hasEnoughStock,
        ).toBe(true);

        expect(
            result[0].rejectedSources,
        ).toEqual([]);
    });

    it('should reject an inactive source', async () => {
        const checkout = createCheckout([
            createItem('SKU-1'),
        ]);

        inventoryProviderMock.getSources.mockResolvedValue([
            createSource({
                id: 'source-1',
                isActive: false,
            }),
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            createInventory(
                'source-1',
                'SKU-1',
                10,
            ),
        ]);

        const result =
            await service.findSourcesForCheckout(
                checkout,
                tenant,
            );

        expect(result[0].selectedSource).toBeNull();

        expect(
            result[0].rejectedSources[0]
                .rejectionReasons,
        ).toContain('SOURCE_INACTIVE');
    });

    it('should reject a source with insufficient inventory', async () => {
        const checkout = createCheckout([
            createItem('SKU-1', 5),
        ]);

        inventoryProviderMock.getSources.mockResolvedValue([
            createSource({
                id: 'source-1',
            }),
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            createInventory(
                'source-1',
                'SKU-1',
                3,
            ),
        ]);

        const result =
            await service.findSourcesForCheckout(
                checkout,
                tenant,
            );

        expect(result[0].selectedSource).toBeNull();

        expect(
            result[0].rejectedSources[0]
                .rejectionReasons,
        ).toContain(
            'INSUFFICIENT_INVENTORY',
        );
    });

    it('should treat missing inventory as zero inventory', async () => {
        const checkout = createCheckout([
            createItem('SKU-1', 1),
        ]);

        inventoryProviderMock.getSources.mockResolvedValue([
            createSource({
                id: 'source-1',
            }),
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([]);

        const result =
            await service.findSourcesForCheckout(
                checkout,
                tenant,
            );

        expect(
            result[0].rejectedSources[0]
                .availableQuantity,
        ).toBe(0);

        expect(
            result[0].rejectedSources[0]
                .hasEnoughStock,
        ).toBe(false);
    });

    it('should sort possible sources by total score and select the best one', async () => {
        const checkout = createCheckout([
            createItem('SKU-1'),
        ]);

        inventoryProviderMock.getSources.mockResolvedValue([
            createSource({
                id: 'source-low',
                city: 'Haifa',
                priority: 0.2,
            }),
            createSource({
                id: 'source-high',
                city: 'Tel Aviv',
                priority: 0.9,
            }),
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            createInventory(
                'source-low',
                'SKU-1',
                10,
            ),
            createInventory(
                'source-high',
                'SKU-1',
                10,
            ),
        ]);

        const result =
            await service.findSourcesForCheckout(
                checkout,
                tenant,
            );

        expect(
            result[0].possibleSources[0]
                .source.id,
        ).toBe('source-high');

        expect(
            result[0].selectedSource!.source.id,
        ).toBe('source-high');
    });

    it('should calculate distance score from real distance', async () => {
        const checkout = createCheckout([
            createItem('SKU-1'),
        ]);

        inventoryProviderMock.getSources.mockResolvedValue([
            createSource({
                id: 'source-1',
            }),
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            createInventory(
                'source-1',
                'SKU-1',
                10,
            ),
        ]);

        distanceProviderMock.getDistance.mockResolvedValue({
            distanceKm: 10,
            durationMinutes: 15,
        });

        const result =
            await service.findSourcesForCheckout(
                checkout,
                tenant,
            );

        expect(
            result[0].selectedSource!.distanceScore,
        ).toBeCloseTo(
            1 / (1 + 10 / 20),
        );
        expect(
            result[0].possibleSources[0].distanceKm,
        ).toBe(10);
        expect(
            distanceProviderMock.getDistance,
        ).toHaveBeenCalledTimes(1);
    });
    it('should continue sourcing when distance calculation fails for one source', async () => {
        const checkout = createCheckout([
            createItem('SKU-1'),
        ]);

        const failedSource = createSource({
            id: 'source-distance-failed',
            priority: 0.5,
        });

        const validSource = createSource({
            id: 'source-distance-valid',
            priority: 0.5,
        });

        inventoryProviderMock.getSources.mockResolvedValue([
            failedSource,
            validSource,
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            createInventory(
                'source-distance-failed',
                'SKU-1',
                10,
            ),
            createInventory(
                'source-distance-valid',
                'SKU-1',
                10,
            ),
        ]);

        distanceProviderMock.getDistance
            .mockRejectedValueOnce(
                new Error('Google Routes unavailable'),
            )
            .mockResolvedValueOnce({
                distanceKm: 10,
                durationMinutes: 15,
            });

        const result =
            await service.findSourcesForCheckout(
                checkout,
                tenant,
            );

        const failedDistanceSource =
            result[0].possibleSources.find(
                (source) =>
                    source.source.id ===
                    'source-distance-failed',
            )!;

        const validDistanceSource =
            result[0].possibleSources.find(
                (source) =>
                    source.source.id ===
                    'source-distance-valid',
            )!;

        expect(failedDistanceSource).toBeDefined();
        expect(
            failedDistanceSource.distanceKm,
        ).toBeUndefined();

        expect(
            failedDistanceSource.distanceScore,
        ).toBe(0);

        expect(
            validDistanceSource.distanceKm,
        ).toBe(10);

        expect(
            validDistanceSource.distanceScore,
        ).toBeCloseTo(
            1 / (1 + 10 / 20),
        );

        expect(
            result[0].selectedSource!.source.id,
        ).toBe('source-distance-valid');

        expect(
            distanceProviderMock.getDistance,
        ).toHaveBeenCalledTimes(2);
    });
    it('should not calculate distance for an inactive source', async () => {
        const checkout = createCheckout([
            createItem('SKU-1'),
        ]);

        const inactiveSource = createSource({
            id: 'source-inactive',
            isActive: false,
        });

        const activeSource = createSource({
            id: 'source-active',
        });

        inventoryProviderMock.getSources.mockResolvedValue([
            inactiveSource,
            activeSource,
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            createInventory(
                'source-inactive',
                'SKU-1',
                10,
            ),
            createInventory(
                'source-active',
                'SKU-1',
                10,
            ),
        ]);

        distanceProviderMock.getDistance.mockResolvedValue({
            distanceKm: 10,
            durationMinutes: 15,
        });

        const result =
            await service.findSourcesForCheckout(
                checkout,
                tenant,
            );

        expect(
            distanceProviderMock.getDistance,
        ).toHaveBeenCalledTimes(1);

        expect(
            distanceProviderMock.getDistance,
        ).toHaveBeenCalledWith(
            activeSource.location,
            checkout.destination,
        );

        const rejectedInactiveSource =
            result[0].rejectedSources.find(
                (source) =>
                    source.source.id ===
                    'source-inactive',
            );

        expect(rejectedInactiveSource).toBeDefined();

        expect(
            rejectedInactiveSource!.rejectionReasons,
        ).toContain('SOURCE_INACTIVE');

        expect(
            rejectedInactiveSource!.distanceKm,
        ).toBeUndefined();

        expect(
            rejectedInactiveSource!.distanceScore,
        ).toBe(0);
    });
    it('should not calculate distance for a source that cannot supply any checkout item', async () => {
        const checkout = createCheckout([
            createItem('SKU-1', 5),
            createItem('SKU-2', 3),
        ]);

        const insufficientSource = createSource({
            id: 'source-insufficient',
        });

        const validSource = createSource({
            id: 'source-valid',
        });

        inventoryProviderMock.getSources.mockResolvedValue([
            insufficientSource,
            validSource,
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            createInventory(
                'source-insufficient',
                'SKU-1',
                2,
            ),
            createInventory(
                'source-insufficient',
                'SKU-2',
                1,
            ),
            createInventory(
                'source-valid',
                'SKU-1',
                10,
            ),
            createInventory(
                'source-valid',
                'SKU-2',
                10,
            ),
        ]);

        distanceProviderMock.getDistance.mockResolvedValue({
            distanceKm: 10,
            durationMinutes: 15,
        });

        await service.findSourcesForCheckout(
            checkout,
            tenant,
        );

        expect(
            distanceProviderMock.getDistance,
        ).toHaveBeenCalledTimes(1);

        expect(
            distanceProviderMock.getDistance,
        ).toHaveBeenCalledWith(
            validSource.location,
            checkout.destination,
        );
    });
    it('should calculate distance when a source can supply at least one checkout item', async () => {
        const checkout = createCheckout([
            createItem('SKU-1', 5),
            createItem('SKU-2', 3),
        ]);

        const partialSource = createSource({
            id: 'source-partial',
        });

        inventoryProviderMock.getSources.mockResolvedValue([
            partialSource,
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            // Not enough for SKU-1
            createInventory(
                'source-partial',
                'SKU-1',
                2,
            ),

            // Enough for SKU-2
            createInventory(
                'source-partial',
                'SKU-2',
                10,
            ),
        ]);

        distanceProviderMock.getDistance.mockResolvedValue({
            distanceKm: 15,
            durationMinutes: 20,
        });

        const result =
            await service.findSourcesForCheckout(
                checkout,
                tenant,
            );

        expect(
            distanceProviderMock.getDistance,
        ).toHaveBeenCalledTimes(1);

        expect(
            distanceProviderMock.getDistance,
        ).toHaveBeenCalledWith(
            partialSource.location,
            checkout.destination,
        );

        expect(
            result[1].selectedSource?.source.id,
        ).toBe('source-partial');

        expect(
            result[1].selectedSource?.distanceKm,
        ).toBe(15);
    });
    it('should create audit log when distance calculation fails', async () => {
        const checkout = createCheckout([
            createItem('SKU-1'),
        ]);

        const source = createSource({
            id: 'source-distance-failed',
        });

        inventoryProviderMock.getSources.mockResolvedValue([
            source,
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            createInventory(
                'source-distance-failed',
                'SKU-1',
                10,
            ),
        ]);

        distanceProviderMock.getDistance.mockRejectedValue(
            new Error('Google Routes unavailable'),
        );

        await service.findSourcesForCheckout(
            checkout,
            tenant,
        );

        expect(
            auditLogsServiceMock.createLog,
        ).toHaveBeenCalledWith({
            schemaName: 'queen',
            action: 'sourcing.distance_calculation_failed',
            entityType: 'supply_source',
            entityId: 'source-distance-failed',
            status: 'warning',
            metadata: {
                storeId: 'store-1',
                sourceId: 'source-distance-failed',
                sourceName: 'Source source-distance-failed',
                error: 'Google Routes unavailable',
            },
        });
    });
    it('should give a higher distance score to a closer source', async () => {
        const checkout = createCheckout([
            createItem('SKU-1'),
        ]);

        const closeSource = createSource({
            id: 'source-close',
            priority: 0.5,
        });

        const farSource = createSource({
            id: 'source-far',
            priority: 0.5,
        });

        inventoryProviderMock.getSources.mockResolvedValue([
            closeSource,
            farSource,
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            createInventory(
                'source-close',
                'SKU-1',
                10,
            ),
            createInventory(
                'source-far',
                'SKU-1',
                10,
            ),
        ]);

        distanceProviderMock.getDistance
            .mockResolvedValueOnce({
                distanceKm: 5,
                durationMinutes: 10,
            })
            .mockResolvedValueOnce({
                distanceKm: 40,
                durationMinutes: 50,
            });

        const result =
            await service.findSourcesForCheckout(
                checkout,
                tenant,
            );

        const close =
            result[0].possibleSources.find(
                (source) =>
                    source.source.id === 'source-close',
            )!;

        const far =
            result[0].possibleSources.find(
                (source) =>
                    source.source.id === 'source-far',
            )!;

        expect(
            close.distanceScore,
        ).toBeGreaterThan(
            far.distanceScore,
        );

        expect(
            result[0].selectedSource!.source.id,
        ).toBe('source-close');
    });
    it('should give distance score 0.5 for a 20 km distance', async () => {
        const checkout = createCheckout(
            [createItem('SKU-1')],
            'Tel Aviv',
        );

        inventoryProviderMock.getSources.mockResolvedValue([
            createSource({
                id: 'source-1',
                city: 'Haifa',
            }),
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            createInventory(
                'source-1',
                'SKU-1',
                10,
            ),
        ]);
        distanceProviderMock.getDistance.mockResolvedValue({
            distanceKm: 20,
            durationMinutes: 30,
        });
        const result =
            await service.findSourcesForCheckout(
                checkout,
                tenant,
            );

        expect(
            result[0].selectedSource!.distanceScore,
        ).toBe(0.5);
    });

    it('should normalize priority below 0 to 0', async () => {
        const checkout = createCheckout([
            createItem('SKU-1'),
        ]);

        inventoryProviderMock.getSources.mockResolvedValue([
            createSource({
                id: 'source-1',
                priority: -5,
            }),
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            createInventory(
                'source-1',
                'SKU-1',
                10,
            ),
        ]);

        const result =
            await service.findSourcesForCheckout(
                checkout,
                tenant,
            );

        expect(
            result[0].selectedSource!.priorityScore,
        ).toBe(0);
    });

    it('should normalize priority above 1 to 1', async () => {
        const checkout = createCheckout([
            createItem('SKU-1'),
        ]);

        inventoryProviderMock.getSources.mockResolvedValue([
            createSource({
                id: 'source-1',
                priority: 5,
            }),
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            createInventory(
                'source-1',
                'SKU-1',
                10,
            ),
        ]);

        const result =
            await service.findSourcesForCheckout(
                checkout,
                tenant,
            );

        expect(
            result[0].selectedSource!.priorityScore,
        ).toBe(1);
    });

    it('should calculate weighted total score correctly', async () => {
        const checkout = createCheckout(
            [createItem('SKU-1')],
            'Tel Aviv',
        );

        inventoryProviderMock.getSources.mockResolvedValue([
            createSource({
                id: 'source-1',
                city: 'Tel Aviv',
                priority: 0.5,
            }),
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            createInventory(
                'source-1',
                'SKU-1',
                10,
            ),
        ]);
        distanceProviderMock.getDistance.mockResolvedValue({
            distanceKm: 20,
            durationMinutes: 30,
        });
        const result =
            await service.findSourcesForCheckout(
                checkout,
                tenant,
            );

        // priority: 0.5 * 0.6 = 0.3
        // distance: 0.5 * 0.4 = 0.2
        // total = 0.5

        expect(
            result[0].selectedSource!.totalScore,
        ).toBe(0.5);

        expect(
            result[0].selectedSource!.scoreBreakdown,
        ).toEqual({
            priority: 0.5,
            distance: 0.5,
        });
    });

    it('should create success audit log when all items are resolved', async () => {
        const checkout = createCheckout([
            createItem('SKU-1'),
            createItem('SKU-2'),
        ]);

        const source = createSource({
            id: 'source-1',
        });

        inventoryProviderMock.getSources.mockResolvedValue([
            source,
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            createInventory(
                'source-1',
                'SKU-1',
                10,
            ),
            createInventory(
                'source-1',
                'SKU-2',
                10,
            ),
        ]);

        await service.findSourcesForCheckout(
            checkout,
            tenant,
        );

        expect(
            auditLogsServiceMock.createLog,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                schemaName: 'queen',
                action: 'sourcing.completed',
                entityType: 'checkout',
                entityId: 'order-1',
                status: 'success',
            }),
        );
    });

    it('should create warning audit log when only some items are unresolved', async () => {
        const checkout = createCheckout([
            createItem('SKU-1'),
            createItem('SKU-2'),
        ]);

        const source = createSource({
            id: 'source-1',
        });

        inventoryProviderMock.getSources.mockResolvedValue([
            source,
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            createInventory(
                'source-1',
                'SKU-1',
                10,
            ),
        ]);

        await service.findSourcesForCheckout(
            checkout,
            tenant,
        );

        expect(
            auditLogsServiceMock.createLog,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'warning',
                metadata: expect.objectContaining({
                    unresolvedItems: ['SKU-2'],
                }),
            }),
        );
    });

    it('should create failed audit log when all items are unresolved', async () => {
        const checkout = createCheckout([
            createItem('SKU-1'),
            createItem('SKU-2'),
        ]);

        inventoryProviderMock.getSources.mockResolvedValue([
            createSource({
                id: 'source-1',
            }),
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([]);

        await service.findSourcesForCheckout(
            checkout,
            tenant,
        );

        expect(
            auditLogsServiceMock.createLog,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'failed',
                metadata: expect.objectContaining({
                    unresolvedItems: [
                        'SKU-1',
                        'SKU-2',
                    ],
                }),
            }),
        );
    });

    it('should include selected source details in audit metadata', async () => {
        const checkout = createCheckout([
            createItem('SKU-1', 2),
        ]);

        inventoryProviderMock.getSources.mockResolvedValue([
            createSource({
                id: 'source-1',
                priority: 0.8,
            }),
        ]);

        inventoryProviderMock.getInventory.mockResolvedValue([
            createInventory(
                'source-1',
                'SKU-1',
                7,
            ),
        ]);

        await service.findSourcesForCheckout(
            checkout,
            tenant,
        );

        expect(
            auditLogsServiceMock.createLog,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    selectedSources: [
                        expect.objectContaining({
                            sku: 'SKU-1',
                            sourceId: 'source-1',
                            sourceName: 'Source source-1',
                            sourceType: 'warehouse',
                            availableQuantity: 7,
                            requestedQuantity: 2,
                        }),
                    ],
                }),
            }),
        );
    });
});