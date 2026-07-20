import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { TenantsModule } from '../tenants/tenants.module';
import { MockCarrierAdapter } from './adapters/mock-carrier.adapter';
import { CarrierRegistry } from './carrier-registry.service';
import { CarriersController } from './carriers.controller';
import { CarriersService } from './carriers.service';
import { MockYangoAdapter } from './adapters/mock-yango.adapter';

@Module({
  imports: [DatabaseModule, TenantsModule],
  controllers: [CarriersController],
  providers: [
    CarriersService,
    CarrierRegistry,
    MockCarrierAdapter,
    MockYangoAdapter,

  ],
  exports: [CarriersService],
})
export class CarriersModule { }