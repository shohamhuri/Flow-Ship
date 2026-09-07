import { CarrierRegistry } from './carrier-registry.service';
import { CarrierCode } from './enums/carrier-code.enum';

describe('CarrierRegistry', () => {
    const mockCarrierAdapter = {
        code: CarrierCode.MOCK,
    } as any;

    const mockYangoAdapter = {
        code: CarrierCode.MOCK_YANGO,
    } as any;

    let registry: CarrierRegistry;

    beforeEach(() => {
        registry = new CarrierRegistry(
            mockCarrierAdapter,
            mockYangoAdapter,
        );
    });

    describe('getAdapter', () => {
        it('should return the mock carrier adapter for its code', () => {
            expect(registry.getAdapter(mockCarrierAdapter.code)).toBe(
                mockCarrierAdapter,
            );
        });

        it('should return the mock Yango adapter for its code', () => {
            expect(registry.getAdapter(mockYangoAdapter.code)).toBe(
                mockYangoAdapter,
            );
        });

        it('should throw a clear error when an adapter does not exist', () => {
            const unknownCode = 'unknown-carrier' as CarrierCode;

            expect(() => registry.getAdapter(unknownCode)).toThrow(
                'Carrier adapter not found: unknown-carrier',
            );
        });
    });

    describe('getAllAdapters', () => {
        it('should return all registered adapters', () => {
            expect(registry.getAllAdapters()).toEqual([
                mockCarrierAdapter,
                mockYangoAdapter,
            ]);
        });

        it('should return the same adapter instances that were injected', () => {
            const adapters = registry.getAllAdapters();

            expect(adapters[0]).toBe(mockCarrierAdapter);
            expect(adapters[1]).toBe(mockYangoAdapter);
        });
    });
});
