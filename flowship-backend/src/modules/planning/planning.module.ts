
import { Module } from '@nestjs/common';

import { GroupingModule } from '../grouping/grouping.module';
import { SourcingModule } from '../sourcing/sourcing.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';

import { ShipmentPlanBuilderService } from './shipment-plan-builder.service';
import { ShipmentPlanEvaluatorService } from './shipment-plan-evaluator.service';
import { ShipmentPlanGeneratorService } from './shipment-plan-generator.service';
import { ShipmentPlanConfirmationService } from './shipment-plan-confirmation.service';
import { DeliverySettingsService } from './delivery-settings.service';
@Module({
    imports: [
        GroupingModule,
        SourcingModule,
        DatabaseModule,
    ],

    providers: [
        ShipmentPlanGeneratorService,
        ShipmentPlanBuilderService,
        ShipmentPlanEvaluatorService,
        ShipmentPlanConfirmationService,
        DeliverySettingsService,
    ],

    exports: [
        ShipmentPlanGeneratorService,
        ShipmentPlanBuilderService,
        ShipmentPlanEvaluatorService,
        ShipmentPlanConfirmationService,
        DeliverySettingsService,

    ],
})
export class PlanningModule { }
