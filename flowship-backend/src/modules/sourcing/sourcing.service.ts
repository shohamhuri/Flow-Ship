import {
    Inject,
    Injectable,
} from '@nestjs/common';

import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
    Checkout,
    CheckoutItem,
} from '../checkout/interfaces/checkout.interface';
import { CurrentTenant } from '../tenants/tenants.service';
import { INVENTORY_PROVIDER } from './sourcing.tokens';
import type { InventoryProvider } from './interfaces/inventory-provider.interface';
import {
    ItemSourcingResult,
    RankedSupplySource,
} from './interfaces/source-ranking.interface';
import { SourceInventory } from './interfaces/source-inventory.interface';
import { SupplySource } from './interfaces/supply-source.interface';

@Injectable()
export class SourcingService {
    constructor(
        private readonly auditLogsService: AuditLogsService,

        @Inject(INVENTORY_PROVIDER)
        private readonly inventoryProvider: InventoryProvider,
    ) { }

    async findSourcesForCheckout(
        checkout: Checkout,
        tenant: CurrentTenant,
    ): Promise<ItemSourcingResult[]> {
        const skus = checkout.items.map((item) => item.sku);

        const [sources, inventory] = await Promise.all([
            this.inventoryProvider.getSources(
                checkout.storeId,
            ),
            this.inventoryProvider.getInventory(
                checkout.storeId,
                skus,
            ),
        ]);

        const results = checkout.items.map((item) =>
            this.findSourceForItem(
                item,
                checkout.destination.city,
                sources,
                inventory,
            ),
        );

        const unresolvedItems = results
            .filter((result) => result.selectedSource === null)
            .map((result) => result.sku);

        const selectedSources = results
            .filter((result) => result.selectedSource !== null)
            .map((result) => ({
                sku: result.sku,
                sourceId:
                    result.selectedSource!.source.id,
                sourceName:
                    result.selectedSource!.source.name,
                sourceType:
                    result.selectedSource!.source.type,
                availableQuantity:
                    result.selectedSource!.availableQuantity,
                requestedQuantity:
                    result.selectedSource!.requestedQuantity,
                scoreBreakdown:
                    result.selectedSource!.scoreBreakdown,
                totalScore:
                    result.selectedSource!.totalScore,
            }));
        let status: 'success' | 'warning' | 'failed';

        if (unresolvedItems.length === 0) {
            status = 'success';
        } else if (
            unresolvedItems.length === results.length
        ) {
            status = 'failed';
        } else {
            status = 'warning';
        }

        await this.auditLogsService.createLog({
            schemaName: tenant.schemaName,
            action: 'sourcing.completed',
            entityType: 'checkout',
            entityId: checkout.orderId,
            status,
            metadata: {
                storeId: checkout.storeId,
                itemsCount: checkout.items.length,
                selectedSources,
                unresolvedItems,
            },
        });

        return results;
    }

    private findSourceForItem(
        item: CheckoutItem,
        destinationCity: string,
        sources: SupplySource[],
        inventory: SourceInventory[],
    ): ItemSourcingResult {
        const rankedSources = sources.map((source) =>
            this.rankSource(
                source,
                item.sku,
                item.quantity,
                destinationCity,
                inventory,
            ),
        );

        const possibleSources = rankedSources
            .filter(
                (rankedSource) =>
                    rankedSource.rejectionReasons.length === 0,
            )
            .sort(
                (a, b) =>
                    b.totalScore - a.totalScore,
            );

        const rejectedSources = rankedSources.filter(
            (rankedSource) =>
                rankedSource.rejectionReasons.length > 0,
        );

        return {
            sku: item.sku,
            requestedQuantity: item.quantity,
            possibleSources,
            rejectedSources,
            selectedSource:
                possibleSources[0] ?? null,
        };
    }
    private rankSource(
        source: SupplySource,
        sku: string,
        requestedQuantity: number,
        destinationCity: string,
        inventory: SourceInventory[],
    ): RankedSupplySource {
        const inventoryRecord = inventory.find(
            (record) =>
                record.sourceId === source.id &&
                record.sku === sku,
        );

        const availableQuantity =
            inventoryRecord?.availableQuantity ?? 0;

        const hasEnoughStock =
            availableQuantity >= requestedQuantity;

        const rejectionReasons: string[] = [];

        if (!source.isActive) {
            rejectionReasons.push('SOURCE_INACTIVE');
        }

        if (!hasEnoughStock) {
            rejectionReasons.push(
                'INSUFFICIENT_INVENTORY',
            );
        }

        const priorityScore =
            this.calculatePriorityScore(source);

        const distanceScore =
            this.calculateDistanceScore(
                source,
                destinationCity,
            );

        const priorityWeight = 0.6;
        const distanceWeight = 0.4;

        const totalScore =
            priorityScore * priorityWeight +
            distanceScore * distanceWeight;

        return {
            source,

            availableQuantity,
            requestedQuantity,

            hasEnoughStock,

            priorityScore,
            distanceScore,

            scoreBreakdown: {
                priority: priorityScore,
                distance: distanceScore,
            },

            totalScore: Number(
                totalScore.toFixed(3),
            ),

            rejectionReasons,
        };
    }
    private calculatePriorityScore(
        source: SupplySource,
    ): number {
        return this.normalizeScore(source.priority);
    }

    private calculateDistanceScore(
        source: SupplySource,
        destinationCity: string,
    ): number {
        const sourceCity =
            source.location.city.trim().toLowerCase();

        const targetCity =
            destinationCity.trim().toLowerCase();

        return sourceCity === targetCity ? 1 : 0.5; // 0.5 אותה עיר → 1 , עיר אחרת 
    }

    private normalizeScore(score: number): number {
        if (score < 0) {
            return 0;
        }

        if (score > 1) {
            return 1;
        }

        return score;
    }
}