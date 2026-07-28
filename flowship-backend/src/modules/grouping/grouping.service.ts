import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { Checkout } from '../checkout/interfaces/checkout.interface';
import { ItemSourceAssignment } from '../planning/interfaces/shipment-plan.interface';
import { ItemSourcingResult } from '../sourcing/interfaces/source-ranking.interface';
import { RankedSupplySource } from '../sourcing/interfaces/source-ranking.interface';

import { GroupingRulesService } from './grouping-rules.service';
import { GroupingResult } from './interfaces/grouping-result.interface';
import {
    ShipmentGroup,
    ShipmentGroupItem,
} from './interfaces/shipment-group.interface';

interface ItemSourceSelection {
    itemIndex: number;
    selectedSource: RankedSupplySource | null;
}

@Injectable()
export class GroupingService {
    constructor(
        private readonly groupingRulesService: GroupingRulesService,
    ) { }

    /**
     * הזרימה הישנה:
     * משתמשת במקור הראשי שנבחר על ידי ה-Sourcing.
     *
     * נשאיר אותה כרגע כדי לא לשבור את CheckoutService.
     */
    groupCheckout(
        checkout: Checkout,
        sourcingResults: ItemSourcingResult[],
    ): GroupingResult {
        const sourceSelections: ItemSourceSelection[] =
            checkout.items.map((item, itemIndex) => {
                /*
                 * כרגע ItemSourcingResult אינו כולל itemIndex,
                 * ולכן לצורך תאימות לזרימה הקיימת אנחנו מחפשים לפי SKU.
                 *
                 * מנגנון התוכניות החדש לא ישתמש בחיפוש הזה.
                 */
                const sourcingResult = sourcingResults.find(
                    (result) => result.sku === item.sku,
                );

                return {
                    itemIndex,
                    selectedSource:
                        sourcingResult?.selectedSource ?? null,
                };
            });

        return this.buildGroupingResult(
            checkout,
            sourceSelections,
        );
    }

    /**
     * הזרימה החדשה:
     * יוצרת Shipment Groups עבור תוכנית משלוחים מסוימת.
     *
     * בכל תוכנית יכול להיבחר מקור שונה לכל פריט.
     */
    groupShipmentPlan(
        checkout: Checkout,
        assignments: ItemSourceAssignment[],
    ): GroupingResult {
        const sourceSelections: ItemSourceSelection[] =
            assignments.map((assignment) => ({
                itemIndex: assignment.itemIndex,
                selectedSource: assignment.selectedSource,
            }));

        return this.buildGroupingResult(
            checkout,
            sourceSelections,
        );
    }

    /**
     * לוגיקת הקיבוץ המשותפת לשתי הזרימות.
     */
    private buildGroupingResult(
        checkout: Checkout,
        sourceSelections: ItemSourceSelection[],
    ): GroupingResult {
        const groupsByKey = new Map<string, ShipmentGroup>();

        const ungroupedItems: GroupingResult['ungroupedItems'] =
            [];

        for (
            let itemIndex = 0;
            itemIndex < checkout.items.length;
            itemIndex++
        ) {
            const item = checkout.items[itemIndex];

            const sourceSelection = sourceSelections.find(
                (selection) =>
                    selection.itemIndex === itemIndex,
            );

            if (!sourceSelection) {
                ungroupedItems.push({
                    sku: item.sku,
                    name: item.name,
                    quantity: item.quantity,
                    reasons: [
                        'SOURCE_ASSIGNMENT_NOT_FOUND',
                    ],
                });

                continue;
            }

            const selectedSource =
                sourceSelection.selectedSource;

            if (!selectedSource) {
                ungroupedItems.push({
                    sku: item.sku,
                    name: item.name,
                    quantity: item.quantity,
                    reasons: [
                        'NO_SUPPLY_SOURCE_SELECTED',
                    ],
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

            const shipmentItem: ShipmentGroupItem = {
                sku: item.sku,
                name: item.name,
                quantity: item.quantity,
                unitWeight: item.unitWeight ?? 0,
                unitPrice: item.unitPrice ?? 0,
                supplierId: item.supplierId,
                category: item.category,
            };

            const existingGroup =
                groupsByKey.get(groupingKey);

            if (existingGroup) {
                if (
                    item.category &&
                    !existingGroup.categories.includes(
                        item.category,
                    )
                ) {
                    existingGroup.categories.push(
                        item.category,
                    );
                }

                existingGroup.items.push(shipmentItem);

                existingGroup.totalItems += item.quantity;

                existingGroup.totalWeight +=
                    item.quantity *
                    (item.unitWeight ?? 0);

                existingGroup.totalPrice +=
                    item.quantity *
                    (item.unitPrice ?? 0);

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
                    item.quantity *
                    (item.unitWeight ?? 0),

                totalPrice:
                    item.quantity *
                    (item.unitPrice ?? 0),

                groupingReasons: [
                    'SAME_SUPPLY_SOURCE',
                    'SAME_SUPPLIER',
                    'COMPATIBLE_HANDLING_GROUP',
                ],
            });
        }

        const shipmentGroups = Array.from(
            groupsByKey.values(),
        ).map((group) => ({
            ...group,
            totalWeight: Number(
                group.totalWeight.toFixed(3),
            ),
            totalPrice: Number(
                group.totalPrice.toFixed(2),
            ),
        }));

        const splitReasons =
            this.buildSplitReasons(shipmentGroups);

        return {
            orderId: checkout.orderId,
            shipmentGroups,
            ungroupedItems,

            totalGroups: shipmentGroups.length,

            totalGroupedItems: shipmentGroups.reduce(
                (total, group) =>
                    total + group.totalItems,
                0,
            ),

            hasUngroupedItems:
                ungroupedItems.length > 0,

            splitReasons,
        };
    }

    private buildSplitReasons(
        shipmentGroups: ShipmentGroup[],
    ): string[] {
        if (shipmentGroups.length <= 1) {
            return [];
        }

        const reasons = new Set<string>();

        const sourceIds = new Set(
            shipmentGroups.map(
                (group) => group.source.id,
            ),
        );

        const supplierIds = new Set(
            shipmentGroups.map(
                (group) =>
                    group.supplierId ??
                    'NO_SUPPLIER',
            ),
        );

        const handlingGroups = new Set(
            shipmentGroups.map(
                (group) => group.handlingGroup,
            ),
        );

        if (sourceIds.size > 1) {
            reasons.add(
                'DIFFERENT_SUPPLY_SOURCES',
            );
        }

        if (supplierIds.size > 1) {
            reasons.add('DIFFERENT_SUPPLIERS');
        }

        if (handlingGroups.size > 1) {
            reasons.add(
                'INCOMPATIBLE_HANDLING_GROUPS',
            );
        }

        return Array.from(reasons);
    }
}