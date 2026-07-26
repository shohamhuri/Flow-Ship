import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './infrastructure/database/database.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CarriersModule } from './modules/carriers/carriers.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { DecisionModule } from './modules/decision/decision.module';
import { AdminModule } from './modules/admin/admin.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { SourcingModule } from './modules/sourcing/sourcing.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    TenantsModule,
    CarriersModule,
    QuotesModule,
    DecisionModule,
    AdminModule,
    CheckoutModule,
    SourcingModule,
    AuditLogsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }