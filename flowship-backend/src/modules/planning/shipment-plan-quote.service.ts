import { Injectable } from '@nestjs/common';
import type {
    VehicleQuoteResult, VehiclePlanQuoteAlternative,
} from './interfaces/shipment-plan-quote.interface';
import { CarriersService } from '../carriers/carriers.service';
import { CurrentTenant } from '../tenants/tenants.service';
import { ConfirmedShipmentPlan } from
    './shipment-plan-confirmation.service';
import { Inject } from '@nestjs/common';
import { DeliverySettingsService } from
    './delivery-settings.service';
import { DISTANCE_PROVIDER } from '../sourcing/sourcing.tokens';
import { CapacityPlanningService } from
    '../checkout/capacity-planning.service';
import type { DistanceProvider } from
    '../sourcing/interfaces/distance-provider.interface';
import { ShipmentPlanCandidate } from './interfaces/shipment-plan.interface';
import {
    QuotedShipmentPlan,
    ShipmentGroupQuoteResult,
} from './interfaces/shipment-plan-quote.interface';
import { CheckoutDestination } from '../checkout/interfaces/checkout.interface';
import type {
    PlannedVehicle,
    ProviderVehiclePlan,
} from
    '../checkout/capacity-planning.service';
import { CarrierQuoteRequest } from
    '../carriers/interfaces/carrier-adapter.interface';
@Injectable()
export class ShipmentPlanQuoteService {
    constructor(
        private readonly carriersService: CarriersService,
        @Inject(DISTANCE_PROVIDER)
        private readonly distanceProvider: DistanceProvider,
        private readonly deliverySettingsService:
            DeliverySettingsService,
        private readonly capacityPlanningService:
            CapacityPlanningService,
    ) { }

