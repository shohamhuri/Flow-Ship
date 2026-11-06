
import { SelfDeliveryFulfillmentService } from './self-delivery-fulfillment.service';
import { SelfDeliveryProviderError } from '../sourcing/interfaces/self-delivery-provider.interface';

describe('SelfDeliveryFulfillmentService', () => {
    const tenant = {
        schemaName: 'flow_ship_test_a',
    } as any;

    const shipmentId = 'shipment-123';

    const fulfillment = {
        shipment_id: shipmentId,
        request_id: 'request-123',
        source_id: 'supplier-123',
        status: 'processing',
        request_payload: {
            requestId: 'request-123',
            orderId: 'order-123',
            storeId: 'store-123',
            sourceId: 'supplier-123',
            recipient: {
                name: 'Test Customer',
                phone: '0501234567',
            },
            destination: {
                country: 'IL',
                city: 'Tel Aviv',
                street: 'Herzl',
                houseNumber: '10',
            },
            items: [{ sku: 'SKU-1', quantity: 1 }],
        },
    };

    let repository: {
        claimPending: jest.Mock;
        findByShipmentId: jest.Mock;
        markConfirmed: jest.Mock;
        markFailed: jest.Mock;
    };

    let provider: {
        createDelivery: jest.Mock;
    };

    let service: SelfDeliveryFulfillmentService;

    beforeEach(() => {
        repository = {
            claimPending: jest.fn().mockResolvedValue(fulfillment),
            findByShipmentId: jest.fn(),
            markConfirmed: jest.fn().mockResolvedValue(undefined),
            markFailed: jest.fn().mockResolvedValue(undefined),
        };

        provider = {
            createDelivery: jest.fn(),
        };

        service = new SelfDeliveryFulfillmentService(
            repository as any,
            provider as any,
        );
    });

    it('marks a definitive INVALID_REQUEST rejection as failed', async () => {
        provider.createDelivery.mockRejectedValue(
            new SelfDeliveryProviderError(
                'INVALID_REQUEST',
                'Supplier rejected invalid request',
                false,
            ),
        );

        await expect(
            service.executePending(tenant, shipmentId),
        ).rejects.toThrow('Supplier rejected invalid request');

        expect(repository.markFailed).toHaveBeenCalledTimes(1);
        expect(repository.markFailed).toHaveBeenCalledWith(
            tenant,
            shipmentId,
            'Supplier rejected invalid request',
        );

        expect(repository.markConfirmed).not.toHaveBeenCalled();
        expect(provider.createDelivery).toHaveBeenCalledTimes(1);
    });

    it('keeps an ambiguous TIMEOUT in processing without retrying', async () => {
        provider.createDelivery.mockRejectedValue(
            new SelfDeliveryProviderError(
                'TIMEOUT',
                'Supplier response timed out',
                true,
            ),
        );

        await expect(
            service.executePending(tenant, shipmentId),
        ).rejects.toThrow('Supplier response timed out');

        expect(repository.markFailed).not.toHaveBeenCalled();
        expect(repository.markConfirmed).not.toHaveBeenCalled();
        expect(provider.createDelivery).toHaveBeenCalledTimes(1);
    });

    it('does not contact the supplier again when fulfillment is already processing', async () => {
        repository.claimPending.mockResolvedValue(null);

        repository.findByShipmentId.mockResolvedValue({
            ...fulfillment,
            status: 'processing',
        });

        await expect(
            service.executePending(tenant, shipmentId),
        ).rejects.toThrow(
            'Self-delivery fulfillment is processing',
        );

        expect(repository.claimPending).toHaveBeenCalledTimes(1);
        expect(repository.findByShipmentId).toHaveBeenCalledWith(
            tenant,
            shipmentId,
        );

        expect(provider.createDelivery).not.toHaveBeenCalled();
        expect(repository.markFailed).not.toHaveBeenCalled();
        expect(repository.markConfirmed).not.toHaveBeenCalled();
    });

});
