import { Module } from '@nestjs/common';
import { GroupingService } from './grouping.service';
import { GroupingRulesService } from './grouping-rules.service';
import { ShipmentGroupsRepository } from './shipment-groups.repository';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import {
    GroupingStrategySettingsRepository,
} from './grouping-strategy-settings.repository';


@Module({
    imports: [
        DatabaseModule,
    ],
    providers: [
        GroupingService,
        GroupingRulesService,
        ShipmentGroupsRepository,
        GroupingStrategySettingsRepository,
    ],
    exports: [
        GroupingService,
        ShipmentGroupsRepository,
        GroupingStrategySettingsRepository,
        GroupingRulesService,
    ],
})
export class GroupingModule { }