    async getQuotesForPlans(
        plans: ShipmentPlanCandidate[],
        destination: CheckoutDestination,
        tenant: CurrentTenant,
        confirmations: ConfirmedShipmentPlan[] = [],
        orderCreatedAt?: Date,
    ): Promise<QuotedShipmentPlan[]> {
        let expressMaxMinutes = 0;
        let sameDayMaxMinutes = 0;

        try {
            const settings =
                await this.deliverySettingsService.getSettings(tenant);

            expressMaxMinutes = settings.expressMaxMinutes;
            sameDayMaxMinutes = settings.sameDayMaxMinutes;
        } catch (error) {
            // כשל בקריאת ההגדרות:
            // חוסמים אקספרס, אך ממשיכים לבקש הצעות רגילות.
            console.error(
                'Failed to load tenant delivery settings',
                {
                    tenantId: tenant.id,
                    error,
                },
            );
        }
        return Promise.all(
            plans.map((plan) => {
                const confirmation = confirmations.find(
                    (result) => result.plan.id === plan.id,
                );

                return this.getQuotesForPlan(
                    plan,
                    destination,
                    tenant,
                    expressMaxMinutes,
                    sameDayMaxMinutes,
                    confirmation,
                    orderCreatedAt,
                );
            }),
        );
    }
    private async getQuotesForPlan(
        plan: ShipmentPlanCandidate,
        destination: CheckoutDestination,
        tenant: CurrentTenant,
        expressMaxMinutes: number,
        sameDayMaxMinutes: number,
        confirmation?: ConfirmedShipmentPlan,
        orderCreatedAt?: Date,
    ): Promise<QuotedShipmentPlan> {
        const shipmentGroups =
            plan.grouping?.shipmentGroups ?? [];

        const groupQuotes = await Promise.all(
            shipmentGroups.map((group) =>
                this.getQuotesForGroup(
                    group,
                    destination,
                    tenant,
                    expressMaxMinutes,
                    sameDayMaxMinutes,
                    confirmation,
                    orderCreatedAt,
                )
            ),
        );


        const getGroupQuotesCount = (
            groupQuote: ShipmentGroupQuoteResult,
        ): number => {
            if (groupQuote.vehiclePlans?.length) {
                return groupQuote.vehiclePlans.reduce(
                    (planSum, vehiclePlan) =>
                        planSum +
                        vehiclePlan.vehicleQuotes.reduce(
                            (vehicleSum, vehicleQuote) =>
                                vehicleSum +
                                vehicleQuote.quotes.length,
                            0,
                        ),
                    0,
                );
            }

            return groupQuote.quotes.length;
        };

        const quotedGroupsCount =
            groupQuotes.filter(
                (groupQuote) =>
                    getGroupQuotesCount(groupQuote) > 0,
            ).length;

        const groupsWithoutQuotesCount =
            groupQuotes.length -
            quotedGroupsCount;

        const totalQuotesCount =
            groupQuotes.reduce(
                (sum, groupQuote) =>
                    sum +
                    getGroupQuotesCount(groupQuote),
                0,
            );
        let status: QuotedShipmentPlan['status'];

        if (
            groupQuotes.length > 0 &&
            groupsWithoutQuotesCount === 0
        ) {
            status = 'quoted';
        } else if (quotedGroupsCount > 0) {
            status = 'partially_quoted';
        } else {
            status = 'quote_failed';
        }

        return {
            plan,

            groupQuotes,

            quoteMetrics: {
                quotedGroupsCount,
                groupsWithoutQuotesCount,
                totalQuotesCount,
            },

            status,
        };
    }
    private async getQuotesForVehicle(
        vehicle: PlannedVehicle,
        providerId: string,
        request: CarrierQuoteRequest,
        tenant: CurrentTenant,
    ) {
        return this.carriersService.getQuotes(
            {
                ...request,
                weightKg: vehicle.assignedWeightKg,
                vehicleType: vehicle.vehicleType,
            },
            tenant,
            providerId,
        );
    }
    private async getQuotesForVehiclePlan(
        providerVehiclePlan: ProviderVehiclePlan,
        request: CarrierQuoteRequest,
        tenant: CurrentTenant,
    ): Promise<VehicleQuoteResult[]> {
        const results = await Promise.all(
            providerVehiclePlan.plan.vehicles.map(
                (vehicle) =>
                    this.getQuotesForVehicle(
                        vehicle,
                        providerVehiclePlan.providerId,
                        request,
                        tenant,
                    ),
            ),
        );

        return providerVehiclePlan.plan.vehicles.map(
            (vehicle, index) => ({
                vehicleType: vehicle.vehicleType,
                assignedWeightKg:
                    vehicle.assignedWeightKg,
                quotes: results[index].quotes,
                failedProviders:
                    results[index].failedProviders,
            }),
        );
    }
    private async getQuotesForGroup(
        group: NonNullable<
            ShipmentPlanCandidate['grouping']
        >['shipmentGroups'][number],
        destination: CheckoutDestination,
        tenant: CurrentTenant,
        expressMaxMinutes: number,
        sameDayMaxMinutes: number,
        confirmation?: ConfirmedShipmentPlan,
        orderCreatedAt?: Date,
    ): Promise<ShipmentGroupQuoteResult> {
        if (group.sources.length === 0) {
            throw new Error(
                `Shipment group ${group.groupId} has no supply sources`,
            );
        }
        const vehiclePlanItems =
            group.items.flatMap((item) =>
                Array.from(
                    { length: item.quantity },
                    () => ({
                        sku: item.sku,
                        quantity: 1,
                        unitWeightKg: item.unitWeight,
                    }),
                ),
            );
        const providers =
            await this.carriersService.getActiveProviders(
                tenant,
            );

        const providerVehiclePlans =
            this.capacityPlanningService
                .planVehiclesForProviders(
                    providers,
                    group.totalWeight,
                    vehiclePlanItems,
                );
        const capacityPlanningTrace =
            providers.map((provider) =>
                this.capacityPlanningService
                    .planVehicleTraceForProvider(
                        provider,
                        group.totalWeight,
                        vehiclePlanItems,
                    ),
            );
        const pickupSources = group.sources.map((source) => {
            const sourceConfirmation =
                confirmation?.confirmations.find(
                    (item) => item.sourceId === source.id,
                );

            if (!sourceConfirmation) {
                throw new Error(
                    `Missing confirmation for source ${source.id}`,
                );
            }

            const { preparationMinutes, confirmedAt } =
                sourceConfirmation;

            if (
                preparationMinutes === null ||
                !Number.isFinite(preparationMinutes) ||
                preparationMinutes < 0
            ) {
                throw new Error(
                    `Invalid preparation time for source ${source.id}`,
                );
            }

            const readyAt = new Date(
                new Date(confirmedAt).getTime() +
                preparationMinutes * 60_000,
            );

            return {
                sourceId: source.id,
                address:
                    `${source.location.street} ` +
                    `${source.location.houseNumber}, ` +
                    source.location.city,
                readyAt: readyAt.toISOString(),
            };
        });

        const readyAt = new Date(
            Math.max(
                ...pickupSources.map(
                    (source) => new Date(source.readyAt).getTime(),
                ),
            ),
        ).toISOString();
        // מועד המסירה האחרון לפי הגדרות הטננט
        // מועד המסירה האחרון למשלוח מהיר
        const expressDeadline = orderCreatedAt
            ? new Date(
                new Date(orderCreatedAt).getTime() +
                expressMaxMinutes * 60_000,
            )
            : null;

        // מועד המסירה האחרון למשלוח מהיום להיום
        const sameDayDeadline = orderCreatedAt
            ? new Date(
                new Date(orderCreatedAt).getTime() +
                sameDayMaxMinutes * 60_000,
            )
            : null;

        // הזמן שנותר למשלוח מהיר מרגע שכל המקורות מוכנים
        const expressRemainingMinutes = expressDeadline
            ? Math.floor(
                (
                    expressDeadline.getTime() -
                    new Date(readyAt).getTime()
                ) / 60_000,
            )
            : null;

        // הזמן שנותר למשלוח מהיום להיום
        // מרגע שכל המקורות מוכנים
        const sameDayRemainingMinutes = sameDayDeadline
            ? Math.floor(
                (
                    sameDayDeadline.getTime() -
                    new Date(readyAt).getTime()
                ) / 60_000,
            )
            : null;
        let estimatedTravelMinutes: number | undefined;

        // צריך זמן נסיעה אם לפחות אחד משני חלונות
        // המשלוח עדיין פתוח.
        const shouldEstimateTravelTime =
            (
                expressRemainingMinutes !== null &&
                expressRemainingMinutes > 0
            ) ||
            (
                sameDayRemainingMinutes !== null &&
                sameDayRemainingMinutes > 0
            );

        if (
            shouldEstimateTravelTime &&
            group.sources.length === 1
        ) {
            try {
                const distance =
                    await this.distanceProvider.getDistance(
                        group.sources[0].location,
                        destination,
                    );

                if (
                    distance.durationMinutes !== undefined &&
                    Number.isFinite(distance.durationMinutes) &&
                    distance.durationMinutes >= 0
                ) {
                    estimatedTravelMinutes = Math.ceil(
                        distance.durationMinutes,
                    );
                }
            } catch {
                // זמן הנסיעה אינו ידוע.
                // לא נאשר שירות מוגבל בזמן ללא הערכה תקינה.
            }
        }

        const canOfferExpress =
            expressRemainingMinutes !== null &&
            expressRemainingMinutes > 0 &&
            estimatedTravelMinutes !== undefined &&
            estimatedTravelMinutes <= expressRemainingMinutes;

        const canOfferSameDay =
            sameDayRemainingMinutes !== null &&
            sameDayRemainingMinutes > 0 &&
            estimatedTravelMinutes !== undefined &&
            estimatedTravelMinutes <= sameDayRemainingMinutes;

        const pickupCities =
            group.sources.map(
                (source) =>
                    source.location.city,
            );
        const pickupAddress =
            group.sources
                .map(
                    (source) =>
                        `${source.location.street} ${source.location.houseNumber}, ${source.location.city}`,
                )
                .join(' | ');

        const destinationAddress =
            `${destination.street} ${destination.houseNumber}, ${destination.city}`;
        const quoteRequest: CarrierQuoteRequest = {
            pickupCities,
            destinationCity: destination.city,
            weightKg: group.totalWeight,
            pickupAddress,
            destinationAddress,
            readyAt,
            pickupSources,
            allowedUrgencies: [
                ...(canOfferExpress
                    ? (['urgent'] as const)
                    : []),
                ...(canOfferSameDay
                    ? (['express'] as const)
                    : []),
                'standard' as const,
            ],
        };
        const result =
            providerVehiclePlans.length === 0
                ? await this.carriersService.getQuotes(
                    quoteRequest,
                    tenant,
                )
                : {
                    quotes: [],
                    failedProviders: [],
                };

        const vehiclePlans =
            await Promise.all(
                providerVehiclePlans.map(
                    async (providerVehiclePlan) => {
                        const vehicleQuotes =
                            await this.getQuotesForVehiclePlan(
                                providerVehiclePlan,
                                quoteRequest,
                                tenant,
                            );

                        return {
                            providerId:
                                providerVehiclePlan.providerId,

                            providerCode:
                                providerVehiclePlan.providerCode,
                            plan:
                                providerVehiclePlan.plan,
                            vehicleQuotes,

                            alternatives:
                                this.buildVehiclePlanAlternatives(
                                    vehicleQuotes,
                                ),
                        };
                    },
                ),
            );
        return {
            groupId: group.groupId,

            pickupCities,
            destinationCity: destination.city,
            weightKg: group.totalWeight,

            quotes: result.quotes,
            failedProviders: result.failedProviders,
            vehiclePlans,
            capacityPlanningTrace,

        };
    }
    private buildVehiclePlanAlternatives(
        vehicleQuotes: VehicleQuoteResult[],
    ): VehiclePlanQuoteAlternative[] {
        const urgencies = [
            'urgent',
            'express',
            'standard',
        ] as const;

        return urgencies.flatMap((urgency) => {
            const matchingQuotes =
                vehicleQuotes.map((vehicleQuote) =>
                    vehicleQuote.quotes.find(
                        (quote) =>
                            quote.urgency === urgency,
                    ),
                );

            const hasQuoteForEveryVehicle =
                matchingQuotes.every(
                    (quote) => quote !== undefined,
                );

            if (!hasQuoteForEveryVehicle) {
                return [];
            }

            const quotes =
                matchingQuotes.filter(
                    (
                        quote,
                    ): quote is NonNullable<
                        typeof quote
                    > => quote !== undefined,
                );

            return [
                {
                    urgency,
                    totalPrice: quotes.reduce(
                        (sum, quote) =>
                            sum + quote.price,
                        0,
                    ),
                    currency: 'ILS' as const,
                    vehicleCount:
                        vehicleQuotes.length,
                    estimatedDays: Math.max(
                        ...quotes.map(
                            (quote) =>
                                quote.estimatedDays,
                        ),
                    ),
                    providerPriority:
                        quotes[0]?.providerPriority,
                },
            ];
        });
    }
}