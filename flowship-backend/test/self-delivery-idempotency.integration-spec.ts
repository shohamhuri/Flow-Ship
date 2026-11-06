
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';

import { DbService } from '../src/infrastructure/database/db.service';
import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';
import {
    SelfDeliveryFulfillmentRepository,
} from '../src/modules/shipments/self-delivery-fulfillment.repository';

describe('Self-Delivery Idempotency Integration', () => {
    let moduleRef: TestingModule;
    let db: DbService;
    let tenant: CurrentTenant;
    let repository: SelfDeliveryFulfillmentRepository;

    const shipmentId = randomUUID();

    beforeAll(async () => {
        moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
            ],
            providers: [
                DbService,
                ConfigService,
                TenantsService,
                SelfDeliveryFulfillmentRepository,
            ],
        }).compile();

        db = moduleRef.get(DbService);

        const config = moduleRef.get(ConfigService);
        const tenantsService = moduleRef.get(TenantsService);

        const apiKey = config.get<string>('TEST_FLOW_SHIP_A_API_KEY');

        if (!apiKey) {
            throw new Error('TEST_FLOW_SHIP_A_API_KEY is missing');
        }

        tenant = await tenantsService.findByApiKey(apiKey);

        if (tenant.schemaName !== 'flow_ship_test_a') {
            throw new Error('Integration test requires flow_ship_test_a');
        }

        repository = moduleRef.get(SelfDeliveryFulfillmentRepository);

        await db.query(
            `INSERT INTO "flow_ship_test_a".shipments (id, order_id)
             VALUES ($1, $2)`,
            [shipmentId, `test-order-${shipmentId}`],
        );
    }, 30000);

    afterAll(async () => {
        if (db && tenant?.schemaName === 'flow_ship_test_a') {
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
        }

        if (moduleRef) {
            await moduleRef.close();
        }
    }, 30000);

    it('preserves one fulfillment and one requestId on repeated preparation', async () => {
        const request = {
            orderId: `test-order-${shipmentId}`,
            storeId: 'test-store',
            sourceId: 'test-source',
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
            items: [
                { sku: 'SKU-1', quantity: 2 },
            ],
        };

        const first = await repository.createPending(
            tenant,
            shipmentId,
            request,
        );

        const second = await repository.createPending(
            tenant,
            shipmentId,
            request,
        );

        expect(second.id).toBe(first.id);
        expect(second.request_id).toBe(first.request_id);

        const rows = await db.query(
            `SELECT request_id
             FROM "flow_ship_test_a".self_delivery_fulfillments
             WHERE shipment_id = $1`,
            [shipmentId],
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].request_id).toBe(first.request_id);

        await expect(
            repository.createPending(tenant, shipmentId, {
                ...request,
                items: [{ sku: 'DIFFERENT-SKU', quantity: 1 }],
            }),
        ).rejects.toThrow(
            'Fulfillment already exists with different request content',
        );
    });

    it('allows only one concurrent claim for the same shipment', async () => {
        const concurrentShipmentId = randomUUID();

        await db.query(
            `INSERT INTO "flow_ship_test_a".shipments (id, order_id)
         VALUES ($1, $2)`,
            [concurrentShipmentId, `test-order-${concurrentShipmentId}`],
        );

        try {
            await repository.createPending(tenant, concurrentShipmentId, {
                orderId: `test-order-${concurrentShipmentId}`,
                storeId: 'test-store',
                sourceId: 'test-source',
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

            const results = await Promise.all([
                repository.claimPending(tenant, concurrentShipmentId),
                repository.claimPending(tenant, concurrentShipmentId),
            ]);

            expect(results.filter((result) => result !== null)).toHaveLength(1);
            expect(results.filter((result) => result === null)).toHaveLength(1);

            const fulfillment = await repository.findByShipmentId(
                tenant,
                concurrentShipmentId,
            );

            expect(fulfillment?.status).toBe('processing');
        } finally {
            await db.query(
                `DELETE FROM "flow_ship_test_a".self_delivery_fulfillments
             WHERE shipment_id = $1`,
                [concurrentShipmentId],
            );

            await db.query(
                `DELETE FROM "flow_ship_test_a".shipments
             WHERE id = $1`,
                [concurrentShipmentId],
            );
        }
    });

    it('persists supplier confirmation and prevents duplicate confirmation', async () => {
        const confirmationShipmentId = randomUUID();
        const sourceOrderId = `supplier-order-${confirmationShipmentId}`;

        await db.query(
            `INSERT INTO "flow_ship_test_a".shipments (id, order_id)
         VALUES ($1, $2)`,
            [
                confirmationShipmentId,
                `test-order-${confirmationShipmentId}`,
            ],
        );

        try {
            await repository.createPending(tenant, confirmationShipmentId, {
                orderId: `test-order-${confirmationShipmentId}`,
                storeId: 'test-store',
                sourceId: 'test-source',
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

            const claimed = await repository.claimPending(
                tenant,
                confirmationShipmentId,
            );

            expect(claimed?.status).toBe('processing');

            await repository.markConfirmed(
                tenant,
                confirmationShipmentId,
                sourceOrderId,
            );

            const confirmed = await repository.findByShipmentId(
                tenant,
                confirmationShipmentId,
            );

            expect(confirmed?.status).toBe('confirmed');
            expect(confirmed?.source_order_id).toBe(sourceOrderId);
            expect(confirmed?.error_message).toBeNull();
            const shipmentAfterConfirmation = await db.queryOne<{
                external_shipment_id: string | null;
            }>(
                `
    SELECT external_shipment_id
    FROM "flow_ship_test_a".shipments
    WHERE id = $1
    `,
                [confirmationShipmentId],
            );

            expect(shipmentAfterConfirmation?.external_shipment_id)
                .toBe(sourceOrderId);
            await expect(
                repository.markConfirmed(
                    tenant,
                    confirmationShipmentId,
                    'another-supplier-order',
                ),
            ).rejects.toThrow(
                'Fulfillment confirmation update failed',
            );

            const afterDuplicate = await repository.findByShipmentId(
                tenant,
                confirmationShipmentId,
            );

            expect(afterDuplicate?.source_order_id).toBe(sourceOrderId);
            expect(afterDuplicate?.status).toBe('confirmed');
        } finally {
            await db.query(
                `DELETE FROM "flow_ship_test_a".self_delivery_fulfillments
             WHERE shipment_id = $1`,
                [confirmationShipmentId],
            );

            await db.query(
                `DELETE FROM "flow_ship_test_a".shipments
             WHERE id = $1`,
                [confirmationShipmentId],
            );
        }
    });

    it('rolls back confirmation when shipment has a different external ID', async () => {
        const shipmentId = randomUUID();
        const existingExternalId = `existing-${shipmentId}`;
        const newExternalId = `new-${shipmentId}`;

        await db.query(
            `INSERT INTO "flow_ship_test_a".shipments
            (id, order_id, external_shipment_id)
         VALUES ($1, $2, $3)`,
            [shipmentId, `test-order-${shipmentId}`, existingExternalId],
        );

        try {
            await repository.createPending(tenant, shipmentId, {
                orderId: `test-order-${shipmentId}`,
                storeId: 'test-store',
                sourceId: 'test-source',
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

            await repository.claimPending(tenant, shipmentId);

            await expect(
                repository.markConfirmed(tenant, shipmentId, newExternalId),
            ).rejects.toThrow('Shipment external ID update failed');

            const fulfillment = await repository.findByShipmentId(
                tenant,
                shipmentId,
            );

            expect(fulfillment?.status).toBe('processing');
            expect(fulfillment?.source_order_id).toBeNull();

            const shipment = await db.queryOne<{
                external_shipment_id: string | null;
            }>(
                `SELECT external_shipment_id
             FROM "flow_ship_test_a".shipments
             WHERE id = $1`,
                [shipmentId],
            );

            expect(shipment?.external_shipment_id).toBe(existingExternalId);
        } finally {
            await db.query(
                `DELETE FROM "flow_ship_test_a".self_delivery_fulfillments
             WHERE shipment_id = $1`,
                [shipmentId],
            );

            await db.query(
                `DELETE FROM "flow_ship_test_a".shipments WHERE id = $1`,
                [shipmentId],
            );
        }
    });

    it('persists supplier failure and prevents later confirmation', async () => {
        const failedShipmentId = randomUUID();

        await db.query(
            `INSERT INTO "flow_ship_test_a".shipments (id, order_id)
         VALUES ($1, $2)`,
            [failedShipmentId, `test-order-${failedShipmentId}`],
        );

        try {
            await repository.createPending(tenant, failedShipmentId, {
                orderId: `test-order-${failedShipmentId}`,
                storeId: 'test-store',
                sourceId: 'test-source',
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

            const claimed = await repository.claimPending(
                tenant,
                failedShipmentId,
            );

            expect(claimed?.status).toBe('processing');

            await repository.markFailed(
                tenant,
                failedShipmentId,
                'Supplier rejected the delivery request',
            );

            const failed = await repository.findByShipmentId(
                tenant,
                failedShipmentId,
            );

            expect(failed?.status).toBe('failed');
            expect(failed?.error_message).toBe(
                'Supplier rejected the delivery request',
            );
            expect(failed?.source_order_id).toBeNull();

            await expect(
                repository.markConfirmed(
                    tenant,
                    failedShipmentId,
                    'late-supplier-order',
                ),
            ).rejects.toThrow(
                'Fulfillment confirmation update failed',
            );

            expect(
                (await repository.findByShipmentId(
                    tenant,
                    failedShipmentId,
                ))?.status,
            ).toBe('failed');
        } finally {
            await db.query(
                `DELETE FROM "flow_ship_test_a".self_delivery_fulfillments
             WHERE shipment_id = $1`,
                [failedShipmentId],
            );

            await db.query(
                `DELETE FROM "flow_ship_test_a".shipments
             WHERE id = $1`,
                [failedShipmentId],
            );
        }
    });

});
