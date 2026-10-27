
import { DbService } from '../../infrastructure/database/db.service';
import { SourceDeliveryPermissionsService } from './source-delivery-permissions.service';
import type { CurrentTenant } from '../tenants/tenants.service';

describe('SourceDeliveryPermissionsService', () => {
    const dbMock = {
        query: jest.fn(),
        queryOne: jest.fn(),
    };

    const tenant = {
        id: 'tenant-1',
        name: 'FLOW_SHIP_TEST',
        schemaName: 'flow_ship_test',
        status: 'active',
    } as CurrentTenant;

    let service: SourceDeliveryPermissionsService;

    beforeEach(() => {
        jest.resetAllMocks();

        service = new SourceDeliveryPermissionsService(
            dbMock as unknown as DbService,
        );
    });

    it('returns true for explicitly allowed source', async () => {
        dbMock.queryOne.mockResolvedValue({
            self_delivery_allowed: true,
        });

        await expect(
            service.isSelfDeliveryAllowed(
                tenant,
                'store-1',
                'WAREHOUSE-SOUTH',
            ),
        ).resolves.toBe(true);

        expect(dbMock.queryOne).toHaveBeenCalledWith(
            expect.stringContaining(
                '"flow_ship_test".source_delivery_permissions',
            ),
            ['store-1', 'WAREHOUSE-SOUTH'],
        );
    });

    it('returns false for denied source', async () => {
        dbMock.queryOne.mockResolvedValue({
            self_delivery_allowed: false,
        });

        await expect(
            service.isSelfDeliveryAllowed(
                tenant,
                'store-1',
                'WAREHOUSE-SOUTH',
            ),
        ).resolves.toBe(false);
    });

    it('returns false when permission is missing', async () => {
        dbMock.queryOne.mockResolvedValue(null);

        await expect(
            service.isSelfDeliveryAllowed(
                tenant,
                'store-1',
                'WAREHOUSE-SOUTH',
            ),
        ).resolves.toBe(false);
    });

    it('rejects invalid tenant schema', async () => {
        const invalidTenant = {
            ...tenant,
            schemaName: 'invalid"; DROP TABLE stores;--',
        };

        await expect(
            service.isSelfDeliveryAllowed(
                invalidTenant,
                'store-1',
                'WAREHOUSE-SOUTH',
            ),
        ).rejects.toThrow('Invalid tenant schema name');

        expect(dbMock.queryOne).not.toHaveBeenCalled();
    });

    it('loads all store permissions in one query', async () => {
        dbMock.query.mockResolvedValue([
            {
                source_id: 'WAREHOUSE-SOUTH',
                self_delivery_allowed: true,
            },
            {
                source_id: 'WAREHOUSE-CENTER',
                self_delivery_allowed: false,
            },
        ]);

        const permissions =
            await service.getPermissionsForStore(
                tenant,
                'store-1',
            );

        expect(permissions.get('WAREHOUSE-SOUTH')).toBe(true);
        expect(permissions.get('WAREHOUSE-CENTER')).toBe(false);
        expect(permissions.get('UNKNOWN-SOURCE') ?? false).toBe(false);

        expect(dbMock.query).toHaveBeenCalledTimes(1);
        expect(dbMock.query).toHaveBeenCalledWith(
            expect.stringContaining(
                '"flow_ship_test".source_delivery_permissions',
            ),
            ['store-1'],
        );
    });

    it('rejects invalid schema when loading store permissions', async () => {
        const invalidTenant = {
            ...tenant,
            schemaName: 'invalid"; DROP TABLE stores;--',
        };

        await expect(
            service.getPermissionsForStore(
                invalidTenant,
                'store-1',
            ),
        ).rejects.toThrow('Invalid tenant schema name');

        expect(dbMock.query).not.toHaveBeenCalled();
    });

});
