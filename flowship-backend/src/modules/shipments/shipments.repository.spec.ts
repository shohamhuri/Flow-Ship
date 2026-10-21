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
    it('should reject multiple pickups before writing to database', async () => {
        const pickups = [
            { sourceId: 'warehouse-A', city: 'Netivot' },
            { sourceId: 'warehouse-B', city: 'Beer Sheva' },
        ];

        await expect(
            repository.createShipmentStops(
                createTenant('flow_ship_test'),
                'shipment-123',
                pickups,
                { city: 'Tel Aviv' },
            ),
        ).rejects.toThrow(
            'Shipment shipment-123 must have exactly one pickup; received 2',
        );

        expect(dbQueryMock).not.toHaveBeenCalled();
    });

    it('should reject shipments without a pickup before writing to database', async () => {
        await expect(
            repository.createShipmentStops(
                createTenant('flow_ship_test'),
                'shipment-123',
                [],
                { city: 'Tel Aviv' },
            ),
        ).rejects.toThrow(
            'Shipment shipment-123 must have exactly one pickup; received 0',
        );

        expect(dbQueryMock).not.toHaveBeenCalled();
    });
    it('should insert exactly one pickup and one dropoff', async () => {
        await repository.createShipmentStops(
            createTenant('flow_ship_test'),
            'shipment-123',
            [{ sourceId: 'warehouse-A', city: 'Netivot' }],
            { city: 'Tel Aviv' },
        );

        expect(dbQueryMock).toHaveBeenCalledTimes(2);

        const [pickupSql, pickupParams] = dbQueryMock.mock.calls[0];
        const [dropoffSql, dropoffParams] = dbQueryMock.mock.calls[1];

        expect(pickupSql).toContain("'pickup'");
        expect(dropoffSql).toContain("'dropoff'");

        expect(pickupSql).toContain('"flow_ship_test".shipment_stops');
        expect(dropoffSql).toContain('"flow_ship_test".shipment_stops');

        expect(pickupParams[0]).toBe('shipment-123');
        expect(pickupParams[1]).toBe(1);

        expect(dropoffParams[0]).toBe('shipment-123');
        expect(dropoffParams[1]).toBe(2);
    });
});