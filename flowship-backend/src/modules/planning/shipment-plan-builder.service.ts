import { Injectable } from '@nestjs/common';

import { Checkout } from '../checkout/interfaces/checkout.interface';
import { GroupingService } from '../grouping/grouping.service';

import { ShipmentPlanCandidate } from './interfaces/shipment-plan.interface';
import {
    GroupingStrategySetting,
} from '../grouping/interfaces/grouping-strategy-setting.interface';
@Injectable()
export class ShipmentPlanBuilderService {
    constructor(
        private readonly groupingService: GroupingService,
    ) { }

    buildPlans(
        checkout: Checkout,
        plans: ShipmentPlanCandidate[],
        strategies: GroupingStrategySetting[] = [],
    ): ShipmentPlanCandidate[] {
        return plans.map((plan) => {
            const grouping =
                this.groupingService.groupShipmentPlan(
                    checkout,
                    plan.assignments,
                    strategies,
                );

            /*
             * תוכנית שבה פריט כלשהו לא שובץ לקבוצה
             * אינה תוכנית חוקית להמשך התהליך.
             */
            if (grouping.hasUngroupedItems) {
                return {
                    ...plan,
                    grouping,
                    status: 'rejected' as const,
                };
            }

            return {
                ...plan,
                grouping,
                status: 'grouped' as const,
            };
        });
    }
}