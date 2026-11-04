import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TenantsService } from '../tenants/tenants.service';
import { ShipmentMonitoringService } from './shipment-monitoring.service';

@Injectable()
export class ShipmentMonitoringScheduler {
    private readonly logger = new Logger(ShipmentMonitoringScheduler.name);
    private running = false;

    constructor(
        private readonly tenantsService: TenantsService,
        private readonly monitoringService: ShipmentMonitoringService,
    ) { }

    @Cron('0 */5 * * * *', {
        name: 'shipment-monitoring',
        waitForCompletion: true,
    })
    async runMonitoring(): Promise<void> {
        if (this.running) {
            this.logger.warn('Previous monitoring run is still active');
            return;
        }

        this.running = true;

        try {
            const tenants = await this.tenantsService.findAllActive();

            for (const tenant of tenants) {
                try {
                    const ready =
                        await this.tenantsService.isShipmentMonitoringReady(tenant);

                    if (!ready) {
                        this.logger.warn(
                            `Skipping shipment monitoring for tenant ${tenant.schemaName}: required tables are missing`,
                        );
                        continue;
                    }

                    await this.monitoringService.monitorTenant(tenant);
                } catch (error) {
                    this.logger.error(
                        `Monitoring failed for tenant ${tenant.id}`,
                        error instanceof Error ? error.stack : String(error),
                    );
                }
            }
        } catch (error) {
            this.logger.error(
                'Failed to load tenants for shipment monitoring',
                error instanceof Error ? error.stack : String(error),
            );
        } finally {
            this.running = false;
        }
    }
}
