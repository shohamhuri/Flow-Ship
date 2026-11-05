
import { ShipmentHistoryRepository } from './shipment-history.repository';
import { DbService } from '../../infrastructure/database/db.service';
import { CurrentTenant } from '../tenants/tenants.service';

describe('ShipmentHistoryRepository - self delivery', () => {
    const tenant = {
        id: 'tenant-1',
        name: 'QUEEN',
        schemaName: 'queen',
        status: 'active',
    } as CurrentTenant;

    it('returns self-delivery details in shipment history', async () => {
        const readyAt = '2026-11-04T10:00:00Z';
        const estimatedDeliveryAt = '2026-11-04T13:00:00Z';

        const queryMock = jest.fn().mockResolvedValue([
            {
                checkout_id: 'checkout-1',
                order_id: 'ORDER-100',
                platform: 'manual',
                result_status: 'delivered',
                checkout_status: 'completed',
                failure_stage: null,
                failure_reason: null,
                destination: {},
                total_shipments: '1',
                delivered_shipments: '1',
                failed_shipments: '0',
                total_shipping_price: '35',
                currency: 'ILS',
                created_at: new Date('2026-11-04T09:00:00Z'),
                completed_at: new Date('2026-11-04T13:00:00Z'),
                shipments: [
                    {
                        id: 'shipment-1',
                        shipmentGroupId: 'group-1',
                        status: 'delivered',
                        deliveryMethod: 'self_delivery',
                        sourceId: 'source-1',
                        preparationTimeMinutes: 75,
                        readyAt,
                        estimatedDeliveryAt,
                        externalShipmentId: 'SUP-123',
                        carrierName: null,
                        serviceName: 'Self Delivery',
                        price: 35,
                        currency: 'ILS',
                        trackingNumber: null,
                        trackingUrl: null,
                        pickup: {},
                        dropoff: {},
                        failureReason: null,
                        deliveredAt: estimatedDeliveryAt,
                        failedAt: null,
                        createdAt: new Date('2026-11-04T09:00:00Z'),
                    },
                ],
            },
        ]);

        const repository = new ShipmentHistoryRepository({
            query: queryMock,
        } as unknown as DbService);

        const result = await repository.findFinalOrders(tenant);

        expect(result).toHaveLength(1);
        expect(result[0].shipments[0]).toMatchObject({
            deliveryMethod: 'self_delivery',
            sourceId: 'source-1',
            preparationTimeMinutes: 75,
            readyAt,
            estimatedDeliveryAt,
            externalShipmentId: 'SUP-123',
        });

        const sql = queryMock.mock.calls[0][0] as string;

        expect(sql).toContain("'deliveryMethod'");
        expect(sql).toContain("'sourceId'");
        expect(sql).toContain("'preparationTimeMinutes'");
        expect(sql).toContain("'readyAt'");
        expect(sql).toContain("'estimatedDeliveryAt'");
        expect(sql).toContain('shipment.preparation_time_minutes');
        expect(sql).toContain('shipment.estimated_delivery_at');
        expect(sql).toContain('"queen".shipments');
        expect(queryMock).toHaveBeenCalledTimes(1);
    });
});
