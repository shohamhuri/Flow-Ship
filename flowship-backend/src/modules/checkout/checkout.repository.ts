import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { DbService } from '../../infrastructure/database/db.service';
import { CurrentTenant } from '../tenants/tenants.service';
import { Checkout } from './interfaces/checkout.interface';

export interface CheckoutListRow {
    id: string;
    orderId: string;
    storeId: string | null;
    platform: string;
    status: string;
    totalItems: number;
    totalPrice: number;
    destination: {
        country?: string;
        city?: string;
        street?: string;
        houseNumber?: string;
        postalCode?: string;
    } | null;
    createdAt: Date;
    updatedAt: Date | null;
}
export interface CheckoutDetailsItem {
    id: string;
    sku: string;
    name: string;
    quantity: number;
    unitWeight: number | null;
    unitPrice: number | null;
    supplierId: string | null;
    category: string | null;
}

export interface CheckoutShipmentGroupItem {
    checkoutItemId: string;
    sku: string;
    quantity: number;
    unitWeight: number | null;
    unitPrice: number | null;
    category: string | null;
}

export interface CheckoutShipmentGroup {
    id: string;
    sourceId: string;
    sourceName: string;
    sourceType: string;
    supplierId: string | null;
    handlingGroup: string | null;
    totalItems: number;
    totalWeight: number;
    totalPrice: number;
    groupingReasons: unknown;
    status: string;
    items: CheckoutShipmentGroupItem[];
}

export interface CheckoutShipmentStop {
    id: string;
    stopOrder: number;
    stopType: string;
    address: Record<string, unknown>;
}

export interface CheckoutShipment {
    id: string;
    shipmentGroupId: string;
    orderId: string;
    selectedPlanId: string;
    selectedDeliveryOptionKey: string;
    providerId: string | null;
    providerCode: string | null;
    adapterKey: string | null;
    carrierName: string;
    serviceName: string;
    price: number;
    currency: string;
    estimatedDeliveryDays: number;
    status: string;
    createdAt: Date;
    updatedAt: Date | null;
    stops: CheckoutShipmentStop[];
}

export interface CheckoutDetails {
    id: string;
    orderId: string;
    storeId: string | null;
    platform: string;
    status: string;
    customer: unknown;
    destination: Record<string, unknown> | null;
    groupingSplitReasons: string[];
    totalItems: number;
    totalPrice: number;
    createdAt: Date;
    updatedAt: Date | null;

    items: CheckoutDetailsItem[];
    shipmentGroups: CheckoutShipmentGroup[];
    shipments: CheckoutShipment[];
}
@Injectable()
export class CheckoutRepository {
    constructor(
        private readonly databaseService: DbService,
    ) { }

    async saveCheckout(
        tenant: CurrentTenant,
        checkout: Checkout,
        platform = 'manual',
    ): Promise<string> {
        const checkoutId = randomUUID();

        await this.databaseService.query(
            `
            insert into ${tenant.schemaName}.checkouts (
                id,
                store_id,
                platform,
                external_checkout_id,
                external_order_id,
                customer,
                cart,
                destination,
                raw_payload,
                status
            )
            values (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6::jsonb,
                $7::jsonb,
                $8::jsonb,
                $9::jsonb,
                $10
            )
            `,
            [
                checkoutId,
                null,
                platform,
                checkout.orderId,
                checkout.orderId,
                JSON.stringify({}),
                JSON.stringify(checkout.items),
                JSON.stringify(checkout.destination),
                JSON.stringify(checkout),
                'processing',
            ],
        );

        return checkoutId;
    }

