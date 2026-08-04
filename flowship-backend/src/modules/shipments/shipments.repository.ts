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
        pickupAddress: Record<string, unknown>,
        dropoffAddress: Record<string, unknown>,
    ): Promise<void> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

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
            ($1, 1, 'pickup', $2::jsonb),
            ($1, 2, 'dropoff', $3::jsonb)
        `,
            [
                shipmentId,
                JSON.stringify(pickupAddress),
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
}