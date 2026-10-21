import { Controller, Get, Headers } from '@nestjs/common';
import { DbService } from './infrastructure/database/db.service';
import { TenantsService } from './modules/tenants/tenants.service';

@Controller()
export class AppController {
  constructor(
    private readonly db: DbService,
    private readonly tenantsService: TenantsService,
  ) { }

  @Get()
  getHello() {
    return {
      message: 'FlowShip API is running',
    };
  }

  @Get('health/db')
  async checkDb() {
    await this.db.queryOne('select now()');

    return {
      ok: true,
    };
  }

  @Get('health/tenants')
  async checkTenantsTable() {
    await this.db.queryOne(`
    select 1
    from public.flowship_tenants
    limit 1
  `);

    return {
      ok: true,
    };
  }

  @Get('health/current-tenant')
  async checkCurrentTenant(@Headers('x-api-key') apiKey: string) {
    const tenant = await this.tenantsService.findByApiKey(apiKey);

    return {
      ok: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        schemaName: tenant.schemaName,
        status: tenant.status,
      },
    };
  }
}