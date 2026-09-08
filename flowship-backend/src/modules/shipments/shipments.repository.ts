import { Injectable } from '@nestjs/common';
import { DbService } from '../../infrastructure/database/db.service';
import { CurrentTenant } from '../tenants/tenants.service';

type CreateShipmentParams = {
    checkoutId: string;
    shipmentGroupId: string;

    selectedPlanId: string;
    selectedDeliveryOptionKey: string;

    providerId: string | null;

    carrierName: string;
    serviceName: string;
    providerCode?: string;
    adapterKey?: string;

    priceAgorot: number;
    currency: string;

    estimatedDeliveryDays: number;

    pickup: Record<string, unknown>;
    dropoff: Record<string, unknown>;
};
export interface CreateShipmentData {
    checkoutId: string;
    orderId: string;
    shipmentGroupId: string;

    selectedPlanId: string;
    selectedDeliveryOptionKey: string;

    providerId?: string;
    providerCode?: string;
    adapterKey?: string;

    carrierName: string;
    serviceName: string;

    price: number;
    currency: string;
    estimatedDeliveryDays: number;

    status: string;
}
export interface ShipmentStatusSummary {
    checkoutId: string;
    totalShipments: number;
    deliveredShipments: number;
    failedShipments: number;
    activeShipments: number;
}
@Injectable()
export class ShipmentsRepository {
    constructor(
        private readonly db: DbService,
    ) { }

    async createShipment(
        tenant: CurrentTenant,
        shipment: CreateShipmentData,
    ): Promise<string> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        const rows = await this.db.query<{
            id: string;
        }>(
            `
        INSERT INTO "${schemaName}".shipments
        (
            checkout_id,
            order_id,
            shipment_group_id,

            selected_plan_id,
            selected_delivery_option_key,

            provider_id,
            provider_code,
            adapter_key,

            carrier_name,
            service_name,

            price,
            currency,
            estimated_delivery_days,

            status
        )
        VALUES
        (
            $1, $2, $3,
            $4, $5,
            $6, $7, $8,
            $9, $10,
            $11, $12, $13,
            $14
        )
        RETURNING id
        `,
            [
                shipment.checkoutId,
                shipment.orderId,
                shipment.shipmentGroupId,

                shipment.selectedPlanId,
                shipment.selectedDeliveryOptionKey,

                shipment.providerId ?? null,
                shipment.providerCode,
                shipment.adapterKey,

                shipment.carrierName,
                shipment.serviceName,

                shipment.price,
                shipment.currency,
                shipment.estimatedDeliveryDays,

                shipment.status,
            ],
        );

        const createdShipment = rows[0];

        if (!createdShipment) {
            throw new Error(
                'Shipment was not created: database returned no id',
            );
        }

