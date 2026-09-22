import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import {
    DatabaseModule,
} from '../src/infrastructure/database/database.module';

import {
    DbService,
} from '../src/infrastructure/database/db.service';

import {
    TenantsModule,
} from '../src/modules/tenants/tenants.module';

import {
    TenantsService,
    CurrentTenant,
} from '../src/modules/tenants/tenants.service';

import {
    CheckoutRepository,
} from '../src/modules/checkout/checkout.repository';

import {
    Checkout,
} from '../src/modules/checkout/interfaces/checkout.interface';

import {
    ShipmentGroupsRepository,
} from '../src/modules/grouping/shipment-groups.repository';

import {
    GroupingResult,
} from '../src/modules/grouping/interfaces/grouping-result.interface';


describe(
    'Checkout Details Integration',
    () => {
        jest.setTimeout(30000);

        let moduleRef: TestingModule;

        let db: DbService;
        let tenantsService: TenantsService;
        let checkoutRepository: CheckoutRepository;
        let shipmentGroupsRepository:
            ShipmentGroupsRepository;

        let tenantA: CurrentTenant;
        let tenantB: CurrentTenant;

        let checkoutId: string | null = null;

        let checkoutItemIdsBySku:
            Map<string, string> = new Map();

        const GROUP_1_ID =
            '81111111-1111-4111-8111-111111111111';

        const GROUP_2_ID =
            '82222222-2222-4222-8222-222222222222';

        const SHIPMENT_1_ID =
            '83333333-3333-4333-8333-333333333333';

        const SHIPMENT_2_ID =
            '84444444-4444-4444-8444-444444444444';

        function qSchema(
            schemaName: string,
        ): string {
            if (
                !/^[a-zA-Z0-9_]+$/.test(schemaName)
            ) {
                throw new Error(
                    `Invalid schema name: ${schemaName}`,
                );
            }

            return `"${schemaName}"`;
        }


        async function cleanup(): Promise<void> {
            if (!tenantA) {
                return;
            }

            const schema =
                qSchema(tenantA.schemaName);

            await db.query(
                `
                delete from ${schema}.shipment_stops
                where shipment_id in ($1, $2)
                `,
                [
                    SHIPMENT_1_ID,
                    SHIPMENT_2_ID,
                ],
            );

            await db.query(
                `
                delete from ${schema}.shipments
                where id in ($1, $2)
                `,
                [
                    SHIPMENT_1_ID,
                    SHIPMENT_2_ID,
                ],
            );

            await db.query(
                `
                delete from ${schema}.shipment_group_items
                where shipment_group_id in ($1, $2)
                `,
                [
                    GROUP_1_ID,
                    GROUP_2_ID,
                ],
            );
            await db.query(
                `
    delete from ${schema}.shipment_group_sources
    where shipment_group_id in ($1, $2)
    `,
                [
                    GROUP_1_ID,
                    GROUP_2_ID,
                ],
            );
            await db.query(
                `
                delete from ${schema}.shipment_groups
                where id in ($1, $2)
                `,
                [
                    GROUP_1_ID,
                    GROUP_2_ID,
                ],
            );

            if (checkoutId) {
                await db.query(
                    `
                    delete from ${schema}.checkout_items
                    where checkout_id = $1
                    `,
                    [checkoutId],
                );

                await db.query(
                    `
                    delete from ${schema}.checkouts
                    where id = $1
                    `,
                    [checkoutId],
                );
            }

            checkoutId = null;

            checkoutItemIdsBySku =
                new Map<string, string>();
        }


        async function seed(): Promise<void> {
            const checkout: Checkout = {
                orderId:
                    'checkout-details-integration-order',

                storeId:
                    'checkout-details-store',

                destination: {
                    country: 'IL',
                    city: 'Tel Aviv',
                    street: 'Dizengoff',
                    houseNumber: '100',
                    postalCode: '6100000',
                },

                items: [
                    {
                        sku: 'DETAILS-SKU-A',
                        name: 'Details Item A',
                        quantity: 2,
                        unitWeight: 1.5,
                        unitPrice: 50,
                        category: 'standard',
                    },
                    {
                        sku: 'DETAILS-SKU-B',
                        name: 'Details Item B',
                        quantity: 1,
                        unitWeight: 3,
                        unitPrice: 200,
                        category: 'fragile',
                    },
                ],

                totalItems: 3,
                totalPrice: 300,
                createdAt: new Date(),
            };

            /*
             * 1. Checkout
             */
            checkoutId =
                await checkoutRepository.saveCheckout(
                    tenantA,
                    checkout,
                    'integration-test',
                );

            /*
             * 2. Checkout Items
             */
            checkoutItemIdsBySku =
                await checkoutRepository.saveCheckoutItems(
                    tenantA,
                    checkoutId,
                    checkout,
                );

            /*
             * 3. Grouping
             *
             * חשוב:
             * ShipmentGroup מחזיק sources[]
             * ולא source יחיד.
             *
             * כל item מחזיק sourceId.
             */
            const grouping: GroupingResult = {
                orderId: checkout.orderId,

                shipmentGroups: [
                    {
                        groupId: GROUP_1_ID,

                        sources: [
                            {
                                id: 'source-details-a',
                                name: 'Details Source A',
                                type: 'warehouse',

                                isActive: true,
                                priority: 1,

                                location: {
                                    country: 'IL',
                                    city: 'Rishon LeZion',
                                    street: 'Warehouse A',
                                    houseNumber: '1',
                                },
                            },
                        ],

                        categories: [
                            'standard',
                        ],

                        handlingGroup:
                            'standard',

                        items: [
                            {
                                sku: 'DETAILS-SKU-A',
                                name: 'Details Item A',
                                quantity: 2,
                                unitWeight: 1.5,
                                unitPrice: 50,
                                category: 'standard',

                                sourceId:
                                    'source-details-a',
                            },
                        ],

                        totalItems: 2,
                        totalWeight: 3,
                        totalPrice: 100,

                        groupingReasons: [
                            'SAME_SOURCE',
                        ],
                    },

                    {
                        groupId: GROUP_2_ID,

                        sources: [
                            {
                                id: 'source-details-b',
                                name: 'Details Source B',
                                type: 'warehouse',

                                isActive: true,
                                priority: 1,

                                location: {
                                    country: 'IL',
                                    city: 'Petah Tikva',
                                    street: 'Warehouse B',
                                    houseNumber: '2',
                                },
                            },
                        ],

                        categories: [
                            'fragile',
                        ],

                        handlingGroup:
                            'fragile',

                        items: [
                            {
                                sku: 'DETAILS-SKU-B',
                                name: 'Details Item B',
                                quantity: 1,
                                unitWeight: 3,
                                unitPrice: 200,
                                category: 'fragile',

                                sourceId:
                                    'source-details-b',
                            },
                        ],

                        totalItems: 1,
                        totalWeight: 3,
                        totalPrice: 200,

                        groupingReasons: [
                            'SAME_SOURCE',
                        ],
                    },
                ],

                ungroupedItems: [],

                totalGroups: 2,
                totalGroupedItems: 3,

                hasUngroupedItems: false,

                splitReasons: [],
            };

            /*
             * 4. Persist Shipment Groups +
             *    Group Sources +
             *    Group Items
             */
            await shipmentGroupsRepository
                .saveGroupingResult(
                    tenantA,
                    checkoutId,
                    grouping,
                    checkoutItemIdsBySku,
                );

            const schema =
                qSchema(tenantA.schemaName);

            /*
             * 5. Shipment #1
             */
            await db.query(
                `
        insert into ${schema}.shipments
        (
            id,
            checkout_id,
            order_id,
            shipment_group_id,

            selected_plan_id,
            selected_delivery_option_key,

            provider_id,
            provider_code,
            adapter_key,

            carrier_name,
            service_name,

            price,
            currency,
            estimated_delivery_days,

            status
        )
        values
        (
            $1,
            $2,
            $3,
            $4,

            'details-plan-1',
            'details-option-1',

            null,
            'details-provider-a',
            'mock',

            'Details Carrier A',
            'Express',

            25,
            'ILS',
            1,

            'in_transit'
        )
        `,
                [
                    SHIPMENT_1_ID,
                    checkoutId,
                    checkout.orderId,
                    GROUP_1_ID,
                ],
            );

            /*
             * 6. Shipment #2
             */
            await db.query(
                `
        insert into ${schema}.shipments
        (
            id,
            checkout_id,
            order_id,
            shipment_group_id,

            selected_plan_id,
            selected_delivery_option_key,

            provider_id,
            provider_code,
            adapter_key,

            carrier_name,
            service_name,

            price,
            currency,
            estimated_delivery_days,

            status
        )
        values
        (
            $1,
            $2,
            $3,
            $4,

            'details-plan-2',
            'details-option-2',

            null,
            'details-provider-b',
            'mock',

            'Details Carrier B',
            'Standard',

            40,
            'ILS',
            3,

            'created'
        )
        `,
                [
                    SHIPMENT_2_ID,
                    checkoutId,
                    checkout.orderId,
                    GROUP_2_ID,
                ],
            );

            /*
             * 7. Shipment Stops
             *
             * בכוונה מכניסים Shipment #1
             * בסדר הפוך כדי לבדוק שהקריאה
             * מחזירה לפי stop_order.
             */
            await db.query(
                `
        insert into ${schema}.shipment_stops
        (
            shipment_id,
            stop_order,
            stop_type,
            address,
            status
        )
        values
        (
            $1,
            2,
            'dropoff',
            $3::jsonb,
            'pending'
        ),
        (
            $1,
            1,
            'pickup',
            $4::jsonb,
            'completed'
        ),
        (
            $2,
            2,
            'dropoff',
            $5::jsonb,
            'pending'
        ),
        (
            $2,
            1,
            'pickup',
            $6::jsonb,
            'pending'
        )
        `,
                [
                    SHIPMENT_1_ID,
                    SHIPMENT_2_ID,

                    JSON.stringify({
                        country: 'IL',
                        city: 'Tel Aviv',
                        street: 'Dizengoff',
                        houseNumber: '100',
                    }),

                    JSON.stringify({
                        country: 'IL',
                        city: 'Rishon LeZion',
                        street: 'Warehouse A',
                        houseNumber: '1',
                    }),

                    JSON.stringify({
                        country: 'IL',
                        city: 'Tel Aviv',
                        street: 'Dizengoff',
                        houseNumber: '100',
                    }),

                    JSON.stringify({
                        country: 'IL',
                        city: 'Petah Tikva',
                        street: 'Warehouse B',
                        houseNumber: '2',
                    }),
                ],
            );
        }


        async function resetFixture():
            Promise<void> {
            await cleanup();
            await seed();
        }


        beforeAll(
            async () => {
                moduleRef =
                    await Test
                        .createTestingModule({
                            imports: [
                                ConfigModule.forRoot({
                                    isGlobal: true,
                                }),
                                DatabaseModule,
                                TenantsModule,
                            ],
                            providers: [
                                CheckoutRepository,
                                ShipmentGroupsRepository,
                            ],
                        })
                        .compile();
                db =
                    moduleRef.get(DbService);

                tenantsService =
                    moduleRef.get(
                        TenantsService,
                    );

                checkoutRepository =
                    moduleRef.get(
                        CheckoutRepository,
                    );

                shipmentGroupsRepository =
                    moduleRef.get(
                        ShipmentGroupsRepository,
                    );


                tenantA =
                    await tenantsService
                        .findByApiKey(
                            process.env
                                .TEST_FLOW_SHIP_A_API_KEY,
                        );

                tenantB =
                    await tenantsService
                        .findByApiKey(
                            process.env
                                .TEST_FLOW_SHIP_B_API_KEY,
                        );


                await cleanup();
            },
            30000,
        );


        beforeEach(
            async () => {
                await resetFixture();
            },
            30000,
        );


        afterAll(
            async () => {
                await cleanup();

                if (moduleRef) {
                    await moduleRef.close();
                }
            },
            30000,
        );


        it(
            '1. returns the basic checkout details and maps external_order_id to orderId',
            async () => {
                const details =
                    await checkoutRepository
                        .getCheckoutById(
                            tenantA,
                            checkoutId!,
                        );

                expect(details)
                    .not
                    .toBeNull();

                expect(details!.id)
                    .toBe(checkoutId);

                expect(details!.orderId)
                    .toBe(
                        'checkout-details-integration-order',
                    );

                expect(details!.storeId)
                    .toBeNull();
                expect(details!.platform)
                    .toBe(
                        'integration-test',
                    );

                expect(details!.status)
                    .toBe('processing');

                expect(details!.destination)
                    .toEqual(
                        expect.objectContaining({
                            country: 'IL',
                            city: 'Tel Aviv',
                            street: 'Dizengoff',
                            houseNumber: '100',
                        }),
                    );
            },
        );


        it(
            '2. returns totalItems and totalPrice from the checkout payload',
            async () => {
                const details =
                    await checkoutRepository
                        .getCheckoutById(
                            tenantA,
                            checkoutId!,
                        );

                expect(details)
                    .not
                    .toBeNull();

                expect(details!.totalItems)
                    .toBe(3);

                expect(details!.totalPrice)
                    .toBe(300);
            },
        );


        it(
            '3. returns all checkout items with the expected mapping',
            async () => {
                const details =
                    await checkoutRepository
                        .getCheckoutById(
                            tenantA,
                            checkoutId!,
                        );

                expect(details)
                    .not
                    .toBeNull();

                expect(details!.items)
                    .toHaveLength(2);

                const itemA =
                    details!.items.find(
                        (item) =>
                            item.sku ===
                            'DETAILS-SKU-A',
                    );

                const itemB =
                    details!.items.find(
                        (item) =>
                            item.sku ===
                            'DETAILS-SKU-B',
                    );

                expect(itemA)
                    .toEqual(
                        expect.objectContaining({
                            sku: 'DETAILS-SKU-A',
                            name: 'Details Item A',
                            quantity: 2,
                            unitWeight: '1.500',
                            unitPrice: '50.00',
                            category: 'standard',
                        }),
                    );

                expect(itemB)
                    .toEqual(
                        expect.objectContaining({
                            sku: 'DETAILS-SKU-B',
                            name: 'Details Item B',
                            quantity: 1,
                            unitWeight: '3.000',
                            unitPrice: '200.00',
                            category: 'fragile',
                        }),
                    );

                expect(itemA!.id)
                    .toBe(
                        checkoutItemIdsBySku.get(
                            'DETAILS-SKU-A',
                        ),
                    );

                expect(itemB!.id)
                    .toBe(
                        checkoutItemIdsBySku.get(
                            'DETAILS-SKU-B',
                        ),
                    );
            },
        );


        it(
            '4. returns all shipment groups with their mapped fields',
            async () => {
                const details =
                    await checkoutRepository
                        .getCheckoutById(
                            tenantA,
                            checkoutId!,
                        );

                expect(details)
                    .not
                    .toBeNull();

                expect(
                    details!.shipmentGroups,
                ).toHaveLength(2);

                const groupA =
                    details!
                        .shipmentGroups
                        .find(
                            (group) =>
                                group.id ===
                                GROUP_1_ID,
                        );

                const groupB =
                    details!
                        .shipmentGroups
                        .find(
                            (group) =>
                                group.id ===
                                GROUP_2_ID,
                        );

                expect(groupA)
                    .toEqual(
                        expect.objectContaining({
                            id: GROUP_1_ID,
                            sourceId: null,
                            sourceName: null,
                            sourceType: null,
                            handlingGroup:
                                'standard',
                            totalItems: 2,
                            totalWeight: '3.000',
                            totalPrice: '100.00',
                            status: 'planned',
                        }),
                    );

                expect(groupB)
                    .toEqual(
                        expect.objectContaining({
                            id: GROUP_2_ID,
                            sourceId: null,
                            sourceName: null,
                            sourceType: null,
                            handlingGroup:
                                'fragile',
                            totalItems: 1,
                            totalWeight: '3.000',
                            totalPrice: '200.00',
                            status: 'planned',
                        }),
                    );
            },
        );


        it(
            '5. maps shipment group items only to their correct group',
            async () => {
                const details =
                    await checkoutRepository
                        .getCheckoutById(
                            tenantA,
                            checkoutId!,
                        );

                expect(details)
                    .not
                    .toBeNull();

                const groupA =
                    details!
                        .shipmentGroups
                        .find(
                            (group) =>
                                group.id ===
                                GROUP_1_ID,
                        )!;

                const groupB =
                    details!
                        .shipmentGroups
                        .find(
                            (group) =>
                                group.id ===
                                GROUP_2_ID,
                        )!;

                expect(groupA.items)
                    .toHaveLength(1);

                expect(groupB.items)
                    .toHaveLength(1);

                expect(groupA.items[0])
                    .toEqual(
                        expect.objectContaining({
                            checkoutItemId:
                                checkoutItemIdsBySku
                                    .get(
                                        'DETAILS-SKU-A',
                                    ),
                            sku: 'DETAILS-SKU-A',
                            quantity: 2,
                            unitWeight: '1.500',
                            unitPrice: '50.00',
                            category: 'standard',
                        }),
                    );

                expect(groupB.items[0])
                    .toEqual(
                        expect.objectContaining({
                            checkoutItemId:
                                checkoutItemIdsBySku
                                    .get(
                                        'DETAILS-SKU-B',
                                    ),
                            sku: 'DETAILS-SKU-B',
                            quantity: 1,
                            unitWeight: '3.000',
                            unitPrice: '200.00',
                            category: 'fragile',
                        }),
                    );

                expect(
                    groupA.items.some(
                        (item) =>
                            item.sku ===
                            'DETAILS-SKU-B',
                    ),
                ).toBe(false);

                expect(
                    groupB.items.some(
                        (item) =>
                            item.sku ===
                            'DETAILS-SKU-A',
                    ),
                ).toBe(false);
            },
        );


        it(
            '6. returns all shipments belonging to the checkout',
            async () => {
                const details =
                    await checkoutRepository
                        .getCheckoutById(
                            tenantA,
                            checkoutId!,
                        );

                expect(details)
                    .not
                    .toBeNull();

                expect(details!.shipments)
                    .toHaveLength(2);

                expect(
                    details!.shipments.map(
                        (shipment) =>
                            shipment.id,
                    ),
                ).toEqual(
                    expect.arrayContaining([
                        SHIPMENT_1_ID,
                        SHIPMENT_2_ID,
                    ]),
                );
            },
        );


        it(
            '7. maps shipment provider, carrier, service, price and status fields',
            async () => {
                const details =
                    await checkoutRepository
                        .getCheckoutById(
                            tenantA,
                            checkoutId!,
                        );

                expect(details)
                    .not
                    .toBeNull();

                const shipment =
                    details!.shipments.find(
                        (item) =>
                            item.id ===
                            SHIPMENT_1_ID,
                    );

                expect(shipment)
                    .toEqual(
                        expect.objectContaining({
                            id: SHIPMENT_1_ID,

                            shipmentGroupId:
                                GROUP_1_ID,

                            orderId:
                                'checkout-details-integration-order',

                            selectedPlanId:
                                'details-plan-1',

                            selectedDeliveryOptionKey:
                                'details-option-1',

                            providerCode:
                                'details-provider-a',

                            adapterKey:
                                'mock',

                            carrierName:
                                'Details Carrier A',

                            serviceName:
                                'Express',

                            price: '25.00',
                            currency: 'ILS',

                            estimatedDeliveryDays:
                                1,

                            status:
                                'in_transit',
                        }),
                    );
            },
        );


        it(
            '8. maps stops to the correct shipment and orders them by stopOrder',
            async () => {
                const details =
                    await checkoutRepository
                        .getCheckoutById(
                            tenantA,
                            checkoutId!,
                        );

                expect(details)
                    .not
                    .toBeNull();

                const shipmentA =
                    details!.shipments.find(
                        (shipment) =>
                            shipment.id ===
                            SHIPMENT_1_ID,
                    )!;

                const shipmentB =
                    details!.shipments.find(
                        (shipment) =>
                            shipment.id ===
                            SHIPMENT_2_ID,
                    )!;


                expect(shipmentA.stops)
                    .toHaveLength(2);

                expect(shipmentB.stops)
                    .toHaveLength(2);


                expect(
                    shipmentA.stops.map(
                        (stop) =>
                            stop.stopOrder,
                    ),
                ).toEqual([
                    1,
                    2,
                ]);

                expect(
                    shipmentB.stops.map(
                        (stop) =>
                            stop.stopOrder,
                    ),
                ).toEqual([
                    1,
                    2,
                ]);


                expect(
                    shipmentA.stops[0],
                ).toEqual(
                    expect.objectContaining({
                        stopOrder: 1,
                        stopType: 'pickup',

                        address:
                            expect.objectContaining({
                                city:
                                    'Rishon LeZion',
                            }),
                    }),
                );

                expect(
                    shipmentA.stops[1],
                ).toEqual(
                    expect.objectContaining({
                        stopOrder: 2,
                        stopType: 'dropoff',

                        address:
                            expect.objectContaining({
                                city:
                                    'Tel Aviv',
                            }),
                    }),
                );


                /*
                 * מוודא שאין זליגה של Stops
                 * בין שני Shipments.
                 */
                expect(
                    shipmentA.stops.some(
                        (stop) =>
                            (
                                stop.address as any
                            )?.city ===
                            'Petah Tikva',
                    ),
                ).toBe(false);

                expect(
                    shipmentB.stops.some(
                        (stop) =>
                            (
                                stop.address as any
                            )?.city ===
                            'Rishon LeZion',
                    ),
                ).toBe(false);
            },
        );


        it(
            '9. returns null when the checkout does not exist',
            async () => {
                const details =
                    await checkoutRepository
                        .getCheckoutById(
                            tenantA,
                            '99999999-9999-4999-8999-999999999999',
                        );

                expect(details)
                    .toBeNull();
            },
        );


        it(
            '10. does not expose Tenant A checkout details to Tenant B',
            async () => {
                const tenantADetails =
                    await checkoutRepository
                        .getCheckoutById(
                            tenantA,
                            checkoutId!,
                        );

                const tenantBDetails =
                    await checkoutRepository
                        .getCheckoutById(
                            tenantB,
                            checkoutId!,
                        );

                expect(tenantADetails)
                    .not
                    .toBeNull();

                expect(tenantBDetails)
                    .toBeNull();
            },
        );
    },
);