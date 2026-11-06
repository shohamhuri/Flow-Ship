import { Module } from '@nestjs/common';

import { DatabaseModule } from
  '../../infrastructure/database/database.module';

import { TenantsModule } from
  '../tenants/tenants.module';

import { PlanningModule } from
  '../planning/planning.module';

import { SourcingModule } from
  '../sourcing/sourcing.module';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    DatabaseModule,
    TenantsModule,
    PlanningModule,
    SourcingModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule { }