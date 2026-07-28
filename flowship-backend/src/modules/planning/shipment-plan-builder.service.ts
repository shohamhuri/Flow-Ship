import { Injectable } from '@nestjs/common';

import { Checkout } from '../checkout/interfaces/checkout.interface';
import { GroupingService } from '../grouping/grouping.service';

import { ShipmentPlanCandidate } from './interfaces/shipment-plan.interface';

@Injectable()
export class ShipmentPlanBuilderService {
    constructor(
        private readonly groupingService: GroupingService,
    ) { }

    buildPlans(
        checkout: Checkout,
        plans: ShipmentPlanCandidate[],
    ): ShipmentPlanCandidate[] {
        return plans.map((plan) => {
            const grouping =
                this.groupingService.groupShipmentPlan(
                    checkout,
                    plan.assignments,
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