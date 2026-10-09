import { Injectable } from '@nestjs/common';

import { DbService } from '../../infrastructure/database/db.service';
import { CurrentTenant } from '../tenants/tenants.service';

export interface WeightEstimationRule {
    id: string;
    category: string | null;
    productType: string | null;
    size: string | null;
    estimatedWeightKg: number;
    priority: number;
}

@Injectable()
export class WeightEstimationRepository {
    constructor(
        private readonly databaseService: DbService,
    ) { }

    async findActiveRules(
        tenant: CurrentTenant,
    ): Promise<WeightEstimationRule[]> {
        const schemaName =
            this.safeSchemaName(tenant.schemaName);

        const rows =
            await this.databaseService.query<{
                id: string;
                category: string | null;
                product_type: string | null;
                size: string | null;
                estimated_weight_kg: string | number;
                priority: number;
            }>(
                `
                select
                    id,
                    category,
                    product_type,
                    size,
                    estimated_weight_kg,
                    priority
                from "${schemaName}".weight_estimation_rules
                where is_active = true
                order by priority asc
                `,
            );

        return rows.map((row) => ({
            id: row.id,
            category: row.category,
            productType: row.product_type,
            size: row.size,
            estimatedWeightKg:
                Number(row.estimated_weight_kg),
            priority: row.priority,
        }));
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
}