
import { Inject, Injectable } from '@nestjs/common';

import { ShipmentPlanCandidate } from './interfaces/shipment-plan.interface';

import type {
    SourceConfirmationProvider,
    SourceConfirmationResponse,
} from '../sourcing/interfaces/source-confirmation-provider.interface';

import { SOURCE_CONFIRMATION_PROVIDER }
    from '../sourcing/sourcing.tokens';
export interface ConfirmedShipmentPlan {
    plan: ShipmentPlanCandidate;
    confirmed: boolean;

    confirmations: Array<
        SourceConfirmationResponse & {
            confirmedAt: string;
        }
    >;

    failure?: {
        sourceId: string;
        reason:
        | 'SOURCE_NOT_AVAILABLE'
        | 'INVALID_PREPARATION_TIME'
        | 'INSUFFICIENT_QUANTITY'
        | 'INVALID_SOURCE_RESPONSE'
        | 'CONFIRMATION_PROVIDER_ERROR';
    };

    confirmedAt?: string;
}

@Injectable()
export class ShipmentPlanConfirmationService {
    constructor(
        @Inject(SOURCE_CONFIRMATION_PROVIDER)
        private readonly confirmationProvider:
            SourceConfirmationProvider,
    ) { }

    async confirmPlan(
        plan: ShipmentPlanCandidate,
        storeId: string,
    ): Promise<ConfirmedShipmentPlan> {

        const itemsBySource = new Map<
            string,
            Map<string, number>
        >();

        for (const assignment of plan.assignments) {
            const sourceId =
                assignment.selectedSource.source.id;

            if (!itemsBySource.has(sourceId)) {
                itemsBySource.set(sourceId, new Map());
            }

            const sourceItems = itemsBySource.get(sourceId)!;

            sourceItems.set(
                assignment.sku,
                (sourceItems.get(assignment.sku) ?? 0) +
                assignment.requestedQuantity,
            );
        }

        const confirmations: ConfirmedShipmentPlan['confirmations'] = [];
        for (const [sourceId, items] of itemsBySource) {
            try {
                const response =
                    await this.confirmationProvider.confirmSource({
                        storeId,
                        sourceId,
                        items: [...items].map(
                            ([sku, quantity]) => ({
                                sku,
                                quantity,
                            }),
                        ),
                    });

                const requestedItems = [...items];
                let failureReason:
                    | NonNullable<
                        ConfirmedShipmentPlan['failure']
                    >['reason']
                    | null = null;

                const hasInsufficientQuantity =
                    !requestedItems.every(([sku, quantity]) =>
                        response.items.some(
                            item =>
                                item.sku === sku &&
                                item.requestedQuantity === quantity &&
                                item.availableQuantity >= quantity,
                        ),
                    );

                if (response.sourceId !== sourceId) {
                    failureReason =
                        'INVALID_SOURCE_RESPONSE';

                } else if (hasInsufficientQuantity) {
                    failureReason =
                        'INSUFFICIENT_QUANTITY';

                } else if (response.available !== true) {
                    failureReason =
                        'SOURCE_NOT_AVAILABLE';

                } else if (
                    response.preparationMinutes === null ||
                    !Number.isFinite(
                        response.preparationMinutes,
                    ) ||
                    response.preparationMinutes < 0
                ) {
                    failureReason =
                        'INVALID_PREPARATION_TIME';
                }
                const validResponse =
                    response.sourceId === sourceId &&
                    response.available === true &&
                    response.preparationMinutes !== null &&
                    Number.isFinite(
                        response.preparationMinutes,
                    ) &&
                    response.preparationMinutes >= 0 &&
                    requestedItems.every(([sku, quantity]) =>
                        response.items.some(
                            item =>
                                item.sku === sku &&
                                item.requestedQuantity === quantity &&
                                item.availableQuantity >= quantity,
                        ),
                    );

                confirmations.push({
                    ...response,
                    confirmedAt: new Date().toISOString(),
                });
                if (failureReason) {
                    return {
                        plan,
                        confirmed: false,
                        confirmations,
                        failure: {
                            sourceId,
                            reason: failureReason,
                        },
                    };
                }
            } catch {
                return {
                    plan,
                    confirmed: false,
                    confirmations,
                    failure: {
                        sourceId,
                        reason: 'CONFIRMATION_PROVIDER_ERROR',
                    },
                };
            }
        }
        return {
            plan,
            confirmed: itemsBySource.size > 0,
            confirmations,
            confirmedAt: new Date().toISOString(),
        };
    }
}
