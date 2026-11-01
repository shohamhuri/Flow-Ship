
import { UnauthorizedException } from '@nestjs/common';

import { SourceDeliveryWebhookController } from './source-delivery-webhook.controller';
import { SourceDeliveryWebhookResolverService } from './source-delivery-webhook-resolver.service';
import { SourceDeliveryWebhookSignatureService } from './source-delivery-webhook-signature.service';
import { SelfDeliveryFulfillmentRepository } from './self-delivery-fulfillment.repository';
import { ShipmentStatusService } from './shipment-status.service';

describe('SourceDeliveryWebhookController', () => {
    const tenant = {
        id: 'tenant-1',
        name: 'Test Tenant',
        schemaName: 'flow_ship_test',
        status: 'active',
        timezone: 'Asia/Jerusalem',
    };

    const integration = {
        tenant,
        storeId: 'store-1',
        sourceId: 'source-1',
        webhookSecret: 'supplier-secret-at-least-32-characters',
    };

    const update = {
        sourceId: 'source-1',
        sourceOrderId: 'ORDER-123',
        status: 'out_for_delivery',
        externalEventId: 'EVENT-456',
        occurredAt: '2026-11-01T10:00:00Z',
    };

    const resolver = {
        resolve: jest.fn(),
    };

    const signatureService = {
        verify: jest.fn(),
    };

    const fulfillmentRepository = {
        findBySourceOrderId: jest.fn(),
    };

    const shipmentStatusService = {
        processSelfDeliveryUpdate: jest.fn(),
    };

    let controller: SourceDeliveryWebhookController;

    const request = (body: unknown = update) => ({
        rawBody: Buffer.from(JSON.stringify(body)),
        body,
    });

    beforeEach(() => {
        jest.clearAllMocks();

        resolver.resolve.mockResolvedValue(integration);
        signatureService.verify.mockReturnValue(undefined);

        fulfillmentRepository.findBySourceOrderId.mockResolvedValue({
            source_id: 'source-1',
            source_order_id: 'ORDER-123',
            request_payload: {
                storeId: 'store-1',
                sourceId: 'source-1',
            },
        });

        shipmentStatusService.processSelfDeliveryUpdate
            .mockResolvedValue('processed');

        controller = new SourceDeliveryWebhookController(
            resolver as unknown as SourceDeliveryWebhookResolverService,
            signatureService as unknown as SourceDeliveryWebhookSignatureService,
            fulfillmentRepository as unknown as SelfDeliveryFulfillmentRepository,
            shipmentStatusService as unknown as ShipmentStatusService,
        );
    });

    it('processes a valid supplier update', async () => {
        const result = await controller.receive(
            'webhook-id',
            'signature',
            'timestamp',
            request() as any,
        );

        expect(result).toEqual({
            ok: true,
            result: 'processed',
        });

        expect(signatureService.verify).toHaveBeenCalled();
        expect(shipmentStatusService.processSelfDeliveryUpdate)
            .toHaveBeenCalledWith(tenant, update);
    });

    it('rejects an invalid signature before database lookup', async () => {
        signatureService.verify.mockImplementation(() => {
            throw new UnauthorizedException('Invalid signature');
        });

        await expect(
            controller.receive(
                'webhook-id',
                'invalid-signature',
                'timestamp',
                request() as any,
            ),
        ).rejects.toThrow(UnauthorizedException);

        expect(fulfillmentRepository.findBySourceOrderId)
            .not.toHaveBeenCalled();

        expect(shipmentStatusService.processSelfDeliveryUpdate)
            .not.toHaveBeenCalled();
    });

    it('rejects a different source', async () => {
        const invalidUpdate = {
            ...update,
            sourceId: 'source-2',
        };

        await expect(
            controller.receive(
                'webhook-id',
                'signature',
                'timestamp',
                request(invalidUpdate) as any,
            ),
        ).rejects.toThrow(UnauthorizedException);

        expect(shipmentStatusService.processSelfDeliveryUpdate)
            .not.toHaveBeenCalled();
    });

    it('rejects an order belonging to another store', async () => {
        fulfillmentRepository.findBySourceOrderId.mockResolvedValue({
            request_payload: {
                storeId: 'store-2',
                sourceId: 'source-1',
            },
        });

        await expect(
            controller.receive(
                'webhook-id',
                'signature',
                'timestamp',
                request() as any,
            ),
        ).rejects.toThrow(UnauthorizedException);

        expect(shipmentStatusService.processSelfDeliveryUpdate)
            .not.toHaveBeenCalled();
    });

    it('returns duplicate without creating another event', async () => {
        shipmentStatusService.processSelfDeliveryUpdate
            .mockResolvedValue('duplicate');

        const result = await controller.receive(
            'webhook-id',
            'signature',
            'timestamp',
            request() as any,
        );

        expect(result).toEqual({
            ok: true,
            result: 'duplicate',
        });
    });
});
