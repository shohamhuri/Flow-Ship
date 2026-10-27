
import { Module } from '@nestjs/common';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { SourceDeliveryPermissionsService } from './source-delivery-permissions.service';
import { MockInventoryProvider } from './adapters/mock-inventory.provider';
import { GoogleRoutesDistanceProvider } from './providers/google-routes-distance.provider';
import { MockSourceConfirmationProvider } from './providers/mock-source-confirmation.provider';
import { MockSelfDeliveryProvider } from './providers/mock-self-delivery.provider';
import { SourcingService } from './sourcing.service';
import { SourcingResultsRepository } from './sourcing-results.repository';

import {
  DISTANCE_PROVIDER,
  INVENTORY_PROVIDER,
  SOURCE_CONFIRMATION_PROVIDER,
  SELF_DELIVERY_PROVIDER
} from './sourcing.tokens';

@Module({
  imports: [
    AuditLogsModule,
    DatabaseModule,
  ],

  providers: [
    SourcingService,
    MockInventoryProvider,
    GoogleRoutesDistanceProvider,
    MockSourceConfirmationProvider,
    SourcingResultsRepository,
    SourceDeliveryPermissionsService,
    MockSelfDeliveryProvider,

    {
      provide: SELF_DELIVERY_PROVIDER,
      useExisting: MockSelfDeliveryProvider,
    },

    {
      provide: INVENTORY_PROVIDER,
      useExisting: MockInventoryProvider,
    },

    {
      provide: DISTANCE_PROVIDER,
      useExisting: GoogleRoutesDistanceProvider,
    },

    {
      provide: SOURCE_CONFIRMATION_PROVIDER,
      useExisting: MockSourceConfirmationProvider,
    },
  ],

  exports: [
    SourcingService,
    SourcingResultsRepository,
    SOURCE_CONFIRMATION_PROVIDER,
    DISTANCE_PROVIDER,
    INVENTORY_PROVIDER,
    SourceDeliveryPermissionsService,
    SELF_DELIVERY_PROVIDER,
  ],
})
export class SourcingModule { }
