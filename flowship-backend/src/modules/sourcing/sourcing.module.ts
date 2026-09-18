import { Module } from '@nestjs/common';

import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';

import { MockInventoryProvider } from './adapters/mock-inventory.provider';
import { GoogleRoutesDistanceProvider } from './providers/google-routes-distance.provider';

import { SourcingService } from './sourcing.service';
import { SourcingResultsRepository } from './sourcing-results.repository';

import {
  DISTANCE_PROVIDER,
  INVENTORY_PROVIDER,
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
    SourcingResultsRepository,

    {
      provide: INVENTORY_PROVIDER,
      useExisting: MockInventoryProvider,
    },

    {
      provide: DISTANCE_PROVIDER,
      useExisting: GoogleRoutesDistanceProvider,
    },
  ],

  exports: [
    SourcingService,
    SourcingResultsRepository,
  ],
})
export class SourcingModule { }