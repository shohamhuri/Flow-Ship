
import type { ShipmentMonitoringService } from './shipment-monitoring.service';
import type { SelfDeliveryPollingService } from './self-delivery-polling.service';
import type { TenantsService } from '../tenants/tenants.service';
import type { ShipmentMonitoringScheduler as SchedulerType } from './shipment-monitoring.scheduler';

jest.mock('@nestjs/schedule', () => ({
    Cron: () => () => undefined,
}));

const { ShipmentMonitoringScheduler } =
    jest.requireActual<typeof import('./shipment-monitoring.scheduler')>(
        './shipment-monitoring.scheduler',
    );
describe('ShipmentMonitoringScheduler', () => {
    const tenantA = {
        id: 'tenant-a',
        schemaName: 'flow_ship_test_a',
    };

    const tenantB = {
        id: 'tenant-b',
        schemaName: 'flow_ship_test_b',
    };

    let scheduler: SchedulerType; let tenantsService: {
        findAllActive: jest.Mock;
        isShipmentMonitoringReady: jest.Mock;
    };
    let monitoringService: {
        monitorTenant: jest.Mock;
    };
    let pollingService: {
        pollActiveShipments: jest.Mock;
    };

    beforeEach(() => {
        tenantsService = {
            findAllActive: jest.fn().mockResolvedValue([
                tenantA,
                tenantB,
            ]),
            isShipmentMonitoringReady: jest.fn()
                .mockResolvedValue(true),
        };

        monitoringService = {
            monitorTenant: jest.fn().mockResolvedValue(undefined),
        };

        pollingService = {
            pollActiveShipments: jest.fn().mockResolvedValue(undefined),
        };

        scheduler = new ShipmentMonitoringScheduler(
            tenantsService as unknown as TenantsService,
            monitoringService as unknown as ShipmentMonitoringService,
            pollingService as unknown as SelfDeliveryPollingService,
        );
    });

    it('monitors all active and ready tenants', async () => {
        await scheduler.runMonitoring();

        expect(monitoringService.monitorTenant)
            .toHaveBeenCalledTimes(2);

        expect(monitoringService.monitorTenant)
            .toHaveBeenCalledWith(tenantA);

        expect(monitoringService.monitorTenant)
            .toHaveBeenCalledWith(tenantB);

        expect(pollingService.pollActiveShipments)
            .toHaveBeenCalledTimes(2);

        expect(pollingService.pollActiveShipments)
            .toHaveBeenCalledWith(tenantA);

        expect(pollingService.pollActiveShipments)
            .toHaveBeenCalledWith(tenantB);
    });

    it('skips tenants with missing required tables', async () => {
        tenantsService.isShipmentMonitoringReady
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);

        await scheduler.runMonitoring();

        expect(monitoringService.monitorTenant)
            .toHaveBeenCalledTimes(1);

        expect(monitoringService.monitorTenant)
            .toHaveBeenCalledWith(tenantB);
    });

    it('continues monitoring after a tenant fails', async () => {
        monitoringService.monitorTenant
            .mockRejectedValueOnce(new Error('Database error'))
            .mockResolvedValueOnce(undefined);

        await scheduler.runMonitoring();

        expect(monitoringService.monitorTenant)
            .toHaveBeenCalledTimes(2);

        expect(monitoringService.monitorTenant)
            .toHaveBeenCalledWith(tenantB);
    });

    it('prevents overlapping monitoring runs', async () => {
        let releaseFirstRun!: () => void;

        monitoringService.monitorTenant.mockImplementationOnce(
            () => new Promise<void>((resolve) => {
                releaseFirstRun = resolve;
            }),
        );

        const firstRun = scheduler.runMonitoring();

        // Allow the first run to reach the monitoring call.
        await new Promise<void>((resolve) =>
            setImmediate(resolve),
        );

        // Second run must exit while the first is active.
        await scheduler.runMonitoring();

        expect(monitoringService.monitorTenant)
            .toHaveBeenCalledTimes(1);

        releaseFirstRun();
        await firstRun;

        expect(monitoringService.monitorTenant)
            .toHaveBeenCalledTimes(2);
    });
});
