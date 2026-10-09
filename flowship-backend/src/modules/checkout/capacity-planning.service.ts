import { Injectable } from '@nestjs/common';
import { CheckoutItem } from './interfaces/checkout.interface';
import type { ProviderRow } from '../carriers/carriers.service';
export type VehicleType =
    | 'scooter'
    | 'car'
    | 'commercial';

export interface VehicleCapacity {
    vehicleType: VehicleType;
    maxWeightKg: number | null;
}
export interface ProviderVehiclePlan {
    providerId: string;
    providerCode: string;
    plan: VehiclePlan;
}
export interface VehiclePlanPart {
    vehicleType: VehicleType;
    vehicleCount: number;
    maxWeightPerVehicleKg: number | null;
    assignedWeightKg: number;
    items: VehiclePlanItem[];
}

export interface VehiclePlan {
    parts: VehiclePlanPart[];
    vehicles: PlannedVehicle[];
}
export interface VehiclePlanItem {
    sku: string;
    quantity: number;
    unitWeightKg: number;
}
export interface PlannedVehicle {
    vehicleType: VehicleType;
    maxWeightKg: number | null;
    assignedWeightKg: number;
    items: VehiclePlanItem[];
}
export type CapacityPlanRejectionReason =
    | 'INSUFFICIENT_TOTAL_CAPACITY'
    | 'NON_MINIMAL_COMMERCIAL_PLAN'
    | 'ITEMS_DO_NOT_FIT_VEHICLES'
    | 'UNUSED_VEHICLE';
export interface CapacityPlanCandidateTrace {
    plan: VehiclePlan;

    status:
    | 'accepted'
    | 'rejected';

    rejectionReason:
    CapacityPlanRejectionReason | null;
}

export interface ProviderCapacityPlanningTrace {
    providerId: string;
    providerCode: string;

    weightKg: number;

    capacities: VehicleCapacity[];

    candidates: CapacityPlanCandidateTrace[];

