import {
    BadRequestException,
    Injectable,
} from '@nestjs/common';

import {
    DbService,
    DbTransaction,
} from '../../infrastructure/database/db.service';
import {
    CurrentTenant,
} from '../tenants/tenants.service';

import {
    ShipmentEventDto,
    ShipmentEventType,
} from './dto/shipment-event.dto';

import {
    ShipmentsRepository,
} from './shipments.repository';

@Injectable()
export class ShipmentStatusService {
    constructor(
        private readonly shipmentsRepository:
            ShipmentsRepository,
        private readonly db: DbService,
    ) { }

    async markPickedUp(
        tenant: CurrentTenant,
        shipmentId: string,
        stopOrder: number,
        occurredAt: Date = new Date(),
    ): Promise<void> {
        await this.db.transaction(async (tx) => {
            await this.shipmentsRepository.markPickupCompleted(
                tenant,
                shipmentId,
                stopOrder,
                occurredAt,
                tx,
            );

            const allPickupsCompleted =
                await this.shipmentsRepository.areAllPickupsCompleted(
                    tenant,
                    shipmentId,
                    tx,
                );

            if (allPickupsCompleted) {
                const previousStatus =
                    await this.shipmentsRepository.updateStatus(
                        tenant,
                        shipmentId,
                        'picked_up',
                        tx,
                    );

                if (previousStatus !== null) {
                    await this.shipmentsRepository.recordShipmentEvent(
                        tenant,
                        {
                            shipmentId,
                            eventType: 'PICKED_UP',
                            previousStatus,
                            newStatus: 'picked_up',
                            occurredAt,
                        },
                        tx,
                    );
                }
            }

            await this.synchronizeCheckoutStatus(
                tenant,
                shipmentId,
                tx,
            );
        });
    }


    async markInTransit(
        tenant: CurrentTenant,
        shipmentId: string,
        occurredAt: Date = new Date(),
    ): Promise<void> {
        await this.db.transaction(async (tx) => {
            const previousStatus =
                await this.shipmentsRepository.updateStatus(
                    tenant,
                    shipmentId,
                    'in_transit',
                    tx,
                );

            if (previousStatus !== null) {
                await this.shipmentsRepository.recordShipmentEvent(
                    tenant,
                    {
                        shipmentId,
                        eventType: 'IN_TRANSIT',
                        previousStatus,
                        newStatus: 'in_transit',
                        occurredAt,
                    },
                    tx,
                );
            }

            await this.synchronizeCheckoutStatus(
                tenant,
                shipmentId,
                tx,
            );
        });
    }



    async markDelivered(
        tenant: CurrentTenant,
        shipmentId: string,
        occurredAt: Date = new Date(),
    ): Promise<void> {
        await this.db.transaction(async (tx) => {
            // Complete the single dropoff before setting terminal status
            await this.shipmentsRepository.markDropoffCompleted(
                tenant,
                shipmentId,
                occurredAt,
                tx,
            );

            const previousStatus =
                await this.shipmentsRepository.markDelivered(
                    tenant,
                    shipmentId,
                    occurredAt,
                    tx,
                );

            if (previousStatus !== null) {
                await this.shipmentsRepository.recordShipmentEvent(
                    tenant,
                    {
                        shipmentId,
                        eventType: 'DELIVERED',
                        previousStatus,
                        newStatus: 'delivered',
                        occurredAt,
                    },
                    tx,
                );
            }

            await this.synchronizeCheckoutStatus(
                tenant,
                shipmentId,
                tx,
            );
        });
    }

    async markFailed(
        tenant: CurrentTenant,
        shipmentId: string,
        reason: string,
        occurredAt: Date = new Date(),
    ): Promise<void> {
        const normalizedReason = reason.trim();

        if (!normalizedReason) {
            throw new BadRequestException(
                'Failure reason is required',
            );
        }

        await this.db.transaction(async (tx) => {
            const previousStatus =
                await this.shipmentsRepository.markFailed(
                    tenant,
                    shipmentId,
                    normalizedReason,
                    occurredAt,
                    tx,
                );

            if (previousStatus !== null) {
                await this.shipmentsRepository.recordShipmentEvent(
                    tenant,
                    {
                        shipmentId,
                        eventType: 'FAILED',
                        previousStatus,
                        newStatus: 'failed',
                        occurredAt,
                        errorMessage: normalizedReason,
                    },
                    tx,
                );
            }

            await this.synchronizeCheckoutStatus(
                tenant,
                shipmentId,
                tx,
            );
        });
    }

    async handleEvent(
        tenant: CurrentTenant,
        dto: ShipmentEventDto,
    ): Promise<void> {
        const occurredAt = dto.occurredAt
            ? new Date(dto.occurredAt)
            : new Date();

        if (Number.isNaN(occurredAt.getTime())) {
            throw new BadRequestException(
                'occurredAt must be a valid date',
            );
        }

        switch (dto.event) {
            case ShipmentEventType.PICKED_UP:
                if (dto.stopOrder === undefined) {
                    throw new BadRequestException(
                        'stopOrder is required for pickup events',
                    );
                }

                await this.markPickedUp(
                    tenant,
                    dto.shipmentId,
                    dto.stopOrder,
                    occurredAt,
                );

                return;
            case ShipmentEventType.IN_TRANSIT:
                await this.markInTransit(
                    tenant,
                    dto.shipmentId,
                );
                return;

            case ShipmentEventType.DELIVERED:
                await this.markDelivered(
                    tenant,
                    dto.shipmentId,
                    occurredAt,
                );
                return;

            case ShipmentEventType.FAILED:
                if (!dto.reason?.trim()) {
                    throw new BadRequestException(
                        'Failure reason is required for failed shipment events',
                    );
                }

                await this.markFailed(
                    tenant,
                    dto.shipmentId,
                    dto.reason,
                    occurredAt,
                );
                return;

            default:
                throw new BadRequestException(
                    'Unsupported shipment event',
                );
        }
    }

    private async synchronizeCheckoutStatus(
        tenant: CurrentTenant,
        shipmentId: string,
        tx?: DbTransaction,
    ): Promise<void> {
        const checkoutId =
            await this.shipmentsRepository
                .findCheckoutIdByShipmentId(
                    tenant,
                    shipmentId,
                    tx,

                );

        if (!checkoutId) {
            throw new Error(
                `Checkout was not found for shipment: ${shipmentId}`,
            );
        }

        const summary =
            await this.shipmentsRepository
                .getShipmentStatusSummary(
                    tenant,
                    checkoutId,
                    tx,


                );

        if (
            !summary ||
            summary.totalShipments === 0
        ) {
            return;
        }

        let checkoutStatus: string;

        if (
            summary.deliveredShipments ===
            summary.totalShipments
        ) {
            checkoutStatus = 'delivered';
        } else if (
            summary.failedShipments > 0 &&
            summary.deliveredShipments > 0
        ) {
            checkoutStatus = 'partially_failed';
        } else if (
            summary.failedShipments > 0
        ) {
            checkoutStatus = 'failed';
        } else if (
            summary.deliveredShipments > 0
        ) {
            checkoutStatus = 'partially_delivered';
        } else {
            checkoutStatus = 'processing';
        }

        await this.shipmentsRepository
            .updateCheckoutStatus(
                tenant,
                checkoutId,
                checkoutStatus,
                tx,

            );
    }
}