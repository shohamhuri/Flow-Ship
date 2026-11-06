
import {
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';

import { DbService } from '../../infrastructure/database/db.service';
import type { CurrentTenant } from '../tenants/tenants.service';

export interface ResolvedSourceDeliveryWebhook {
    tenant: CurrentTenant;
    storeId: string;
    sourceId: string;
    webhookSecret: string;
}

@Injectable()
export class SourceDeliveryWebhookResolverService {
    constructor(private readonly db: DbService) { }

    async resolve(
        webhookId: string,
    ): Promise<ResolvedSourceDeliveryWebhook> {
        if (
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
                .test(webhookId)
        ) {
            throw new UnauthorizedException(
                'Invalid webhook integration',
            );
        }

        const tenants = await this.db.query<{
            id: string;
            name: string;
            schema_name: string;
            status: string;
            timezone: string;
        }>(
            `
            SELECT id, name, schema_name, status, timezone
            FROM public.flowship_tenants
            WHERE status = 'active'
            `,
        );

        const matches: ResolvedSourceDeliveryWebhook[] = [];

        for (const tenant of tenants) {
            const schema = tenant.schema_name;

            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
                throw new Error('Invalid tenant schema name');
            }

            const integration = await this.db.queryOne<{
                store_id: string;
                source_id: string;
                webhook_secret: string | null;
            }>(
                `
                SELECT store_id, source_id, webhook_secret
                FROM "${schema}".source_delivery_integrations
                WHERE webhook_id = $1::uuid
                  AND webhook_enabled = true
                LIMIT 1
                `,
                [webhookId],
            );

            if (!integration) {
                continue;
            }

            if (!integration.webhook_secret) {
                throw new UnauthorizedException(
                    'Invalid webhook integration',
                );
            }

            matches.push({
                tenant: {
                    id: tenant.id,
                    name: tenant.name,
                    schemaName: schema,
                    status: tenant.status,
                    timezone: tenant.timezone,
                },
                storeId: integration.store_id,
                sourceId: integration.source_id,
                webhookSecret: integration.webhook_secret,
            });
        }

        if (matches.length !== 1) {
            throw new UnauthorizedException(
                'Invalid webhook integration',
            );
        }

        return matches[0];
    }
}