        return createdShipment.id;
    }
    async createShipmentStops(
        tenant: CurrentTenant,
        shipmentId: string,
        pickupAddresses: Record<string, unknown>[],
        dropoffAddress: Record<string, unknown>,
    ): Promise<void> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        let stopOrder = 1;

        for (const pickupAddress of pickupAddresses) {
            await this.db.query(
                `
            INSERT INTO "${schemaName}".shipment_stops
            (
                shipment_id,
                stop_order,
                stop_type,
                address
            )
            VALUES
            (
                $1,
                $2,
                'pickup',
                $3::jsonb
            )
            `,
                [
                    shipmentId,
                    stopOrder,
                    JSON.stringify(pickupAddress),
                ],
            );

            stopOrder++;
        }

        await this.db.query(
            `
        INSERT INTO "${schemaName}".shipment_stops
        (
            shipment_id,
            stop_order,
            stop_type,
            address
        )
        VALUES
        (
            $1,
            $2,
            'dropoff',
            $3::jsonb
        )
        `,
            [
                shipmentId,
                stopOrder,
                JSON.stringify(dropoffAddress),
            ],
        );
    }
    private safeSchemaName(
        schemaName: string,
    ): string {

        if (
            !/^[a-zA-Z0-9_]+$/.test(schemaName)
        ) {
            throw new Error(
                `Invalid schema name: ${schemaName}`,
            );
        }

        return schemaName;
    }
    async markDelivered(
        tenant: CurrentTenant,
        shipmentId: string,
        deliveredAt: Date = new Date(),
    ): Promise<void> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        await this.db.query(
            `
    update "${schemaName}".shipments
    set
      status = 'delivered',
      delivered_at = $1,
      failed_at = null,
      failure_reason = null,
      updated_at = now()
    where id = $2
    `,
            [
                deliveredAt,
                shipmentId,
            ],
        );
    }

    async markFailed(
        tenant: CurrentTenant,
        shipmentId: string,
        failureReason: string,
        failedAt: Date = new Date(),
    ): Promise<void> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        await this.db.query(
            `
    update "${schemaName}".shipments
    set
      status = 'failed',
      failed_at = $1,
      failure_reason = $2,
      delivered_at = null,
      updated_at = now()
    where id = $3
    `,
            [
                failedAt,
                failureReason,
                shipmentId,
            ],
        );
    }

    async markDropoffCompleted(
        tenant: CurrentTenant,
        shipmentId: string,
        completedAt: Date = new Date(),
    ): Promise<void> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        await this.db.query(
            `
    update "${schemaName}".shipment_stops
    set
      status = 'completed',
      arrived_at = coalesce(arrived_at, $1),
      completed_at = $1
    where shipment_id = $2
      and stop_type = 'dropoff'
    `,
            [
                completedAt,
                shipmentId,
            ],
        );
    }

    async markPickupCompleted(
        tenant: CurrentTenant,
        shipmentId: string,
        stopOrder: number,
        completedAt: Date = new Date(),
    ): Promise<void> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        await this.db.query(
            `
        update "${schemaName}".shipment_stops
        set
            status = 'completed',
            arrived_at = coalesce(arrived_at, $1),
            completed_at = $1
        where shipment_id = $2
          and stop_order = $3
          and stop_type = 'pickup'
        `,
            [
                completedAt,
                shipmentId,
                stopOrder,
            ],
        );
    }
    async areAllPickupsCompleted(
        tenant: CurrentTenant,
        shipmentId: string,
    ): Promise<boolean> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        const rows = await this.db.query<{
            remaining_count: string | number;
        }>(
            `
        select count(*) as remaining_count
        from "${schemaName}".shipment_stops
        where shipment_id = $1
          and stop_type = 'pickup'
          and coalesce(status, '') <> 'completed'
        `,
            [shipmentId],
        );

        return Number(
            rows[0]?.remaining_count ?? 0,
        ) === 0;
    }
    async updateStatus(
        tenant: CurrentTenant,
        shipmentId: string,
        status: string,
    ): Promise<void> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        await this.db.query(
            `
    update "${schemaName}".shipments
    set
      status = $1,
      updated_at = now()
    where id = $2
    `,
            [
                status,
                shipmentId,
            ],
        );
    }
    async findCheckoutIdByShipmentId(
        tenant: CurrentTenant,
        shipmentId: string,
    ): Promise<string | null> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        const rows = await this.db.query<{
            checkout_id: string | null;
        }>(
            `
    select checkout_id
    from "${schemaName}".shipments
    where id = $1
    limit 1
    `,
            [shipmentId],
        );

        return rows[0]?.checkout_id ?? null;
    }
    async getShipmentStatusSummary(
        tenant: CurrentTenant,
        checkoutId: string,
    ): Promise<ShipmentStatusSummary | null> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        const rows = await this.db.query<{
            checkout_id: string;
            total_shipments: string | number;
            delivered_shipments: string | number;
            failed_shipments: string | number;
            active_shipments: string | number;
        }>(
            `
    select
      checkout_id,

      count(*) as total_shipments,

      count(*) filter (
        where status = 'delivered'
      ) as delivered_shipments,

      count(*) filter (
        where status = 'failed'
      ) as failed_shipments,

      count(*) filter (
        where status not in (
          'delivered',
          'failed'
        )
      ) as active_shipments

    from "${schemaName}".shipments

    where checkout_id = $1

    group by checkout_id
    `,
            [checkoutId],
        );

        const row = rows[0];

        if (!row) {
            return null;
        }

        return {
            checkoutId: row.checkout_id,
            totalShipments:
                Number(row.total_shipments),

            deliveredShipments:
                Number(row.delivered_shipments),

            failedShipments:
                Number(row.failed_shipments),

            activeShipments:
                Number(row.active_shipments),
        };
    }
    async updateCheckoutStatus(
        tenant: CurrentTenant,
        checkoutId: string,
        status: string,
    ): Promise<void> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        const rows = await this.db.query<{
            id: string;
        }>(
            `
    update "${schemaName}".checkouts
    set
      status = $1,
      updated_at = now()
    where id = $2
    returning id
    `,
            [
                status,
                checkoutId,
            ],
        );

        if (!rows[0]) {
            throw new Error(
                `Checkout not found: ${checkoutId}`,
            );
        }
    }
}