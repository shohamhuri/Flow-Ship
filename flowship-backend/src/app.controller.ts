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
    const result = await this.db.queryOne<{ now: string }>('select now()');

    return {
      ok: true,
      dbTime: result?.now,
    };
  }

  @Get('health/tenants')
  async checkTenantsTable() {
    const result = await this.db.queryOne<{ count: string }>(`
      select count(*)::text as count
      from public.flowship_tenants
    `);

    return {
      ok: true,
      table: 'public.flowship_tenants',
      tenantsCount: result?.count,
    };
  }

  @Get('health/current-tenant')
  async checkCurrentTenant(@Headers('x-api-key') apiKey: string) {
    const tenant = await this.tenantsService.findByApiKey(apiKey);

    return {
      ok: true,
      tenant,
    };
  }
}