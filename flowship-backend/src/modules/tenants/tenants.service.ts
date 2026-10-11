
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

        return {
            id: tenant.id,
            name: tenant.name,
            schemaName: tenant.schema_name,
            status: tenant.status,
            timezone: tenant.timezone,
        };
    }
}
