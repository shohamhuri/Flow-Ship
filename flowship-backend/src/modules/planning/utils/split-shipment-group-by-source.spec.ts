
import { splitShipmentGroupBySource } from
    './split-shipment-group-by-source';
import { ShipmentGroup } from
    '../../grouping/interfaces/shipment-group.interface';

describe('splitShipmentGroupBySource', () => {
    const createGroup = (): ShipmentGroup => ({
        groupId: 'group-1',
        sources: [
            { id: 'A' },
            { id: 'B' },
        ] as ShipmentGroup['sources'],
        items: [
            {
                sku: 'SKU-1',
                name: 'Product 1',
                sourceId: 'A',
                quantity: 2,
                unitWeight: 10,
                unitPrice: 100,
            },
            {
                sku: 'SKU-2',
                name: 'Product 2',
                sourceId: 'B',
                quantity: 1,
                unitWeight: 15,
                unitPrice: 80,
            },
            {
                sku: 'SKU-3',
                name: 'Product 3',
                sourceId: 'A',
                quantity: 3,
                unitWeight: 5,
                unitPrice: 50,
            },
        ],
        categories: [],
        totalItems: 6,
        totalWeight: 50,
        totalPrice: 430,
        groupingReasons: [],
        handlingGroup: 'general',
    });

    it('splits items by pickup source', () => {
        const result = splitShipmentGroupBySource(
            createGroup(),
        );

        expect(result).toHaveLength(2);

        expect(result[0].sourceId).toBe('A');
        expect(result[0].items).toHaveLength(2);

        expect(result[1].sourceId).toBe('B');
        expect(result[1].items).toHaveLength(1);
    });

    it('calculates weight independently for each source', () => {
        const result = splitShipmentGroupBySource(
            createGroup(),
        );

        expect(result[0].totalWeight).toBe(35);
        expect(result[1].totalWeight).toBe(15);
    });

    it('rejects an item whose source is missing', () => {
        const group = createGroup();
        group.items[0].sourceId = 'UNKNOWN';

        expect(() =>
            splitShipmentGroupBySource(group),
        ).toThrow('Source UNKNOWN not found');
    });

    it('does not modify the original group', () => {
        const group = createGroup();
        const original = JSON.stringify(group);

        splitShipmentGroupBySource(group);

        expect(JSON.stringify(group)).toBe(original);
    });

    it('rejects an item without sourceId', () => {
        const group = createGroup();
        group.items[0].sourceId = '';

        expect(() =>
            splitShipmentGroupBySource(group),
        ).toThrow('Item SKU-1 has no sourceId');
    });

    it('does not create a shipment group for a source without items', () => {
        const group = createGroup();
        group.items = group.items.filter(
            (item) => item.sourceId === 'A',
        );

        const result = splitShipmentGroupBySource(group);

        expect(result).toHaveLength(1);
        expect(result[0].sourceId).toBe('A');
        expect(result[0].totalWeight).toBe(35);
    });

});
