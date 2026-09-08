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
import {
    GroupingStrategySetting,
} from './interfaces/grouping-strategy-setting.interface';

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
        strategies: GroupingStrategySetting[] = [],
    ): GroupingResult {
        const sourceSelections: ItemSourceSelection[] =
            assignments.map((assignment) => ({
                itemIndex: assignment.itemIndex,
                selectedSource: assignment.selectedSource,
            }));
        return this.buildGroupingResult(
            checkout,
            sourceSelections,
            strategies,
        );
    }

    /**
     * לוגיקת הקיבוץ המשותפת לשתי הזרימות.
     */
    private buildGroupingResult(
        checkout: Checkout,
        sourceSelections: ItemSourceSelection[],
        strategies: GroupingStrategySetting[] = [],
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

            const groupingKey = handlingGroup;
            const shipmentItem: ShipmentGroupItem = {
                sku: item.sku,
                name: item.name,
                quantity: item.quantity,
                unitWeight: item.unitWeight ?? 0,
                unitPrice: item.unitPrice ?? 0,

                sourceId: source.id,

                supplierId: item.supplierId,
                category: item.category,
            };
            const existingGroup =
                groupsByKey.get(groupingKey);

            if (existingGroup) {
                if (
                    !existingGroup.sources.some(
                        (existingSource) =>
                            existingSource.id === source.id,
                    )
                ) {
                    existingGroup.sources.push(source);
                }
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

                sources: [source],

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
                    'COMPATIBLE_HANDLING_GROUP',
                ],
            });
        }

        const initialShipmentGroups = Array.from(
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

        const shipmentGroups =
            this.applyGroupingStrategies(
                initialShipmentGroups,
                strategies,
            );
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

        const handlingGroups = new Set(
            shipmentGroups.map(
                (group) => group.handlingGroup,
            ),
        );

        if (handlingGroups.size > 1) {
            reasons.add(
                'INCOMPATIBLE_HANDLING_GROUPS',
            );
        }

        return Array.from(reasons);
    }
    private applyGroupingStrategies(
        initialGroups: ShipmentGroup[],
        strategies: GroupingStrategySetting[],
    ): ShipmentGroup[] {
        let currentGroups = initialGroups;

        for (const strategy of strategies) {
            switch (strategy.strategyKey) {
                case 'group_by_source':
                    /*
                     * הקיבוץ לפי מקור כבר מתבצע בשלב יצירת
                     * groupsByKey, ולכן אין צורך לבצע אותו שוב.
                     */
                    break;

                case 'split_by_max_weight':
                    currentGroups =
                        this.splitGroupsByMaxWeight(
                            currentGroups,
                            strategy.config.maxWeightKg!,
                        );
                    break;

                case 'split_by_max_items':
                    currentGroups =
                        this.splitGroupsByMaxItems(
                            currentGroups,
                            strategy.config.maxItems!,
                        );
                    break;
            }
        }

        return currentGroups;
    }

    private splitGroupsByMaxWeight(
        groups: ShipmentGroup[],
        maxWeightKg: number,
    ): ShipmentGroup[] {
        const result: ShipmentGroup[] = [];

        for (const group of groups) {
            if (group.totalWeight <= maxWeightKg) {
                result.push(group);
                continue;
            }

            result.push(
                ...this.splitGroup(
                    group,
                    (currentGroup, item) => {
                        const itemWeight =
                            item.quantity *
                            item.unitWeight;

                        return (
                            currentGroup.totalWeight +
                            itemWeight >
                            maxWeightKg
                        );
                    },
                    'MAX_WEIGHT_EXCEEDED',
                ),
            );
        }

        return result;
    }

    private splitGroupsByMaxItems(
        groups: ShipmentGroup[],
        maxItems: number,
    ): ShipmentGroup[] {
        const result: ShipmentGroup[] = [];

        for (const group of groups) {
            if (group.totalItems <= maxItems) {
                result.push(group);
                continue;
            }

            result.push(
                ...this.splitGroup(
                    group,
                    (currentGroup, item) =>
                        currentGroup.totalItems +
                        item.quantity >
                        maxItems,
                    'MAX_ITEMS_EXCEEDED',
                ),
            );
        }

        return result;
    }

    private splitGroup(
        originalGroup: ShipmentGroup,
        shouldStartNewGroup: (
            currentGroup: ShipmentGroup,
            nextItem: ShipmentGroupItem,
        ) => boolean,
        splitReason: string,
    ): ShipmentGroup[] {
        const result: ShipmentGroup[] = [];

        let currentGroup =
            this.createEmptySplitGroup(
                originalGroup,
                splitReason,
            );

        for (const item of originalGroup.items) {
            if (
                currentGroup.items.length > 0 &&
                shouldStartNewGroup(
                    currentGroup,
                    item,
                )
            ) {
                result.push(
                    this.finalizeGroup(currentGroup),
                );

                currentGroup =
                    this.createEmptySplitGroup(
                        originalGroup,
                        splitReason,
                    );
            }

            currentGroup.items.push(item);

            currentGroup.totalItems +=
                item.quantity;

            currentGroup.totalWeight +=
                item.quantity *
                item.unitWeight;

            currentGroup.totalPrice +=
                item.quantity *
                item.unitPrice;

            if (
                item.category &&
                !currentGroup.categories.includes(
                    item.category,
                )
            ) {
                currentGroup.categories.push(
                    item.category,
                );
            }
            const itemSource =
                originalGroup.sources.find(
                    (source) =>
                        source.id === item.sourceId,
                );

            if (
                itemSource &&
                !currentGroup.sources.some(
                    (source) =>
                        source.id === itemSource.id,
                )
            ) {
                currentGroup.sources.push(itemSource);
            }
        }

        if (currentGroup.items.length > 0) {
            result.push(
                this.finalizeGroup(currentGroup),
            );
        }

        return result;
    }

    private createEmptySplitGroup(
        originalGroup: ShipmentGroup,
        splitReason: string,
    ): ShipmentGroup {
        return {
            groupId: randomUUID(),

            sources: [],

            categories: [],
            handlingGroup:
                originalGroup.handlingGroup,

            items: [],

            totalItems: 0,
            totalWeight: 0,
            totalPrice: 0,

            groupingReasons: [
                ...originalGroup.groupingReasons,
                splitReason,
            ],
        };
    }

    private finalizeGroup(
        group: ShipmentGroup,
    ): ShipmentGroup {
        return {
            ...group,

            totalWeight: Number(
                group.totalWeight.toFixed(3),
            ),

            totalPrice: Number(
                group.totalPrice.toFixed(2),
            ),
        };
    }
}