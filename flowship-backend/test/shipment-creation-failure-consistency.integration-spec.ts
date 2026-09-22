import {
    ConfigModule,
    ConfigService,
} from '@nestjs/config';

import {
    Test,
    TestingModule,
} from '@nestjs/testing';

import {
    randomUUID,
} from 'crypto';

import {
    DbService,
} from '../src/infrastructure/database/db.service';

import {
    TenantsService,
    CurrentTenant,
} from '../src/modules/tenants/tenants.service';

import {
    ShipmentsRepository,
} from '../src/modules/shipments/shipments.repository';

import {
    ShipmentCreationService,
} from '../src/modules/shipments/shipment-creation.service';


describe(
    'Shipment Creation Failure Consistency Integration',
    () => {
        let moduleRef: TestingModule;

        let db: DbService;
        let config: ConfigService;
        let tenantsService: TenantsService;

        let service: ShipmentCreationService;

        let tenant: CurrentTenant;


        const checkoutId =
            randomUUID();


        const groupValidId =
            randomUUID();

        const groupTwoSourcesId =
            randomUUID();

        const groupNoSourcesId =
            randomUUID();

        const groupAtomicFirstId =
            randomUUID();

        const groupAtomicSecondId =
            randomUUID();


        const orderId =
            `SHIPMENT-FAILURE-${Date.now()}`;


        function qSchema(
            schemaName: string,
        ): string {
            if (
                !/^[a-zA-Z_][a-zA-Z0-9_]*$/
                    .test(schemaName)
            ) {
                throw new Error(
                    `Invalid schema name: ${schemaName}`,
                );
            }

            return `"${schemaName}"`;
        }


        function source(
            id: string,
            city: string,
        ) {
            return {
                id,
                name:
                    `Source ${id}`,

                type:
                    'warehouse',

                location: {
                    country:
                        'Israel',

                    city,

                    street:
                        'Test Street',

                    houseNumber:
                        '1',

                    latitude:
                        31.9,

                    longitude:
                        34.8,
                },
            };
        }


        function quote(
            carrierName:
                string = 'Test Carrier',
        ) {
            return {
                carrierName,

                serviceName:
                    'Standard',

                price:
                    25,

                currency:
                    'ILS',

                estimatedDays:
                    2,

                providerPriority:
                    0.5,

                providerCode:
                    'TEST',

                adapterKey:
                    'mock',
            };
        }


        function group(
            groupId: string,
            sources: any[],
        ) {
            return {
                groupId,

                sources,

                categories: [
                    'standard',
                ],

                items: [
                    {
                        sku:
                            'TEST-SKU',

                        name:
                            'Test Item',

                        quantity:
                            1,

                        unitWeight:
                            1,

                        unitPrice:
                            100,

                        sourceId:
                            sources[0]?.id ??
                            'NO-SOURCE',
                    },
                ],

                totalItems:
                    1,

                totalWeight:
                    1,

                totalPrice:
                    100,

                groupingReasons:
                    [],

                handlingGroup:
                    'standard',
            };
        }


        function plan(
            id: string,
            groups: any[],
        ) {
            return {
                id,

                status:
                    'grouped',

                assignments:
                    [],

                grouping: {
                    orderId,

                    shipmentGroups:
                        groups,

                    ungroupedItems:
                        [],

                    totalGroups:
                        groups.length,

                    totalGroupedItems:
                        groups.length,

                    hasUngroupedItems:
                        false,

                    splitReasons:
                        [],
                },
            } as any;
        }


        function option(
            planId: string,
            entries: {
                groupId: string;
                carrierName?: string;
            }[],
        ) {
            return {
                id:
                    `option-${randomUUID()}`,

                planId,

                selectedGroupQuotes:
                    entries.map(
                        (entry) => ({
                            groupId:
                                entry.groupId,

                            pickupCities: [
                                'Tel Aviv',
                            ],

                            destinationCity:
                                'Jerusalem',

                            weightKg:
                                1,

                            quote:
                                quote(
                                    entry.carrierName,
                                ),
                        }),
                    ),

                metrics: {
                    totalShippingPrice:
                        entries.length *
                        25,

                    estimatedDeliveryDays:
                        2,

                    averageProviderPriority:
                        0.5,

                    shipmentCount:
                        entries.length,
                },
            } as any;
        }


        const checkout = {
            orderId,

            storeId:
                null,

            destination: {
                country:
                    'Israel',

                city:
                    'Jerusalem',

                street:
                    'Jaffa',

                houseNumber:
                    '10',

                postalCode:
                    '91000',
            },

            items: [
                {
                    sku:
                        'TEST-SKU',

                    name:
                        'Test Item',

                    quantity:
                        1,

                    unitWeight:
                        1,

                    unitPrice:
                        100,
                },
            ],

            totalItems:
                1,

            totalPrice:
                100,

            createdAt:
                new Date(),
        } as any;


        beforeAll(
            async () => {
                moduleRef =
                    await Test
                        .createTestingModule({
                            imports: [
                                ConfigModule.forRoot({
                                    isGlobal:
                                        true,
                                }),
                            ],

                            providers: [
                                DbService,
                                ConfigService,
                                TenantsService,
                                ShipmentsRepository,
                                ShipmentCreationService,
                            ],
                        })
                        .compile();


                db =
                    moduleRef.get(
                        DbService,
                    );


                config =
                    moduleRef.get(
                        ConfigService,
                    );


                tenantsService =
                    moduleRef.get(
                        TenantsService,
                    );


                service =
                    moduleRef.get(
                        ShipmentCreationService,
                    );


                const apiKey =
                    config.get<string>(
                        'TEST_FLOW_SHIP_A_API_KEY',
                    );


                if (!apiKey) {
                    throw new Error(
                        'Missing TEST_FLOW_SHIP_A_API_KEY',
                    );
                }


                tenant =
                    await tenantsService
                        .findByApiKey(
                            apiKey,
                        );


                const schema =
                    qSchema(
                        tenant.schemaName,
                    );


                /*
                 * Checkout fixture
                 */
                await db.query(
                    `
                    insert into ${schema}.checkouts (
                        id,
                        platform,
                        external_checkout_id,
                        external_order_id,
                        customer,
                        cart,
                        destination,
                        raw_payload,
                        status
                    )
                    values (
                        $1,
                        'manual',
                        $2,
                        $2,
                        '{}'::jsonb,
                        '[]'::jsonb,
                        $3::jsonb,
                        '{}'::jsonb,
                        'processing'
                    )
                    `,
                    [
                        checkoutId,
                        orderId,

                        JSON.stringify(
                            checkout.destination,
                        ),
                    ],
                );


                /*
                 * Shipment groups only need to exist
                 * because shipments reference them by FK.
                 */
                const groups = [
                    groupValidId,
                    groupTwoSourcesId,
                    groupNoSourcesId,
                    groupAtomicFirstId,
                    groupAtomicSecondId,
                ];


                for (
                    const groupId of groups
                ) {
                    await db.query(
                        `
                        insert into ${schema}.shipment_groups (
                            id,
                            checkout_id,
                            handling_group,
                            total_items,
                            total_weight,
                            total_price,
                            grouping_reasons,
                            status
                        )
                        values (
                            $1,
                            $2,
                            'standard',
                            1,
                            1,
                            100,
                            '[]'::jsonb,
                            'planned'
                        )
                        `,
                        [
                            groupId,
                            checkoutId,
                        ],
                    );
                }
            },
            30000,
        );


        beforeEach(
            async () => {
                const schema =
                    qSchema(
                        tenant.schemaName,
                    );


                const groupIds = [
                    groupValidId,
                    groupTwoSourcesId,
                    groupNoSourcesId,
                    groupAtomicFirstId,
                    groupAtomicSecondId,
                ];


                const shipments =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from ${schema}.shipments
                        where checkout_id = $1
                        `,
                        [
                            checkoutId,
                        ],
                    );


                const shipmentIds =
                    shipments.map(
                        (row) =>
                            row.id,
                    );


                if (
                    shipmentIds.length
                ) {
                    await db.query(
                        `
                        delete from ${schema}.shipment_stops
                        where shipment_id =
                            any($1::uuid[])
                        `,
                        [
                            shipmentIds,
                        ],
                    );


                    await db.query(
                        `
                        delete from ${schema}.shipments
                        where id =
                            any($1::uuid[])
                        `,
                        [
                            shipmentIds,
                        ],
                    );
                }


                /*
                 * Defensive check
                 */
                const remaining =
                    await db.query(
                        `
                        select id
                        from ${schema}.shipments
                        where shipment_group_id =
                            any($1::uuid[])
                        `,
                        [
                            groupIds,
                        ],
                    );


                expect(
                    remaining,
                ).toHaveLength(
                    0,
                );
            },
        );


        afterAll(
            async () => {
                if (
                    db &&
                    tenant
                ) {
                    const schema =
                        qSchema(
                            tenant.schemaName,
                        );


                    const shipments =
                        await db.query<{
                            id: string;
                        }>(
                            `
                            select id
                            from ${schema}.shipments
                            where checkout_id = $1
                            `,
                            [
                                checkoutId,
                            ],
                        );


                    const shipmentIds =
                        shipments.map(
                            (row) =>
                                row.id,
                        );


                    if (
                        shipmentIds.length
                    ) {
                        await db.query(
                            `
                            delete from ${schema}.shipment_stops
                            where shipment_id =
                                any($1::uuid[])
                            `,
                            [
                                shipmentIds,
                            ],
                        );


                        await db.query(
                            `
                            delete from ${schema}.shipments
                            where id =
                                any($1::uuid[])
                            `,
                            [
                                shipmentIds,
                            ],
                        );
                    }


                    await db.query(
                        `
                        delete from ${schema}.shipment_groups
                        where checkout_id = $1
                        `,
                        [
                            checkoutId,
                        ],
                    );


                    await db.query(
                        `
                        delete from ${schema}.checkouts
                        where id = $1
                        `,
                        [
                            checkoutId,
                        ],
                    );
                }


                if (
                    moduleRef
                ) {
                    await moduleRef.close();
                }
            },
            30000,
        );


        /*
         * ==========================================================
         * TEST 1
         * Normal creation
         * ==========================================================
         */
        it(
            'should create one shipment with pickup and dropoff stops',
            async () => {
                const planId =
                    'plan-valid';


                const winningPlan =
                    plan(
                        planId,
                        [
                            group(
                                groupValidId,
                                [
                                    source(
                                        'SRC-1',
                                        'Tel Aviv',
                                    ),
                                ],
                            ),
                        ],
                    );


                const selectedOption =
                    option(
                        planId,
                        [
                            {
                                groupId:
                                    groupValidId,
                            },
                        ],
                    );


                const result =
                    await service
                        .createShipments(
                            tenant,
                            checkoutId,
                            checkout,
                            winningPlan,
                            selectedOption,
                        );


                expect(
                    result,
                ).toHaveLength(
                    1,
                );


                const schema =
                    qSchema(
                        tenant.schemaName,
                    );


                const shipments =
                    await db.query<{
                        id: string;
                        status: string;
                    }>(
                        `
                        select id, status
                        from ${schema}.shipments
                        where checkout_id = $1
                        `,
                        [
                            checkoutId,
                        ],
                    );


                expect(
                    shipments,
                ).toHaveLength(
                    1,
                );


                expect(
                    shipments[0].status,
                ).toBe(
                    'created',
                );


                const stops =
                    await db.query<{
                        stop_order: number;
                        stop_type: string;
                    }>(
                        `
                        select
                            stop_order,
                            stop_type
                        from ${schema}.shipment_stops
                        where shipment_id = $1
                        order by stop_order
                        `,
                        [
                            shipments[0].id,
                        ],
                    );


                expect(
                    stops,
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


        /*
         * ==========================================================
         * TEST 2
         * Multiple pickup sources
         * ==========================================================
         */
        it(
            'should create one pickup stop per source before dropoff',
            async () => {
                const planId =
                    'plan-two-sources';


                const winningPlan =
                    plan(
                        planId,
                        [
                            group(
                                groupTwoSourcesId,
                                [
                                    source(
                                        'SRC-A',
                                        'Tel Aviv',
                                    ),

                                    source(
                                        'SRC-B',
                                        'Netanya',
                                    ),
                                ],
                            ),
                        ],
                    );


                await service
                    .createShipments(
                        tenant,
                        checkoutId,
                        checkout,
                        winningPlan,
                        option(
                            planId,
                            [
                                {
                                    groupId:
                                        groupTwoSourcesId,
                                },
                            ],
                        ),
                    );


                const schema =
                    qSchema(
                        tenant.schemaName,
                    );


                const shipment =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from ${schema}.shipments
                        where shipment_group_id = $1
                        `,
                        [
                            groupTwoSourcesId,
                        ],
                    );


                expect(
                    shipment,
                ).toHaveLength(
                    1,
                );


                const stops =
                    await db.query<{
                        stop_order: number;
                        stop_type: string;
                        address: any;
                    }>(
                        `
                        select
                            stop_order,
                            stop_type,
                            address
                        from ${schema}.shipment_stops
                        where shipment_id = $1
                        order by stop_order
                        `,
                        [
                            shipment[0].id,
                        ],
                    );


                expect(
                    stops,
                ).toHaveLength(
                    3,
                );


                expect(
                    stops.map(
                        (stop) =>
                            stop.stop_type,
                    ),
                ).toEqual([
                    'pickup',
                    'pickup',
                    'dropoff',
                ]);


                expect(
                    stops[0]
                        .address
                        .city,
                ).toBe(
                    'Tel Aviv',
                );


                expect(
                    stops[1]
                        .address
                        .city,
                ).toBe(
                    'Netanya',
                );


                expect(
                    stops[2]
                        .address
                        .city,
                ).toBe(
                    'Jerusalem',
                );
            },
        );


        /*
         * ==========================================================
         * TEST 3
         * Wrong plan
         * ==========================================================
         */
        it(
            'should not create shipment when delivery option belongs to another plan',
            async () => {
                const winningPlan =
                    plan(
                        'plan-a',
                        [
                            group(
                                groupValidId,
                                [
                                    source(
                                        'SRC-1',
                                        'Tel Aviv',
                                    ),
                                ],
                            ),
                        ],
                    );


                await expect(
                    service
                        .createShipments(
                            tenant,
                            checkoutId,
                            checkout,
                            winningPlan,
                            option(
                                'plan-b',
                                [
                                    {
                                        groupId:
                                            groupValidId,
                                    },
                                ],
                            ),
                        ),
                ).rejects.toThrow(
                    'does not belong to plan',
                );


                const rows =
                    await db.query(
                        `
                        select id
                        from ${qSchema(
                            tenant.schemaName,
                        )}.shipments
                        where checkout_id = $1
                        `,
                        [
                            checkoutId,
                        ],
                    );


                expect(
                    rows,
                ).toHaveLength(
                    0,
                );
            },
        );


        /*
         * ==========================================================
         * TEST 4
         * Missing shipment group
         * ==========================================================
         */
        it(
            'should not create shipment when selected quote references missing group',
            async () => {
                const planId =
                    'plan-missing-group';


                const winningPlan =
                    plan(
                        planId,
                        [
                            group(
                                groupValidId,
                                [
                                    source(
                                        'SRC-1',
                                        'Tel Aviv',
                                    ),
                                ],
                            ),
                        ],
                    );


                await expect(
                    service
                        .createShipments(
                            tenant,
                            checkoutId,
                            checkout,
                            winningPlan,
                            option(
                                planId,
                                [
                                    {
                                        groupId:
                                            randomUUID(),
                                    },
                                ],
                            ),
                        ),
                ).rejects.toThrow(
                    'was not found in plan',
                );


                const rows =
                    await db.query(
                        `
                        select id
                        from ${qSchema(
                            tenant.schemaName,
                        )}.shipments
                        where checkout_id = $1
                        `,
                        [
                            checkoutId,
                        ],
                    );


                expect(
                    rows,
                ).toHaveLength(
                    0,
                );
            },
        );


        /*
         * ==========================================================
         * TEST 5
         * No source -> no orphan shipment
         * ==========================================================
         */
        it(
            'should not leave an orphan shipment when group has no supply sources',
            async () => {
                const planId =
                    'plan-no-sources';


                const winningPlan =
                    plan(
                        planId,
                        [
                            group(
                                groupNoSourcesId,
                                [],
                            ),
                        ],
                    );


                await expect(
                    service
                        .createShipments(
                            tenant,
                            checkoutId,
                            checkout,
                            winningPlan,
                            option(
                                planId,
                                [
                                    {
                                        groupId:
                                            groupNoSourcesId,
                                    },
                                ],
                            ),
                        ),
                ).rejects.toThrow(
                    'has no supply sources',
                );


                const rows =
                    await db.query(
                        `
                        select id
                        from ${qSchema(
                            tenant.schemaName,
                        )}.shipments
                        where shipment_group_id = $1
                        `,
                        [
                            groupNoSourcesId,
                        ],
                    );


                /*
                 * THIS is the important consistency assertion.
                 */
                expect(
                    rows,
                ).toHaveLength(
                    0,
                );
            },
        );


        /*
         * ==========================================================
         * TEST 6
         * Atomicity across multiple groups
         * ==========================================================
         */
        it(
            'should not leave partially created shipments when a later group fails',
            async () => {
                const planId =
                    'plan-atomic';


                const winningPlan =
                    plan(
                        planId,
                        [
                            group(
                                groupAtomicFirstId,
                                [
                                    source(
                                        'SRC-FIRST',
                                        'Tel Aviv',
                                    ),
                                ],
                            ),

                            group(
                                groupAtomicSecondId,
                                [],
                            ),
                        ],
                    );


                const selectedOption =
                    option(
                        planId,
                        [
                            {
                                groupId:
                                    groupAtomicFirstId,
                            },

                            {
                                groupId:
                                    groupAtomicSecondId,
                            },
                        ],
                    );


                await expect(
                    service
                        .createShipments(
                            tenant,
                            checkoutId,
                            checkout,
                            winningPlan,
                            selectedOption,
                        ),
                ).rejects.toThrow(
                    'has no supply sources',
                );


                const rows =
                    await db.query(
                        `
                        select
                            id,
                            shipment_group_id
                        from ${qSchema(
                            tenant.schemaName,
                        )}.shipments
                        where shipment_group_id =
                            any($1::uuid[])
                        `,
                        [[
                            groupAtomicFirstId,
                            groupAtomicSecondId,
                        ]],
                    );


                /*
                 * createShipments should behave atomically:
                 * either all selected shipments exist,
                 * or none exist.
                 */
                expect(
                    rows,
                ).toHaveLength(
                    0,
                );
            },
        );
    },
);