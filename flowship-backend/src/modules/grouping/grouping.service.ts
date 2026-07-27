import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { Checkout } from '../checkout/interfaces/checkout.interface';
import { ItemSourcingResult } from '../sourcing/interfaces/source-ranking.interface';

import { GroupingResult } from './interfaces/grouping-result.interface';
import {
    ShipmentGroup,
    ShipmentGroupItem,
} from './interfaces/shipment-group.interface';
import { GroupingRulesService } from './grouping-rules.service';

@Injectable()
export class GroupingService {
    groupCheckout(
        checkout: Checkout,
        sourcingResults: ItemSourcingResult[],
    ): GroupingResult {

        const groupsByKey = new Map<string, ShipmentGroup>();

        const ungroupedItems: GroupingResult['ungroupedItems'] = [];

        for (const item of checkout.items) {
            const sourcingResult = sourcingResults.find(
                (result) => result.sku === item.sku,
            );

            if (!sourcingResult) {
                ungroupedItems.push({
                    sku: item.sku,
                    name: item.name,
                    quantity: item.quantity,
                    reasons: ['SOURCING_RESULT_NOT_FOUND'],
                });

                continue;
            }

            const selectedSource = sourcingResult.selectedSource;

            if (!selectedSource) {
                ungroupedItems.push({
                    sku: item.sku,
                    name: item.name,
                    quantity: item.quantity,
                    reasons: ['NO_SUPPLY_SOURCE_SELECTED'],
                });

                continue;
            }

            const source = selectedSource.source;

            const handlingGroup =
                this.groupingRulesService.getHandlingGroup(
                    item.category,
                );

            const groupingKey = [
                source.id,
                item.supplierId ?? 'NO_SUPPLIER',
                handlingGroup,
            ].join('::');

            const existingGroup = groupsByKey.get(groupingKey);

            const shipmentItem: ShipmentGroupItem = {
                sku: item.sku,
                name: item.name,
                quantity: item.quantity,
                unitWeight: item.unitWeight ?? 0,
                unitPrice: item.unitPrice ?? 0,
                supplierId: item.supplierId,
                category: item.category,
            };

            if (existingGroup) {
                if (
                    item.category &&
                    !existingGroup.categories.includes(item.category)
                ) {
                    existingGroup.categories.push(item.category);
                }
                existingGroup.items.push(shipmentItem);

                existingGroup.totalItems += item.quantity;

                existingGroup.totalWeight +=
                    item.quantity * (item.unitWeight ?? 0);

                existingGroup.totalPrice +=
                    item.quantity * (item.unitPrice ?? 0);

                continue;
            }

            groupsByKey.set(groupingKey, {
                groupId: randomUUID(),

                source,

                supplierId: item.supplierId,
                categories: item.category
                    ? [item.category]
                    : [],
                handlingGroup,
                items: [shipmentItem],

                totalItems: item.quantity,

                totalWeight:
                    item.quantity * (item.unitWeight ?? 0),

                totalPrice:
                    item.quantity * (item.unitPrice ?? 0),

                groupingReasons: [
                    'SAME_SUPPLY_SOURCE',
                    'SAME_SUPPLIER',
                    'COMPATIBLE_HANDLING_GROUP',
                ],
            });
        }

        const shipmentGroups = Array.from(groupsByKey.values()).map(
            (group) => ({
                ...group,
                totalWeight: Number(group.totalWeight.toFixed(3)),
                totalPrice: Number(group.totalPrice.toFixed(2)),
            }),
        );
        const splitReasons = this.buildSplitReasons(shipmentGroups);

        return {
            orderId: checkout.orderId,
            shipmentGroups,
            ungroupedItems,
            totalGroups: shipmentGroups.length,
            totalGroupedItems: shipmentGroups.reduce(
                (total, group) => total + group.totalItems,
                0,
            ),
            hasUngroupedItems: ungroupedItems.length > 0,
            splitReasons,
        };
    }
    constructor(
        private readonly groupingRulesService: GroupingRulesService,
    ) { }
    private buildSplitReasons(
        shipmentGroups: ShipmentGroup[],
    ): string[] {
        if (shipmentGroups.length <= 1) {
            return [];
        }

        const reasons = new Set<string>();

        const sourceIds = new Set(
            shipmentGroups.map((group) => group.source.id),
        );

        const supplierIds = new Set(
            shipmentGroups.map(
                (group) => group.supplierId ?? 'NO_SUPPLIER',
            ),
        );

        const handlingGroups = new Set(
            shipmentGroups.map((group) => group.handlingGroup),
        );

        if (sourceIds.size > 1) {
            reasons.add('DIFFERENT_SUPPLY_SOURCES');
        }

        if (supplierIds.size > 1) {
            reasons.add('DIFFERENT_SUPPLIERS');
        }

        if (handlingGroups.size > 1) {
            reasons.add('INCOMPATIBLE_HANDLING_GROUPS');
        }

        return Array.from(reasons);
    }
}