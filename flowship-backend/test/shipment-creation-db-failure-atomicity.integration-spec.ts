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
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import {
    ShipmentsRepository,
} from '../src/modules/shipments/shipments.repository';

import {
    ShipmentCreationService,
} from '../src/modules/shipments/shipment-creation.service';


describe(
    'Shipment Creation DB Failure Atomicity Integration',
    () => {
        let moduleRef: TestingModule;

        let db: DbService;
        let config: ConfigService;
        let tenantsService: TenantsService;

        let shipmentsRepository:
            ShipmentsRepository;

        let service:
            ShipmentCreationService;

        let tenant:
            CurrentTenant;


        let checkoutId: string;

        let groupOneId: string;
        let groupTwoId: string;

        let orderId: string;


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


        function group(
            groupId: string,
            sourceId: string,
            city: string,
        ) {
            return {
                groupId,

                sources: [
                    source(
                        sourceId,
                        city,
                    ),
                ],

                categories: [
                    'standard',
                ],

                items: [
                    {
                        sku:
                            `SKU-${sourceId}`,

                        name:
                            'Atomicity Test Item',

                        quantity:
                            1,

                        unitWeight:
                            1,

                        unitPrice:
                            100,

                        sourceId,
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


        function quote(
            carrierName: string,
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


        function plan(
            planId: string,
            groups: any[],
        ) {
            return {
                id:
                    planId,

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
            groupIds: string[],
        ) {
            return {
                id:
                    `option-${randomUUID()}`,

                planId,

                selectedGroupQuotes:
                    groupIds.map(
                        (
                            groupId,
                            index,
                        ) => ({
                            groupId,

                            pickupCities: [
                                index === 0
                                    ? 'Tel Aviv'
                                    : 'Haifa',
                            ],

                            destinationCity:
                                'Jerusalem',

                            weightKg:
                                1,

                            quote:
                                quote(
                                    index === 0
                                        ? 'Carrier A'
                                        : 'Carrier B',
                                ),
                        }),
                    ),

                metrics: {
                    totalShippingPrice:
                        groupIds.length *
                        25,

                    estimatedDeliveryDays:
                        2,

                    averageProviderPriority:
                        0.5,

                    shipmentCount:
                        groupIds.length,
                },
            } as any;
        }


        function checkout() {
            return {
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
        }


        async function deleteCreatedShipments() {
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
                    (shipment) =>
                        shipment.id,
                );


            if (
                shipmentIds.length > 0
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
        }


        async function countShipments() {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            const rows =
                await db.query<{
                    count: string;
                }>(
                    `
                    select count(*)::text as count
                    from ${schema}.shipments
                    where checkout_id = $1
                    `,
                    [
                        checkoutId,
                    ],
                );


            return Number(
                rows[0]?.count ?? 0,
            );
        }


        async function countStops() {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            const rows =
                await db.query<{
                    count: string;
                }>(
                    `
                    select count(*)::text as count
                    from ${schema}.shipment_stops ss
                    join ${schema}.shipments s
                        on s.id =
                            ss.shipment_id
                    where s.checkout_id = $1
                    `,
                    [
                        checkoutId,
                    ],
                );


            return Number(
                rows[0]?.count ?? 0,
            );
        }


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


                shipmentsRepository =
                    moduleRef.get(
                        ShipmentsRepository,
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
            },
            30000,
        );


        beforeEach(
            async () => {
                jest.restoreAllMocks();


                checkoutId =
                    randomUUID();

                groupOneId =
                    randomUUID();

                groupTwoId =
                    randomUUID();

                orderId =
                    `DB-ATOMICITY-${Date.now()}-${randomUUID()}`;


                const schema =
                    qSchema(
                        tenant.schemaName,
                    );


                /*
                 * ==================================================
                 * Checkout
                 * ==================================================
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
                            checkout()
                                .destination,
                        ),
                    ],
                );


                /*
                 * ==================================================
                 * Shipment groups
                 * ==================================================
                 */

                for (
                    const groupId
                    of [
                        groupOneId,
                        groupTwoId,
                    ]
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


        afterEach(
            async () => {
                jest.restoreAllMocks();


                if (
                    !tenant ||
                    !checkoutId
                ) {
                    return;
                }


                const schema =
                    qSchema(
                        tenant.schemaName,
                    );


                await deleteCreatedShipments();


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
            },
            30000,
        );


        afterAll(
            async () => {
                jest.restoreAllMocks();


                if (moduleRef) {
                    await moduleRef.close();
                }
            },
            30000,
        );


        /*
         * ==========================================================
         * TEST 1
         *
         * Shipment insert succeeds.
         * Stop creation fails.
         *
         * Expected:
         * entire operation must leave ZERO shipment rows.
         * ==========================================================
         */

        it(
            'should rollback shipment when stop creation fails',
            async () => {
                const planId =
                    'db-failure-single';


                const winningPlan =
                    plan(
                        planId,
                        [
                            group(
                                groupOneId,
                                'SOURCE-1',
                                'Tel Aviv',
                            ),
                        ],
                    );


                const selectedOption =
                    option(
                        planId,
                        [
                            groupOneId,
                        ],
                    );


                jest.spyOn(
                    shipmentsRepository,
                    'createShipmentStops',
                ).mockRejectedValueOnce(
                    new Error(
                        'SIMULATED_DB_STOP_FAILURE',
                    ),
                );


                await expect(
                    service
                        .createShipments(
                            tenant,
                            checkoutId,
                            checkout(),
                            winningPlan,
                            selectedOption,
                        ),
                ).rejects.toThrow(
                    'SIMULATED_DB_STOP_FAILURE',
                );


                /*
                 * If shipment + stops are atomic,
                 * shipment insert must also disappear.
                 */
                expect(
                    await countShipments(),
                ).toBe(
                    0,
                );


                expect(
                    await countStops(),
                ).toBe(
                    0,
                );
            },
        );


        /*
         * ==========================================================
         * TEST 2
         *
         * Group 1:
         * shipment + stops succeed.
         *
         * Group 2:
         * shipment succeeds,
         * stops fail.
         *
         * Expected:
         * ZERO shipments from the entire operation.
         * ==========================================================
         */

        it(
            'should rollback all shipments when a later DB write fails',
            async () => {
                const planId =
                    'db-failure-multiple';


                const winningPlan =
                    plan(
                        planId,
                        [
                            group(
                                groupOneId,
                                'SOURCE-1',
                                'Tel Aviv',
                            ),

                            group(
                                groupTwoId,
                                'SOURCE-2',
                                'Haifa',
                            ),
                        ],
                    );


                const selectedOption =
                    option(
                        planId,
                        [
                            groupOneId,
                            groupTwoId,
                        ],
                    );


                const originalCreateStops =
                    shipmentsRepository
                        .createShipmentStops
                        .bind(
                            shipmentsRepository,
                        );


                let stopCallCount =
                    0;


                jest.spyOn(
                    shipmentsRepository,
                    'createShipmentStops',
                ).mockImplementation(
                    async (
                        currentTenant,
                        shipmentId,
                        pickupAddresses,
                        dropoffAddress,
                    ) => {
                        stopCallCount++;


                        if (
                            stopCallCount === 2
                        ) {
                            throw new Error(
                                'SIMULATED_SECOND_SHIPMENT_DB_FAILURE',
                            );
                        }


                        return originalCreateStops(
                            currentTenant,
                            shipmentId,
                            pickupAddresses,
                            dropoffAddress,
                        );
                    },
                );


                await expect(
                    service
                        .createShipments(
                            tenant,
                            checkoutId,
                            checkout(),
                            winningPlan,
                            selectedOption,
                        ),
                ).rejects.toThrow(
                    'SIMULATED_SECOND_SHIPMENT_DB_FAILURE',
                );


                /*
                 * The operation is one business operation.
                 *
                 * Failure in group 2 must rollback group 1 too.
                 */
                expect(
                    await countShipments(),
                ).toBe(
                    0,
                );


                expect(
                    await countStops(),
                ).toBe(
                    0,
                );
            },
        );


        /*
         * ==========================================================
         * TEST 3
         *
         * First attempt fails during group 2.
         * Then we retry the exact same business operation.
         *
         * Expected:
         * only the two shipments from the successful retry exist.
         *
         * No leftovers / duplicates from attempt #1.
         * ==========================================================
         */

        it(
            'should allow clean retry after DB failure without duplicate shipments',
            async () => {
                const planId =
                    'db-failure-retry';


                const winningPlan =
                    plan(
                        planId,
                        [
                            group(
                                groupOneId,
                                'SOURCE-1',
                                'Tel Aviv',
                            ),

                            group(
                                groupTwoId,
                                'SOURCE-2',
                                'Haifa',
                            ),
                        ],
                    );


                const selectedOption =
                    option(
                        planId,
                        [
                            groupOneId,
                            groupTwoId,
                        ],
                    );


                const originalCreateStops =
                    shipmentsRepository
                        .createShipmentStops
                        .bind(
                            shipmentsRepository,
                        );


                let stopCallCount =
                    0;


                const spy =
                    jest.spyOn(
                        shipmentsRepository,
                        'createShipmentStops',
                    ).mockImplementation(
                        async (
                            currentTenant,
                            shipmentId,
                            pickupAddresses,
                            dropoffAddress,
                        ) => {
                            stopCallCount++;


                            if (
                                stopCallCount === 2
                            ) {
                                throw new Error(
                                    'SIMULATED_RETRY_DB_FAILURE',
                                );
                            }


                            return originalCreateStops(
                                currentTenant,
                                shipmentId,
                                pickupAddresses,
                                dropoffAddress,
                            );
                        },
                    );


                /*
                 * Attempt #1
                 */
                await expect(
                    service
                        .createShipments(
                            tenant,
                            checkoutId,
                            checkout(),
                            winningPlan,
                            selectedOption,
                        ),
                ).rejects.toThrow(
                    'SIMULATED_RETRY_DB_FAILURE',
                );


                /*
                 * Restore real repository behavior.
                 */
                spy.mockRestore();


                /*
                 * Attempt #2
                 */
                const retryResult =
                    await service
                        .createShipments(
                            tenant,
                            checkoutId,
                            checkout(),
                            winningPlan,
                            selectedOption,
                        );


                expect(
                    retryResult,
                ).toHaveLength(
                    2,
                );


                /*
                 * We expect exactly:
                 *
                 * Shipment group 1
                 * Shipment group 2
                 *
                 * NOT leftovers from attempt #1.
                 */
                expect(
                    await countShipments(),
                ).toBe(
                    2,
                );


                /*
                 * Every shipment has:
                 *
                 * 1 pickup
                 * 1 dropoff
                 *
                 * = 4 total stops.
                 */
                expect(
                    await countStops(),
                ).toBe(
                    4,
                );


                const schema =
                    qSchema(
                        tenant.schemaName,
                    );


                const rows =
                    await db.query<{
                        shipment_group_id:
                        string;

                        count:
                        string;
                    }>(
                        `
                        select
                            shipment_group_id,
                            count(*)::text as count
                        from ${schema}.shipments
                        where checkout_id = $1
                        group by shipment_group_id
                        order by shipment_group_id
                        `,
                        [
                            checkoutId,
                        ],
                    );


                /*
                 * Exactly one shipment
                 * per shipment group.
                 */
                expect(
                    rows,
                ).toHaveLength(
                    2,
                );


                expect(
                    rows.every(
                        (row) =>
                            Number(
                                row.count,
                            ) === 1,
                    ),
                ).toBe(
                    true,
                );
            },
        );
    },
);