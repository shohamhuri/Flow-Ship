
import { ShipmentMonitoringService } from './shipment-monitoring.service';
import { ShipmentMonitoringRepository } from './shipment-monitoring.repository';
import type { CurrentTenant } from '../tenants/tenants.service';

describe('ShipmentMonitoringService', () => {
    const tenant = {
        id: 'tenant-a',
        schemaName: 'flow_ship_test_a',
    } as CurrentTenant;

    const now = new Date('2026-11-04T12:00:00.000Z');

    let service: ShipmentMonitoringService;
    let repository: {
        findShipmentsToMonitor: jest.Mock;
        upsertAnomaly: jest.Mock;
        resolveAnomaly: jest.Mock;
        recordResolvedAnomaly: jest.Mock;
        finalizeAnomaly: jest.Mock;
    };

    const shipment = (overrides = {}) => ({
        id: 'shipment-1',
        status: 'preparing',
        created_at: '2026-11-04T08:00:00.000Z',
        ready_at: null,
        actual_ready_at: null,
        estimated_delivery_at: null,
        delivered_at: null,
        failed_at: null,
        last_status_update_at: null,
        source_confirmed_at: null,
        ...overrides,
    });

    beforeEach(() => {
        repository = {
            findShipmentsToMonitor: jest.fn(),
            upsertAnomaly: jest.fn(),
            resolveAnomaly: jest.fn(),
            recordResolvedAnomaly: jest.fn(),
            finalizeAnomaly: jest.fn(),
        };

        service = new ShipmentMonitoringService(
            repository as unknown as ShipmentMonitoringRepository,
        );
    });

    it('detects preparation delay after ready_at', async () => {
        repository.findShipmentsToMonitor.mockResolvedValue([
            shipment({
                ready_at: '2026-11-04T11:30:00.000Z',
            }),
        ]);

        await service.monitorTenant(tenant, now);

        expect(repository.upsertAnomaly).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            'preparation_delay',
            expect.objectContaining({
                actualReadyAt: null,
            }),
        );
    });

    it('detects missing status update after 120 minutes', async () => {
        repository.findShipmentsToMonitor.mockResolvedValue([
            shipment({
                source_confirmed_at: '2026-11-04T09:00:00.000Z',
            }),
        ]);

        await service.monitorTenant(tenant, now);

        expect(repository.upsertAnomaly).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            'missing_status_update',
            expect.objectContaining({
                elapsedMinutes: 180,
                thresholdMinutes: 120,
            }),
        );
    });

    it('detects delivery delay after ETA', async () => {
        repository.findShipmentsToMonitor.mockResolvedValue([
            shipment({
                estimated_delivery_at: '2026-11-04T11:00:00.000Z',
            }),
        ]);

        await service.monitorTenant(tenant, now);

        expect(repository.upsertAnomaly).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            'delivery_delay',
            expect.any(Object),
        );
    });

    it('records historical preparation delay after late readiness', async () => {
        repository.findShipmentsToMonitor.mockResolvedValue([
            shipment({
                status: 'ready_for_pickup',
                ready_at: '2026-11-04T10:00:00.000Z',
                actual_ready_at: '2026-11-04T10:25:00.000Z',
            }),
        ]);

        await service.monitorTenant(tenant, now);

        expect(repository.recordResolvedAnomaly).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            'preparation_delay',
            expect.objectContaining({
                delayMinutes: 25,
            }),
        );

        expect(repository.resolveAnomaly).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            'preparation_delay',
        );
    });

    it('records historical delivery delay after late delivery', async () => {
        repository.findShipmentsToMonitor.mockResolvedValue([
            shipment({
                status: 'delivered',
                estimated_delivery_at: '2026-11-04T10:00:00.000Z',
                delivered_at: '2026-11-04T10:40:00.000Z',
            }),
        ]);

        await service.monitorTenant(tenant, now);

        expect(repository.recordResolvedAnomaly).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            'delivery_delay',
            expect.objectContaining({
                delayMinutes: 40,
            }),
        );

        expect(repository.finalizeAnomaly).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            'delivery_delay',
            expect.objectContaining({
                delayMinutes: 40,
            }),
        );
    });

    it('resolves missing update anomaly after a recent update', async () => {
        repository.findShipmentsToMonitor.mockResolvedValue([
            shipment({
                source_confirmed_at: '2026-11-04T08:00:00.000Z',
                last_status_update_at: '2026-11-04T11:30:00.000Z',
            }),
        ]);

        await service.monitorTenant(tenant, now);

        expect(repository.resolveAnomaly).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            'missing_status_update',
        );
    });
});
