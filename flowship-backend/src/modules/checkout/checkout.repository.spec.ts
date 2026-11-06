
import { CheckoutRepository } from './checkout.repository';
import { DbService } from '../../infrastructure/database/db.service';

describe('CheckoutRepository - shipment details', () => {
    it('returns self-delivery preparation time and ETA', async () => {
        const readyAt = new Date('2026-11-04T10:00:00Z');
        const eta = new Date('2026-11-04T13:00:00Z');

        const queryMock = jest.fn()
            .mockResolvedValueOnce([{
                id: 'checkout-1',
                external_order_id: 'ORDER-100',
                store_id: 'store-1',
                platform: 'manual',
                status: 'completed',
                customer: {},
                destination: {},
                raw_payload: { totalItems: 1, totalPrice: 100 },
                created_at: new Date(),
                updated_at: null,
                grouping_split_reasons: [],
            }])
            .mockResolvedValueOnce([]) // checkout_items
            .mockResolvedValueOnce([]) // sourcing
            .mockResolvedValueOnce([]) // shipment_groups
            .mockResolvedValueOnce([]) // shipment_group_items
            .mockResolvedValueOnce([{
                id: 'shipment-1',
                shipment_group_id: 'group-1',
                order_id: 'ORDER-100',
                selected_plan_id: 'plan-1',
                selected_delivery_option_key: 'option-1',
                provider_id: null,
                provider_code: null,
                adapter_key: null,
                carrier_name: 'Supplier',
                service_name: 'Self Delivery',
                price: 35,
                currency: 'ILS',
                estimated_delivery_days: 0,
                status: 'preparing',
                metadata: {
                    deliveryMethod: 'self_delivery',
                    sourceId: 'source-1',
                },
                preparation_time_minutes: 75,
                ready_at: readyAt,
                estimated_delivery_at: eta,
                external_shipment_id: 'SUP-123',
                created_at: new Date(),
                updated_at: null,
            }])
            .mockResolvedValueOnce([]) // shipment_stops
            .mockResolvedValueOnce([]); // shipment_decisions

        const repository = new CheckoutRepository({
            query: queryMock,
        } as unknown as DbService);

        const result = await repository.getCheckoutById(
            {
                id: 'tenant-1',
                name: 'QUEEN',
                schemaName: 'queen',
                status: 'active',
            } as any,
            'checkout-1',
        );

        expect(result).not.toBeNull();
        expect(queryMock).toHaveBeenCalledTimes(8);

        const shipment = result!.shipments[0];

        expect(shipment).toMatchObject({
            deliveryMethod: 'self_delivery',
            sourceId: 'source-1',
            preparationTimeMinutes: 75,
            readyAt,
            estimatedDeliveryAt: eta,
            externalShipmentId: 'SUP-123',
            status: 'preparing',
        });

        expect(queryMock.mock.calls[5][0]).toContain(
            'preparation_time_minutes',
        );
        expect(queryMock.mock.calls[5][0]).toContain(
            'estimated_delivery_at',
        );
    });
});
