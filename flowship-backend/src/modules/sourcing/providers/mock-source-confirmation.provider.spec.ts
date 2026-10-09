
import { MockSourceConfirmationProvider }
    from './mock-source-confirmation.provider';

import { MockInventoryProvider }
    from '../adapters/mock-inventory.provider';

describe('MockSourceConfirmationProvider', () => {
    let provider: MockSourceConfirmationProvider;

    beforeEach(() => {
        provider = new MockSourceConfirmationProvider(
            new MockInventoryProvider(),
        );
    });

    it('should confirm available inventory and preparation time',
        async () => {
            const result = await provider.confirmSource({
                storeId: 'store-1',
                sourceId: 'WAREHOUSE-SOUTH',
                items: [
                    {
                        sku: 'SHIRT-BLACK-M',
                        quantity: 2,
                    },
                ],
            });

            expect(result.available).toBe(true);
            expect(result.preparationMinutes).toBe(25);
            expect(result.items[0].availableQuantity).toBe(15);
        },
    );

    it('should reject insufficient inventory',
        async () => {
            const result = await provider.confirmSource({
                storeId: 'store-1',
                sourceId: 'WAREHOUSE-SOUTH',
                items: [
                    {
                        sku: 'SHIRT-BLACK-M',
                        quantity: 20,
                    },
                ],
            });

            expect(result.available).toBe(false);
            expect(result.preparationMinutes).toBeNull();
        },
    );

    it('should reject an inactive source',
        async () => {
            const result = await provider.confirmSource({
                storeId: 'store-1',
                sourceId: 'BRANCH-TEL-AVIV',
                items: [
                    {
                        sku: 'SHIRT-BLACK-M',
                        quantity: 2,
                    },
                ],
            });

            expect(result.available).toBe(false);
            expect(result.preparationMinutes).toBeNull();
        },
    );
});
