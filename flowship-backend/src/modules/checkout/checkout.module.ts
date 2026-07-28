import { Module } from '@nestjs/common';

import { DatabaseModule } from '../../infrastructure/database/database.module';

import { GroupingModule } from '../grouping/grouping.module';
import { PlanningModule } from '../planning/planning.module';
import { SourcingModule } from '../sourcing/sourcing.module';
import { TenantsModule } from '../tenants/tenants.module';

import { CheckoutProcessingRepository } from './checkout-processing.repository';
import { CheckoutController } from './checkout.controller';
import { CheckoutRepository } from './checkout.repository';
import { CheckoutService } from './checkout.service';
import { ShipmentPlanQuoteService } from '../planning/shipment-plan-quote.service';
import { CarriersModule } from '../carriers/carriers.module';
import { ShipmentPlanDeliveryOptionsService } from '../planning/shipment-plan-delivery-options.service';
import { DecisionModule } from '../decision/decision.module';

@Module({
  imports: [
    SourcingModule,
    TenantsModule,
    GroupingModule,
    PlanningModule,
    DatabaseModule,
    CarriersModule,
    DecisionModule,
  ],

  controllers: [
    CheckoutController,
  ],

  providers: [
    CheckoutService,
    CheckoutRepository,
    CheckoutProcessingRepository,
    ShipmentPlanQuoteService,
    ShipmentPlanDeliveryOptionsService,
  ],
})
export class CheckoutModule { }