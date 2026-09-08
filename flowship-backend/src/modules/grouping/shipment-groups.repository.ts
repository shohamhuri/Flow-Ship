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

            // 1. שמירת קבוצת המשלוח
            await this.databaseService.query(
                `
                insert into ${tenant.schemaName}.shipment_groups (
                    id,
                    checkout_id,
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
                    $7::jsonb,
                    $8
                )
                `,
                [
                    group.groupId,
                    checkoutId,
                    group.handlingGroup,
                    group.totalItems,
                    group.totalWeight,
                    group.totalPrice,
                    JSON.stringify(group.groupingReasons),
                    'planned',
                ],
            );

            // 2. שמירת כל מקורות האיסוף של הקבוצה
            for (const source of group.sources) {
                await this.databaseService.query(
                    `
                    insert into ${tenant.schemaName}.shipment_group_sources (
                        shipment_group_id,
                        source_id,
                        source_name,
                        source_type
                    )
                    values ($1, $2, $3, $4)
                    `,
                    [
                        group.groupId,
                        source.id,
                        source.name,
                        source.type,
                    ],
                );
            }

            // 3. שמירת הפריטים והמקור של כל פריט
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
                        category,
                        source_id
                    )
                    values ($1, $2, $3, $4, $5, $6, $7, $8)
                    `,
                    [
                        group.groupId,
                        checkoutItemId,
                        item.sku,
                        item.quantity,
                        item.unitWeight,
                        item.unitPrice,
                        item.category ?? null,
                        item.sourceId,
                    ],
                );
            }
        }
    }
}