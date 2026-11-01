import './integration-safety';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { DbService } from '../src/infrastructure/database/db.service';
import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';
import { SelfDeliveryFulfillmentRepository } from '../src/modules/shipments/self-delivery-fulfillment.repository';

describe('Source Delivery Webhook HTTP E2E', () => {
    let app: INestApplication;
    let db: DbService;
    let tenant: CurrentTenant;
    let fulfillmentRepository: SelfDeliveryFulfillmentRepository;

    const shipmentId = randomUUID();
    const checkoutId = randomUUID();
    const webhookId = randomUUID();
    const storeId = `webhook-store-${randomUUID()}`;
    const sourceId = `webhook-source-${randomUUID()}`;
    const sourceOrderId = `webhook-order-${randomUUID()}`;
    const orderId = `webhook-checkout-${randomUUID()}`;
    const webhookSecret = 'local-e2e-webhook-secret-at-least-32-characters';

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleRef.createNestApplication({
            rawBody: true,
        });

        await app.init();

        db = app.get(DbService);
        const config = app.get(ConfigService);
        const tenants = app.get(TenantsService);

        const apiKey = config.get<string>('TEST_FLOW_SHIP_A_API_KEY');

        if (!apiKey) {
            throw new Error('Missing TEST_FLOW_SHIP_A_API_KEY');
        }

        tenant = await tenants.findByApiKey(apiKey);

        if (tenant.schemaName !== 'flow_ship_test_a') {
            throw new Error('Test requires flow_ship_test_a');
        }

        fulfillmentRepository = app.get(
            SelfDeliveryFulfillmentRepository,
        );

        await db.query(
            `INSERT INTO "flow_ship_test_a".checkouts
             (id, platform, status)
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
            storeId,
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

        await db.query(
            `INSERT INTO "flow_ship_test_a".source_delivery_integrations
             (store_id, source_id, webhook_id, webhook_secret, webhook_enabled)
             VALUES ($1, $2, $3, $4, true)`,
            [storeId, sourceId, webhookId, webhookSecret],
        );
    }, 30000);

    afterAll(async () => {
        try {
            if (db && tenant?.schemaName === 'flow_ship_test_a') {
                await db.query(
                    `DELETE FROM "flow_ship_test_a".source_delivery_integrations
                     WHERE webhook_id = $1`,
                    [webhookId],
                );

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
        } finally {
            if (app) {
                await app.close();
            }
        }
    });
    it('accepts a correctly signed webhook and updates the shipment', async () => {
        const payload = {
            sourceId,
            sourceOrderId,
            externalEventId: `webhook-event-${randomUUID()}`,
            occurredAt: new Date().toISOString(),
            status: 'preparing',
        };

        const body = JSON.stringify(payload);
        const timestamp = Math.floor(Date.now() / 1000).toString();

        const response = await request(app.getHttpServer())
            .post(`/shipments/self-delivery/webhook/${webhookId}`)
            .set('Content-Type', 'application/json')
            .set('x-supplier-timestamp', timestamp)
            .set('x-supplier-signature', sign(body, timestamp))
            .send(body)
            .expect(201);

        expect(response.body.ok).toBe(true);

        const rows = await db.query(
            `SELECT status FROM "flow_ship_test_a".shipments WHERE id = $1`,
            [shipmentId],
        );

        expect(rows[0].status).toBe('preparing');
    });
    it('rejects a webhook with an invalid HMAC signature', async () => {
        const payload = {
            sourceId,
            sourceOrderId,
            externalEventId: `invalid-signature-${randomUUID()}`,
            occurredAt: new Date().toISOString(),
            status: 'delivered',
        };

        const body = JSON.stringify(payload);
        const timestamp = Math.floor(Date.now() / 1000).toString();

        await request(app.getHttpServer())
            .post(`/shipments/self-delivery/webhook/${webhookId}`)
            .set('Content-Type', 'application/json')
            .set('x-supplier-timestamp', timestamp)
            .set('x-supplier-signature', '0'.repeat(64))
            .send(body)
            .expect(401);

        const rows = await db.query(
            `SELECT status FROM "flow_ship_test_a".shipments WHERE id = $1`,
            [shipmentId],
        );

        expect(rows[0].status).toBe('preparing');
    });
    it('does not create duplicate shipment events for the same webhook', async () => {
        const eventId = `duplicate-event-${randomUUID()}`;

        const payload = {
            sourceId,
            sourceOrderId,
            externalEventId: eventId,
            occurredAt: new Date().toISOString(),
            status: 'ready_for_pickup',
        };

        const body = JSON.stringify(payload);
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signature = sign(body, timestamp);
        const url = `/shipments/self-delivery/webhook/${webhookId}`;

        const before = await db.query(
            `SELECT COUNT(*)::int AS count
             FROM "flow_ship_test_a".shipment_events
             WHERE shipment_id = $1`,
            [shipmentId],
        );

        const first = await request(app.getHttpServer())
            .post(url)
            .set('Content-Type', 'application/json')
            .set('x-supplier-timestamp', timestamp)
            .set('x-supplier-signature', signature)
            .send(body)
            .expect(201);

        expect(first.body.ok).toBe(true);

        const second = await request(app.getHttpServer())
            .post(url)
            .set('Content-Type', 'application/json')
            .set('x-supplier-timestamp', timestamp)
            .set('x-supplier-signature', signature)
            .send(body)
            .expect(201);

        expect(second.body.ok).toBe(true);
        expect(second.body.result).toBe('duplicate');

        const after = await db.query(
            `SELECT COUNT(*)::int AS count
             FROM "flow_ship_test_a".shipment_events
             WHERE shipment_id = $1`,
            [shipmentId],
        );

        expect(after[0].count - before[0].count).toBe(1);
    });
    it('does not roll back shipment status when receiving an older event', async () => {
        const before = await db.query(
            `SELECT status FROM "flow_ship_test_a".shipments WHERE id = $1`,
            [shipmentId],
        );

        expect(before[0].status).toBe('ready_for_pickup');

        const eventsBefore = await db.query(
            `SELECT COUNT(*)::int AS count
             FROM "flow_ship_test_a".shipment_events
             WHERE shipment_id = $1`,
            [shipmentId],
        );

        const payload = {
            sourceId,
            sourceOrderId,
            externalEventId: `stale-event-${randomUUID()}`,
            occurredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            status: 'preparing',
        };

        const body = JSON.stringify(payload);
        const timestamp = Math.floor(Date.now() / 1000).toString();

        const response = await request(app.getHttpServer())
            .post(`/shipments/self-delivery/webhook/${webhookId}`)
            .set('Content-Type', 'application/json')
            .set('x-supplier-timestamp', timestamp)
            .set('x-supplier-signature', sign(body, timestamp))
            .send(body)
            .expect(201);

        expect(response.body.ok).toBe(true);

        const after = await db.query(
            `SELECT status FROM "flow_ship_test_a".shipments WHERE id = $1`,
            [shipmentId],
        );

        expect(after[0].status).toBe('ready_for_pickup');

        const eventsAfter = await db.query(
            `SELECT COUNT(*)::int AS count
             FROM "flow_ship_test_a".shipment_events
             WHERE shipment_id = $1`,
            [shipmentId],
        );

        expect(eventsAfter[0].count).toBe(eventsBefore[0].count);
    });
    function sign(body: string, timestamp: string): string {
        return createHmac('sha256', webhookSecret)
            .update(timestamp)
            .update('.')
            .update(body)
            .digest('hex');
    }
});







