
import { Injectable } from '@nestjs/common';
import type { CurrentTenant } from '../tenants/tenants.service';
import { ShipmentMonitoringRepository } from './shipment-monitoring.repository';

@Injectable()
export class ShipmentMonitoringService {
    private readonly missingUpdateThresholdMinutes = 120;

    constructor(
        private readonly repository: ShipmentMonitoringRepository,
    ) { }

    async monitorTenant(
        tenant: CurrentTenant,
        now: Date = new Date(),
    ): Promise<void> {
        const shipments =
            await this.repository.findShipmentsToMonitor(tenant);

        for (const shipment of shipments) {
            await this.monitorShipment(tenant, shipment, now);
        }
    }

    private async monitorShipment(
        tenant: CurrentTenant,
        shipment: Awaited<
            ReturnType<
                ShipmentMonitoringRepository['findShipmentsToMonitor']
            >
        >[number],
        now: Date,
    ): Promise<void> {
        const {
            id,
            status,
            created_at,
            ready_at,
            actual_ready_at,
            estimated_delivery_at,
            delivered_at,
            failed_at,
            last_status_update_at,
            source_confirmed_at,
        } = shipment;

        const terminal = status === 'delivered' || status === 'failed';
        const preparationCompleted = [
            'ready_for_pickup',
            'picked_up',
            'in_transit',
            'delivered',
        ].includes(status);


        // Preparation deadline exceeded.
        if (ready_at) {
            const deadline = new Date(ready_at).getTime();
            const actual = actual_ready_at
                ? new Date(actual_ready_at).getTime()
                : null;

            if (actual !== null) {
                if (actual > deadline) {
                    await this.repository.recordResolvedAnomaly(
                        tenant,
                        id,
                        'preparation_delay',
                        {
                            deadline: ready_at,
                            actualReadyAt: actual_ready_at,
                            delayMinutes: Math.ceil(
                                (actual - deadline) / 60_000,
                            ),
                            checkedAt: now.toISOString(),
                        },
                    );
                }

                await this.repository.resolveAnomaly(
                    tenant,
                    id,
                    'preparation_delay',
                );
            } else if (
                !preparationCompleted &&
                !terminal &&
                now.getTime() > deadline
            ) {
                await this.repository.upsertAnomaly(
                    tenant,
                    id,
                    'preparation_delay',
                    {
                        deadline: ready_at,
                        actualReadyAt: null,
                        checkedAt: now.toISOString(),
                    },
                );
            } else if (preparationCompleted || terminal) {
                await this.repository.resolveAnomaly(
                    tenant,
                    id,
                    'preparation_delay',
                );
            }

        }
        // Missing supplier status updates.
        if (source_confirmed_at) {
            const lastUpdate = Math.max(
                new Date(source_confirmed_at).getTime(),
                last_status_update_at
                    ? new Date(last_status_update_at).getTime()
                    : 0,
            );

            const elapsedMinutes =
                (now.getTime() - lastUpdate) / 60_000;

            if (terminal || elapsedMinutes <= this.missingUpdateThresholdMinutes) {
                await this.repository.resolveAnomaly(
                    tenant,
                    id,
                    'missing_status_update',
                );
            } else {
                await this.repository.upsertAnomaly(
                    tenant,
                    id,
                    'missing_status_update',
                    {
                        lastUpdateAt: new Date(lastUpdate).toISOString(),
                        elapsedMinutes: Math.floor(elapsedMinutes),
                        thresholdMinutes: this.missingUpdateThresholdMinutes,
                        checkedAt: now.toISOString(),
                    },
                );
            }
        }



        // Delivery ETA exceeded.
        if (estimated_delivery_at) {
            const deadline =
                new Date(estimated_delivery_at).getTime();

            const actual = delivered_at
                ? new Date(delivered_at).getTime()
                : null;

            if (actual !== null) {
                if (actual > deadline) {
                    const details = {
                        estimatedDeliveryAt: estimated_delivery_at,
                        deliveredAt: delivered_at,
                        delayMinutes: Math.ceil(
                            (actual - deadline) / 60_000,
                        ),
                        checkedAt: now.toISOString(),
                    };

                    await this.repository.recordResolvedAnomaly(
                        tenant,
                        id,
                        'delivery_delay',
                        details,
                    );
                }

                await this.repository.finalizeAnomaly(
                    tenant,
                    id,
                    'delivery_delay',
                    {
                        deliveredAt: delivered_at,
                        estimatedDeliveryAt: estimated_delivery_at,
                        delayMinutes: Math.max(
                            0,
                            Math.ceil(
                                (
                                    new Date(delivered_at!).getTime() -
                                    new Date(estimated_delivery_at!).getTime()
                                ) / 60_000,
                            ),
                        ),
                    },
                );
            } else if (!terminal && now.getTime() > deadline) {
                await this.repository.upsertAnomaly(
                    tenant,
                    id,
                    'delivery_delay',
                    {
                        estimatedDeliveryAt: estimated_delivery_at,
                        deliveredAt: null,
                        checkedAt: now.toISOString(),
                    },
                );

            } else if (terminal) {
                await this.repository.resolveAnomaly(
                    tenant,
                    id,
                    'delivery_delay',
                );
            }
        }

    }
}
