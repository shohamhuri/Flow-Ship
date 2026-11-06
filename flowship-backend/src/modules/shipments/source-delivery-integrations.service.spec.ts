
import { SourceDeliveryIntegrationsService } from './source-delivery-integrations.service';
import { DbService } from '../../infrastructure/database/db.service';
import type { CurrentTenant } from '../tenants/tenants.service';

describe('SourceDeliveryIntegrationsService', () => {
    let service: SourceDeliveryIntegrationsService;
    let queryOne: jest.Mock;

    const tenant = {
        schemaName: 'flow_ship_test',
    } as CurrentTenant;

    beforeEach(() => {
        queryOne = jest.fn();

        service = new SourceDeliveryIntegrationsService({
            queryOne,
        } as unknown as DbService);
    });

    it('returns integration settings for store and source', async () => {
        queryOne.mockResolvedValue({
            store_id: 'store-1',
            source_id: 'source-1',
            webhook_enabled: true,
            polling_enabled: false,
            webhook_secret: 'test-secret',
        });

        const result = await service.findByStoreAndSource(
            tenant,
            'store-1',
            'source-1',
        );

        expect(result).toEqual({
            storeId: 'store-1',
            sourceId: 'source-1',
            webhookEnabled: true,
            pollingEnabled: false,
            webhookSecret: 'test-secret',
        });

        expect(queryOne).toHaveBeenCalledWith(
            expect.stringContaining(
                '"flow_ship_test".source_delivery_integrations',
            ),
            ['store-1', 'source-1'],
        );
    });

    it('returns null when integration does not exist', async () => {
        queryOne.mockResolvedValue(null);

        const result = await service.findByStoreAndSource(
            tenant,
            'store-1',
            'missing-source',
        );

        expect(result).toBeNull();
    });

    it('rejects invalid tenant schema names', async () => {
        const invalidTenant = {
            schemaName: 'public"; DROP TABLE shipments; --',
        } as CurrentTenant;

        await expect(
            service.findByStoreAndSource(
                invalidTenant,
                'store-1',
                'source-1',
            ),
        ).rejects.toThrow('Invalid tenant schema name');

        expect(queryOne).not.toHaveBeenCalled();
    });

    it('queries only the requested tenant schema', async () => {
        queryOne.mockResolvedValue(null);

        const otherTenant = {
            schemaName: 'queen',
        } as CurrentTenant;

        await service.findByStoreAndSource(
            otherTenant,
            'store-1',
            'source-1',
        );

        const sql = queryOne.mock.calls[0][0] as string;

        expect(sql).toContain(
            '"queen".source_delivery_integrations',
        );

        expect(sql).not.toContain(
            '"flow_ship_test".source_delivery_integrations',
        );
    });
});
