
import { Injectable } from '@nestjs/common';

import { DbService } from '../../infrastructure/database/db.service';
import type { CurrentTenant } from '../tenants/tenants.service';

export interface SourceDeliveryIntegration {
    storeId: string;
    sourceId: string;
    webhookEnabled: boolean;
    pollingEnabled: boolean;
    webhookSecret: string | null;
}

@Injectable()
export class SourceDeliveryIntegrationsService {
    constructor(
        private readonly db: DbService,
    ) { }

    async findByStoreAndSource(
        tenant: CurrentTenant,
        storeId: string,
        sourceId: string,
    ): Promise<SourceDeliveryIntegration | null> {
        const schema = tenant.schemaName;

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
            throw new Error('Invalid tenant schema name');
        }

        const row = await this.db.queryOne<{
            store_id: string;
            source_id: string;
            webhook_enabled: boolean;
            polling_enabled: boolean;
            webhook_secret: string | null;
        }>(
            `
            SELECT
                store_id,
                source_id,
                webhook_enabled,
                polling_enabled,
                webhook_secret
            FROM "${schema}".source_delivery_integrations
            WHERE store_id = $1
              AND source_id = $2
            LIMIT 1
            `,
            [storeId, sourceId],
        );

        if (!row) {
            return null;
        }

        return {
            storeId: row.store_id,
            sourceId: row.source_id,
            webhookEnabled: row.webhook_enabled,
            pollingEnabled: row.polling_enabled,
            webhookSecret: row.webhook_secret,
        };
    }
}
