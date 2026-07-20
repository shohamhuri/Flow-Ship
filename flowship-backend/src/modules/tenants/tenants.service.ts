import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DbService } from '../../infrastructure/database/db.service';

export type CurrentTenant = {
    id: string;
    name: string;
    schemaName: string;
    status: string;
};

@Injectable()
export class TenantsService {
    constructor(private readonly db: DbService) { }

    async findByApiKey(apiKey: string | undefined): Promise<CurrentTenant> {
        if (!apiKey) {
            throw new UnauthorizedException('Missing x-api-key header');
        }

        const tenant = await this.db.queryOne<{
            id: string;
            name: string;
            schema_name: string;
            status: string;
        }>(
            `
      select id, name, schema_name, status
      from public.flowship_tenants
      where api_key = $1
        and status = 'active'
      limit 1
      `,
            [apiKey],
        );

        if (!tenant) {
            throw new UnauthorizedException('Invalid API key');
        }

        return {
            id: tenant.id,
            name: tenant.name,
            schemaName: tenant.schema_name,
            status: tenant.status,
        };
    }
}