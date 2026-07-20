import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { TenantsModule } from '../tenants/tenants.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [DatabaseModule, TenantsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule { }