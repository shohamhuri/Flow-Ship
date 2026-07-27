import { Module } from '@nestjs/common';
import { GroupingService } from './grouping.service';
import { GroupingRulesService } from './grouping-rules.service';
import { ShipmentGroupsRepository } from './shipment-groups.repository';
import { DatabaseModule } from '../../infrastructure/database/database.module';

@Module({
    imports: [
        DatabaseModule,
    ],
    providers: [
        GroupingService,
        GroupingRulesService,
        ShipmentGroupsRepository
    ],
    exports: [
        GroupingService,
        ShipmentGroupsRepository
    ],
})
export class GroupingModule { }