
import { Injectable } from '@nestjs/common';
import { CarrierQuoteOption } from
    '../carriers/interfaces/carrier-adapter.interface';
import {
    QuotedShipmentPlan,
    ProviderVehiclePlanQuoteResult,
} from './interfaces/shipment-plan-quote.interface';
import {
    SelectedGroupQuote,
    SelectedVehicleShipment,
    ShipmentPlanDeliveryOption,
    ShipmentPlanDeliveryOptionsResult,
} from './interfaces/shipment-plan-delivery-option.interface';

@Injectable()
export class ShipmentPlanDeliveryOptionsService {
    private readonly maxOptionsPerPlan = 100;

    generateForPlans(
        quotedPlans: QuotedShipmentPlan[],
    ): ShipmentPlanDeliveryOptionsResult[] {
        return quotedPlans.map((plan) => this.generateForPlan(plan));
    }

    private generateForPlan(
        quotedPlan: QuotedShipmentPlan,
    ): ShipmentPlanDeliveryOptionsResult {
        const empty = (): ShipmentPlanDeliveryOptionsResult => ({
            quotedPlan,
            deliveryOptions: [],
            statistics: {
                theoreticalCombinations: 0,
                generatedCombinations: 0,
                generationLimitReached: false,
            },
        });

        const groupChoices: SelectedGroupQuote[][] = [];

        for (const groupQuote of quotedPlan.groupQuotes) {
            const sourceIds = [
                ...new Set(
                    quotedPlan.plan.grouping?.shipmentGroups
                        .find((group) => group.groupId === groupQuote.groupId)
                        ?.items.map((item) => item.sourceId) ?? [],
                ),
            ];

            if (sourceIds.length === 0) return empty();



            const choicesBySource = sourceIds.map((sourceId) => {
                const plans = (groupQuote.vehiclePlans ?? [])
                    .filter((plan) => plan.sourceId === sourceId);

                const sourceTiming = (groupQuote.sourceDirectQuotes ?? []).find(
                    (entry) => entry.sourceId === sourceId,
                );

                const vehicleChoices = plans.flatMap((plan) =>
                    this.buildSourceChoices(
                        sourceId,
                        plan,
                        sourceTiming?.travelMinutes,
                        sourceTiming?.estimatedDeliveryAt,
                    ),
                );

                const shipmentGroup =
                    quotedPlan.plan.grouping?.shipmentGroups.find(
                        (group) => group.groupId === groupQuote.groupId,
                    );

                const sourceItems = (shipmentGroup?.items ?? [])
                    .filter((item) => item.sourceId === sourceId)
                    .map((item) => ({
                        sku: item.sku,
                        quantity: item.quantity,
                        unitWeightKg: item.unitWeight,
                    }));

                const sourceWeightKg = sourceItems.reduce(
                    (total, item) =>
                        total + item.quantity * item.unitWeightKg,
                    0,
                );

                const directChoices = (
                    groupQuote.sourceDirectQuotes ?? []
                )
                    .filter((entry) => entry.sourceId === sourceId)
                    .flatMap((entry) =>
                        entry.quotes.map((quote) => [
                            {
                                sourceId,
                                deliveryMethod: 'carrier' as const,
                                vehicleIndex: 0,
                                assignedWeightKg: sourceWeightKg,
                                items: sourceItems.map((item) => ({ ...item })),
                                quote,
                                travelMinutes: entry.travelMinutes,
                                estimatedDeliveryAt: entry.estimatedDeliveryAt,
                            },
                        ]),
                    );
                const selfDeliveryChoices =
                    sourceTiming?.selfDeliveryQuote?.accepted === true &&
                        sourceTiming.selfDeliveryQuote.price !== null &&
                        sourceTiming.selfDeliveryQuote.price >= 0 &&
                        sourceTiming.selfDeliveryQuote.estimatedDeliveryAt &&
                        Number.isFinite(
                            Date.parse(sourceTiming.selfDeliveryQuote.estimatedDeliveryAt),
                        ) &&
                        Date.parse(
                            sourceTiming.selfDeliveryQuote.estimatedDeliveryAt,
                        ) > Date.now()
                        ? [
                            [
                                {
                                    sourceId,
                                    deliveryMethod: 'self_delivery' as const,
                                    vehicleIndex: 0,
                                    assignedWeightKg: sourceWeightKg,
                                    items: sourceItems.map((item) => ({ ...item })),
                                    quote: {
                                        carrierName: 'Source Self Delivery',
                                        serviceName: 'Self Delivery',
                                        price: sourceTiming.selfDeliveryQuote.price,
                                        currency: 'ILS' as const,
                                        estimatedDays: Math.max(
                                            0,
                                            Math.ceil(
                                                (new Date(
                                                    sourceTiming.selfDeliveryQuote.estimatedDeliveryAt,
                                                ).getTime() - Date.now()) /
                                                (24 * 60 * 60 * 1000),
                                            ),
                                        ),
                                    },
                                    estimatedDeliveryAt:
                                        sourceTiming.selfDeliveryQuote.estimatedDeliveryAt,
                                },
                            ],
                        ]
                        : [];

                return [...vehicleChoices, ...directChoices, ...selfDeliveryChoices];
            });

            if (choicesBySource.some((choices) => choices.length === 0)) {
                return empty();
            }

            let combinations: SelectedVehicleShipment[][] = [[]];

            for (const sourceChoices of choicesBySource) {
                const next: SelectedVehicleShipment[][] = [];

                for (const combination of combinations) {
                    for (const choice of sourceChoices) {
                        next.push([...combination, ...choice]);

                        if (next.length >= this.maxOptionsPerPlan) break;
                    }

                    if (next.length >= this.maxOptionsPerPlan) break;
                }

                combinations = next;
            }

            groupChoices.push(
                combinations.map((shipments) => {
                    const price = shipments.reduce(
                        (sum, shipment) => sum + shipment.quote.price,
                        0,
                    );

                    const estimatedDays = Math.max(
                        ...shipments.map((shipment) =>
                            shipment.quote.estimatedDays,
                        ),
                    );

                    return {
                        groupId: groupQuote.groupId,
                        pickupCities: groupQuote.pickupCities,
                        destinationCity: groupQuote.destinationCity,
                        weightKg: groupQuote.weightKg,
                        shipments,
                        quote: {
                            carrierName: 'Combined shipment',
                            serviceName: 'Multi-vehicle delivery',
                            price,
                            currency: 'ILS' as const,
                            estimatedDays,
                        },
                    };
                }),
            );
        }

        if (groupChoices.length === 0) return empty();

        let combinations: SelectedGroupQuote[][] = [[]];

        for (const choices of groupChoices) {
            const next: SelectedGroupQuote[][] = [];

            for (const combination of combinations) {
                for (const choice of choices) {
                    next.push([...combination, choice]);

                    if (next.length >= this.maxOptionsPerPlan) break;
                }

                if (next.length >= this.maxOptionsPerPlan) break;
            }

            combinations = next;
        }

        const deliveryOptions = combinations.map(
            (selectedGroupQuotes, index): ShipmentPlanDeliveryOption => {
                const shipments = selectedGroupQuotes.flatMap(
                    (group) => group.shipments ?? [],
                );

                const totalShippingPrice = shipments.reduce(
                    (sum, shipment) => sum + shipment.quote.price,
                    0,
                );
                const estimatedDeliveryAt =
                    shipments.length > 0 &&
                        shipments.every((shipment) => shipment.estimatedDeliveryAt)
                        ? new Date(
                            Math.max(
                                ...shipments.map((shipment) =>
                                    new Date(shipment.estimatedDeliveryAt!).getTime(),
                                ),
                            ),
                        ).toISOString()
                        : undefined;
                const averageProviderPriority = shipments.length
                    ? shipments.reduce(
                        (sum, shipment) =>
                            sum + (shipment.quote.providerPriority ?? 0),
                        0,
                    ) / shipments.length
                    : 0;

                return {
                    id: `${quotedPlan.plan.id}-delivery-${index + 1}`,
                    planId: quotedPlan.plan.id,
                    selectedGroupQuotes,
                    metrics: {
                        totalShippingPrice,
                        estimatedDeliveryDays: Math.max(
                            ...shipments.map((shipment) =>
                                shipment.quote.estimatedDays,
                            ),
                        ),
                        pickupLeadTimeMinutes: quotedPlan.pickupLeadTimeMinutes,
                        estimatedDeliveryAt,
                        averageProviderPriority,
                        shipmentCount: shipments.length,
                    },
                };
            },
        );

        return {
            quotedPlan,
            deliveryOptions,
            statistics: {
                theoreticalCombinations: groupChoices.reduce(
                    (total, choices) => total * choices.length,
                    1,
                ),
                generatedCombinations: deliveryOptions.length,
                generationLimitReached:
                    groupChoices.reduce(
                        (total, choices) => total * choices.length,
                        1,
                    ) > this.maxOptionsPerPlan,
            },
        };
    }

    private buildSourceChoices(
        sourceId: string,
        plan: ProviderVehiclePlanQuoteResult,
        travelMinutes?: number,
        estimatedDeliveryAt?: string,
    ): SelectedVehicleShipment[][] {
        const alternatives = plan.alternatives ?? [];

        return alternatives.flatMap((alternative) => {
            const shipments: SelectedVehicleShipment[] = [];

            for (let index = 0; index < plan.plan.vehicles.length; index++) {
                const vehicle = plan.plan.vehicles[index];
                const vehicleQuotes = plan.vehicleQuotes[index];

                if (!vehicleQuotes) return [];

                const quote = vehicleQuotes.quotes.find(
                    (candidate) => candidate.urgency === alternative.urgency,
                );

                if (!quote) return [];

                shipments.push({
                    sourceId,
                    deliveryMethod: 'carrier',

                    vehicleIndex: index,
                    vehicleType: vehicle.vehicleType,
                    assignedWeightKg: vehicle.assignedWeightKg,
                    items: vehicle.items.map((item) => ({ ...item })),
                    quote,
                    travelMinutes,
                    estimatedDeliveryAt,
                });
            }

            return [shipments];
        });
    }
}
