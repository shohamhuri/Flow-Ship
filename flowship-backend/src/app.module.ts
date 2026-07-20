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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }