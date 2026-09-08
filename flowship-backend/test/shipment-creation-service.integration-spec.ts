import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';

import { DbService } from '../src/infrastructure/database/db.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import { ShipmentsRepository } from '../src/modules/shipments/shipments.repository';

import { ShipmentCreationService } from '../src/modules/shipments/shipment-creation.service';

import { Checkout } from '../src/modules/checkout/interfaces/checkout.interface';

import { ShipmentPlanCandidate } from '../src/modules/planning/interfaces/shipment-plan.interface';

import { ShipmentPlanDeliveryOption } from '../src/modules/planning/interfaces/shipment-plan-delivery-option.interface';

describe(
    'ShipmentCreationService Integration',
    () => {
        let db: DbService;

        let tenantsService: TenantsService;

        let shipmentCreationService:
            ShipmentCreationService;

        let config: ConfigService;

        let tenantA: CurrentTenant;
        let tenantB: CurrentTenant;

        let checkoutAId: string;

        const createdShipmentIds:
            string[] = [];

        beforeAll(async () => {
            const moduleRef =
                await Test.createTestingModule({
                    imports: [
                        ConfigModule.forRoot({
                            isGlobal: true,
                        }),
                    ],

                    providers: [
                        DbService,
                        TenantsService,
                        ShipmentsRepository,
                        ShipmentCreationService,
                    ],
                }).compile();

            db =
                moduleRef.get(
                    DbService,
                );

            tenantsService =
                moduleRef.get(
                    TenantsService,
                );

            shipmentCreationService =
                moduleRef.get(
                    ShipmentCreationService,
                );

            config =
                moduleRef.get(
                    ConfigService,
                );

            const tenantAApiKey =
                config.get<string>(
                    'TEST_FLOW_SHIP_A_API_KEY',
                );

            const tenantBApiKey =
                config.get<string>(
                    'TEST_FLOW_SHIP_B_API_KEY',
                );

            if (!tenantAApiKey) {
                throw new Error(
                    'Missing TEST_FLOW_SHIP_A_API_KEY',
                );
            }

            if (!tenantBApiKey) {
                throw new Error(
                    'Missing TEST_FLOW_SHIP_B_API_KEY',
                );
            }

            tenantA =
                await tenantsService
                    .findByApiKey(
                        tenantAApiKey,
                    );

            tenantB =
                await tenantsService
                    .findByApiKey(
                        tenantBApiKey,
                    );

            checkoutAId =
                randomUUID();

            await db.query(
                `
                insert into flow_ship_test_a.checkouts (
                    id,
                    external_order_id,
                    platform,
                    status,
                    raw_payload
                )
                values (
                    $1,
                    $2,
                    'integration-test',
                    'processing',
                    '{}'::jsonb
                )
                `,
                [
                    checkoutAId,
                    `SHIPMENT-CREATION-${Date.now()}`,
                ],
            );
        }, 30000);

        afterAll(async () => {
            if (
                createdShipmentIds.length >
                0
            ) {
                await db.query(
                    `
                    delete from flow_ship_test_a.shipment_stops
                    where shipment_id = any($1::uuid[])
                    `,
                    [
                        createdShipmentIds,
                    ],
                );

                await db.query(
                    `
                    delete from flow_ship_test_a.shipments
                    where id = any($1::uuid[])
                    `,
                    [
                        createdShipmentIds,
                    ],
                );
            }

            await db.query(
                `
                delete from flow_ship_test_a.checkouts
                where id = $1
                `,
                [
                    checkoutAId,
                ],
            );

            await db.onModuleDestroy();
        }, 30000);

        function createCheckout():
            Checkout {

            return {
                orderId:
                    `ORDER-${Date.now()}`,

                storeId:
                    'integration-store',

                destination: {
                    country:
                        'Israel',

                    city:
                        'Tel Aviv',

                    street:
                        'Dizengoff',

                    houseNumber:
                        '100',

                    postalCode:
                        '6100000',
                },

                items: [
                    {
                        sku:
                            'SKU-INTEGRATION',

                        name:
                            'Integration Product',

                        quantity:
                            2,

                        unitWeight:
                            1.5,

                        unitPrice:
                            100,
                    },
                ],

                totalItems:
                    2,

                totalPrice:
                    200,

                createdAt:
                    new Date(),
            };
        }

        function createPlan(
            checkout: Checkout,
        ): ShipmentPlanCandidate {

            return {
                id:
                    randomUUID(),

                status:
                    'grouped',

                assignments:
                    [],

                grouping: {
                    orderId:
                        checkout.orderId,

                    shipmentGroups: [
                        {
                            groupId:
                                randomUUID(),

                            sources: [
                                {
                                    id:
                                        randomUUID(),

                                    name:
                                        'Integration Warehouse',

                                    type:
                                        'warehouse',

                                    isActive:
                                        true,

                                    priority:
                                        1,

                                    location: {
                                        country:
                                            'Israel',

                                        city:
                                            'Petah Tikva',

                                        street:
                                            'HaYarkon',

                                        houseNumber:
                                            '10',

                                        postalCode:
                                            '4900000',

                                        latitude:
                                            32.087,

                                        longitude:
                                            34.887,
                                    },
                                },
                            ],

                            categories:
                                [],

                            items: [
                                {
                                    sku:
                                        'SKU-INTEGRATION',

                                    name:
                                        'Integration Product',

                                    quantity:
                                        2,

                                    unitWeight:
                                        1.5,

                                    unitPrice:
                                        100,

                                    sourceId:
                                        'integration-source',
                                },
                            ],

                            totalItems:
                                2,

                            totalWeight:
                                3,

                            totalPrice:
                                200,

                            groupingReasons: [
                                'COMPATIBLE_HANDLING_GROUP',
                            ],

                            handlingGroup:
                                'standard',
                        },
                    ],

                    ungroupedItems:
                        [],

                    totalGroups:
                        1,

                    totalGroupedItems:
                        2,

                    hasUngroupedItems:
                        false,

                    splitReasons:
                        [],
                },
            };
        }

        function createDeliveryOption(
            plan:
                ShipmentPlanCandidate,
        ):
            ShipmentPlanDeliveryOption {

            const group =
                plan.grouping!
                    .shipmentGroups[0];

            return {
                id:
                    randomUUID(),

                planId:
                    plan.id,

                selectedGroupQuotes: [
                    {
                        groupId:
                            group.groupId,

                        pickupCities: [
                            'Petah Tikva',
                        ],

                        destinationCity:
                            'Tel Aviv',

                        weightKg:
                            3,

                        quote: {
                            providerId:
                                randomUUID(),

                            providerCode:
                                'integration-provider',

                            adapterKey:
                                'integration-adapter',

                            carrierName:
                                'Integration Carrier',

                            serviceName:
                                'Same Day',

                            price:
                                35,

                            currency:
                                'ILS',

                            estimatedDays:
                                1,

                            providerPriority:
                                0.9,
                        },
                    },
                ],

                metrics: {
                    totalShippingPrice:
                        35,

                    estimatedDeliveryDays:
                        1,

                    averageProviderPriority:
                        0.9,

                    shipmentCount:
                        1,
                },
            };
        }

        it(
            'should create a real shipment for Tenant A',
            async () => {
                const checkout =
                    createCheckout();

                const plan =
                    createPlan(
                        checkout,
                    );

                const deliveryOption =
                    createDeliveryOption(
                        plan,
                    );

                const result =
                    await shipmentCreationService
                        .createShipments(
                            tenantA,
                            checkoutAId,
                            checkout,
                            plan,
                            deliveryOption,
                        );

                expect(
                    result,
                ).toHaveLength(
                    1,
                );

                expect(
                    result[0].shipmentGroupId,
                ).toBe(
                    plan.grouping!
                        .shipmentGroups[0]
                        .groupId,
                );

                expect(
                    result[0].shipmentId,
                ).toBeDefined();

                createdShipmentIds.push(
                    result[0]
                        .shipmentId,
                );
            },
        );

        it(
            'should persist shipment fields correctly',
            async () => {
                const shipmentId =
                    createdShipmentIds[0];

                const rows =
                    await db.query<{
                        checkout_id:
                        string;

                        status:
                        string;

                        carrier_name:
                        string;

                        service_name:
                        string;

                        price:
                        string;

                        currency:
                        string;

                        estimated_delivery_days:
                        number;
                    }>(
                        `
                        select
                            checkout_id,
                            status,
                            carrier_name,
                            service_name,
                            price,
                            currency,
                            estimated_delivery_days
                        from flow_ship_test_a.shipments
                        where id = $1
                        `,
                        [
                            shipmentId,
                        ],
                    );

                expect(
                    rows,
                ).toHaveLength(
                    1,
                );

                expect(
                    rows[0],
                ).toMatchObject({
                    checkout_id:
                        checkoutAId,

                    status:
                        'created',

                    carrier_name:
                        'Integration Carrier',

                    service_name:
                        'Same Day',

                    price:
                        '35.00',

                    currency:
                        'ILS',

                    estimated_delivery_days:
                        1,
                });
            },
        );

        it(
            'should create a pickup stop from the supply source',
            async () => {
                const shipmentId =
                    createdShipmentIds[0];

                const rows =
                    await db.query<{
                        stop_type:
                        string;

                        stop_order:
                        number;

                        address:
                        Record<
                            string,
                            unknown
                        >;
                    }>(
                        `
                        select
                            stop_type,
                            stop_order,
                            address
                        from flow_ship_test_a.shipment_stops
                        where
                            shipment_id = $1
                            and stop_type = 'pickup'
                        `,
                        [
                            shipmentId,
                        ],
                    );

                expect(
                    rows,
                ).toHaveLength(
                    1,
                );

                expect(
                    rows[0].stop_order,
                ).toBe(
                    1,
                );

                expect(
                    rows[0].address,
                ).toMatchObject({
                    sourceName:
                        'Integration Warehouse',

                    sourceType:
                        'warehouse',

                    country:
                        'Israel',

                    city:
                        'Petah Tikva',

                    street:
                        'HaYarkon',

                    houseNumber:
                        '10',
                });
            },
        );

        it(
            'should create a dropoff stop from checkout destination',
            async () => {
                const shipmentId =
                    createdShipmentIds[0];

                const rows =
                    await db.query<{
                        stop_type:
                        string;

                        stop_order:
                        number;

                        address:
                        Record<
                            string,
                            unknown
                        >;
                    }>(
                        `
                        select
                            stop_type,
                            stop_order,
                            address
                        from flow_ship_test_a.shipment_stops
                        where
                            shipment_id = $1
                            and stop_type = 'dropoff'
                        `,
                        [
                            shipmentId,
                        ],
                    );

                expect(
                    rows,
                ).toHaveLength(
                    1,
                );

                expect(
                    rows[0].stop_order,
                ).toBe(
                    2,
                );

                expect(
                    rows[0].address,
                ).toEqual({
                    country:
                        'Israel',

                    city:
                        'Tel Aviv',

                    street:
                        'Dizengoff',

                    houseNumber:
                        '100',

                    postalCode:
                        '6100000',
                });
            },
        );

        it(
            'should persist stops in pickup then dropoff order',
            async () => {
                const shipmentId =
                    createdShipmentIds[0];

                const rows =
                    await db.query<{
                        stop_order:
                        number;

                        stop_type:
                        string;
                    }>(
                        `
                        select
                            stop_order,
                            stop_type
                        from flow_ship_test_a.shipment_stops
                        where shipment_id = $1
                        order by stop_order asc
                        `,
                        [
                            shipmentId,
                        ],
                    );

                expect(
                    rows,
                ).toEqual([
                    {
                        stop_order:
                            1,

                        stop_type:
                            'pickup',
                    },

                    {
                        stop_order:
                            2,

                        stop_type:
                            'dropoff',
                    },
                ]);
            },
        );

        it(
            'should keep Tenant A shipment isolated from Tenant B',
            async () => {
                const shipmentId =
                    createdShipmentIds[0];

                const rows =
                    await db.query(
                        `
                        select id
                        from flow_ship_test_b.shipments
                        where id = $1
                        `,
                        [
                            shipmentId,
                        ],
                    );

                expect(
                    rows,
                ).toHaveLength(
                    0,
                );
            },
        );

        it(
            'should reject a delivery option that belongs to another plan',
            async () => {
                const checkout =
                    createCheckout();

                const plan =
                    createPlan(
                        checkout,
                    );

                const deliveryOption =
                    createDeliveryOption(
                        plan,
                    );

                deliveryOption.planId =
                    randomUUID();

                const before =
                    await db.query<{
                        count:
                        string;
                    }>(
                        `
                        select count(*)::text as count
                        from flow_ship_test_a.shipments
                        where checkout_id = $1
                        `,
                        [
                            checkoutAId,
                        ],
                    );

                await expect(
                    shipmentCreationService
                        .createShipments(
                            tenantA,
                            checkoutAId,
                            checkout,
                            plan,
                            deliveryOption,
                        ),
                ).rejects.toThrow(
                    'does not belong to plan',
                );

                const after =
                    await db.query<{
                        count:
                        string;
                    }>(
                        `
                        select count(*)::text as count
                        from flow_ship_test_a.shipments
                        where checkout_id = $1
                        `,
                        [
                            checkoutAId,
                        ],
                    );

                expect(
                    after[0].count,
                ).toBe(
                    before[0].count,
                );
            },
        );

        it(
            'should reject a shipment group with no sources without creating an orphan shipment',
            async () => {
                const checkout =
                    createCheckout();

                const plan =
                    createPlan(
                        checkout,
                    );

                plan.grouping!
                    .shipmentGroups[0]
                    .sources = [];

                const deliveryOption =
                    createDeliveryOption(
                        plan,
                    );

                const before =
                    await db.query<{
                        count:
                        string;
                    }>(
                        `
                        select count(*)::text as count
                        from flow_ship_test_a.shipments
                        where checkout_id = $1
                        `,
                        [
                            checkoutAId,
                        ],
                    );

                await expect(
                    shipmentCreationService
                        .createShipments(
                            tenantA,
                            checkoutAId,
                            checkout,
                            plan,
                            deliveryOption,
                        ),
                ).rejects.toThrow(
                    'has no supply sources',
                );

                const after =
                    await db.query<{
                        count:
                        string;
                    }>(
                        `
                        select count(*)::text as count
                        from flow_ship_test_a.shipments
                        where checkout_id = $1
                        `,
                        [
                            checkoutAId,
                        ],
                    );

                expect(
                    after[0].count,
                ).toBe(
                    before[0].count,
                );
            },
        );
    },
);