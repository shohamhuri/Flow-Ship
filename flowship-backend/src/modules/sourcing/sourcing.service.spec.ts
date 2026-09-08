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

    beforeEach(() => {
        jest.clearAllMocks();

        service = new SourcingService(
            auditLogsServiceMock as unknown as AuditLogsService,
            inventoryProviderMock as unknown as InventoryProvider,
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

    it('should give distance score 1 when source city matches destination city', async () => {
        const checkout = createCheckout(
            [createItem('SKU-1')],
            'Tel Aviv',
        );

        inventoryProviderMock.getSources.mockResolvedValue([
            createSource({
                id: 'source-1',
                city: 'Tel Aviv',
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
            result[0].selectedSource!.distanceScore,
        ).toBe(1);
    });

    it('should compare cities case-insensitively and ignore surrounding spaces', async () => {
        const checkout = createCheckout(
            [createItem('SKU-1')],
            '  TEL AVIV ',
        );

        inventoryProviderMock.getSources.mockResolvedValue([
            createSource({
                id: 'source-1',
                city: ' tel aviv ',
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
            result[0].selectedSource!.distanceScore,
        ).toBe(1);
    });

    it('should give distance score 0.5 when source city differs from destination city', async () => {
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

        const result =
            await service.findSourcesForCheckout(
                checkout,
                tenant,
            );

        // priority: 0.5 * 0.6 = 0.3
        // distance: 1 * 0.4 = 0.4
        // total = 0.7
        expect(
            result[0].selectedSource!.totalScore,
        ).toBe(0.7);

        expect(
            result[0].selectedSource!.scoreBreakdown,
        ).toEqual({
            priority: 0.5,
            distance: 1,
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