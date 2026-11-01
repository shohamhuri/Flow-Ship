import { SelfDeliveryFulfillmentRepository } from './self-delivery-fulfillment.repository';
import { DbService } from '../../infrastructure/database/db.service';
import { CurrentTenant } from '../tenants/tenants.service';

describe('SelfDeliveryFulfillmentRepository', () => {
    let repository: SelfDeliveryFulfillmentRepository;
    let dbQueryOneMock: jest.Mock;

    const createTenant = (schemaName: string) =>
        ({
            id: schemaName,
            name: schemaName,
            schemaName,
            status: 'active',
        }) as CurrentTenant;

    beforeEach(() => {
        dbQueryOneMock = jest.fn().mockResolvedValue(null);

        repository = new SelfDeliveryFulfillmentRepository({
            queryOne: dbQueryOneMock,
        } as unknown as DbService);
    });
    it('should use the provided transaction to find a supplier order', async () => {
        const fulfillment = {
            shipment_id: 'shipment-123',
            source_id: 'supplier-123',
            source_order_id: 'order-456',
            status: 'confirmed',
        };

        const tx = {
            query: jest.fn().mockResolvedValue([fulfillment]),
        };

        const db = {
            queryOne: jest.fn(),
        };

        const repository = new SelfDeliveryFulfillmentRepository(
            db as any,
        );

        const tenant = {
            schemaName: 'flow_ship_test',
        } as CurrentTenant;

        const result = await repository.findBySourceOrderId(
            tenant,
            'supplier-123',
            'order-456',
            tx as any,
        );

        expect(result).toEqual(fulfillment);
        expect(tx.query).toHaveBeenCalledWith(
            expect.stringContaining(
                '"flow_ship_test".self_delivery_fulfillments',
            ),
            ['supplier-123', 'order-456'],
        );
        expect(db.queryOne).not.toHaveBeenCalled();
    });
    it('should find a confirmed shipment by source and order IDs', async () => {
        const fulfillment = {
            shipment_id: 'shipment-123',
            source_id: 'supplier-A',
            source_order_id: 'ORDER-456',
            status: 'confirmed',
        };

        dbQueryOneMock.mockResolvedValueOnce(fulfillment);

        const result = await repository.findBySourceOrderId(
            createTenant('queen'),
            'supplier-A',
            'ORDER-456',
        );

        expect(result).toEqual(fulfillment);
        expect(dbQueryOneMock).toHaveBeenCalledTimes(1);

        const [sql, params] = dbQueryOneMock.mock.calls[0];

        expect(sql).toContain(
            '"queen".self_delivery_fulfillments',
        );
        expect(sql).toMatch(/source_id\s*=\s*\$1/);
        expect(sql).toMatch(/source_order_id\s*=\s*\$2/);
        expect(sql).toMatch(/status\s*=\s*'confirmed'/);
        expect(params).toEqual(['supplier-A', 'ORDER-456']);
    });

    it('should return null when no matching shipment exists', async () => {
        const result = await repository.findBySourceOrderId(
            createTenant('queen'),
            'supplier-B',
            'ORDER-456',
        );

        expect(result).toBeNull();
    });

    it('should use only the authenticated tenant schema', async () => {
        await repository.findBySourceOrderId(
            createTenant('flow_ship_test'),
            'supplier-A',
            'ORDER-456',
        );

        const [sql] = dbQueryOneMock.mock.calls[0];

        expect(sql).toContain(
            '"flow_ship_test".self_delivery_fulfillments',
        );
        expect(sql).not.toContain(
            '"queen".self_delivery_fulfillments',
        );
    });

    it('should reject empty source or order IDs', async () => {
        await expect(
            repository.findBySourceOrderId(
                createTenant('queen'),
                ' ',
                'ORDER-456',
            ),
        ).rejects.toThrow(
            'Source ID and source order ID are required',
        );

        await expect(
            repository.findBySourceOrderId(
                createTenant('queen'),
                'supplier-A',
                ' ',
            ),
        ).rejects.toThrow(
            'Source ID and source order ID are required',
        );

        expect(dbQueryOneMock).not.toHaveBeenCalled();
    });

    it('should reject invalid tenant schema names', async () => {
        await expect(
            repository.findBySourceOrderId(
                createTenant('queen; DROP TABLE shipments; --'),
                'supplier-A',
                'ORDER-456',
            ),
        ).rejects.toThrow('Invalid tenant schema name');

        expect(dbQueryOneMock).not.toHaveBeenCalled();
    });

    it('should trim external identifiers before querying', async () => {
        await repository.findBySourceOrderId(
            createTenant('queen'),
            ' supplier-A ',
            ' ORDER-456 ',
        );

        const [, params] = dbQueryOneMock.mock.calls[0];

        expect(params).toEqual(['supplier-A', 'ORDER-456']);
    });
});