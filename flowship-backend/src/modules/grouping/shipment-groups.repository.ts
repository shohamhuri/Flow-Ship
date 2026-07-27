import { Injectable } from '@nestjs/common';

import { DbService } from '../../infrastructure/database/db.service';
import { CurrentTenant } from '../tenants/tenants.service';
import { GroupingResult } from './interfaces/grouping-result.interface';

@Injectable()
export class ShipmentGroupsRepository {
    constructor(
        private readonly databaseService: DbService,
    ) { }

    async saveGroupingResult(
        tenant: CurrentTenant,
        checkoutId: string,
        grouping: GroupingResult,
        checkoutItemIdsBySku: Map<string, string>,
    ): Promise<void> {
        for (const group of grouping.shipmentGroups) {
            await this.databaseService.query(
                `
                insert into ${tenant.schemaName}.shipment_groups (
                    id,
                    checkout_id,
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
                    $10,
                    $11::jsonb,
                    $12
                )
                `,
                [
                    group.groupId,
                    checkoutId,
                    group.source.id,
                    group.source.name,
                    group.source.type,
                    group.supplierId ?? null,
                    group.handlingGroup,
                    group.totalItems,
                    group.totalWeight,
                    group.totalPrice,
                    JSON.stringify(group.groupingReasons),
                    'planned',
                ],
            );

            for (const item of group.items) {
                const checkoutItemId =
                    checkoutItemIdsBySku.get(item.sku);

                if (!checkoutItemId) {
                    throw new Error(
                        `Checkout item id not found for SKU ${item.sku}`,
                    );
                }

                await this.databaseService.query(
                    `
                    insert into ${tenant.schemaName}.shipment_group_items (
                        shipment_group_id,
                        checkout_item_id,
                        sku,
                        quantity,
                        unit_weight,
                        unit_price,
                        category
                    )
                    values ($1, $2, $3, $4, $5, $6, $7)
                    `,
                    [
                        group.groupId,
                        checkoutItemId,
                        item.sku,
                        item.quantity,
                        item.unitWeight,
                        item.unitPrice,
                        item.category ?? null,
                    ],
                );
            }
        }
    }
}