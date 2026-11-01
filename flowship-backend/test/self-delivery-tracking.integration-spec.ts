
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';

import { DbService } from '../src/infrastructure/database/db.service';
import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';
import { ShipmentsRepository } from '../src/modules/shipments/shipments.repository';
import { SelfDeliveryFulfillmentRepository } from '../src/modules/shipments/self-delivery-fulfillment.repository';
import { ShipmentStatusService } from '../src/modules/shipments/shipment-status.service';

describe('Self-Delivery Tracking Integration', () => {
    let moduleRef: TestingModule;
    let db: DbService;
    let tenant: CurrentTenant;
    let fulfillmentRepository: SelfDeliveryFulfillmentRepository;
    let statusService: ShipmentStatusService;

    const shipmentId = randomUUID();
    const checkoutId = randomUUID();
    const orderId = `test-order-${shipmentId}`;
    const sourceOrderId = `supplier-order-${shipmentId}`;
    const sourceId = `test-source-${shipmentId}`;
    const eventId = `event-${shipmentId}`;

    beforeAll(async () => {
        moduleRef = await Test.createTestingModule({
            imports: [ConfigModule.forRoot({ isGlobal: true })],
            providers: [
                DbService,
                ConfigService,
                TenantsService,
                ShipmentsRepository,
                SelfDeliveryFulfillmentRepository,
                ShipmentStatusService,
            ],
        }).compile();

        db = moduleRef.get(DbService);

        const config = moduleRef.get(ConfigService);
        const tenants = moduleRef.get(TenantsService);

        const apiKey = config.get<string>('TEST_FLOW_SHIP_A_API_KEY');

        if (!apiKey) {
            throw new Error('Missing TEST_FLOW_SHIP_A_API_KEY');
        }

        tenant = await tenants.findByApiKey(apiKey);

        if (tenant.schemaName !== 'flow_ship_test_a') {
            throw new Error('Test requires flow_ship_test_a');
        }

        fulfillmentRepository = moduleRef.get(
            SelfDeliveryFulfillmentRepository,
        );

        statusService = moduleRef.get(ShipmentStatusService);
        await db.query(
            `INSERT INTO "flow_ship_test_a".checkouts (id, platform, status)
     VALUES ($1, $2, $3)`,
            [checkoutId, 'test', 'open'],
        );
        await db.query(
            `INSERT INTO "flow_ship_test_a".shipments
        (id, order_id, checkout_id)
     VALUES ($1, $2, $3)`,
            [shipmentId, orderId, checkoutId],
        );

        await fulfillmentRepository.createPending(tenant, shipmentId, {
            orderId,
            storeId: 'test-store',
            sourceId,
            recipient: {
                name: 'Test Customer',
                phone: '0501234567',
            },
            destination: {
                country: 'IL',
                city: 'Tel Aviv',
                street: 'Herzl',
                houseNumber: '10',
            },
            items: [{ sku: 'SKU-1', quantity: 1 }],
        });

        await fulfillmentRepository.claimPending(tenant, shipmentId);

        await fulfillmentRepository.markConfirmed(
            tenant,
            shipmentId,
            sourceOrderId,
        );
    }, 30000);

    afterAll(async () => {
        if (db && tenant?.schemaName === 'flow_ship_test_a') {
            await db.query(
                `DELETE FROM "flow_ship_test_a".shipment_events
                 WHERE shipment_id = $1`,
                [shipmentId],
            );

            await db.query(
                `DELETE FROM "flow_ship_test_a".self_delivery_fulfillments
                 WHERE shipment_id = $1`,
                [shipmentId],
            );

            await db.query(
                `DELETE FROM "flow_ship_test_a".shipments
                 WHERE id = $1`,
                [shipmentId],
            );
            await db.query(
                `DELETE FROM "flow_ship_test_a".checkouts
     WHERE id = $1`,
                [checkoutId],
            );
        }

        if (moduleRef) {
            await moduleRef.close();
        }
    }, 30000);

    it('persists supplier tracking and prevents duplicate events', async () => {
        const update = {
            sourceId,
            sourceOrderId,
            status: 'preparing' as const,
            externalEventId: eventId,
            occurredAt: new Date().toISOString(),
        };

        const first = await statusService.processSelfDeliveryUpdate(
            tenant,
            update,
        );

        expect(first).toBe('processed');

        const shipment = await db.queryOne<{ status: string }>(
            `SELECT status
             FROM "flow_ship_test_a".shipments
             WHERE id = $1`,
            [shipmentId],
        );

        expect(shipment?.status).toBe('preparing');
        const checkout = await db.queryOne<{ status: string }>(
            `SELECT status
     FROM "flow_ship_test_a".checkouts
     WHERE id = $1`,
            [checkoutId],
        );

        expect(checkout?.status).toBe('processing');
        const events = await db.query<{
            event_type: string;
            new_status: string;
            external_event_id: string;
        }>(
            `SELECT event_type, new_status, external_event_id
             FROM "flow_ship_test_a".shipment_events
             WHERE shipment_id = $1
               AND source_id = $2`,
            [shipmentId, sourceId],
        );

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            event_type: 'PREPARING',
            new_status: 'preparing',
            external_event_id: eventId,
        });

        const second = await statusService.processSelfDeliveryUpdate(
            tenant,
            update,
        );

        expect(second).toBe('duplicate');

        const afterDuplicate = await db.query<{ id: string }>(
            `SELECT id
             FROM "flow_ship_test_a".shipment_events
             WHERE shipment_id = $1
               AND source_id = $2`,
            [shipmentId, sourceId],
        );

        expect(afterDuplicate).toHaveLength(1);
        const staleWhileActive =
            await statusService.processSelfDeliveryUpdate(
                tenant,
                {
                    sourceId,
                    sourceOrderId,
                    status: 'ready_for_pickup',
                    externalEventId: `${eventId}-stale-active`,
                    occurredAt: new Date(
                        new Date(update.occurredAt).getTime() - 1000,
                    ).toISOString(),
                },
            );

        expect(staleWhileActive).toBe('ignored');

        const activeShipment = await db.queryOne<{
            status: string;
        }>(
            `SELECT status
     FROM "flow_ship_test_a".shipments
     WHERE id = $1`,
            [shipmentId],
        );

        expect(activeShipment?.status).toBe('preparing');
        const nextStatuses = [
            {
                supplierStatus: 'ready_for_pickup',
                shipmentStatus: 'ready_for_pickup',
            },
            {
                supplierStatus: 'out_for_delivery',
                shipmentStatus: 'in_transit',
            },
            {
                supplierStatus: 'delivered',
                shipmentStatus: 'delivered',
            },
        ] as const;

        const baseTime = new Date(update.occurredAt).getTime();

        for (const [index, step] of nextStatuses.entries()) {
            const result = await statusService.processSelfDeliveryUpdate(
                tenant,
                {
                    sourceId,
                    sourceOrderId,
                    status: step.supplierStatus,
                    externalEventId: `${eventId}-${index + 1}`,
                    occurredAt: new Date(
                        baseTime + (index + 1) * 1000,
                    ).toISOString(),
                },
            );

            expect(result).toBe('processed');

            const currentShipment = await db.queryOne<{
                status: string;
                delivered_at: Date | null;
            }>(
                `SELECT status, delivered_at
         FROM "flow_ship_test_a".shipments
         WHERE id = $1`,
                [shipmentId],
            );

            expect(currentShipment?.status).toBe(step.shipmentStatus);

            if (step.shipmentStatus === 'delivered') {
                expect(currentShipment?.delivered_at).not.toBeNull();
            }
        }

        const finalCheckout = await db.queryOne<{ status: string }>(
            `SELECT status
     FROM "flow_ship_test_a".checkouts
     WHERE id = $1`,
            [checkoutId],
        );

        expect(finalCheckout?.status).toBe('delivered');

        const finalEvents = await db.query<{ id: string }>(
            `SELECT id
     FROM "flow_ship_test_a".shipment_events
     WHERE shipment_id = $1
       AND source_id = $2`,
            [shipmentId, sourceId],
        );

        expect(finalEvents).toHaveLength(4);
        const rejectedUpdate = await statusService.processSelfDeliveryUpdate(
            tenant,
            {
                sourceId,
                sourceOrderId,
                status: 'failed',
                reason: 'Supplier reported failure after delivery',
                externalEventId: `${eventId}-after-delivery`,
                occurredAt: new Date(baseTime + 10000).toISOString(),
            },
        );

        expect(rejectedUpdate).toBe('ignored');

        const shipmentAfterRejected = await db.queryOne<{
            status: string;
        }>(
            `SELECT status
     FROM "flow_ship_test_a".shipments
     WHERE id = $1`,
            [shipmentId],
        );

        expect(shipmentAfterRejected?.status).toBe('delivered');

        const eventsAfterRejected = await db.query<{ id: string }>(
            `SELECT id
     FROM "flow_ship_test_a".shipment_events
     WHERE shipment_id = $1
       AND source_id = $2`,
            [shipmentId, sourceId],
        );

        expect(eventsAfterRejected).toHaveLength(4);
        const staleUpdate = await statusService.processSelfDeliveryUpdate(
            tenant,
            {
                sourceId,
                sourceOrderId,
                status: 'ready_for_pickup',
                externalEventId: `${eventId}-stale`,
                occurredAt: new Date(baseTime - 1000).toISOString(),
            },
        );

        expect(staleUpdate).toBe('ignored');

        const eventsAfterStale = await db.query<{ id: string }>(
            `SELECT id
     FROM "flow_ship_test_a".shipment_events
     WHERE shipment_id = $1
       AND source_id = $2`,
            [shipmentId, sourceId],
        );

        expect(eventsAfterStale).toHaveLength(4);
    });
});
