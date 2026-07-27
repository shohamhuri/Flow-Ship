import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { SourcingModule } from '../sourcing/sourcing.module';
import { TenantsModule } from '../tenants/tenants.module';
import { GroupingModule } from '../grouping/grouping.module';
import { CheckoutRepository } from './checkout.repository';
import { CheckoutProcessingRepository } from './checkout-processing.repository';
import { DatabaseModule } from '../../infrastructure/database/database.module';

@Module({
  imports: [SourcingModule, TenantsModule, GroupingModule, DatabaseModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, CheckoutRepository, CheckoutProcessingRepository],
})
export class CheckoutModule { }