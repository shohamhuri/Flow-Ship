import { CapacityPlanningService } from './capacity-planning.service';

describe('CapacityPlanningService', () => {
    let service: CapacityPlanningService;

    beforeEach(() => {
        service = new CapacityPlanningService();
    });

    it('should generate valid vehicle plans for 70kg', () => {
        const capacities =
            service.getVehicleCapacities(
                48,
                50,
            );

        const plans =
            service.generateVehiclePlans(
                70,
                capacities,
            );




        expect(plans).toEqual([
            {
                parts: [
                    {
                        vehicleType: 'scooter',
                        vehicleCount: 2,
                        maxWeightPerVehicleKg: 48,
                        assignedWeightKg: 70,
                        items: [],
                    },
                ],
                vehicles: [],

            },
            {
                parts: [
                    {
                        vehicleType: 'car',
                        vehicleCount: 2,
                        maxWeightPerVehicleKg: 50,
                        assignedWeightKg: 70,
                        items: [],
                    },
                ],
                vehicles: [],

            },
            {
                parts: [
                    {
                        vehicleType: 'commercial',
                        vehicleCount: 1,
                        maxWeightPerVehicleKg: null,
                        assignedWeightKg: 70,
                        items: [],
                    },
                ],
                vehicles: [],

            },
            {
                parts: [
                    {
                        vehicleType: 'scooter',
                        vehicleCount: 1,
                        maxWeightPerVehicleKg: 48,
                        assignedWeightKg: 48,
                        items: [],
                    },
                    {
                        vehicleType: 'car',
                        vehicleCount: 1,
                        maxWeightPerVehicleKg: 50,
                        assignedWeightKg: 22,
                        items: [],
                    },
                ],
                vehicles: [],

            },
        ]);
    });
    it('should expand checkout items into individual units', () => {
        const units =
            service.expandItemsToUnits([
                {
                    sku: 'SKU-A',
                    name: 'Product A',
                    quantity: 2,
                    unitWeight: 30,
                    unitPrice: 100,
                },
                {
                    sku: 'SKU-B',
                    name: 'Product B',
                    quantity: 1,
                    unitWeight: 10,
                    unitPrice: 50,
                },
            ]);

        expect(units).toEqual([
            {
                sku: 'SKU-A',
                quantity: 1,
                unitWeightKg: 30,
            },
            {
                sku: 'SKU-A',
                quantity: 1,
                unitWeightKg: 30,
            },
            {
                sku: 'SKU-B',
                quantity: 1,
                unitWeightKg: 10,
            },
        ]);
    });
    it('should take only items that fit within vehicle capacity', () => {
        const selectedItems =
            service.takeItemsUpToCapacity(
                [
                    {
                        sku: 'A',
                        quantity: 1,
                        unitWeightKg: 30,
                    },
                    {
                        sku: 'B',
                        quantity: 1,
                        unitWeightKg: 25,
                    },
                    {
                        sku: 'C',
                        quantity: 1,
                        unitWeightKg: 15,
                    },
                ],
                48,
            );

        expect(selectedItems).toEqual([
            {
                sku: 'A',
                quantity: 1,
                unitWeightKg: 30,
            },
            {
                sku: 'C',
                quantity: 1,
                unitWeightKg: 15,
            },
        ]);
    });
    it('should split items into selected and remaining by capacity', () => {
        const result =
            service.splitItemsByCapacity(
                [
                    {
                        sku: 'A',
                        quantity: 1,
                        unitWeightKg: 30,
                    },
                    {
                        sku: 'B',
                        quantity: 1,
                        unitWeightKg: 25,
                    },
                    {
                        sku: 'C',
                        quantity: 1,
                        unitWeightKg: 15,
                    },
                ],
                48,
            );

        expect(result).toEqual({
            selectedItems: [
                {
                    sku: 'A',
                    quantity: 1,
                    unitWeightKg: 30,
                },
                {
                    sku: 'C',
                    quantity: 1,
                    unitWeightKg: 15,
                },
            ],
            remainingItems: [
                {
                    sku: 'B',
                    quantity: 1,
                    unitWeightKg: 25,
                },
            ],
        });
    });
    it('should split items across multiple vehicles', () => {
        const result =
            service.splitItemsAcrossVehicles(
                [
                    {
                        sku: 'A',
                        quantity: 1,
                        unitWeightKg: 30,
                    },
                    {
                        sku: 'B',
                        quantity: 1,
                        unitWeightKg: 25,
                    },
                    {
                        sku: 'C',
                        quantity: 1,
                        unitWeightKg: 15,
                    },
                ],
                2,
                48,
            );

        expect(result).toEqual({
            vehicleItems: [
                [
                    {
                        sku: 'A',
                        quantity: 1,
                        unitWeightKg: 30,
                    },
                    {
                        sku: 'C',
                        quantity: 1,
                        unitWeightKg: 15,
                    },
                ],
                [
                    {
                        sku: 'B',
                        quantity: 1,
                        unitWeightKg: 25,
                    },
                ],
            ],
            remainingItems: [],
        });
    });
    it('should build physical planned vehicles from split items', () => {
        const vehicles =
            service.buildPlannedVehicles(
                'scooter',
                48,
                [
                    [
                        {
                            sku: 'A',
                            quantity: 1,
                            unitWeightKg: 30,
                        },
                        {
                            sku: 'C',
                            quantity: 1,
                            unitWeightKg: 15,
                        },
                    ],
                    [
                        {
                            sku: 'B',
                            quantity: 1,
                            unitWeightKg: 25,
                        },
                    ],
                ],
            );

        expect(vehicles).toEqual([
            {
                vehicleType: 'scooter',
                maxWeightKg: 48,
                assignedWeightKg: 45,
                items: [
                    {
                        sku: 'A',
                        quantity: 1,
                        unitWeightKg: 30,
                    },
                    {
                        sku: 'C',
                        quantity: 1,
                        unitWeightKg: 15,
                    },
                ],
            },
            {
                vehicleType: 'scooter',
                maxWeightKg: 48,
                assignedWeightKg: 25,
                items: [
                    {
                        sku: 'B',
                        quantity: 1,
                        unitWeightKg: 25,
                    },
                ],
            },
        ]);
    });
    it('should assign items to a single vehicle type plan', () => {
        const plan = {
            parts: [
                {
                    vehicleType: 'scooter' as const,
                    vehicleCount: 2,
                    maxWeightPerVehicleKg: 48,
                    assignedWeightKg: 70,
                    items: [],
                },
            ],
            vehicles: [],
        };

        const result =
            service.assignItemsToSingleTypePlan(
                plan,
                [
                    {
                        sku: 'A',
                        quantity: 1,
                        unitWeightKg: 30,
                    },
                    {
                        sku: 'B',
                        quantity: 1,
                        unitWeightKg: 25,
                    },
                    {
                        sku: 'C',
                        quantity: 1,
                        unitWeightKg: 15,
                    },
                ],
            );

        expect(result?.vehicles).toEqual([
            {
                vehicleType: 'scooter',
                maxWeightKg: 48,
                assignedWeightKg: 45,
                items: [
                    {
                        sku: 'A',
                        quantity: 1,
                        unitWeightKg: 30,
                    },
                    {
                        sku: 'C',
                        quantity: 1,
                        unitWeightKg: 15,
                    },
                ],
            },
            {
                vehicleType: 'scooter',
                maxWeightKg: 48,
                assignedWeightKg: 25,
                items: [
                    {
                        sku: 'B',
                        quantity: 1,
                        unitWeightKg: 25,
                    },
                ],
            },
        ]);
    });
    it('should assign items to a mixed vehicle plan', () => {
        const plan = {
            parts: [
                {
                    vehicleType: 'scooter' as const,
                    vehicleCount: 1,
                    maxWeightPerVehicleKg: 48,
                    assignedWeightKg: 48,
                    items: [],
                },
                {
                    vehicleType: 'car' as const,
                    vehicleCount: 1,
                    maxWeightPerVehicleKg: 50,
                    assignedWeightKg: 22,
                    items: [],
                },
            ],
            vehicles: [],
        };

        const result =
            service.assignItemsToMixedPlan(
                plan,
                [
                    {
                        sku: 'A',
                        quantity: 1,
                        unitWeightKg: 30,
                    },
                    {
                        sku: 'B',
                        quantity: 1,
                        unitWeightKg: 25,
                    },
                    {
                        sku: 'C',
                        quantity: 1,
                        unitWeightKg: 15,
                    },
                ],
            );

        expect(result?.vehicles).toEqual([
            {
                vehicleType: 'scooter',
                maxWeightKg: 48,
                assignedWeightKg: 45,
                items: [
                    {
                        sku: 'A',
                        quantity: 1,
                        unitWeightKg: 30,
                    },
                    {
                        sku: 'C',
                        quantity: 1,
                        unitWeightKg: 15,
                    },
                ],
            },
            {
                vehicleType: 'car',
                maxWeightKg: 50,
                assignedWeightKg: 25,
                items: [
                    {
                        sku: 'B',
                        quantity: 1,
                        unitWeightKg: 25,
                    },
                ],
            },
        ]);
    });
    it('should assign items through the generic plan assignment', () => {
        const plan = {
            parts: [
                {
                    vehicleType: 'scooter' as const,
                    vehicleCount: 2,
                    maxWeightPerVehicleKg: 48,
                    assignedWeightKg: 70,
                    items: [],
                },
            ],
            vehicles: [],
        };

        const result =
            service.assignItemsToPlan(
                plan,
                [
                    {
                        sku: 'A',
                        quantity: 1,
                        unitWeightKg: 30,
                    },
                    {
                        sku: 'B',
                        quantity: 1,
                        unitWeightKg: 25,
                    },
                    {
                        sku: 'C',
                        quantity: 1,
                        unitWeightKg: 15,
                    },
                ],
            );

        expect(result?.vehicles).toHaveLength(2);

        expect(
            result?.vehicles.reduce(
                (total, vehicle) =>
                    total + vehicle.assignedWeightKg,
                0,
            ),
        ).toBe(70);
    });
    it('should reject plans where items cannot physically fit', () => {
        const plans =
            service.generateVehiclePlans(
                90,
                service.getVehicleCapacities(
                    48,
                    50,
                ),
            );

        const assignedPlans =
            service.assignItemsToPlans(
                plans,
                [
                    {
                        sku: 'A',
                        quantity: 1,
                        unitWeightKg: 60,
                    },
                    {
                        sku: 'B',
                        quantity: 1,
                        unitWeightKg: 30,
                    },
                ],
            );

        const scooterOnlyPlan =
            assignedPlans.find(
                (plan) =>
                    plan.parts.length === 1 &&
                    plan.parts[0].vehicleType ===
                    'scooter',
            );

        expect(scooterOnlyPlan).toBeUndefined();
    });
    it('should generate and assign complete vehicle plans', () => {
        const capacities =
            service.getVehicleCapacities(
                48,
                50,
            );

        const result =
            service.planVehicles(
                70,
                capacities,
                [
                    {
                        sku: 'A',
                        quantity: 1,
                        unitWeightKg: 30,
                    },
                    {
                        sku: 'B',
                        quantity: 1,
                        unitWeightKg: 25,
                    },
                    {
                        sku: 'C',
                        quantity: 1,
                        unitWeightKg: 15,
                    },
                ],
            );

        expect(result).toHaveLength(4);

        for (const plan of result) {
            expect(plan.vehicles.length).toBeGreaterThan(0);

            const assignedWeight =
                plan.vehicles.reduce(
                    (total, vehicle) =>
                        total +
                        vehicle.assignedWeightKg,
                    0,
                );

            expect(assignedWeight).toBe(70);
        }
    });
    it('should get vehicle capacities from provider settings', () => {
        const provider = {
            id: 'provider-1',
            code: 'delivery-center',
            name: 'Delivery Center',
            adapter_key: 'delivery-center',
            is_mock: false,
            is_active: true,
            priority_score: 1,
            settings: {
                vehicleWeightRules: {
                    scooterMaxWeightKg: 48,
                    carMaxWeightKg: 50,
                },
            },
        };

        const result =
            service.getProviderVehicleCapacities(
                provider,
            );

        expect(result).toEqual([
            {
                vehicleType: 'scooter',
                maxWeightKg: 48,
            },
            {
                vehicleType: 'car',
                maxWeightKg: 50,
            },
        ]);
    });
    it('should generate vehicle plans for a provider based on its capacities', () => {
        const provider = {
            id: 'provider-1',
            code: 'delivery-center',
            name: 'Delivery Center',
            adapter_key: 'delivery-center',
            is_mock: false,
            is_active: true,
            priority_score: 1,
            settings: {
                vehicleWeightRules: {
                    scooterMaxWeightKg: 48,
                    carMaxWeightKg: 50,
                },
            },
        };

        const items = [
            {
                sku: 'A',
                quantity: 1,
                unitWeightKg: 30,
            },
            {
                sku: 'B',
                quantity: 1,
                unitWeightKg: 25,
            },
            {
                sku: 'C',
                quantity: 1,
                unitWeightKg: 15,
            },
        ];

        const result =
            service.planVehiclesForProvider(
                provider,
                70,
                items,
            );

        expect(result).toHaveLength(3);

        expect(
            result.map((item) =>
                item.plan.parts.map((part) => ({
                    vehicleType: part.vehicleType,
                    vehicleCount: part.vehicleCount,
                })),
            ),
        ).toEqual([
            [
                {
                    vehicleType: 'scooter',
                    vehicleCount: 2,
                },
            ],
            [
                {
                    vehicleType: 'car',
                    vehicleCount: 2,
                },
            ],
            [
                {
                    vehicleType: 'scooter',
                    vehicleCount: 1,
                },
                {
                    vehicleType: 'car',
                    vehicleCount: 1,
                },
            ],
        ]);

        expect(
            result.every(
                (item) =>
                    item.providerId === 'provider-1' &&
                    item.providerCode ===
                    'delivery-center',
            ),
        ).toBe(true);
    });
    it('should generate vehicle plans for multiple providers using each provider capacities', () => {
        const providers = [
            {
                id: 'provider-1',
                code: 'provider-a',
                name: 'Provider A',
                adapter_key: 'delivery-center',
                is_mock: false,
                is_active: true,
                priority_score: 1,
                settings: {
                    vehicleWeightRules: {
                        scooterMaxWeightKg: 48,
                        carMaxWeightKg: 50,
                    },
                },
            },
            {
                id: 'provider-2',
                code: 'provider-b',
                name: 'Provider B',
                adapter_key: 'delivery-center',
                is_mock: false,
                is_active: true,
                priority_score: 1,
                settings: {
                    vehicleWeightRules: {
                        scooterMaxWeightKg: 30,
                        carMaxWeightKg: 80,
                    },
                },
            },
        ];

        const items = [
            {
                sku: 'A',
                quantity: 1,
                unitWeightKg: 30,
            },
            {
                sku: 'B',
                quantity: 1,
                unitWeightKg: 25,
            },
            {
                sku: 'C',
                quantity: 1,
                unitWeightKg: 15,
            },
        ];

        const result =
            service.planVehiclesForProviders(
                providers,
                70,
                items,
            );

        const providerAPlans = result.filter(
            (item) =>
                item.providerId === 'provider-1',
        );

        const providerBPlans = result.filter(
            (item) =>
                item.providerId === 'provider-2',
        );

        expect(providerAPlans).toHaveLength(3);

        expect(providerBPlans).toHaveLength(3);

        expect(
            providerBPlans.some(
                (item) =>
                    item.plan.parts.length === 1 &&
                    item.plan.parts[0].vehicleType ===
                    'car' &&
                    item.plan.parts[0].vehicleCount === 1,
            ),
        ).toBe(true);
    });
    it('should reject mixed plans with an unused vehicle', () => {
        const capacities =
            service.getVehicleCapacities(
                48,
                50,
            );

        const plans =
            service.planVehicles(
                0.2,
                capacities,
                [
                    {
                        sku: 'SKU-A',
                        quantity: 1,
                        unitWeightKg: 0.1,
                    },
                    {
                        sku: 'SKU-A',
                        quantity: 1,
                        unitWeightKg: 0.1,
                    },
                ],
            );

        const scooterCarPlan =
            plans.find(
                (plan) =>
                    plan.parts.some(
                        (part) =>
                            part.vehicleType ===
                            'scooter',
                    ) &&
                    plan.parts.some(
                        (part) =>
                            part.vehicleType ===
                            'car',
                    ),
            );

        expect(scooterCarPlan).toBeUndefined();

        expect(
            plans.some((plan) =>
                plan.vehicles.some(
                    (vehicle) =>
                        vehicle.assignedWeightKg <= 0,
                ),
            ),
        ).toBe(false);
    });
});