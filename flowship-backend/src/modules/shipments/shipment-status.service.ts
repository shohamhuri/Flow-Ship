import {
    BadRequestException,
    Injectable,
} from '@nestjs/common';


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


    ) { }

    async markPickedUp(
        tenant: CurrentTenant,
        shipmentId: string,
        occurredAt: Date = new Date(),
    ): Promise<void> {
        await this.shipmentsRepository.updateStatus(
            tenant,
            shipmentId,
            'picked_up',
        );

        await this.shipmentsRepository.markPickupCompleted(
            tenant,
            shipmentId,
            occurredAt,
        );

        await this.synchronizeCheckoutStatus(
            tenant,
            shipmentId,
        );
    }

    async markInTransit(
        tenant: CurrentTenant,
        shipmentId: string,
    ): Promise<void> {
        await this.shipmentsRepository.updateStatus(
            tenant,
            shipmentId,
            'in_transit',
        );

        await this.synchronizeCheckoutStatus(
            tenant,
            shipmentId,
        );
    }

    async markDelivered(
        tenant: CurrentTenant,
        shipmentId: string,
        occurredAt: Date = new Date(),
    ): Promise<void> {
        await this.shipmentsRepository.markDropoffCompleted(
            tenant,
            shipmentId,
            occurredAt,
        );

        await this.shipmentsRepository.markDelivered(
            tenant,
            shipmentId,
            occurredAt,
        );

        await this.synchronizeCheckoutStatus(
            tenant,
            shipmentId,
        );
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

        await this.shipmentsRepository.markFailed(
            tenant,
            shipmentId,
            normalizedReason,
            occurredAt,
        );

        await this.synchronizeCheckoutStatus(
            tenant,
            shipmentId,
        );
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
                await this.markPickedUp(
                    tenant,
                    dto.shipmentId,
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
    ): Promise<void> {
        const checkoutId =
            await this.shipmentsRepository
                .findCheckoutIdByShipmentId(
                    tenant,
                    shipmentId,
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
            );
    }
}