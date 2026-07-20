import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { DecisionService } from './decision.service';

@Module({
  imports: [DatabaseModule],
  providers: [DecisionService],
  exports: [DecisionService],
})
export class DecisionModule { }