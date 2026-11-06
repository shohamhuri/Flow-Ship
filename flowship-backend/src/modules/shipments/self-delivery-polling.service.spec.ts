
import { BadRequestException } from '@nestjs/common';

import { SelfDeliveryPollingService } from './self-delivery-polling.service';
import { SourceDeliveryIntegrationsService } from './source-delivery-integrations.service';
import { SelfDeliveryFulfillmentRepository } from './self-delivery-fulfillment.repository';
import { ShipmentStatusService } from './shipment-status.service';
import type { SelfDeliveryProvider } from '../sourcing/interfaces/self-delivery-provider.interface';

describe('SelfDeliveryPollingService', () => {
    const tenant = {
        id: 'tenant-1',
        name: 'Test',
        schemaName: 'flow_ship_test',
        status: 'active',
        timezone: 'Asia/Jerusalem',
    };

    const update = {
        sourceId: 'source-1',
        sourceOrderId: 'order-1',
        status: 'preparing' as const,
        externalEventId: 'event-1',
        occurredAt: '2026-11-01T10:00:00Z',
    };

    const integrations = {
        findByStoreAndSource: jest.fn(),
    };

    const fulfillments = {
        findBySourceOrderId: jest.fn(),
    };

    const provider = {
        getDeliveryStatus: jest.fn(),
    };

    const shipmentStatus = {
        processSelfDeliveryUpdate: jest.fn(),
    };

    let service: SelfDeliveryPollingService;

    beforeEach(() => {
        jest.clearAllMocks();

        integrations.findByStoreAndSource.mockResolvedValue({
            storeId: 'store-1',
            sourceId: 'source-1',
            pollingEnabled: true,
            webhookEnabled: false,
        });

        fulfillments.findBySourceOrderId.mockResolvedValue({
            request_payload: {
                storeId: 'store-1',
                sourceId: 'source-1',
            },
        });

        provider.getDeliveryStatus.mockResolvedValue(update);
        shipmentStatus.processSelfDeliveryUpdate.mockResolvedValue('processed');

        service = new SelfDeliveryPollingService(
            integrations as unknown as SourceDeliveryIntegrationsService,
            fulfillments as unknown as SelfDeliveryFulfillmentRepository,
            provider as unknown as SelfDeliveryProvider,
            shipmentStatus as unknown as ShipmentStatusService,
        );
    });

    const poll = () =>
        service.poll(tenant, 'store-1', 'source-1', 'order-1');

    it('processes a valid polling update', async () => {
        await expect(poll()).resolves.toBe('processed');

        expect(provider.getDeliveryStatus).toHaveBeenCalledWith({
            sourceId: 'source-1',
            sourceOrderId: 'order-1',
        });

        expect(shipmentStatus.processSelfDeliveryUpdate)
            .toHaveBeenCalledWith(tenant, update);
    });

    it('does not poll when polling is disabled', async () => {
        integrations.findByStoreAndSource.mockResolvedValue({
            pollingEnabled: false,
        });

        await expect(poll()).resolves.toBe('disabled');

        expect(provider.getDeliveryStatus).not.toHaveBeenCalled();
    });

    it('rejects an order belonging to another store', async () => {
        fulfillments.findBySourceOrderId.mockResolvedValue({
            request_payload: {
                storeId: 'store-2',
                sourceId: 'source-1',
            },
        });

        await expect(poll()).rejects.toThrow(BadRequestException);

        expect(provider.getDeliveryStatus).not.toHaveBeenCalled();
    });

    it('rejects tracking data for another order', async () => {
        provider.getDeliveryStatus.mockResolvedValue({
            ...update,
            sourceOrderId: 'different-order',
        });

        await expect(poll()).rejects.toThrow(BadRequestException);

        expect(shipmentStatus.processSelfDeliveryUpdate)
            .not.toHaveBeenCalled();
    });

    it('returns duplicate for an already processed event', async () => {
        shipmentStatus.processSelfDeliveryUpdate.mockResolvedValue('duplicate');

        await expect(poll()).resolves.toBe('duplicate');
    });
});
