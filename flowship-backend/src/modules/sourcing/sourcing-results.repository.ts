import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { DbService } from '../../infrastructure/database/db.service';
import { CurrentTenant } from '../tenants/tenants.service';
import { ItemSourcingResult } from './interfaces/source-ranking.interface';

@Injectable()
export class SourcingResultsRepository {
    constructor(
        private readonly databaseService: DbService,
    ) { }

    async saveResults(
        tenant: CurrentTenant,
        checkoutId: string,
        sourcing: ItemSourcingResult[],
        checkoutItemIdsBySku: Map<string, string>,
    ): Promise<void> {
        for (const itemResult of sourcing) {
            const checkoutItemId =
                checkoutItemIdsBySku.get(itemResult.sku);

            if (!checkoutItemId) {
                throw new Error(
                    `Checkout item not found for SKU: ${itemResult.sku}`,
                );
            }

            const allSources = [
                ...itemResult.possibleSources,
                ...itemResult.rejectedSources,
            ];

            for (const rankedSource of allSources) {
                await this.databaseService.query(
                    `
                    insert into ${tenant.schemaName}.checkout_sourcing_results (
                        id,
                        checkout_id,
                        checkout_item_id,
                        source_id,
                        source_name,
                        source_type,
                        available_quantity,
                        requested_quantity,
                        has_enough_stock,
                        priority_score,
                        distance_km,
                        distance_score,
                        total_score,
                        is_selected,
                        rejection_reasons
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
                        $11,
                        $12,
                        $13,
                        $14,
                        $15::jsonb
                    )
                    `,
                    [
                        randomUUID(),
                        checkoutId,
                        checkoutItemId,

                        rankedSource.source.id,
                        rankedSource.source.name,
                        rankedSource.source.type,

                        rankedSource.availableQuantity,
                        rankedSource.requestedQuantity,
                        rankedSource.hasEnoughStock,

                        rankedSource.priorityScore,
                        rankedSource.distanceKm ?? null,
                        rankedSource.distanceScore,
                        rankedSource.totalScore,

                        itemResult.selectedSource?.source.id ===
                        rankedSource.source.id,

                        JSON.stringify(
                            rankedSource.rejectionReasons,
                        ),
                    ],
                );
            }
        }
    }
}