    async saveCheckoutItems(
        tenant: CurrentTenant,
        checkoutId: string,
        checkout: Checkout,
    ): Promise<Map<string, string>> {
        const itemIdsBySku = new Map<string, string>();

        for (const item of checkout.items) {
            const itemId = randomUUID();

            await this.databaseService.query(
                `
                insert into ${tenant.schemaName}.checkout_items (
                    id,
                    checkout_id,
                    sku,
                    name,
                    quantity,
                    unit_weight,
                    unit_price,
                    supplier_id,
                    category,
                    raw_payload
                )
                values (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9,
                    $10::jsonb
                )
                `,
                [
                    itemId,
                    checkoutId,
                    item.sku,
                    item.name,
                    item.quantity,
                    item.unitWeight ?? null,
                    item.unitPrice ?? null,
                    item.supplierId ?? null,
                    item.category ?? null,
                    JSON.stringify(item),
                ],
            );

            itemIdsBySku.set(item.sku, itemId);
        }

        return itemIdsBySku;
    }
    async getCheckouts(
        tenant: CurrentTenant,
    ): Promise<CheckoutListRow[]> {
        const result = await this.databaseService.query(
            `
        select
            id,
            external_order_id,
            store_id,
            platform,
            status,
            destination,
            raw_payload,
            created_at,
            updated_at
        from ${tenant.schemaName}.checkouts
        order by created_at desc
        `,
        );

        return result.map((row) => {
            const rawPayload =
                typeof row.raw_payload === 'string'
                    ? JSON.parse(row.raw_payload)
                    : row.raw_payload;

            const destination =
                typeof row.destination === 'string'
                    ? JSON.parse(row.destination)
                    : row.destination;

            return {
                id: row.id,
                orderId: row.external_order_id,
                storeId: row.store_id,
                platform: row.platform,
                status: row.status,

                totalItems:
                    rawPayload?.totalItems ??
                    rawPayload?.items?.reduce(
                        (
                            total: number,
                            item: { quantity?: number },
                        ) => total + (item.quantity ?? 0),
                        0,
                    ) ??
                    0,

                totalPrice:
                    rawPayload?.totalPrice ??
                    rawPayload?.items?.reduce(
                        (
                            total: number,
                            item: {
                                unitPrice?: number;
                                quantity?: number;
                            },
                        ) =>
                            total +
                            (item.unitPrice ?? 0) *
                            (item.quantity ?? 0),
                        0,
                    ) ??
                    0,

                destination,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            };
        });
    }
    async getCheckoutById(
        tenant: CurrentTenant,
        checkoutId: string,
    ): Promise<CheckoutDetails | null> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        const checkoutRows = await this.databaseService.query<{
            id: string;
            external_order_id: string;
            store_id: string | null;
            platform: string;
            status: string;
            customer: unknown;
            destination: Record<string, unknown> | null;
            raw_payload: {
                totalItems?: number;
                totalPrice?: number;
                items?: Array<{
                    quantity?: number;
                    unitPrice?: number;
                    price?: number;
                }>;
            } | null;
            created_at: Date;
            updated_at: Date | null;
            grouping_split_reasons: string[];
        }>(
            `
        select
            id,
            external_order_id,
            store_id,
            platform,
            status,
            customer,
            destination,
            raw_payload,
            created_at,
            updated_at,
            grouping_split_reasons
        from "${schemaName}".checkouts
        where id = $1
        limit 1
        `,
            [checkoutId],
        );

        const checkoutRow = checkoutRows[0];

        if (!checkoutRow) {
            return null;
        }

        const itemRows = await this.databaseService.query<{
            id: string;
            sku: string;
            name: string;
            quantity: number;
            unit_weight: number | null;
            unit_price: number | null;
            supplier_id: string | null;
            category: string | null;
        }>(
            `
        select
            id,
            sku,
            name,
            quantity,
            unit_weight,
            unit_price,
            supplier_id,
            category
        from "${schemaName}".checkout_items
        where checkout_id = $1
        order by sku asc
        `,
            [checkoutId],
        );

        const shipmentGroupRows =
            await this.databaseService.query<{
                id: string;
                source_id: string;
                source_name: string;
                source_type: string;
                supplier_id: string | null;
                handling_group: string | null;
                total_items: number;
                total_weight: number;
                total_price: number;
                grouping_reasons: unknown;
                status: string;
            }>(
                `
            select
                id,
                source_id,
                source_name,
                source_type,
                supplier_id,
                handling_group,
                total_items,
                total_weight,
                total_price,
                grouping_reasons,
                status
            from "${schemaName}".shipment_groups
            where checkout_id = $1
            order by id asc
            `,
                [checkoutId],
            );

        const shipmentGroupItemRows =
            await this.databaseService.query<{
                shipment_group_id: string;
                checkout_item_id: string;
                sku: string;
                quantity: number;
                unit_weight: number | null;
                unit_price: number | null;
                category: string | null;
            }>(
                `
            select
                sgi.shipment_group_id,
                sgi.checkout_item_id,
                sgi.sku,
                sgi.quantity,
                sgi.unit_weight,
                sgi.unit_price,
                sgi.category
            from "${schemaName}".shipment_group_items sgi
            inner join "${schemaName}".shipment_groups sg
                on sg.id = sgi.shipment_group_id
            where sg.checkout_id = $1
            order by
                sgi.shipment_group_id asc,
                sgi.sku asc
            `,
                [checkoutId],
            );

        const shipmentRows =
            await this.databaseService.query<{
                id: string;
                shipment_group_id: string;
                order_id: string;
                selected_plan_id: string;
                selected_delivery_option_key: string;
                provider_id: string | null;
                provider_code: string | null;
                adapter_key: string | null;
                carrier_name: string;
                service_name: string;
                price: number;
                currency: string;
                estimated_delivery_days: number;
                status: string;
                created_at: Date;
                updated_at: Date | null;
            }>(
                `
            select
                id,
                shipment_group_id,
                order_id,
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
                status,
                created_at,
                updated_at
            from "${schemaName}".shipments
            where checkout_id = $1
            order by created_at asc
            `,
                [checkoutId],
            );

