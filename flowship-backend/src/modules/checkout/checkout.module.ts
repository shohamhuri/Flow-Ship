import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { SourcingModule } from '../sourcing/sourcing.module';
import { TenantsModule } from '../tenants/tenants.module';


@Module({
  imports: [SourcingModule, TenantsModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule { }