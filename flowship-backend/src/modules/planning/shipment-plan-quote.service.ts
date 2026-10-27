import { Injectable } from '@nestjs/common';
import type { DeliverySettings } from './delivery-settings.service';
import { splitShipmentGroupBySource } from './utils/split-shipment-group-by-source';
import { SourceDeliveryPermissionsService } from
    '../sourcing/source-delivery-permissions.service';
import type { SelfDeliveryQuoteResponse } from '../sourcing/interfaces/self-delivery-provider.interface';
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
import { SELF_DELIVERY_PROVIDER } from
    '../sourcing/sourcing.tokens';

import type { SelfDeliveryProvider } from
    '../sourcing/interfaces/self-delivery-provider.interface';
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
        private readonly sourceDeliveryPermissionsService:
            SourceDeliveryPermissionsService,
        @Inject(SELF_DELIVERY_PROVIDER)
        private readonly selfDeliveryProvider: SelfDeliveryProvider,
    ) { }

    private resolveExpressMaxMinutes(
        settings: DeliverySettings,
        tenantTimezone: string,
        orderCreatedAt?: Date,
    ): number {
        if (!settings.expressCutoffTime) {
            return settings.expressMaxMinutes;
        }

        if (!orderCreatedAt) {
            return 0;
        }

        const orderDate = new Date(orderCreatedAt);

        if (Number.isNaN(orderDate.getTime())) {
            return 0;
        }

        const formatter = new Intl.DateTimeFormat('en-GB', {
            timeZone: tenantTimezone,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        });

        const parts = formatter.formatToParts(orderDate);

        const getPart = (type: string): number =>
            Number(parts.find((part) => part.type === type)?.value);

        const orderSeconds =
            getPart('hour') * 3600 +
            getPart('minute') * 60 +
            getPart('second');

        const [hour, minute, second = 0] =
            settings.expressCutoffTime.split(':').map(Number);

        const cutoffSeconds =
            hour * 3600 + minute * 60 + second;

        if (orderSeconds < cutoffSeconds) {
            return settings.expressMaxMinutes;
        }

        if (settings.expressAfterCutoffMode === 'disabled') {
            return 0;
        }

        return settings.expressAfterCutoffMaxMinutes ?? 0;
    }

    async getQuotesForPlans(
        plans: ShipmentPlanCandidate[],
        destination: CheckoutDestination,
        tenant: CurrentTenant,
        confirmations: ConfirmedShipmentPlan[] = [],
        orderCreatedAt?: Date,
        storeId?: string,
    ): Promise<QuotedShipmentPlan[]> {
        let expressMaxMinutes = 0;
        let sameDayMaxMinutes = 0;
        let pickupLeadTimeMinutes = 0;

        try {
            const settings =
                await this.deliverySettingsService.getSettings(tenant);

            expressMaxMinutes = this.resolveExpressMaxMinutes(
                settings,
                tenant.timezone,
                orderCreatedAt,
            );

            sameDayMaxMinutes = settings.sameDayMaxMinutes;
            pickupLeadTimeMinutes = settings.pickupLeadTimeMinutes;
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
                    pickupLeadTimeMinutes,
                    confirmation,
                    orderCreatedAt,
                    storeId,

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
        pickupLeadTimeMinutes: number,
        confirmation?: ConfirmedShipmentPlan,
        orderCreatedAt?: Date,
        storeId?: string,
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
                    pickupLeadTimeMinutes,
                    confirmation,
                    orderCreatedAt,
                    storeId,
                )
            ),
        );


        const getGroupQuotesCount = (
            groupQuote: ShipmentGroupQuoteResult,
        ): number => {
            const group = shipmentGroups.find(
                (item) => item.groupId === groupQuote.groupId,
            );

            if (!group) {
                return 0;
            }

            const requiredSourceIds = [
                ...new Set(group.items.map((item) => item.sourceId)),
            ];

            if (
                requiredSourceIds.length === 0 ||
                requiredSourceIds.some((sourceId) => !sourceId)
            ) {
                return 0;
            }

            const sourceQuotes = groupQuote.sourceDirectQuotes ?? [];
            const vehiclePlans = groupQuote.vehiclePlans ?? [];

            const allSourcesCovered = requiredSourceIds.every(
                (sourceId) =>
                    sourceQuotes.some(
                        (entry) =>
                            entry.sourceId === sourceId &&
                            entry.quotes.length > 0,
                    ) ||
                    vehiclePlans.some(
                        (entry) =>
                            entry.sourceId === sourceId &&
                            (entry.alternatives?.length ?? 0) > 0,
                    ),
            );

            if (!allSourcesCovered) {
                return 0;
            }

            return (
                sourceQuotes.reduce(
                    (sum, entry) => sum + entry.quotes.length,
                    0,
                ) +
                vehiclePlans.reduce(
                    (sum, entry) =>
                        sum + (entry.alternatives?.length ?? 0),
                    0,
                )
            );
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

            pickupLeadTimeMinutes,

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
        pickupLeadTimeMinutes: number,
        confirmation?: ConfirmedShipmentPlan,
        orderCreatedAt?: Date,
        storeId?: string,
    ): Promise<ShipmentGroupQuoteResult> {
        if (group.sources.length === 0) {
            throw new Error(
                `Shipment group ${group.groupId} has no supply sources`,
            );
        }
        const sourceGroups = splitShipmentGroupBySource(group);


        const selfDeliverySettings = storeId
            ? await this.sourceDeliveryPermissionsService
                .getSettingsForStore(tenant, storeId)
            : new Map();


        const providers =
            await this.carriersService.getActiveProviders(tenant);
        const sourceVehiclePlans = sourceGroups.map((sourceGroup) => {

            const deliverySettings =
                selfDeliverySettings.get(sourceGroup.source.id);

            const selfDeliveryPrice =
                deliverySettings?.selfDeliveryPrice ?? null;

            const isSelfDeliveryEligible =
                sourceGroup.source.selfDeliveryEnabled === true &&
                deliverySettings?.selfDeliveryAllowed === true &&
                selfDeliveryPrice !== null &&
                Number.isFinite(selfDeliveryPrice) &&
                selfDeliveryPrice >= 0;

            const vehiclePlanItems = sourceGroup.items.flatMap((item) =>
                Array.from({ length: item.quantity }, () => ({
                    sku: item.sku,
                    quantity: 1,
                    unitWeightKg: item.unitWeight,
                })),
            );

            const providerVehiclePlans =
                this.capacityPlanningService.planVehiclesForProviders(
                    providers,
                    sourceGroup.totalWeight,
                    vehiclePlanItems,
                );

            for (const providerPlan of providerVehiclePlans) {
                const expected = new Map<string, number>();

                for (const item of sourceGroup.items) {
                    expected.set(
                        item.sku,
                        (expected.get(item.sku) ?? 0) + item.quantity,
                    );
                }

                const actual = new Map<string, number>();

                for (const vehicle of providerPlan.plan.vehicles) {
                    for (const item of vehicle.items) {
                        actual.set(
                            item.sku,
                            (actual.get(item.sku) ?? 0) + item.quantity,
                        );
                    }
                }

                if (
                    expected.size !== actual.size ||
                    [...expected].some(
                        ([sku, quantity]) => actual.get(sku) !== quantity,
                    )
                ) {
                    throw new Error(
                        `Vehicle plan does not cover all items for source ${sourceGroup.sourceId}`,
                    );
                }
            }

            const traces = providers.map((provider) =>
                this.capacityPlanningService.planVehicleTraceForProvider(
                    provider,
                    sourceGroup.totalWeight,
                    vehiclePlanItems,
                ),
            );

            return {
                sourceGroup,
                providerVehiclePlans,
                traces,
                isSelfDeliveryEligible,
                selfDeliveryPrice,

            };
        });

        const capacityPlanningTrace =
            sourceVehiclePlans.flatMap((entry) => entry.traces);
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

            const confirmedAtMs = new Date(confirmedAt).getTime();

            if (!Number.isFinite(confirmedAtMs)) {
                throw new Error(
                    `Invalid confirmation date for source ${source.id}`,
                );
            }

            const readyAt = new Date(
                confirmedAtMs + preparationMinutes * 60_000,
            ).toISOString();

            return {
                sourceId: source.id,
                address: `${source.location.street} ${source.location.houseNumber}, ${source.location.city}`,
                readyAt,
            };
        });



        const destinationAddress =
            `${destination.street} ${destination.houseNumber}, ${destination.city}`;

        const sourceResults = await Promise.all(
            sourceVehiclePlans.map(async ({
                sourceGroup,
                providerVehiclePlans,
                isSelfDeliveryEligible,
                selfDeliveryPrice,
            }) => {
                const pickupSource = pickupSources.find(
                    (source) => source.sourceId === sourceGroup.sourceId,
                );

                if (!pickupSource) {
                    throw new Error(
                        `Missing pickup source ${sourceGroup.sourceId}`,
                    );
                }

                const readyAtMs = new Date(pickupSource.readyAt).getTime();
                const orderCreatedAtMs = orderCreatedAt
                    ? new Date(orderCreatedAt).getTime()
                    : NaN;

                if (!Number.isFinite(readyAtMs)) {
                    throw new Error(
                        `Invalid readyAt for source ${sourceGroup.sourceId}`,
                    );
                }

                let travelMinutes: number | undefined;

                try {
                    const distance = await this.distanceProvider.getDistance(
                        sourceGroup.source.location,
                        destination,
                    );

                    if (
                        Number.isFinite(distance.durationMinutes) &&
                        distance.durationMinutes !== undefined &&
                        distance.durationMinutes >= 0
                    ) {
                        travelMinutes = Math.ceil(distance.durationMinutes);
                    }
                } catch {
                    // No reliable travel estimate: disable time-sensitive delivery.
                }
                const estimatedDeliveryAt =
                    travelMinutes !== undefined
                        ? new Date(
                            readyAtMs +
                            (pickupLeadTimeMinutes + travelMinutes) * 60_000,
                        ).toISOString()
                        : undefined;
                const remainingMinutes = (
                    maxMinutes: number,
                ): number | null => {
                    if (
                        !Number.isFinite(orderCreatedAtMs) ||
                        !Number.isFinite(maxMinutes) ||
                        maxMinutes <= 0
                    ) {
                        return null;
                    }

                    return (
                        orderCreatedAtMs +
                        maxMinutes * 60_000 -
                        readyAtMs
                    ) / 60_000 - pickupLeadTimeMinutes;
                };

                const expressRemainingMinutes =
                    remainingMinutes(expressMaxMinutes);

                const sameDayRemainingMinutes =
                    remainingMinutes(sameDayMaxMinutes);

                const canOfferExpress =
                    expressRemainingMinutes !== null &&
                    expressRemainingMinutes > 0 &&
                    travelMinutes !== undefined &&
                    travelMinutes <= expressRemainingMinutes;

                const canOfferSameDay =
                    sameDayRemainingMinutes !== null &&
                    sameDayRemainingMinutes > 0 &&
                    travelMinutes !== undefined &&
                    travelMinutes <= sameDayRemainingMinutes;

                let selfDeliveryQuote: SelfDeliveryQuoteResponse | null = null;
                if (isSelfDeliveryEligible && storeId) {
                    try {
                        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
                        const abortController = new AbortController();
                        try {
                            selfDeliveryQuote = await Promise.race([
                                this.selfDeliveryProvider.getQuote({
                                    storeId,
                                    sourceId: sourceGroup.sourceId,
                                    destination: {
                                        city: destination.city,
                                        street: destination.street,
                                        houseNumber: destination.houseNumber,

                                    },
                                    items: sourceGroup.items.map((item) => ({
                                        sku: item.sku,
                                        quantity: item.quantity,
                                    })),
                                    signal: abortController.signal,
                                }),
                                new Promise<never>((_, reject) => {
                                    timeoutHandle = setTimeout(() => {
                                        abortController.abort();

                                        reject(new Error('Self-delivery quote timeout'));
                                    }, 5000);
                                }),
                            ]);
                        } finally {
                            if (timeoutHandle !== undefined) {
                                clearTimeout(timeoutHandle);
                            }
                        }
                    } catch (error) {
                        // Provider failure must not block carrier quotes.
                        selfDeliveryQuote = null;
                    }
                }

                if (
                    selfDeliveryQuote?.accepted === true &&
                    selfDeliveryPrice !== null
                ) {
                    selfDeliveryQuote = {
                        ...selfDeliveryQuote,
                        price: selfDeliveryPrice,
                        currency: 'ILS',
                    };
                }

                const sourceQuoteRequest: CarrierQuoteRequest = {
                    pickupCities: [sourceGroup.source.location.city],
                    destinationCity: destination.city,
                    weightKg: sourceGroup.totalWeight,
                    pickupAddress: pickupSource.address,
                    destinationAddress,
                    readyAt: pickupSource.readyAt,
                    pickupSources: [pickupSource],
                    allowedUrgencies: [
                        ...(canOfferExpress ? (['urgent'] as const) : []),
                        ...(canOfferSameDay ? (['express'] as const) : []),
                        'standard' as const,
                    ],
                };

                const result =
                    providerVehiclePlans.length === 0
                        ? await this.carriersService.getQuotes(
                            sourceQuoteRequest,
                            tenant,
                        )
                        : {
                            quotes: [],
                            failedProviders: [],
                        };

                const vehiclePlans = await Promise.all(
                    providerVehiclePlans.map(async (providerVehiclePlan) => {
                        const vehicleQuotes =
                            await this.getQuotesForVehiclePlan(
                                providerVehiclePlan,
                                sourceQuoteRequest,
                                tenant,
                            );

                        return {
                            sourceId: sourceGroup.sourceId,
                            providerId: providerVehiclePlan.providerId,
                            providerCode: providerVehiclePlan.providerCode,
                            plan: providerVehiclePlan.plan,
                            vehicleQuotes,
                            alternatives:
                                this.buildVehiclePlanAlternatives(vehicleQuotes),
                        };
                    }),
                );

                return {
                    sourceId: sourceGroup.sourceId,
                    result,
                    vehiclePlans,
                    travelMinutes,
                    estimatedDeliveryAt,
                    selfDeliveryQuote,
                };
            }),
        );

        return {
            groupId: group.groupId,
            pickupCities: sourceGroups.map(
                (entry) => entry.source.location.city,
            ),
            destinationCity: destination.city,
            weightKg: group.totalWeight,
            quotes: sourceResults.flatMap((entry) => entry.result.quotes),
            sourceDirectQuotes: sourceResults.map((entry) => ({
                sourceId: entry.sourceId,
                quotes: entry.result.quotes,
                travelMinutes: entry.travelMinutes,
                estimatedDeliveryAt: entry.estimatedDeliveryAt,
                selfDeliveryQuote: entry.selfDeliveryQuote,
            })),
            failedProviders: sourceResults.flatMap(
                (entry) => entry.result.failedProviders,
            ),
            vehiclePlans: sourceResults.flatMap(
                (entry) => entry.vehiclePlans,
            ),
            capacityPlanningTrace,
        };
    }
    private buildVehiclePlanAlternatives(

        vehicleQuotes: VehicleQuoteResult[],
    ): VehiclePlanQuoteAlternative[] {

        if (vehicleQuotes.length === 0) {
            return [];
        }
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