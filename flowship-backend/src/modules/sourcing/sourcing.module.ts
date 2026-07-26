import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { MockInventoryProvider } from './adapters/mock-inventory.provider';
import { SourcingService } from './sourcing.service';
import { INVENTORY_PROVIDER } from './sourcing.tokens';

@Module({
  imports: [AuditLogsModule],
  providers: [
    SourcingService,
    MockInventoryProvider,
    {
      provide: INVENTORY_PROVIDER,
      useExisting: MockInventoryProvider,
    },
  ],
  exports: [SourcingService],
})
export class SourcingModule { }