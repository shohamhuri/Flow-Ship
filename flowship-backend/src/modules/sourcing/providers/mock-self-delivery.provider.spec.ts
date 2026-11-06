
import { MockSelfDeliveryProvider } from './mock-self-delivery.provider';
import type {
    SelfDeliveryCreateRequest,
} from '../interfaces/self-delivery-provider.interface';

describe('MockSelfDeliveryProvider polling', () => {
    let provider: MockSelfDeliveryProvider;

    const createRequest = {
        requestId: 'request-123',
        orderId: 'order-123',
        storeId: 'store-123',
        sourceId: 'source-123',
        recipient: {
            name: 'Test Customer',
            phone: '0501234567',
        },
        destination: {
            country: 'IL',
            city: 'Tel Aviv',
            street: 'Dizengoff',
            houseNumber: '10',
        },
        items: [
            {
                sku: 'product-123',
                quantity: 1,
            },
        ],
    } satisfies SelfDeliveryCreateRequest;

    beforeEach(() => {
        provider = new MockSelfDeliveryProvider();
    });

    it('returns preparing for an existing order', async () => {
        const created = await provider.createDelivery(createRequest);

        const result = await provider.getDeliveryStatus({
            sourceId: created.sourceId,
            sourceOrderId: created.sourceOrderId,
        });

        expect(result.status).toBe('preparing');
        expect(result.sourceOrderId).toBe(created.sourceOrderId);
        expect(result.sourceId).toBe(created.sourceId);
    });

    it('returns the same event for repeated polling', async () => {
        const created = await provider.createDelivery(createRequest);

        const first = await provider.getDeliveryStatus({
            sourceId: created.sourceId,
            sourceOrderId: created.sourceOrderId,
        });

        const second = await provider.getDeliveryStatus({
            sourceId: created.sourceId,
            sourceOrderId: created.sourceOrderId,
        });

        expect(second.externalEventId)
            .toBe(first.externalEventId);

        expect(second.occurredAt)
            .toBe(first.occurredAt);
    });

    it('rejects an unknown order', async () => {
        await expect(
            provider.getDeliveryStatus({
                sourceId: 'source-123',
                sourceOrderId: 'unknown-order',
            }),
        ).rejects.toThrow('Mock self-delivery order not found');
    });

    it('does not return an order for a different source', async () => {
        const created = await provider.createDelivery(createRequest);

        await expect(
            provider.getDeliveryStatus({
                sourceId: 'another-source',
                sourceOrderId: created.sourceOrderId,
            }),
        ).rejects.toThrow('Mock self-delivery order not found');
    });
});
