import { MockInventoryProvider } from './mock-inventory.provider';

describe('MockInventoryProvider', () => {
    let provider: MockInventoryProvider;

    beforeEach(() => {
        provider = new MockInventoryProvider();
    });

    it('should return all four sources for store-1', async () => {
        const sources = await provider.getSources('store-1');

        expect(sources).toHaveLength(4);
    });

    it('should return only assigned sources for store-2', async () => {
        const sources = await provider.getSources('store-2');

        expect(sources.map((source) => source.id)).toEqual([
            'WAREHOUSE-CENTER',
            'BRANCH-TEL-AVIV',
        ]);
    });

    it('should return no sources for unknown store', async () => {
        const sources = await provider.getSources('unknown-store');

        expect(sources).toEqual([]);
    });

    it('should return inventory only from sources assigned to store-2', async () => {
        const inventory = await provider.getInventory(
            'store-2',
            ['SHIRT-BLACK-M'],
        );

        expect(inventory.length).toBeGreaterThan(0);

        expect(
            inventory.every((record) =>
                ['WAREHOUSE-CENTER', 'BRANCH-TEL-AVIV']
                    .includes(record.sourceId),
            ),
        ).toBe(true);
    });

    it('should return no inventory for unknown store', async () => {
        const inventory = await provider.getInventory(
            'unknown-store',
            ['SHIRT-BLACK-M'],
        );

        expect(inventory).toEqual([]);
    });
});