import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { DbService } from '../../infrastructure/database/db.service';
import { CurrentTenant } from '../tenants/tenants.service';
import { Checkout } from './interfaces/checkout.interface';

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
}