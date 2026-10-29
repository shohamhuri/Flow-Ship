import { Injectable } from '@nestjs/common';
import {
    DbService,
    DbTransaction,
} from '../../infrastructure/database/db.service'; import { CurrentTenant } from '../tenants/tenants.service';
type DbExecutor = Pick<
    DbTransaction,
    'query' | 'queryOne'
>;
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

    // Additional shipment tracking fields
    preparationTimeMinutes?: number | null;
    estimatedDeliveryAt?: string | null;
    externalShipmentId?: string | null;

    status: string;
    metadata?: {
        sourceId: string;
        deliveryMethod?: 'carrier' | 'self_delivery';
        vehicleIndex: number;
        vehicleType?: 'scooter' | 'car' | 'commercial';
        assignedWeightKg?: number;
        items?: Array<{
            sku: string;
            quantity: number;
            unitWeightKg: number;
        }>;
    };
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
        executor: DbExecutor = this.db,
    ): Promise<string> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        const rows =
            await executor.query<{
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
preparation_time_minutes,
estimated_delivery_at,
external_shipment_id,

status,
metadata
        )
        VALUES
        (
            $1, $2, $3,
            $4, $5,
            $6, $7, $8,
            $9, $10,
          $11, $12, $13,
$14, $15, $16,
$17, $18::jsonb
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

                    shipment.preparationTimeMinutes ?? null,
                    shipment.estimatedDeliveryAt ?? null,
                    shipment.externalShipmentId ?? null,

                    shipment.status,
                    JSON.stringify(shipment.metadata ?? {}),
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
        executor: DbExecutor = this.db,
    ): Promise<void> {
        if (pickupAddresses.length !== 1) {
            throw new Error(
                `Shipment ${shipmentId} must have exactly one pickup; received ${pickupAddresses.length}`,
            );
        }

        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        let stopOrder = 1;

        for (const pickupAddress of pickupAddresses) {
            await executor.query(`            INSERT INTO "${schemaName}".shipment_stops
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

        await executor.query(`        INSERT INTO "${schemaName}".shipment_stops
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
        tx?: DbTransaction,
    ): Promise<string | null> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);


        const rows = await (tx ?? this.db).query<{
            previous_status: string;
        }>(
            `
    WITH previous AS MATERIALIZED (
        SELECT id, status
        FROM "${schemaName}".shipments
        WHERE id = $2
        FOR UPDATE
    )
    UPDATE "${schemaName}".shipments AS s
    SET status = 'delivered',
        delivered_at = COALESCE(s.delivered_at, $1),
        failed_at = NULL,
        failure_reason = NULL,
        updated_at = now()
    FROM previous
    WHERE s.id = previous.id
      AND previous.status NOT IN ('delivered', 'failed')
    RETURNING previous.status AS previous_status
    `,
            [deliveredAt, shipmentId],
        );

        return rows[0]?.previous_status ?? null;

    }

    async markFailed(
        tenant: CurrentTenant,
        shipmentId: string,
        failureReason: string,
        failedAt: Date = new Date(),
        tx?: DbTransaction,
    ): Promise<string | null> {

        const schemaName =
            this.safeSchemaName(tenant.schemaName);
        const rows = await (tx ?? this.db).query<{
            previous_status: string;
        }>(
            `
    WITH previous AS MATERIALIZED (
        SELECT id, status
        FROM "${schemaName}".shipments
        WHERE id = $3
        FOR UPDATE
    )
    UPDATE "${schemaName}".shipments AS s
    SET status = 'failed',
        failed_at = COALESCE(s.failed_at, $1),
        failure_reason = $2,
        delivered_at = NULL,
        updated_at = now()
    FROM previous
    WHERE s.id = previous.id
      AND previous.status NOT IN ('delivered', 'failed')
    RETURNING previous.status AS previous_status
    `,
            [failedAt, failureReason, shipmentId],
        );

        return rows[0]?.previous_status ?? null;

    }

    async markDropoffCompleted(
        tenant: CurrentTenant,
        shipmentId: string,
        completedAt: Date = new Date(),
        tx?: DbTransaction,
    ): Promise<void> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        await (tx ?? this.db).query(`
    update "${schemaName}".shipment_stops
set
  status = 'completed',
  arrived_at = coalesce(arrived_at, $1),
  completed_at = coalesce(completed_at, $1)
where shipment_id = $2
  and stop_type = 'dropoff'
  and exists (
    select 1
    from "${schemaName}".shipments s
    where s.id = $2
      and s.status not in ('delivered', 'failed')
  )
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
        tx?: DbTransaction,
    ): Promise<void> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        await (tx ?? this.db).query(`
        update "${schemaName}".shipment_stops
        set
           status = 'completed',
    arrived_at = coalesce(arrived_at, $1),
    completed_at = coalesce(completed_at, $1)
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
        tx?: DbTransaction,
    ): Promise<boolean> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        const rows = await (tx ?? this.db).query<{
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
        tx?: DbTransaction,
    ): Promise<string | null> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);


        const rows = await (tx ?? this.db).query<{
            previous_status: string;
        }>(
            `
    WITH previous AS (
        SELECT id, status
        FROM "${schemaName}".shipments
        WHERE id = $2
        FOR UPDATE
    )
    UPDATE "${schemaName}".shipments AS s
    SET
        status = $1,
        updated_at = now()
    FROM previous
    WHERE s.id = previous.id
      AND (
          (previous.status IN ('created', 'pending')
              AND $1 = 'picked_up')
          OR
          (previous.status IN ('created', 'pending', 'picked_up')
              AND $1 = 'in_transit')
      )
    RETURNING previous.status AS previous_status
    `,
            [status, shipmentId],
        );

        return rows[0]?.previous_status ?? null;

    }
    async findCheckoutIdByShipmentId(
        tenant: CurrentTenant,
        shipmentId: string,
        tx?: DbTransaction,
    ): Promise<string | null> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        const rows = await (tx ?? this.db).query<{
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
        tx?: DbTransaction,

    ): Promise<ShipmentStatusSummary | null> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        const rows = await (tx ?? this.db).query<{
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
        tx?: DbTransaction,
    ): Promise<void> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);
        const rows = await (tx ?? this.db).query<{
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

    async findSelfDeliveryShipmentsByCheckoutId(
        tenant: CurrentTenant,
        checkoutId: string,
    ): Promise<Array<{
        id: string;
        order_id: string;
        checkout_id: string;
        selected_plan_id: string;
        metadata: {
            sourceId: string;
            deliveryMethod: 'self_delivery';
            items: Array<{
                sku: string;
                quantity: number;
                unitWeightKg?: number;
            }>;
        };
    }>> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        return this.db.query(
            `
        SELECT
            id,
            order_id,
            checkout_id,
            selected_plan_id,
            metadata
        FROM "${schemaName}".shipments
        WHERE checkout_id = $1
          AND metadata->>'deliveryMethod' = 'self_delivery'
        ORDER BY id
        `,
            [checkoutId],
        );
    }

    async recordShipmentEvent(
        tenant: CurrentTenant,
        event: {
            shipmentId: string;
            eventType: string;
            previousStatus?: string | null;
            newStatus?: string | null;
            occurredAt: Date;
            sourceId?: string | null;
            externalEventId?: string | null;
            errorCode?: string | null;
            errorMessage?: string | null;
            metadata?: Record<string, unknown>;
        },
        tx: DbTransaction,
    ): Promise<void> {
        const schema = this.safeSchemaName(tenant.schemaName);

        await tx.query(
            `
        INSERT INTO "${schema}".shipment_events (
            shipment_id,
            event_type,
            previous_status,
            new_status,
            occurred_at,
            source_id,
            external_event_id,
            error_code,
            error_message,
            metadata
        )
        VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10::jsonb
        )
        ON CONFLICT DO NOTHING
        `,
            [
                event.shipmentId,
                event.eventType,
                event.previousStatus ?? null,
                event.newStatus ?? null,
                event.occurredAt,
                event.sourceId ?? null,
                event.externalEventId ?? null,
                event.errorCode ?? null,
                event.errorMessage ?? null,
                JSON.stringify(event.metadata ?? {}),
            ],
        );
    }

}