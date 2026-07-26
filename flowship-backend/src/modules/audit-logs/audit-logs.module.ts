import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditLogsService } from './audit-logs.service';

@Module({
  imports: [DatabaseModule],
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule { }