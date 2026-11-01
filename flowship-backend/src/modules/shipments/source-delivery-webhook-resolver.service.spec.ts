
import { UnauthorizedException } from '@nestjs/common';

import { DbService } from '../../infrastructure/database/db.service';
import { SourceDeliveryWebhookResolverService } from './source-delivery-webhook-resolver.service';

describe('SourceDeliveryWebhookResolverService', () => {
    let service: SourceDeliveryWebhookResolverService;

    const webhookId = '123e4567-e89b-42d3-a456-426614174000';

    const tenant = {
        id: 'tenant-1',
        name: 'Test Tenant',
        schema_name: 'flow_ship_test',
        status: 'active',
        timezone: 'Asia/Jerusalem',
    };

    const db = {
        query: jest.fn(),
        queryOne: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        service = new SourceDeliveryWebhookResolverService(
            db as unknown as DbService,
        );
    });

    it('resolves an enabled webhook integration', async () => {
        db.query.mockResolvedValue([tenant]);
        db.queryOne.mockResolvedValue({
            store_id: 'store-1',
            source_id: 'source-1',
            webhook_secret: 'test-secret-at-least-32-characters',
        });

        const result = await service.resolve(webhookId);

        expect(result.tenant.id).toBe('tenant-1');
        expect(result.tenant.schemaName).toBe('flow_ship_test');
        expect(result.storeId).toBe('store-1');
        expect(result.sourceId).toBe('source-1');
        expect(result.webhookSecret).toBe(
            'test-secret-at-least-32-characters',
        );
    });

    it('rejects an invalid webhook ID', async () => {
        await expect(
            service.resolve('invalid-id'),
        ).rejects.toThrow(UnauthorizedException);

        expect(db.query).not.toHaveBeenCalled();
    });

    it('rejects an unknown webhook ID', async () => {
        db.query.mockResolvedValue([tenant]);
        db.queryOne.mockResolvedValue(null);

        await expect(
            service.resolve(webhookId),
        ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a webhook without a secret', async () => {
        db.query.mockResolvedValue([tenant]);
        db.queryOne.mockResolvedValue({
            store_id: 'store-1',
            source_id: 'source-1',
            webhook_secret: null,
        });

        await expect(
            service.resolve(webhookId),
        ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a webhook ID matching multiple tenants', async () => {
        db.query.mockResolvedValue([
            tenant,
            {
                ...tenant,
                id: 'tenant-2',
                schema_name: 'flow_ship_test_b',
            },
        ]);

        db.queryOne.mockResolvedValue({
            store_id: 'store-1',
            source_id: 'source-1',
            webhook_secret: 'test-secret-at-least-32-characters',
        });

        await expect(
            service.resolve(webhookId),
        ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an invalid tenant schema name', async () => {
        db.query.mockResolvedValue([
            {
                ...tenant,
                schema_name: 'invalid-schema;DROP TABLE',
            },
        ]);

        await expect(
            service.resolve(webhookId),
        ).rejects.toThrow('Invalid tenant schema name');

        expect(db.queryOne).not.toHaveBeenCalled();
    });
});
