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
    'Shipment Groups DB Failure Atomicity Integration',
    () => {
        let moduleRef:
            TestingModule;

        let db:
            DbService;

        let config:
            ConfigService;

        let tenantsService:
            TenantsService;

        let checkoutRepository:
            CheckoutRepository;

        let shipmentGroupsRepository:
            ShipmentGroupsRepository;

        let tenant:
            CurrentTenant;


        let checkoutId:
            string;

        let checkout:
            Checkout;

        let checkoutItemIdsBySku:
            Map<string, string>;


        /*
         * ============================================================
         * Helpers
         * ============================================================
         */

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


        function createCheckout():
            Checkout {
            return {
                orderId:
                    `GROUP-ATOMIC-${randomUUID()}`,

                storeId:
                    'group-atomicity-test',

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
                            'SKU-VALID-1',

                        name:
                            'Valid Item 1',

                        quantity:
                            1,

                        unitWeight:
                            1,

                        unitPrice:
                            100,

                        supplierId:
                            'SUPPLIER-1',

                        category:
                            'general',
                    },

                    {
                        sku:
                            'SKU-VALID-2',

                        name:
                            'Valid Item 2',

                        quantity:
                            1,

                        unitWeight:
                            2,

                        unitPrice:
                            150,

                        supplierId:
                            'SUPPLIER-2',

                        category:
                            'general',
                    },
                ],

                totalItems:
                    2,

                totalPrice:
                    250,

                createdAt:
                    new Date(),
            };
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
                    'warehouse' as const,

                isActive:
                    true,

                priority:
                    1,

                location: {
                    country:
                        'Israel',

                    city,

                    street:
                        'Test Street',

                    houseNumber:
                        '1',

                    latitude:
                        32.08,

                    longitude:
                        34.78,
                },
            };
        }


        function group(
            groupId: string,
            sku: string,
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
                    'general',
                ],

                items: [
                    {
                        sku,

                        name:
                            `Item ${sku}`,

                        quantity:
                            1,

                        unitWeight:
                            1,

                        unitPrice:
                            100,

                        sourceId,

                        supplierId:
                            'SUPPLIER-TEST',

                        category:
                            'general',
                    },
                ],

                totalItems:
                    1,

                totalWeight:
                    1,

                totalPrice:
                    100,

                groupingReasons:
                    [
                        'atomicity-test',
                    ],

                handlingGroup:
                    'standard',
            };
        }


        function groupingResult(
            groups: any[],
        ): GroupingResult {
            return {
                orderId:
                    checkout.orderId,

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
            };
        }


        async function countGroups() {
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
                    from ${schema}.shipment_groups
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


        async function countSources() {
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
                    from ${schema}.shipment_group_sources sgs
                    join ${schema}.shipment_groups sg
                        on sg.id =
                            sgs.shipment_group_id
                    where sg.checkout_id = $1
                    `,
                    [
                        checkoutId,
                    ],
                );


            return Number(
                rows[0]?.count ?? 0,
            );
        }


        async function countItems() {
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
                    from ${schema}.shipment_group_items sgi
                    join ${schema}.shipment_groups sg
                        on sg.id =
                            sgi.shipment_group_id
                    where sg.checkout_id = $1
                    `,
                    [
                        checkoutId,
                    ],
                );


            return Number(
                rows[0]?.count ?? 0,
            );
        }


        async function cleanupGrouping() {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            const groups =
                await db.query<{
                    id: string;
                }>(
                    `
                    select id
                    from ${schema}.shipment_groups
                    where checkout_id = $1
                    `,
                    [
                        checkoutId,
                    ],
                );


            const groupIds =
                groups.map(
                    (row) =>
                        row.id,
                );


            if (
                groupIds.length === 0
            ) {
                return;
            }


            await db.query(
                `
                delete from ${schema}.shipment_group_items
                where shipment_group_id =
                    any($1::uuid[])
                `,
                [
                    groupIds,
                ],
            );


            await db.query(
                `
                delete from ${schema}.shipment_group_sources
                where shipment_group_id =
                    any($1::uuid[])
                `,
                [
                    groupIds,
                ],
            );


            await db.query(
                `
                delete from ${schema}.shipment_groups
                where id =
                    any($1::uuid[])
                `,
                [
                    groupIds,
                ],
            );
        }


        async function cleanupCheckout() {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            await cleanupGrouping();


            await db.query(
                `
                delete from ${schema}.checkout_items
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


        /*
         * ============================================================
         * Setup
         * ============================================================
         */

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
                                CheckoutRepository,
                                ShipmentGroupsRepository,
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


                checkoutRepository =
                    moduleRef.get(
                        CheckoutRepository,
                    );


                shipmentGroupsRepository =
                    moduleRef.get(
                        ShipmentGroupsRepository,
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
                checkout =
                    createCheckout();


                checkoutId =
                    await checkoutRepository
                        .saveCheckout(
                            tenant,
                            checkout,
                            'manual',
                        );


                checkoutItemIdsBySku =
                    await checkoutRepository
                        .saveCheckoutItems(
                            tenant,
                            checkoutId,
                            checkout,
                        );


                expect(
                    checkoutItemIdsBySku.size,
                ).toBe(
                    2,
                );
            },
            30000,
        );


        afterEach(
            async () => {
                await cleanupCheckout();
            },
            30000,
        );


        afterAll(
            async () => {
                if (moduleRef) {
                    await moduleRef.close();
                }
            },
            30000,
        );


        /*
         * ============================================================
         * TEST 1
         *
         * Baseline:
         * one valid group must create:
         *
         * 1 shipment_group
         * 1 source
         * 1 item
         * ============================================================
         */

        it(
            'should persist a valid shipment group with source and item',
            async () => {
                const groupId =
                    randomUUID();


                const grouping =
                    groupingResult([
                        group(
                            groupId,
                            'SKU-VALID-1',
                            'SOURCE-1',
                            'Tel Aviv',
                        ),
                    ]);


                await shipmentGroupsRepository
                    .saveGroupingResult(
                        tenant,
                        checkoutId,
                        grouping,
                        checkoutItemIdsBySku,
                    );


                expect(
                    await countGroups(),
                ).toBe(
                    1,
                );


                expect(
                    await countSources(),
                ).toBe(
                    1,
                );


                expect(
                    await countItems(),
                ).toBe(
                    1,
                );
            },
        );


        /*
         * ============================================================
         * TEST 2
         *
         * Group + source are written first.
         *
         * Then repository discovers that the SKU has no checkoutItemId.
         *
         * Expected:
         * ZERO partial rows after failure.
         * ============================================================
         */

        it(
            'should rollback group and source when checkout item id is missing',
            async () => {
                const groupId =
                    randomUUID();


                const grouping =
                    groupingResult([
                        group(
                            groupId,
                            'SKU-NOT-IN-MAP',
                            'SOURCE-MISSING-MAP',
                            'Haifa',
                        ),
                    ]);


                await expect(
                    shipmentGroupsRepository
                        .saveGroupingResult(
                            tenant,
                            checkoutId,
                            grouping,
                            checkoutItemIdsBySku,
                        ),
                ).rejects.toThrow(
                    'Checkout item id not found for SKU SKU-NOT-IN-MAP',
                );


                expect(
                    await countGroups(),
                ).toBe(
                    0,
                );


                expect(
                    await countSources(),
                ).toBe(
                    0,
                );


                expect(
                    await countItems(),
                ).toBe(
                    0,
                );
            },
        );


        /*
         * ============================================================
         * TEST 3
         *
         * Group 1 is completely valid.
         * Group 2 fails due to missing checkout item mapping.
         *
         * Expected:
         * entire saveGroupingResult operation is atomic.
         * Group 1 must NOT remain.
         * ============================================================
         */

        it(
            'should rollback all groups when a later group fails',
            async () => {
                const groupOneId =
                    randomUUID();

                const groupTwoId =
                    randomUUID();


                const grouping =
                    groupingResult([
                        group(
                            groupOneId,
                            'SKU-VALID-1',
                            'SOURCE-1',
                            'Tel Aviv',
                        ),

                        group(
                            groupTwoId,
                            'SKU-MISSING-LATER',
                            'SOURCE-2',
                            'Haifa',
                        ),
                    ]);


                await expect(
                    shipmentGroupsRepository
                        .saveGroupingResult(
                            tenant,
                            checkoutId,
                            grouping,
                            checkoutItemIdsBySku,
                        ),
                ).rejects.toThrow(
                    'Checkout item id not found for SKU SKU-MISSING-LATER',
                );


                expect(
                    await countGroups(),
                ).toBe(
                    0,
                );


                expect(
                    await countSources(),
                ).toBe(
                    0,
                );


                expect(
                    await countItems(),
                ).toBe(
                    0,
                );
            },
        );


        /*
         * ============================================================
         * TEST 4
         *
         * First attempt fails.
         * Then retry with corrected data.
         *
         * Expected:
         * no leftovers from failed attempt,
         * no duplicate group id,
         * retry succeeds cleanly.
         * ============================================================
         */

        it(
            'should allow a clean retry after failed grouping persistence',
            async () => {
                const groupId =
                    randomUUID();


                const invalidGrouping =
                    groupingResult([
                        group(
                            groupId,
                            'SKU-MISSING-RETRY',
                            'SOURCE-RETRY',
                            'Tel Aviv',
                        ),
                    ]);


                await expect(
                    shipmentGroupsRepository
                        .saveGroupingResult(
                            tenant,
                            checkoutId,
                            invalidGrouping,
                            checkoutItemIdsBySku,
                        ),
                ).rejects.toThrow(
                    'Checkout item id not found for SKU SKU-MISSING-RETRY',
                );


                /*
                 * Failed attempt must leave nothing behind.
                 */
                expect(
                    await countGroups(),
                ).toBe(
                    0,
                );


                expect(
                    await countSources(),
                ).toBe(
                    0,
                );


                expect(
                    await countItems(),
                ).toBe(
                    0,
                );


                /*
                 * Retry with valid SKU but SAME group id.
                 *
                 * If failed attempt left the group behind,
                 * this will typically hit a PK/unique violation.
                 */
                const validGrouping =
                    groupingResult([
                        group(
                            groupId,
                            'SKU-VALID-1',
                            'SOURCE-RETRY',
                            'Tel Aviv',
                        ),
                    ]);


                await shipmentGroupsRepository
                    .saveGroupingResult(
                        tenant,
                        checkoutId,
                        validGrouping,
                        checkoutItemIdsBySku,
                    );


                expect(
                    await countGroups(),
                ).toBe(
                    1,
                );


                expect(
                    await countSources(),
                ).toBe(
                    1,
                );


                expect(
                    await countItems(),
                ).toBe(
                    1,
                );
            },
        );
    },
);