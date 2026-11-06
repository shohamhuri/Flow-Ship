import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { ShipmentMonitoringService } from '../src/modules/shipments/shipment-monitoring.service';
import { SelfDeliveryPollingService } from '../src/modules/shipments/self-delivery-polling.service';
import { DbService } from '../src/infrastructure/database/db.service';
import {
    TenantsService,
    type CurrentTenant,
} from '../src/modules/tenants/tenants.service';
import { ShipmentMonitoringRepository } from '../src/modules/shipments/shipment-monitoring.repository';
import type { ShipmentMonitoringScheduler as SchedulerType } from '../src/modules/shipments/shipment-monitoring.scheduler';

jest.mock('@nestjs/schedule', () => ({
    Cron: () => () => undefined,
}));

const { ShipmentMonitoringScheduler } =
    jest.requireActual<
        typeof import('../src/modules/shipments/shipment-monitoring.scheduler')
    >('../src/modules/shipments/shipment-monitoring.scheduler');
describe('ShipmentMonitoringRepository Integration', () => {
    let db: DbService;
    let repository: ShipmentMonitoringRepository;
    let tenant: CurrentTenant;
    let tenantB: CurrentTenant;
    let shipmentId: string;
    let monitoringService: ShipmentMonitoringService;
    let scheduler: SchedulerType;
    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [ConfigModule.forRoot({ isGlobal: true })],
            providers: [
                DbService,
                TenantsService,
                ShipmentMonitoringRepository,
                ShipmentMonitoringService,
                ShipmentMonitoringScheduler,
                {
                    provide: SelfDeliveryPollingService,
                    useValue: {
                        pollActiveShipments: jest.fn().mockResolvedValue(undefined),
                    },
                },
            ],
        }).compile();

        db = moduleRef.get(DbService);
        repository = moduleRef.get(ShipmentMonitoringRepository);
        monitoringService = moduleRef.get(ShipmentMonitoringService);
        scheduler = moduleRef.get(ShipmentMonitoringScheduler);
        const apiKey = moduleRef
            .get(ConfigService)
            .get<string>('TEST_FLOW_SHIP_A_API_KEY');

        if (!apiKey) {
            throw new Error('Missing TEST_FLOW_SHIP_A_API_KEY');
        }

        tenant = await moduleRef
            .get(TenantsService)
            .findByApiKey(apiKey);

        if (tenant.schemaName !== 'flow_ship_test_a') {
            throw new Error('Unexpected test tenant schema');
        }
        const tenantBApiKey = moduleRef
            .get(ConfigService)
            .get<string>('TEST_FLOW_SHIP_B_API_KEY');

        if (!tenantBApiKey) {
            throw new Error('Missing TEST_FLOW_SHIP_B_API_KEY');
        }

        tenantB = await moduleRef
            .get(TenantsService)
            .findByApiKey(tenantBApiKey);

        if (tenantB.schemaName !== 'flow_ship_test_b') {
            throw new Error('Unexpected second test tenant schema');
        }
    }, 30000);

    beforeEach(async () => {
        shipmentId = randomUUID();

        await db.query(
            `INSERT INTO flow_ship_test_a.shipments
                (id, status, metadata)
             VALUES ($1, 'created', $2::jsonb)`,
            [
                shipmentId,
                JSON.stringify({
                    deliveryMethod: 'self_delivery',
                }),
            ],
        );
    });

    afterEach(async () => {
        if (!shipmentId || !db) return;

        await db.query(
            `DELETE FROM flow_ship_test_a.shipment_monitoring_anomalies
             WHERE shipment_id = $1`,
            [shipmentId],
        );
        await db.query(
            `DELETE FROM flow_ship_test_a.self_delivery_fulfillments
     WHERE shipment_id = $1`,
            [shipmentId],
        );
        await db.query(
            `DELETE FROM flow_ship_test_a.shipment_events
     WHERE shipment_id = $1`,
            [shipmentId],
        );
        await db.query(
            `DELETE FROM flow_ship_test_a.shipments
             WHERE id = $1`,
            [shipmentId],
        );
    });
    it('detects preparation delay automatically', async () => {
        const now = new Date('2026-11-02T14:00:00Z');

        await db.query(
            `UPDATE flow_ship_test_a.shipments
         SET ready_at = $2,
             preparation_time_minutes = 30
         WHERE id = $1`,
            [shipmentId, '2026-11-02T13:00:00Z'],
        );

        await monitoringService.monitorTenant(tenant, now);

        const rows = await db.query<{
            anomaly_type: string;
            status: string;
        }>(
            `SELECT anomaly_type, status
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1
           AND anomaly_type = 'preparation_delay'`,
            [shipmentId],
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe('open');
    });
    it('detects delivery delay automatically', async () => {
        const now = new Date('2026-11-02T15:00:00Z');

        await db.query(
            `UPDATE flow_ship_test_a.shipments
         SET estimated_delivery_at = $2,
             ready_at = NULL,
             status = 'in_transit'
         WHERE id = $1`,
            [shipmentId, '2026-11-02T14:00:00Z'],
        );

        await monitoringService.monitorTenant(tenant, now);

        const rows = await db.query<{
            anomaly_type: string;
            status: string;
        }>(
            `SELECT anomaly_type, status
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1
           AND anomaly_type = 'delivery_delay'`,
            [shipmentId],
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].anomaly_type).toBe('delivery_delay');
        expect(rows[0].status).toBe('open');
    });
    it('detects missing supplier status update automatically', async () => {
        const now = new Date('2026-11-02T13:00:00Z');

        await db.query(
            `INSERT INTO flow_ship_test_a.self_delivery_fulfillments
        (
            shipment_id,
            source_id,
            request_id,
            status,
            source_order_id,
            request_payload,
            created_at,
            updated_at
        )
     VALUES (
            $1,
            $2,
            $3,
            'confirmed',
            $4,
            '{}'::jsonb,
            $5,
            $5
        )`,
            [
                shipmentId,
                'monitoring-integration-source',
                randomUUID(),
                `TEST-ORDER-${shipmentId}`,
                '2026-11-02T10:00:00Z',
            ],
        );

        await monitoringService.monitorTenant(tenant, now);

        const rows = await db.query<{
            anomaly_type: string;
            status: string;
        }>(
            `SELECT anomaly_type, status
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1
           AND anomaly_type = 'missing_status_update'`,
            [shipmentId],
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe('open');
    });
    it('resolves missing status update after supplier responds', async () => {
        const confirmedAt = '2026-11-02T10:00:00Z';
        const firstCheck = new Date('2026-11-02T13:00:00Z');
        const secondCheck = new Date('2026-11-02T13:05:00Z');

        await db.query(
            `INSERT INTO flow_ship_test_a.self_delivery_fulfillments
            (
                shipment_id,
                source_id,
                request_id,
                status,
                source_order_id,
                request_payload,
                created_at,
                updated_at
            )
         VALUES ($1, $2, $3, 'confirmed', $4, '{}'::jsonb, $5, $5)`,
            [
                shipmentId,
                'monitoring-integration-source',
                randomUUID(),
                `TEST-ORDER-${shipmentId}`,
                confirmedAt,
            ],
        );

        // First scan: supplier has not updated for 3 hours.
        await monitoringService.monitorTenant(tenant, firstCheck);

        const before = await db.query<{ status: string }>(
            `SELECT status
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1
           AND anomaly_type = 'missing_status_update'`,
            [shipmentId],
        );

        expect(before).toHaveLength(1);
        expect(before[0].status).toBe('open');

        // Supplier responds with a fresh update.
        await db.query(
            `UPDATE flow_ship_test_a.self_delivery_fulfillments
         SET updated_at = $2
         WHERE shipment_id = $1`,
            [shipmentId, '2026-11-02T13:04:00Z'],
        );

        await monitoringService.monitorTenant(tenant, secondCheck);

        const after = await db.query<{ status: string }>(
            `SELECT status
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1
           AND anomaly_type = 'missing_status_update'`,
            [shipmentId],
        );

        expect(after).toHaveLength(1);
        expect(after[0].status).toBe('resolved');
    });
    it('isolates monitoring anomalies between tenants', async () => {
        const details = {
            actualReadyAt: '2026-11-02T12:30:00Z',
            delayMinutes: 30,
        };

        await repository.recordResolvedAnomaly(
            tenant,
            shipmentId,
            'preparation_delay',
            details,
        );

        const tenantARows = await db.query<{ id: string }>(
            `SELECT id
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1`,
            [shipmentId],
        );

        const tenantBRows = await db.query<{ id: string }>(
            `SELECT id
         FROM flow_ship_test_b.shipment_monitoring_anomalies
         WHERE shipment_id = $1`,
            [shipmentId],
        );

        expect(tenantARows).toHaveLength(1);
        expect(tenantBRows).toHaveLength(0);

        const tenantBVisible = await repository.findAnomalies(
            tenantB,
        );

        expect(
            tenantBVisible.some(
                (row: { shipment_id: string }) =>
                    row.shipment_id === shipmentId,
            ),
        ).toBe(false);
    });
    it('prevents duplicate anomalies during concurrent calls', async () => {
        const details = {
            deliveredAt: '2026-11-02T13:00:00Z',
            estimatedDeliveryAt: '2026-11-02T12:30:00Z',
            delayMinutes: 30,
        };

        await Promise.all(
            Array.from({ length: 10 }, () =>
                repository.recordResolvedAnomaly(
                    tenant,
                    shipmentId,
                    'delivery_delay',
                    details,
                ),
            ),
        );

        const rows = await db.query<{ id: string }>(
            `SELECT id
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1
           AND anomaly_type = 'delivery_delay'`,
            [shipmentId],
        );

        expect(rows).toHaveLength(1);
    });
    it('stores a resolved delay only once across repeated scans', async () => {
        const deliveredAt = new Date('2026-11-02T10:45:00Z');

        const details = {
            estimatedDeliveryAt: '2026-11-02T10:00:00Z',
            deliveredAt,
            delayMinutes: 45,
        };

        await repository.recordResolvedAnomaly(
            tenant,
            shipmentId,
            'delivery_delay',
            details,
        );

        await repository.recordResolvedAnomaly(
            tenant,
            shipmentId,
            'delivery_delay',
            details,
        );

        const rows = await db.query<{ id: string }>(
            `SELECT id
             FROM flow_ship_test_a.shipment_monitoring_anomalies
             WHERE shipment_id = $1
               AND anomaly_type = 'delivery_delay'`,
            [shipmentId],
        );

        expect(rows).toHaveLength(1);
    });
    it('resolves an active anomaly without creating a duplicate', async () => {
        const anomalyType = 'preparation_delay';

        await repository.upsertAnomaly(
            tenant,
            shipmentId,
            anomalyType,
            {
                expectedReadyAt: '2026-11-02T10:00:00Z',
            },
        );

        const before = await db.query<{
            id: string;
            status: string;
        }>(
            `SELECT id, status
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1
           AND anomaly_type = $2`,
            [shipmentId, anomalyType],
        );

        expect(before).toHaveLength(1);
        expect(before[0].status).toBe('open');

        await repository.recordResolvedAnomaly(
            tenant,
            shipmentId,
            anomalyType,
            {
                actualReadyAt: '2026-11-02T10:30:00Z',
                delayMinutes: 30,
            },
        );

        const after = await db.query<{
            id: string;
            status: string;
            resolved_at: Date | null;
        }>(
            `SELECT id, status, resolved_at
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1
           AND anomaly_type = $2`,
            [shipmentId, anomalyType],
        );

        expect(after).toHaveLength(1);
        expect(after[0].id).toBe(before[0].id);
        expect(after[0].status).toBe('resolved');
        expect(after[0].resolved_at).not.toBeNull();
    });
    it('handles an existing event key when resolving an active anomaly', async () => {
        const anomalyType = 'preparation_delay';
        const actualReadyAt = '2026-11-02T11:30:00Z';

        await repository.recordResolvedAnomaly(
            tenant,
            shipmentId,
            anomalyType,
            { actualReadyAt, delayMinutes: 30 },
        );

        await repository.upsertAnomaly(
            tenant,
            shipmentId,
            anomalyType,
            { expectedReadyAt: '2026-11-02T11:00:00Z' },
        );

        await expect(
            repository.recordResolvedAnomaly(
                tenant,
                shipmentId,
                anomalyType,
                { actualReadyAt, delayMinutes: 30 },
            ),
        ).resolves.not.toThrow();

        const rows = await db.query<{ status: string }>(
            `SELECT status
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1
           AND anomaly_type = $2`,
            [shipmentId, anomalyType],
        );

        expect(rows).toHaveLength(2);
        expect(rows.every((row) => row.status === 'resolved')).toBe(true);
    });
    it('resolves preparation delay after supplier finishes late', async () => {
        const firstCheck = new Date('2026-11-02T13:00:00Z');
        const secondCheck = new Date('2026-11-02T13:35:00Z');

        // Preparation was expected by 12:00.
        await db.query(
            `UPDATE flow_ship_test_a.shipments
         SET ready_at = $2,
             status = 'created'
         WHERE id = $1`,
            [shipmentId, '2026-11-02T12:00:00Z'],
        );

        // First scan detects the delay.
        await monitoringService.monitorTenant(tenant, firstCheck);

        const before = await db.query<{
            id: string;
            status: string;
        }>(
            `SELECT id, status
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1
           AND anomaly_type = 'preparation_delay'`,
            [shipmentId],
        );

        expect(before).toHaveLength(1);
        expect(before[0].status).toBe('open');

        // Supplier finishes preparation at 13:30.
        await db.query(
            `INSERT INTO flow_ship_test_a.shipment_events
            (
                shipment_id,
                event_type,
                previous_status,
                new_status,
                occurred_at
            )
         VALUES ($1, $2, $3, $4, $5)`,
            [
                shipmentId,
                'status_changed',
                'created',
                'ready_for_pickup',
                '2026-11-02T13:30:00Z',
            ],
        );

        await db.query(
            `UPDATE flow_ship_test_a.shipments
         SET status = 'ready_for_pickup'
         WHERE id = $1`,
            [shipmentId],
        );

        // Second scan should resolve the existing anomaly.
        await monitoringService.monitorTenant(tenant, secondCheck);

        // Repeated scan must not create duplicates.
        await monitoringService.monitorTenant(tenant, secondCheck);

        const after = await db.query<{
            id: string;
            status: string;
            resolved_at: Date | null;
            event_key: string | null;
        }>(
            `SELECT id, status, resolved_at, event_key
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1
           AND anomaly_type = 'preparation_delay'`,
            [shipmentId],
        );

        expect(after).toHaveLength(1);
        expect(after[0].id).toBe(before[0].id);
        expect(after[0].status).toBe('resolved');
        expect(after[0].resolved_at).not.toBeNull();
        expect(after[0].event_key).not.toBeNull();
    });
    it('resolves delivery delay after shipment is delivered late', async () => {
        const firstCheck = new Date('2026-11-02T13:00:00Z');
        const secondCheck = new Date('2026-11-02T13:35:00Z');

        await db.query(
            `UPDATE flow_ship_test_a.shipments
         SET estimated_delivery_at = $2,
             status = 'in_transit'
         WHERE id = $1`,
            [shipmentId, '2026-11-02T12:00:00Z'],
        );

        await monitoringService.monitorTenant(tenant, firstCheck);

        const before = await db.query<{
            id: string;
            status: string;
        }>(
            `SELECT id, status
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1
           AND anomaly_type = 'delivery_delay'`,
            [shipmentId],
        );

        expect(before).toHaveLength(1);
        expect(before[0].status).toBe('open');

        await db.query(
            `UPDATE flow_ship_test_a.shipments
         SET status = 'delivered',
             delivered_at = $2
         WHERE id = $1`,
            [shipmentId, '2026-11-02T13:30:00Z'],
        );

        await monitoringService.monitorTenant(tenant, secondCheck);
        await monitoringService.monitorTenant(tenant, secondCheck);

        const after = await db.query<{
            id: string;
            status: string;
            resolved_at: Date | null;
            event_key: string | null;
        }>(
            `SELECT id, status, resolved_at, event_key
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1
           AND anomaly_type = 'delivery_delay'`,
            [shipmentId],
        );

        expect(after).toHaveLength(1);
        expect(after[0].id).toBe(before[0].id);
        expect(after[0].status).toBe('resolved');
        expect(after[0].resolved_at).not.toBeNull();
        expect(after[0].event_key).not.toBeNull();
    });
    it('resolves delivery delay when shipment fails', async () => {
        const firstCheck = new Date('2026-11-02T13:00:00Z');
        const secondCheck = new Date('2026-11-02T13:30:00Z');

        await db.query(
            `UPDATE flow_ship_test_a.shipments
         SET estimated_delivery_at = $2,
             status = 'in_transit'
         WHERE id = $1`,
            [shipmentId, '2026-11-02T12:00:00Z'],
        );

        await monitoringService.monitorTenant(tenant, firstCheck);

        const before = await db.query<{ status: string }>(
            `SELECT status
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1
           AND anomaly_type = 'delivery_delay'`,
            [shipmentId],
        );

        expect(before).toHaveLength(1);
        expect(before[0].status).toBe('open');

        await db.query(
            `UPDATE flow_ship_test_a.shipments
         SET status = 'failed',
             failed_at = $2,
             failure_reason = 'Integration test failure'
         WHERE id = $1`,
            [shipmentId, '2026-11-02T13:20:00Z'],
        );

        await monitoringService.monitorTenant(tenant, secondCheck);

        const after = await db.query<{
            status: string;
            resolved_at: Date | null;
        }>(
            `SELECT status, resolved_at
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1
           AND anomaly_type = 'delivery_delay'`,
            [shipmentId],
        );

        expect(after).toHaveLength(1);
        expect(after[0].status).toBe('resolved');
        expect(after[0].resolved_at).not.toBeNull();
    });
    it('resolves an active anomaly safely under concurrent calls', async () => {
        const actualReadyAt = '2026-11-02T13:30:00Z';

        await repository.upsertAnomaly(
            tenant,
            shipmentId,
            'preparation_delay',
            {
                deadline: '2026-11-02T12:00:00Z',
            },
        );

        const details = {
            deadline: '2026-11-02T12:00:00Z',
            actualReadyAt,
            delayMinutes: 90,
        };

        const results = await Promise.allSettled(
            Array.from({ length: 10 }, () =>
                repository.recordResolvedAnomaly(
                    tenant,
                    shipmentId,
                    'preparation_delay',
                    details,
                ),
            ),
        );

        expect(
            results.filter(result => result.status === 'rejected'),
        ).toHaveLength(0);

        const anomalies = await db.query<{
            status: string;
            event_key: string | null;
        }>(
            `SELECT status, event_key
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1
           AND anomaly_type = 'preparation_delay'`,
            [shipmentId],
        );

        expect(anomalies).toHaveLength(1);
        expect(anomalies[0].status).toBe('resolved');
        expect(anomalies[0].event_key).not.toBeNull();
    });
    it('runs scheduler against real tenants and persists anomaly', async () => {
        const readyAt = new Date(Date.now() - 60 * 60 * 1000);

        await db.query(
            `UPDATE flow_ship_test_a.shipments
         SET ready_at = $2,
             preparation_time_minutes = 30,
             status = 'created'
         WHERE id = $1`,
            [shipmentId, readyAt.toISOString()],
        );

        // Run the real scheduler method.
        await scheduler.runMonitoring();

        const anomalies = await db.query<{
            anomaly_type: string;
            status: string;
        }>(
            `SELECT anomaly_type, status
         FROM flow_ship_test_a.shipment_monitoring_anomalies
         WHERE shipment_id = $1
           AND anomaly_type = 'preparation_delay'`,
            [shipmentId],
        );

        expect(anomalies).toHaveLength(1);
        expect(anomalies[0].anomaly_type).toBe('preparation_delay');
        expect(anomalies[0].status).toBe('open');
    });
});