        const shipmentStopRows =
            await this.databaseService.query<{
                id: string;
                shipment_id: string;
                stop_order: number;
                stop_type: string;
                address: Record<string, unknown>;
            }>(
                `
            select
                ss.id,
                ss.shipment_id,
                ss.stop_order,
                ss.stop_type,
                ss.address
            from "${schemaName}".shipment_stops ss
            inner join "${schemaName}".shipments s
                on s.id = ss.shipment_id
            where s.checkout_id = $1
            order by
                ss.shipment_id asc,
                ss.stop_order asc
            `,
                [checkoutId],
            );

        const rawPayload =
            checkoutRow.raw_payload ?? {};

        const totalItems =
            rawPayload.totalItems ??
            rawPayload.items?.reduce(
                (total, item) =>
                    total + (item.quantity ?? 0),
                0,
            ) ??
            0;

        const totalPrice =
            rawPayload.totalPrice ??
            rawPayload.items?.reduce(
                (total, item) =>
                    total +
                    (item.unitPrice ?? item.price ?? 0) *
                    (item.quantity ?? 0),
                0,
            ) ??
            0;

        return {
            id: checkoutRow.id,
            orderId: checkoutRow.external_order_id,
            storeId: checkoutRow.store_id,
            platform: checkoutRow.platform,
            status: checkoutRow.status,
            customer: checkoutRow.customer,
            destination: checkoutRow.destination,
            groupingSplitReasons:
                checkoutRow.grouping_split_reasons ?? [],
            totalItems,
            totalPrice,
            createdAt: checkoutRow.created_at,
            updatedAt: checkoutRow.updated_at,

            items: itemRows.map((item) => ({
                id: item.id,
                sku: item.sku,
                name: item.name,
                quantity: item.quantity,
                unitWeight: item.unit_weight,
                unitPrice: item.unit_price,
                supplierId: item.supplier_id,
                category: item.category,
            })),

            shipmentGroups: shipmentGroupRows.map(
                (group) => ({
                    id: group.id,
                    sourceId: group.source_id,
                    sourceName: group.source_name,
                    sourceType: group.source_type,
                    supplierId: group.supplier_id,
                    handlingGroup: group.handling_group,
                    totalItems: group.total_items,
                    totalWeight: group.total_weight,
                    totalPrice: group.total_price,
                    groupingReasons:
                        group.grouping_reasons,
                    status: group.status,

                    items: shipmentGroupItemRows
                        .filter(
                            (item) =>
                                item.shipment_group_id ===
                                group.id,
                        )
                        .map((item) => ({
                            checkoutItemId:
                                item.checkout_item_id,
                            sku: item.sku,
                            quantity: item.quantity,
                            unitWeight: item.unit_weight,
                            unitPrice: item.unit_price,
                            category: item.category,
                        })),
                }),
            ),

            shipments: shipmentRows.map(
                (shipment) => ({
                    id: shipment.id,
                    shipmentGroupId:
                        shipment.shipment_group_id,
                    orderId: shipment.order_id,
                    selectedPlanId:
                        shipment.selected_plan_id,
                    selectedDeliveryOptionKey:
                        shipment
                            .selected_delivery_option_key,
                    providerId: shipment.provider_id,
                    providerCode: shipment.provider_code,
                    adapterKey: shipment.adapter_key,
                    carrierName: shipment.carrier_name,
                    serviceName: shipment.service_name,
                    price: shipment.price,
                    currency: shipment.currency,
                    estimatedDeliveryDays:
                        shipment.estimated_delivery_days,
                    status: shipment.status,
                    createdAt: shipment.created_at,
                    updatedAt: shipment.updated_at,

                    stops: shipmentStopRows
                        .filter(
                            (stop) =>
                                stop.shipment_id ===
                                shipment.id,
                        )
                        .map((stop) => ({
                            id: stop.id,
                            stopOrder: stop.stop_order,
                            stopType: stop.stop_type,
                            address: stop.address,
                        })),
                }),
            ),
        };
    }
    async updateStatus(
        tenant: CurrentTenant,
        checkoutId: string,
        status: string,
    ): Promise<void> {
        await this.databaseService.query(
            `
            update ${tenant.schemaName}.checkouts
            set
                status = $1,
                updated_at = now()
            where id = $2
            `,
            [status, checkoutId],
        );
    }
    private safeSchemaName(
        schemaName: string,
    ): string {
        if (!/^[a-zA-Z0-9_]+$/.test(schemaName)) {
            throw new Error(
                `Invalid schema name: ${schemaName}`,
            );
        }

        return schemaName;
    }
    async updateGroupingSplitReasons(
        tenant: CurrentTenant,
        checkoutId: string,
        splitReasons: string[],
    ): Promise<void> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        const rows = await this.databaseService.query<{
            id: string;
        }>(
            `
    update "${schemaName}".checkouts
    set
      grouping_split_reasons = $1::jsonb,
      updated_at = now()
    where id = $2
    returning id
    `,
            [
                JSON.stringify(splitReasons),
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