import { Module } from '@nestjs/common';
import { CarriersModule } from '../carriers/carriers.module';
import { DecisionModule } from '../decision/decision.module';
import { TenantsModule } from '../tenants/tenants.module';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  imports: [
    CarriersModule,
    TenantsModule,
    DecisionModule,
  ],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule { }