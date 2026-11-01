import {
    BadRequestException,
    Injectable,
} from '@nestjs/common';
import {
    SelfDeliveryFulfillmentRepository,

} from './self-delivery-fulfillment.repository';
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
import {
    SelfDeliveryTrackingStatus, SelfDeliveryTrackingUpdate
} from '../sourcing/interfaces/self-delivery-provider.interface';
@Injectable()
export class ShipmentStatusService {
    constructor(
        private readonly shipmentsRepository: ShipmentsRepository,
        private readonly db: DbService,
        private readonly selfDeliveryFulfillmentRepository:
            SelfDeliveryFulfillmentRepository,
    ) { }
    private mapSelfDeliveryStatus(
        status: SelfDeliveryTrackingStatus,
    ): string {
        switch (status) {
            case 'preparing':
                return 'preparing';

            case 'ready_for_pickup':
                return 'ready_for_pickup';

            case 'out_for_delivery':
                return 'in_transit';

            case 'delivered':
                return 'delivered';

            case 'failed':
                return 'failed';

            default:
                throw new BadRequestException(
                    'Unsupported self-delivery status',
                );
        }
    }
    private isValidSelfDeliveryTransition(
        previousStatus: string,
        newStatus: string,
    ): boolean {
        const progress: Record<string, number> = {
            created: 0,
            pending: 0,
            preparing: 1,
            ready_for_pickup: 2,
            picked_up: 3,
            in_transit: 3,
            delivered: 4,
        };

        if (
            previousStatus === 'delivered' ||
            previousStatus === 'failed'
        ) {
            return false;
        }

        if (newStatus === 'failed') {
            return previousStatus in progress;
        }

        const previousRank = progress[previousStatus];
        const newRank = progress[newStatus];

        return (
            previousRank !== undefined &&
            newRank !== undefined &&
            newRank > previousRank
        );
    }
    async processSelfDeliveryUpdate(
        tenant: CurrentTenant,
        update: SelfDeliveryTrackingUpdate,
    ): Promise<'processed' | 'duplicate' | 'ignored'> {
        const sourceId = update.sourceId?.trim();
        const sourceOrderId = update.sourceOrderId?.trim();
        const externalEventId = update.externalEventId?.trim();

        if (!sourceId || !sourceOrderId || !externalEventId) {
            throw new BadRequestException(
                'Missing supplier tracking identifiers',
            );
        }

        const occurredAt = new Date(update.occurredAt);

        if (Number.isNaN(occurredAt.getTime())) {
            throw new BadRequestException(
                'Invalid supplier event timestamp',
            );
        }

        const newStatus = this.mapSelfDeliveryStatus(
            update.status,
        );

        if (
            newStatus === 'failed' &&
            !update.reason?.trim()
        ) {
            throw new BadRequestException(
                'Failure reason is required',
            );
        }

        return this.db.transaction(async (tx) => {
            const fulfillment =
                await this.selfDeliveryFulfillmentRepository
                    .findBySourceOrderId(
                        tenant,
                        sourceId,
                        sourceOrderId,
                        tx,
                    );

            if (!fulfillment) {
                throw new BadRequestException(
                    'Supplier order not found',
                );
            }

            const shipmentId = fulfillment.shipment_id;

            const previousStatus =
                await this.shipmentsRepository
                    .lockShipmentForUpdate(
                        tenant,
                        shipmentId,
                        tx,
                    );

            if (previousStatus === null) {
                throw new BadRequestException(
                    'Shipment not found',
                );
            }

            const duplicate =
                await this.shipmentsRepository
                    .hasExternalShipmentEvent(
                        tenant,
                        sourceId,
                        externalEventId,
                        tx,
                    );

            if (duplicate) {
                return 'duplicate';
            }

            const latestEventTime =
                await this.shipmentsRepository.getLatestSupplierEventTime(
                    tenant,
                    shipmentId,
                    sourceId,
                    tx,
                );

            if (
                latestEventTime !== null &&
                occurredAt.getTime() <= latestEventTime.getTime()
            ) {
                return 'ignored';
            }

            if (
                !this.isValidSelfDeliveryTransition(
                    previousStatus,
                    newStatus,
                )
            ) {
                return 'ignored';
            }
            const eventType =
                update.status === 'out_for_delivery'
                    ? 'IN_TRANSIT'
                    : update.status.toUpperCase();

            const inserted =
                await this.shipmentsRepository.recordShipmentEvent(
                    tenant,
                    {
                        shipmentId,
                        eventType,
                        previousStatus,
                        newStatus,
                        occurredAt,
                        sourceId,
                        externalEventId,
                        errorMessage: update.reason?.trim() ?? null,
                    },
                    tx,
                );

            if (!inserted) {
                return 'duplicate';
            }

            let updatedPreviousStatus: string | null;

            if (newStatus === 'delivered') {
                await this.shipmentsRepository.markDropoffCompleted(
                    tenant,
                    shipmentId,
                    occurredAt,
                    tx,
                );

                updatedPreviousStatus =
                    await this.shipmentsRepository.markDelivered(
                        tenant,
                        shipmentId,
                        occurredAt,
                        tx,
                    );
            } else if (newStatus === 'failed') {
                updatedPreviousStatus =
                    await this.shipmentsRepository.markFailed(
                        tenant,
                        shipmentId,
                        update.reason!.trim(),
                        occurredAt,
                        tx,
                    );
            } else {
                updatedPreviousStatus =
                    await this.shipmentsRepository.updateStatus(
                        tenant,
                        shipmentId,
                        newStatus,
                        tx,
                    );
            }

            if (updatedPreviousStatus === null) {
                throw new BadRequestException(
                    'Shipment status transition was rejected',
                );
            }

            await this.synchronizeCheckoutStatus(
                tenant,
                shipmentId,
                tx,
            );

            return 'processed';
        });
    }
    async markPreparationStatus(
        tenant: CurrentTenant,
        shipmentId: string,
        status: 'preparing' | 'ready_for_pickup',
        occurredAt: Date = new Date(),
    ): Promise<void> {
        await this.db.transaction(async (tx) => {
            const previousStatus =
                await this.shipmentsRepository.updateStatus(
                    tenant,
                    shipmentId,
                    status,
                    tx,
                );

            if (previousStatus !== null) {
                await this.shipmentsRepository.recordShipmentEvent(
                    tenant,
                    {
                        shipmentId,
                        eventType:
                            status === 'preparing'
                                ? 'PREPARING'
                                : 'READY_FOR_PICKUP',
                        previousStatus,
                        newStatus: status,
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
            case ShipmentEventType.PREPARING:
            case ShipmentEventType.READY_FOR_PICKUP:
                await this.markPreparationStatus(
                    tenant,
                    dto.shipmentId,
                    dto.event,
                    occurredAt,
                );
                return;
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
                    occurredAt,
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