    acceptedPlans: VehiclePlan[];
}
@Injectable()
export class CapacityPlanningService {
    getVehicleCapacities(
        scooterMaxWeightKg: number,
        carMaxWeightKg: number,
    ): VehicleCapacity[] {
        return [
            {
                vehicleType: 'scooter',
                maxWeightKg: scooterMaxWeightKg,
            },
            {
                vehicleType: 'car',
                maxWeightKg: carMaxWeightKg,
            },
            {
                vehicleType: 'commercial',
                maxWeightKg: null,
            },
        ];
    }
    canVehicleCarryWeight(
        capacity: VehicleCapacity,
        weightKg: number,
    ): boolean {
        if (capacity.maxWeightKg === null) {
            return true;
        }

        return weightKg <= capacity.maxWeightKg;
    }
    getEligibleVehicles(
        weightKg: number,
        capacities: VehicleCapacity[],
    ): VehicleCapacity[] {
        return capacities.filter((capacity) =>
            this.canVehicleCarryWeight(
                capacity,
                weightKg,
            ),
        );
    }
    getRequiredVehicleCount(
        weightKg: number,
        capacity: VehicleCapacity,
    ): number {
        if (capacity.maxWeightKg === null) {
            return 1;
        }

        return Math.ceil(
            weightKg / capacity.maxWeightKg,
        );
    }
    generateSingleVehicleTypePlans(
        weightKg: number,
        capacities: VehicleCapacity[],
    ): VehiclePlan[] {
        return capacities.map((capacity) => ({
            parts: [
                {
                    vehicleType: capacity.vehicleType,
                    vehicleCount:
                        this.getRequiredVehicleCount(
                            weightKg,
                            capacity,
                        ),
                    maxWeightPerVehicleKg:
                        capacity.maxWeightKg,
                    assignedWeightKg: weightKg,
                    items: [],

                },
            ],
            vehicles: [],

        }));
    }
    getPlanMaxWeightKg(
        plan: VehiclePlan,
    ): number | null {
        let totalCapacity = 0;

        for (const part of plan.parts) {
            if (part.maxWeightPerVehicleKg === null) {
                return null;
            }

            totalCapacity +=
                part.maxWeightPerVehicleKg *
                part.vehicleCount;
        }

        return totalCapacity;
    }
    generateMixedVehiclePlans(
        weightKg: number,
        capacities: VehicleCapacity[],
    ): VehiclePlan[] {
        const plans: VehiclePlan[] = [];

        for (let i = 0; i < capacities.length; i++) {
            for (
                let j = i + 1;
                j < capacities.length;
                j++
            ) {
                const first = capacities[i];
                const second = capacities[j];
                const firstAssignedWeightKg =
                    first.maxWeightKg === null
                        ? weightKg
                        : Math.min(
                            weightKg,
                            first.maxWeightKg,
                        );

                const secondAssignedWeightKg =
                    weightKg - firstAssignedWeightKg;
                plans.push({
                    parts: [
                        {
                            vehicleType: first.vehicleType,
                            vehicleCount: 1,
                            maxWeightPerVehicleKg:
                                first.maxWeightKg,
                            assignedWeightKg: firstAssignedWeightKg,
                            items: [],
                        },
                        {
                            vehicleType: second.vehicleType,
                            vehicleCount: 1,
                            maxWeightPerVehicleKg:
                                second.maxWeightKg,
                            assignedWeightKg: secondAssignedWeightKg,
                            items: [],
                        },
                    ],
                    vehicles: [],
                });
            }
        }

        return plans;
    }
    canPlanCarryWeight(
        plan: VehiclePlan,
        weightKg: number,
    ): boolean {
        const maxWeightKg =
            this.getPlanMaxWeightKg(plan);

        if (maxWeightKg === null) {
            return true;
        }

        return weightKg <= maxWeightKg;
    }
    generateVehiclePlans(
        weightKg: number,
        capacities: VehicleCapacity[],
    ): VehiclePlan[] {
        const singleTypePlans =
            this.generateSingleVehicleTypePlans(
                weightKg,
                capacities,
            );
        const mixedPlans =
            this.generateMixedVehiclePlans(
                weightKg,
                capacities,
            );

        return [
            ...singleTypePlans,
            ...mixedPlans,
        ].filter(
            (plan) =>
                this.canPlanCarryWeight(
                    plan,
                    weightKg,
                ) &&
                this.isMinimalPlan(plan),
        );
    }
    generateVehiclePlanTrace(
        weightKg: number,
        capacities: VehicleCapacity[],
        items: VehiclePlanItem[],
    ): CapacityPlanCandidateTrace[] {
        const candidates = [
            ...this.generateSingleVehicleTypePlans(
                weightKg,
                capacities,
            ),
            ...this.generateMixedVehiclePlans(
                weightKg,
                capacities,
            ),
        ];

        return candidates.map((plan) => {
            if (
                !this.canPlanCarryWeight(
                    plan,
                    weightKg,
                )
            ) {
                return {
                    plan,
                    status: 'rejected' as const,
                    rejectionReason:
                        'INSUFFICIENT_TOTAL_CAPACITY' as const,
                };
            }

            if (!this.isMinimalPlan(plan)) {
                return {
                    plan,
                    status: 'rejected' as const,
                    rejectionReason:
                        'NON_MINIMAL_COMMERCIAL_PLAN' as const,
                };
            }

            const assignedPlan =
                this.assignItemsToPlan(
                    plan,
                    items,
                );

            if (!assignedPlan) {
                return {
                    plan,
                    status: 'rejected' as const,
                    rejectionReason:
                        'ITEMS_DO_NOT_FIT_VEHICLES' as const,
                };
            }

            if (this.hasUnusedVehicle(assignedPlan)) {
                return {
                    plan: assignedPlan,
                    status: 'rejected' as const,
                    rejectionReason:
                        'UNUSED_VEHICLE' as const,
                };
            }

            return {
                plan: assignedPlan,
                status: 'accepted' as const,
                rejectionReason: null,
            };
        });
    }
    isMinimalPlan(
        plan: VehiclePlan,
    ): boolean {
        const hasCommercial =
            plan.parts.some(
                (part) =>
                    part.vehicleType === 'commercial',
            );

        if (hasCommercial) {
            return plan.parts.length === 1;
        }

        return true;
    }
    expandItemsToUnits(
        items: CheckoutItem[],
    ): VehiclePlanItem[] {
        return items.flatMap((item) =>
            Array.from(
                { length: item.quantity },
                () => ({
                    sku: item.sku,
                    quantity: 1,
                    unitWeightKg:
                        item.unitWeight!,
                }),
            ),
        );
    }
    takeItemsUpToCapacity(
        items: VehiclePlanItem[],
        maxWeightKg: number,
    ): VehiclePlanItem[] {
        const selectedItems: VehiclePlanItem[] = [];
        let currentWeightKg = 0;

        for (const item of items) {
            if (
                currentWeightKg +
                item.unitWeightKg <=
                maxWeightKg
            ) {
                selectedItems.push(item);
                currentWeightKg +=
                    item.unitWeightKg;
            }
        }

        return selectedItems;
    }
    splitItemsByCapacity(
        items: VehiclePlanItem[],
        maxWeightKg: number,
    ): {
        selectedItems: VehiclePlanItem[];
        remainingItems: VehiclePlanItem[];
    } {
        const selectedItems: VehiclePlanItem[] = [];
        const remainingItems: VehiclePlanItem[] = [];

        let currentWeightKg = 0;

        for (const item of items) {
            if (
                currentWeightKg +
                item.unitWeightKg <=
                maxWeightKg
            ) {
                selectedItems.push(item);
                currentWeightKg +=
                    item.unitWeightKg;
            } else {
                remainingItems.push(item);
            }
        }

        return {
            selectedItems,
            remainingItems,
        };
    }
    splitItemsAcrossVehicles(
        items: VehiclePlanItem[],
        vehicleCount: number,
        maxWeightPerVehicleKg: number,
    ): {
        vehicleItems: VehiclePlanItem[][];
        remainingItems: VehiclePlanItem[];
    } {
        const vehicleItems: VehiclePlanItem[][] = [];

        let remainingItems = [...items];

        for (
            let i = 0;
            i < vehicleCount;
            i++
        ) {
            const split =
                this.splitItemsByCapacity(
                    remainingItems,
                    maxWeightPerVehicleKg,
                );

            vehicleItems.push(
                split.selectedItems,
            );

            remainingItems =
                split.remainingItems;
        }

        return {
            vehicleItems,
            remainingItems,
        };
    }
    buildPlannedVehicles(
        vehicleType: VehicleType,
        maxWeightKg: number | null,
        vehicleItems: VehiclePlanItem[][],
    ): PlannedVehicle[] {
        return vehicleItems.map((items) => ({
            vehicleType,
            maxWeightKg,
            assignedWeightKg: items.reduce(
                (total, item) =>
                    total + item.unitWeightKg,
                0,
            ),
            items,
        }));
    }
    assignItemsToSingleTypePlan(
        plan: VehiclePlan,
        items: VehiclePlanItem[],
    ): VehiclePlan | null {
        if (plan.parts.length !== 1) {
            return null;
        }

        const part = plan.parts[0];

        if (part.maxWeightPerVehicleKg === null) {
            const vehicles =
                this.buildPlannedVehicles(
                    part.vehicleType,
                    null,
                    [items],
                );

            return {
                ...plan,
                vehicles,
            };
        }

        const split =
            this.splitItemsAcrossVehicles(
                items,
                part.vehicleCount,
                part.maxWeightPerVehicleKg,
            );

        if (split.remainingItems.length > 0) {
            return null;
        }

        const vehicles =
            this.buildPlannedVehicles(
                part.vehicleType,
                part.maxWeightPerVehicleKg,
                split.vehicleItems,
            );

        return {
            ...plan,
            vehicles,
        };
    }
    assignItemsToMixedPlan(
        plan: VehiclePlan,
        items: VehiclePlanItem[],
    ): VehiclePlan | null {
        if (plan.parts.length <= 1) {
            return null;
        }

        let remainingItems = [...items];
        const vehicles: PlannedVehicle[] = [];

        for (const part of plan.parts) {
            if (part.maxWeightPerVehicleKg === null) {
                const plannedVehicles =
                    this.buildPlannedVehicles(
                        part.vehicleType,
                        null,
                        [remainingItems],
                    );

                vehicles.push(...plannedVehicles);
                remainingItems = [];
                continue;
            }

            const split =
                this.splitItemsAcrossVehicles(
                    remainingItems,
                    part.vehicleCount,
                    part.maxWeightPerVehicleKg,
                );

            const plannedVehicles =
                this.buildPlannedVehicles(
                    part.vehicleType,
                    part.maxWeightPerVehicleKg,
                    split.vehicleItems,
                );

            vehicles.push(...plannedVehicles);

            remainingItems =
                split.remainingItems;
        }

        if (remainingItems.length > 0) {
            return null;
        }

        return {
            ...plan,
            vehicles,
        };
    }
    assignItemsToPlan(
        plan: VehiclePlan,
        items: VehiclePlanItem[],
    ): VehiclePlan | null {
        if (plan.parts.length === 1) {
            return this.assignItemsToSingleTypePlan(
                plan,
                items,
            );
        }

        return this.assignItemsToMixedPlan(
            plan,
            items,
        );
    }
    assignItemsToPlans(
        plans: VehiclePlan[],
        items: VehiclePlanItem[],
    ): VehiclePlan[] {
        return plans
            .map((plan) =>
                this.assignItemsToPlan(
                    plan,
                    items,
                ),
            )
            .filter(
                (plan): plan is VehiclePlan =>
                    plan !== null &&
                    !this.hasUnusedVehicle(plan),
            );
    }
    planVehicles(
        weightKg: number,
        capacities: VehicleCapacity[],
        items: VehiclePlanItem[],
    ): VehiclePlan[] {
        const plans =
            this.generateVehiclePlans(
                weightKg,
                capacities,
            );

        return this.assignItemsToPlans(
            plans,
            items,
        );
    }
    getProviderVehicleCapacities(
        provider: ProviderRow,
    ): VehicleCapacity[] {
        const settings = provider.settings as
            | {
                vehicleWeightRules?: {
                    scooterMaxWeightKg?: number;
                    carMaxWeightKg?: number;
                };
            }
            | null;

        const rules =
            settings?.vehicleWeightRules;

        if (!rules) {
            return [];
        }

        const capacities: VehicleCapacity[] = [];

        if (
            Number.isFinite(
                rules.scooterMaxWeightKg,
            ) &&
            rules.scooterMaxWeightKg! > 0
        ) {
            capacities.push({
                vehicleType: 'scooter',
                maxWeightKg:
                    rules.scooterMaxWeightKg!,
            });
        }

        if (
            Number.isFinite(
                rules.carMaxWeightKg,
            ) &&
            rules.carMaxWeightKg! > 0
        ) {
            capacities.push({
                vehicleType: 'car',
                maxWeightKg:
                    rules.carMaxWeightKg!,
            });
        }

        return capacities;
    }
    planVehiclesForProvider(
        provider: ProviderRow,
        weightKg: number,
        items: VehiclePlanItem[],
    ): ProviderVehiclePlan[] {
        const capacities =
            this.getProviderVehicleCapacities(
                provider,
            );

        if (capacities.length === 0) {
            return [];
        }

        const plans = this.planVehicles(
            weightKg,
            capacities,
            items,
        );

        return plans.map((plan) => ({
            providerId: provider.id,
            providerCode: provider.code,
            plan,
        }));
    }
    planVehiclesForProviders(
        providers: ProviderRow[],
        weightKg: number,
        items: VehiclePlanItem[],
    ): ProviderVehiclePlan[] {
        return providers.flatMap((provider) =>
            this.planVehiclesForProvider(
                provider,
                weightKg,
                items,
            ),
        );
    }
    planVehicleTraceForProvider(
        provider: ProviderRow,
        weightKg: number,
        items: VehiclePlanItem[],
    ): ProviderCapacityPlanningTrace {
        const capacities =
            this.getProviderVehicleCapacities(
                provider,
            );

        const candidates =
            capacities.length === 0
                ? []
                : this.generateVehiclePlanTrace(
                    weightKg,
                    capacities,
                    items,
                );

        return {
            providerId: provider.id,
            providerCode: provider.code,
            weightKg,
            capacities,
            candidates,

            acceptedPlans: candidates
                .filter(
                    (candidate) =>
                        candidate.status === 'accepted',
                )
                .map(
                    (candidate) =>
                        candidate.plan,
                ),
        };
    }
    private hasUnusedVehicle(
        plan: VehiclePlan,
    ): boolean {
        return plan.vehicles.some(
            (vehicle) =>
                vehicle.assignedWeightKg <= 0,
        );
    }
}