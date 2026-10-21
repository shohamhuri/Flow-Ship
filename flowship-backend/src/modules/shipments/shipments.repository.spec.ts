import { ShipmentsRepository } from './shipments.repository';
import { DbService } from '../../infrastructure/database/db.service';
import { CurrentTenant } from '../tenants/tenants.service';

describe('ShipmentsRepository tenant security', () => {
    let repository: ShipmentsRepository;
    let dbQueryMock: jest.Mock;

    const createTenant = (schemaName: string) =>
        ({
            id: schemaName,
            name: schemaName,
            schemaName,
            status: 'active',
        }) as CurrentTenant;

    beforeEach(() => {
        dbQueryMock = jest.fn().mockResolvedValue([]);

        repository = new ShipmentsRepository({
            query: dbQueryMock,
        } as unknown as DbService);
    });

    it('should reject an invalid schema before querying', async () => {
        await expect(
            repository.findCheckoutIdByShipmentId(
                createTenant('queen; DROP TABLE shipments; --'),
                'shipment-1',
            ),
        ).rejects.toThrow('Invalid schema name');

        expect(dbQueryMock).not.toHaveBeenCalled();
    });

    it('should query only the authenticated tenant schema', async () => {
        await repository.findCheckoutIdByShipmentId(
            createTenant('queen'),
            'shipment-1',
        );

        expect(dbQueryMock).toHaveBeenCalledTimes(1);

        const [sql, params] = dbQueryMock.mock.calls[0];

        expect(sql).toContain(
            'from "queen".shipments',
        );
        expect(sql).not.toContain(
            '"flow_ship_test".shipments',
        );
        expect(params).toEqual(['shipment-1']);
    });

    it('should use separate schemas for separate tenants', async () => {
        await repository.findCheckoutIdByShipmentId(
            createTenant('queen'),
            'same-shipment-id',
        );

        await repository.findCheckoutIdByShipmentId(
            createTenant('flow_ship_test'),
            'same-shipment-id',
        );

        expect(dbQueryMock).toHaveBeenCalledTimes(2);

        const firstSql = dbQueryMock.mock.calls[0][0];
        const secondSql = dbQueryMock.mock.calls[1][0];

        expect(firstSql).toContain('"queen".shipments');
        expect(secondSql).toContain('"flow_ship_test".shipments');
        expect(firstSql).not.toEqual(secondSql);
    });
});