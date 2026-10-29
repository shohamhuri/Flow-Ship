import { BadRequestException } from '@nestjs/common';

import type {
    ScoredShipmentPlanDeliveryOption,
} from '../decision/decision.service';

export function validateSelectedDeliveryOption(
    evaluatedOptions: unknown,
    selectedDeliveryOptionId: string,
): ScoredShipmentPlanDeliveryOption {
    if (!Array.isArray(evaluatedOptions)) {
        throw new BadRequestException(
            'Checkout delivery options are missing',
        );
    }

    const selected = evaluatedOptions.find(
        (option: unknown) =>
            typeof option === 'object' &&
            option !== null &&
            'id' in option &&
            option.id === selectedDeliveryOptionId,
    );

    if (
        !selected ||
        typeof selected.planId !== 'string' ||
        !Array.isArray(selected.selectedGroupQuotes)
    ) {
        throw new BadRequestException(
            'Invalid selected delivery option',
        );
    }

    return selected as ScoredShipmentPlanDeliveryOption;
}