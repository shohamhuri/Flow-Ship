import { GroupingService } from './grouping.service';
import { GroupingRulesService } from './grouping-rules.service';

describe('GroupingService', () => {
    let service: GroupingService;

    const groupingRulesServiceMock = {
        getHandlingGroup: jest.fn(),
    };

    const createSource = (id: string) =>
        ({
            id,
            name: `Source ${id}`,
        }) as any;

    const createRankedSource = (id: string) =>
        ({
            source: createSource(id),
            totalScore: 0.9,
        }) as any;

    const createCheckout = (items: any[]) =>
        ({
            orderId: 'order-1',
            items,
        }) as any;

    const createItem = (
        sku: string,
        quantity = 1,
        unitWeight = 1,
        unitPrice = 10,
        category = 'regular',
    ) => ({
        sku,
        name: `Product ${sku}`,
        quantity,
        unitWeight,
        unitPrice,
        category,
    });

    beforeEach(() => {
        jest.clearAllMocks();

        groupingRulesServiceMock.getHandlingGroup
            .mockReturnValue('standard');

        service = new GroupingService(
            groupingRulesServiceMock as unknown as GroupingRulesService,
        );
    });

    it('should group a valid assigned item', () => {
        const checkout = createCheckout([
            createItem('SKU-1', 2, 3, 10),
        ]);

        const assignments = [
            {
                itemIndex: 0,
                selectedSource: createRankedSource('source-1'),
            },
        ] as any;

        const result = service.groupShipmentPlan(
            checkout,
            assignments,
        );

        expect(result.shipmentGroups).toHaveLength(1);
        expect(result.totalGroups).toBe(1);
        expect(result.totalGroupedItems).toBe(2);
        expect(result.hasUngroupedItems).toBe(false);
        expect(result.ungroupedItems).toEqual([]);
    });

    it('should mark item as ungrouped when assignment is missing', () => {
        const checkout = createCheckout([
            createItem('SKU-1', 2),
        ]);

        const result = service.groupShipmentPlan(
            checkout,
            [],
        );

        expect(result.shipmentGroups).toEqual([]);
        expect(result.hasUngroupedItems).toBe(true);

        expect(result.ungroupedItems).toEqual([
            {
                sku: 'SKU-1',
                name: 'Product SKU-1',
                quantity: 2,
                reasons: [
                    'SOURCE_ASSIGNMENT_NOT_FOUND',
                ],
            },
        ]);
    });

    it('should mark item as ungrouped when selected source is null', () => {
        const checkout = createCheckout([
            createItem('SKU-1', 3),
        ]);

        const assignments = [
            {
                itemIndex: 0,
                selectedSource: null,
            },
        ] as any;

        const result = service.groupShipmentPlan(
            checkout,
            assignments,
        );

        expect(result.hasUngroupedItems).toBe(true);

        expect(result.ungroupedItems[0].reasons).toEqual([
            'NO_SUPPLY_SOURCE_SELECTED',
        ]);
    });

    it('should group items with the same handling group together', () => {
        const checkout = createCheckout([
            createItem('SKU-1'),
            createItem('SKU-2'),
        ]);

        const assignments = [
            {
                itemIndex: 0,
                selectedSource: createRankedSource('source-1'),
            },
            {
                itemIndex: 1,
                selectedSource: createRankedSource('source-2'),
            },
        ] as any;

        groupingRulesServiceMock.getHandlingGroup
            .mockReturnValue('standard');

        const result = service.groupShipmentPlan(
            checkout,
            assignments,
        );

        expect(result.shipmentGroups).toHaveLength(1);
        expect(result.shipmentGroups[0].items).toHaveLength(2);
        expect(result.shipmentGroups[0].sources).toHaveLength(2);
    });

    it('should not duplicate the same source inside a group', () => {
        const checkout = createCheckout([
            createItem('SKU-1'),
            createItem('SKU-2'),
        ]);

        const source = createRankedSource('source-1');

        const assignments = [
            {
                itemIndex: 0,
                selectedSource: source,
            },
            {
                itemIndex: 1,
                selectedSource: source,
            },
        ] as any;

        const result = service.groupShipmentPlan(
            checkout,
            assignments,
        );

        expect(result.shipmentGroups).toHaveLength(1);
        expect(result.shipmentGroups[0].sources).toHaveLength(1);
        expect(result.shipmentGroups[0].sources[0].id)
            .toBe('source-1');
    });

    it('should separate items with different handling groups', () => {
        const checkout = createCheckout([
            createItem('SKU-1', 1, 1, 10, 'regular'),
            createItem('SKU-2', 1, 1, 10, 'cold'),
        ]);

        groupingRulesServiceMock.getHandlingGroup
            .mockImplementation((category) =>
                category === 'cold'
                    ? 'refrigerated'
                    : 'standard',
            );

        const assignments = [
            {
                itemIndex: 0,
                selectedSource: createRankedSource('source-1'),
            },
            {
                itemIndex: 1,
                selectedSource: createRankedSource('source-2'),
            },
        ] as any;

        const result = service.groupShipmentPlan(
            checkout,
            assignments,
        );

        expect(result.shipmentGroups).toHaveLength(2);
        expect(result.totalGroups).toBe(2);

        expect(result.splitReasons).toContain(
            'INCOMPATIBLE_HANDLING_GROUPS',
        );
    });

    it('should calculate total items, weight and price correctly', () => {
        const checkout = createCheckout([
            createItem('SKU-1', 2, 1.5, 10),
            createItem('SKU-2', 3, 2, 20),
        ]);

        const assignments = [
            {
                itemIndex: 0,
                selectedSource: createRankedSource('source-1'),
            },
            {
                itemIndex: 1,
                selectedSource: createRankedSource('source-1'),
            },
        ] as any;

        const result = service.groupShipmentPlan(
            checkout,
            assignments,
        );

        const group = result.shipmentGroups[0];

        expect(group.totalItems).toBe(5);

        // 2*1.5 + 3*2 = 9
        expect(group.totalWeight).toBe(9);

        // 2*10 + 3*20 = 80
        expect(group.totalPrice).toBe(80);

        expect(result.totalGroupedItems).toBe(5);
    });

    it('should use zero when unitWeight or unitPrice are missing', () => {
        const checkout = createCheckout([
            {
                sku: 'SKU-1',
                name: 'Product SKU-1',
                quantity: 2,
                category: 'regular',
            },
        ]);

        const assignments = [
            {
                itemIndex: 0,
                selectedSource: createRankedSource('source-1'),
            },
        ] as any;

        const result = service.groupShipmentPlan(
            checkout,
            assignments,
        );

        expect(result.shipmentGroups[0].totalWeight).toBe(0);
        expect(result.shipmentGroups[0].totalPrice).toBe(0);

        expect(
            result.shipmentGroups[0].items[0].unitWeight,
        ).toBe(0);

        expect(
            result.shipmentGroups[0].items[0].unitPrice,
        ).toBe(0);
    });

    it('should round total weight to 3 decimals and price to 2 decimals', () => {
        const checkout = createCheckout([
            createItem(
                'SKU-1',
                3,
                1.23456,
                10.555,
            ),
        ]);

        const assignments = [
            {
                itemIndex: 0,
                selectedSource: createRankedSource('source-1'),
            },
        ] as any;

        const result = service.groupShipmentPlan(
            checkout,
            assignments,
        );

        expect(
            result.shipmentGroups[0].totalWeight,
        ).toBe(3.704);

        expect(
            result.shipmentGroups[0].totalPrice,
        ).toBe(31.66);
    });

    it('should split a group when max weight is exceeded', () => {
        const checkout = createCheckout([
            createItem('SKU-1', 1, 6, 10),
            createItem('SKU-2', 1, 6, 10),
        ]);

        const assignments = [
            {
                itemIndex: 0,
                selectedSource: createRankedSource('source-1'),
            },
            {
                itemIndex: 1,
                selectedSource: createRankedSource('source-1'),
            },
        ] as any;

        const strategies = [
            {
                strategyKey: 'split_by_max_weight',
                config: {
                    maxWeightKg: 10,
                },
            },
        ] as any;

        const result = service.groupShipmentPlan(
            checkout,
            assignments,
            strategies,
        );

        expect(result.shipmentGroups).toHaveLength(2);
        expect(result.totalGroups).toBe(2);

        expect(
            result.shipmentGroups.every((group) =>
                group.groupingReasons.includes(
                    'MAX_WEIGHT_EXCEEDED',
                ),
            ),
        ).toBe(true);
    });

    it('should not split a group when weight is within the limit', () => {
        const checkout = createCheckout([
            createItem('SKU-1', 1, 4, 10),
            createItem('SKU-2', 1, 5, 10),
        ]);

        const assignments = [
            {
                itemIndex: 0,
                selectedSource: createRankedSource('source-1'),
            },
            {
                itemIndex: 1,
                selectedSource: createRankedSource('source-1'),
            },
        ] as any;

        const strategies = [
            {
                strategyKey: 'split_by_max_weight',
                config: {
                    maxWeightKg: 10,
                },
            },
        ] as any;

        const result = service.groupShipmentPlan(
            checkout,
            assignments,
            strategies,
        );

        expect(result.shipmentGroups).toHaveLength(1);
    });

    it('should split a group when max items is exceeded', () => {
        const checkout = createCheckout([
            createItem('SKU-1', 2),
            createItem('SKU-2', 2),
        ]);

        const assignments = [
            {
                itemIndex: 0,
                selectedSource: createRankedSource('source-1'),
            },
            {
                itemIndex: 1,
                selectedSource: createRankedSource('source-1'),
            },
        ] as any;

        const strategies = [
            {
                strategyKey: 'split_by_max_items',
                config: {
                    maxItems: 3,
                },
            },
        ] as any;

        const result = service.groupShipmentPlan(
            checkout,
            assignments,
            strategies,
        );

        expect(result.shipmentGroups).toHaveLength(2);
        expect(result.totalGroups).toBe(2);

        expect(
            result.shipmentGroups.every((group) =>
                group.groupingReasons.includes(
                    'MAX_ITEMS_EXCEEDED',
                ),
            ),
        ).toBe(true);
    });

    it('should not split when total items equals the max items limit', () => {
        const checkout = createCheckout([
            createItem('SKU-1', 2),
            createItem('SKU-2', 3),
        ]);

        const assignments = [
            {
                itemIndex: 0,
                selectedSource: createRankedSource('source-1'),
            },
            {
                itemIndex: 1,
                selectedSource: createRankedSource('source-1'),
            },
        ] as any;

        const strategies = [
            {
                strategyKey: 'split_by_max_items',
                config: {
                    maxItems: 5,
                },
            },
        ] as any;

        const result = service.groupShipmentPlan(
            checkout,
            assignments,
            strategies,
        );

        expect(result.shipmentGroups).toHaveLength(1);
        expect(result.shipmentGroups[0].totalItems).toBe(5);
    });

    it('should return no split reasons when there is only one group', () => {
        const checkout = createCheckout([
            createItem('SKU-1'),
        ]);

        const assignments = [
            {
                itemIndex: 0,
                selectedSource: createRankedSource('source-1'),
            },
        ] as any;

        const result = service.groupShipmentPlan(
            checkout,
            assignments,
        );

        expect(result.splitReasons).toEqual([]);
    });

    it('should return empty grouping for checkout with no items', () => {
        const checkout = createCheckout([]);

        const result = service.groupShipmentPlan(
            checkout,
            [],
        );

        expect(result.shipmentGroups).toEqual([]);
        expect(result.ungroupedItems).toEqual([]);
        expect(result.totalGroups).toBe(0);
        expect(result.totalGroupedItems).toBe(0);
        expect(result.hasUngroupedItems).toBe(false);
        expect(result.splitReasons).toEqual([]);
    });
});