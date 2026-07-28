import { Module } from '@nestjs/common';

import { GroupingModule } from '../grouping/grouping.module';

import { ShipmentPlanBuilderService } from './shipment-plan-builder.service';
import { ShipmentPlanEvaluatorService } from './shipment-plan-evaluator.service';
import { ShipmentPlanGeneratorService } from './shipment-plan-generator.service';

@Module({
    imports: [
        GroupingModule,
    ],

    providers: [
        ShipmentPlanGeneratorService,
        ShipmentPlanBuilderService,
        ShipmentPlanEvaluatorService,
    ],

    exports: [
        ShipmentPlanGeneratorService,
        ShipmentPlanBuilderService,
        ShipmentPlanEvaluatorService,
    ],
})
export class PlanningModule { }