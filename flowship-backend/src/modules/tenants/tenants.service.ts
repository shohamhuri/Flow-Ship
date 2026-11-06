
import {
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';

import { DbService } from
    '../../infrastructure/database/db.service';

export type CurrentTenant = {
    id: string;
    name: string;
    schemaName: string;
    status: string;
    timezone: string;
};

@Injectable()
export class TenantsService {
    constructor(
        private readonly db: DbService,
    ) { }

    async findByApiKey(
        apiKey: string | undefined,
    ): Promise<CurrentTenant> {
        if (!apiKey) {
            throw new UnauthorizedException(
                'Missing x-api-key header',
            );
        }

        const tenant = await this.db.queryOne<{
            id: string;
            name: string;
            schema_name: string;
            status: string;
            timezone: string;
        }>(
            `
            SELECT
                id,
                name,
                schema_name,
                status,
                timezone
            FROM public.flowship_tenants
            WHERE api_key = $1
              AND status = 'active'
            LIMIT 1
            `,
            [apiKey],
        );

        if (!tenant) {
            throw new UnauthorizedException(
                'Invalid API key',
            );
        }

        if (!/^[a-zA-Z0-9_]+$/.test(tenant.schema_name)) {
            throw new Error('Invalid tenant schema name');
        }

        return {
            id: tenant.id,
            name: tenant.name,
            schemaName: tenant.schema_name,
            status: tenant.status,
            timezone: tenant.timezone,
        };
    }
    async findAllActive(): Promise<CurrentTenant[]> {
        const rows = await this.db.query<{
            id: string;
            name: string;
            schema_name: string;
            status: string;
            timezone: string;
        }>(
            `
        SELECT
            id,
            name,
            schema_name,
            status,
            timezone
        FROM public.flowship_tenants
        WHERE status = 'active'
        ORDER BY name
        `,
        );

        return rows.map((row) => {
            if (!/^[a-zA-Z0-9_]+$/.test(row.schema_name)) {
                throw new Error(
                    `Invalid tenant schema name: ${row.schema_name}`,
                );
            }

            return {
                id: row.id,
                name: row.name,
                schemaName: row.schema_name,
                status: row.status,
                timezone: row.timezone,
            };
        });
    }
    async isShipmentMonitoringReady(
        tenant: CurrentTenant,
    ): Promise<boolean> {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tenant.schemaName)) {
            throw new Error('Invalid tenant schema name');
        }

        const result = await this.db.queryOne<{
            ready: boolean;
        }>(
            `
    SELECT
        to_regclass(format('%I.shipments', $1::text)) IS NOT NULL
        AND to_regclass(format('%I.shipment_events', $1::text)) IS NOT NULL
        AND to_regclass(format('%I.self_delivery_fulfillments', $1::text)) IS NOT NULL
        AND to_regclass(format('%I.shipment_monitoring_anomalies', $1::text)) IS NOT NULL
        AS ready
    `,
            [tenant.schemaName],
        );

        return result?.ready === true;
    }
}
