import {
    INestApplication,
    ValidationPipe,
} from '@nestjs/common';

import {
    Test,
    TestingModule,
} from '@nestjs/testing';

import { ConfigService } from '@nestjs/config';

import request from 'supertest';

import { randomUUID } from 'crypto';

import { AppModule } from '../src/app.module';

import {
    DbService,
} from '../src/infrastructure/database/db.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';


describe(
    'Checkout API Security & Validation E2E',
    () => {
        let app: INestApplication;
        let moduleRef: TestingModule;

        let db: DbService;
        let config: ConfigService;
        let tenantsService: TenantsService;

        let tenantA: CurrentTenant;
        let tenantB: CurrentTenant;

        let tenantAApiKey: string;
        let tenantBApiKey: string;

        /*
         * הזמנות תקינות שניצור ב-Test 7 ו-Test 8.
         * נשמור את ה-orderId כדי לנקות אותן בסוף.
         */
        const createdOrderIds: string[] = [];


        beforeAll(
            async () => {
                moduleRef =
                    await Test
                        .createTestingModule({
                            imports: [
                                AppModule,
                            ],
                        })
                        .compile();


                app =
                    moduleRef
                        .createNestApplication();


                /*
                 * זהה ל-main.ts.
                 */
                app.useGlobalPipes(
                    new ValidationPipe({
                        whitelist: true,
                        transform: true,
                        forbidNonWhitelisted: true,
                    }),
                );


                await app.init();


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


                const apiKeyA =
                    config.get<string>(
                        'TEST_FLOW_SHIP_A_API_KEY',
                    );


                const apiKeyB =
                    config.get<string>(
                        'TEST_FLOW_SHIP_B_API_KEY',
                    );


                if (!apiKeyA) {
                    throw new Error(
                        'Missing TEST_FLOW_SHIP_A_API_KEY',
                    );
                }


                if (!apiKeyB) {
                    throw new Error(
                        'Missing TEST_FLOW_SHIP_B_API_KEY',
                    );
                }


                tenantAApiKey =
                    apiKeyA;


                tenantBApiKey =
                    apiKeyB;


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


                expect(
                    tenantA.schemaName,
                ).toBe(
                    'flow_ship_test_a',
                );


                expect(
                    tenantB.schemaName,
                ).toBe(
                    'flow_ship_test_b',
                );
            },
            60000,
        );


        afterAll(
            async () => {
                /*
                 * =====================================================
                 * Cleanup
                 * =====================================================
                 *
                 * חלק מה-checkouts התקינים יכולים ליצור גם downstream
                 * records ולכן מנקים לפי checkout IDs.
                 */

                for (
                    const schema of [
                        'flow_ship_test_a',
                        'flow_ship_test_b',
                    ]
                ) {
                    if (
                        createdOrderIds.length >
                        0
                    ) {
                        const checkoutRows =
                            await db.query<{
                                id: string;
                            }>(
                                `
                                select id
                                from ${schema}.checkouts
                                where external_order_id =
                                    any($1::text[])
                                `,
                                [
                                    createdOrderIds,
                                ],
                            );


                        const checkoutIds =
                            checkoutRows.map(
                                (row) =>
                                    row.id,
                            );


                        if (
                            checkoutIds.length >
                            0
                        ) {
                            await db.query(
                                `
                                delete from ${schema}.shipment_stops
                                where shipment_id in (
                                    select id
                                    from ${schema}.shipments
                                    where checkout_id =
                                        any($1::uuid[])
                                )
                                `,
                                [
                                    checkoutIds,
                                ],
                            );


                            await db.query(
                                `
                                delete from ${schema}.shipments
                                where checkout_id =
                                    any($1::uuid[])
                                `,
                                [
                                    checkoutIds,
                                ],
                            );


                            await db.query(
                                `
                                delete from ${schema}.shipment_group_items
                                where shipment_group_id in (
                                    select id
                                    from ${schema}.shipment_groups
                                    where checkout_id =
                                        any($1::uuid[])
                                )
                                `,
                                [
                                    checkoutIds,
                                ],
                            );


                            await db.query(
                                `
                                delete from ${schema}.shipment_group_sources
                                where shipment_group_id in (
                                    select id
                                    from ${schema}.shipment_groups
                                    where checkout_id =
                                        any($1::uuid[])
                                )
                                `,
                                [
                                    checkoutIds,
                                ],
                            );


                            await db.query(
                                `
                                delete from ${schema}.shipment_groups
                                where checkout_id =
                                    any($1::uuid[])
                                `,
                                [
                                    checkoutIds,
                                ],
                            );


                            await db.query(
                                `
                                delete from ${schema}.shipment_decisions
                                where checkout_id =
                                    any($1::uuid[])
                                `,
                                [
                                    checkoutIds,
                                ],
                            );


                            await db.query(
                                `
                                delete from ${schema}.checkout_processing
                                where checkout_id =
                                    any($1::uuid[])
                                `,
                                [
                                    checkoutIds,
                                ],
                            );


                            await db.query(
                                `
                                delete from ${schema}.checkout_sourcing_results
                                where checkout_id =
                                    any($1::uuid[])
                                `,
                                [
                                    checkoutIds,
                                ],
                            );


                            await db.query(
                                `
                                delete from ${schema}.checkout_items
                                where checkout_id =
                                    any($1::uuid[])
                                `,
                                [
                                    checkoutIds,
                                ],
                            );


                            await db.query(
                                `
                                delete from ${schema}.checkouts
                                where id =
                                    any($1::uuid[])
                                `,
                                [
                                    checkoutIds,
                                ],
                            );
                        }


                        /*
                         * Audit logs משתמשים ב-orderId כ-entity_id.
                         */
                        await db.query(
                            `
                            delete from ${schema}.audit_logs
                            where entity_id =
                                any($1::text[])
                            `,
                            [
                                createdOrderIds,
                            ],
                        );
                    }
                }


                if (app) {
                    await app.close();
                }
            },
            60000,
        );


        /*
         * Payload תקין מבחינת DTO.
         *
         * שימי לב:
         * אנחנו לא מניחים כאן שה-business pipeline בהכרח יצליח.
         * בחלק מהבדיקות מעניינת אותנו שכבת HTTP / Validation / Tenant.
         */
        function createValidPayload(
            orderId:
                string =
                `E2E-SECURITY-${randomUUID()}`,
        ) {
            return {
                orderId,

                storeId:
                    'E2E-SECURITY-STORE',

                destination: {
                    country:
                        'Israel',

                    city:
                        'Netivot',

                    street:
                        'HaShalom',

                    houseNumber:
                        '10',

                    postalCode:
                        '8770000',
                },

                items: [
                    {
                        sku:
                            'SHIRT-BLACK-M',

                        name:
                            'Security Test Shirt',

                        quantity:
                            1,

                        weight:
                            1,

                        price:
                            100,
                    },
                ],
            };
        }


        /*
         * =============================================================
         * TEST 1
         * Missing x-api-key
         * =============================================================
         */

        it(
            'should return 401 when POST /checkout has no x-api-key',
            async () => {
                const payload =
                    createValidPayload();


                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/checkout',
                        )
                        .send(
                            payload,
                        )
                        .expect(
                            401,
                        );


                expect(
                    response.body.message,
                ).toBe(
                    'Missing x-api-key header',
                );
            },
        );


        /*
         * =============================================================
         * TEST 2
         * Invalid API key
         * =============================================================
         */

        it(
            'should return 401 when POST /checkout receives an invalid API key',
            async () => {
                const payload =
                    createValidPayload();


                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/checkout',
                        )
                        .set(
                            'x-api-key',
                            `invalid-${randomUUID()}`,
                        )
                        .send(
                            payload,
                        )
                        .expect(
                            401,
                        );


                expect(
                    response.body.message,
                ).toBe(
                    'Invalid API key',
                );
            },
        );


        /*
         * =============================================================
         * TEST 3
         * Empty payload
         * =============================================================
         */

        it(
            'should return 400 for an empty checkout payload',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/checkout',
                        )
                        .set(
                            'x-api-key',
                            tenantAApiKey,
                        )
                        .send({})
                        .expect(
                            400,
                        );


                expect(
                    response.body.statusCode,
                ).toBe(
                    400,
                );


                expect(
                    Array.isArray(
                        response.body.message,
                    ),
                ).toBe(
                    true,
                );


                const messages =
                    response.body.message
                        .join(
                            ' ',
                        );


                expect(
                    messages,
                ).toContain(
                    'orderId',
                );


                expect(
                    messages,
                ).toContain(
                    'storeId',
                );


                expect(
                    messages,
                ).toContain(
                    'items',
                );
            },
        );


        /*
         * =============================================================
         * TEST 4
         * forbidNonWhitelisted
         * =============================================================
         */

        it(
            'should return 400 when payload contains an unknown field',
            async () => {
                const payload = {
                    ...createValidPayload(),

                    /*
                     * לא קיים ב-CreateCheckoutDto.
                     */
                    maliciousField:
                        'should-not-be-accepted',
                };


                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/checkout',
                        )
                        .set(
                            'x-api-key',
                            tenantAApiKey,
                        )
                        .send(
                            payload,
                        )
                        .expect(
                            400,
                        );


                expect(
                    response.body.statusCode,
                ).toBe(
                    400,
                );


                expect(
                    response.body.message,
                ).toEqual(
                    expect.arrayContaining([
                        expect.stringContaining(
                            'maliciousField',
                        ),
                    ]),
                );
            },
        );


        /*
         * =============================================================
         * TEST 5
         * Invalid nested CheckoutItemDto
         * =============================================================
         */

        it(
            'should return 400 when checkout item violates DTO validation',
            async () => {
                const payload =
                    createValidPayload();


                payload.items = [
                    {
                        /*
                         * @IsNotEmpty()
                         */
                        sku:
                            '',

                        name:
                            'Invalid Item',

                        /*
                         * @Min(1)
                         */
                        quantity:
                            0,

                        weight:
                            1,

                        /*
                         * @Min(0)
                         */
                        price:
                            -1,
                    },
                ];


                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/checkout',
                        )
                        .set(
                            'x-api-key',
                            tenantAApiKey,
                        )
                        .send(
                            payload,
                        )
                        .expect(
                            400,
                        );


                expect(
                    response.body.statusCode,
                ).toBe(
                    400,
                );


                expect(
                    Array.isArray(
                        response.body.message,
                    ),
                ).toBe(
                    true,
                );


                const messages =
                    response.body.message
                        .join(
                            ' ',
                        );


                expect(
                    messages,
                ).toContain(
                    'sku',
                );


                expect(
                    messages,
                ).toContain(
                    'quantity',
                );


                expect(
                    messages,
                ).toContain(
                    'price',
                );
            },
        );


        /*
         * =============================================================
         * TEST 6
         * Validation failure must not persist
         * =============================================================
         */

        it(
            'should not persist checkout when request is rejected by validation',
            async () => {
                const orderId =
                    `E2E-REJECTED-${randomUUID()}`;


                const payload =
                    createValidPayload(
                        orderId,
                    );


                /*
                 * CreateCheckoutDto:
                 * @IsArray()
                 * @ArrayMinSize(1)
                 */
                payload.items = [];


                await request(
                    app.getHttpServer(),
                )
                    .post(
                        '/checkout',
                    )
                    .set(
                        'x-api-key',
                        tenantAApiKey,
                    )
                    .send(
                        payload,
                    )
                    .expect(
                        400,
                    );


                const rowsA =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from flow_ship_test_a.checkouts
                        where external_order_id = $1
                        `,
                        [
                            orderId,
                        ],
                    );


                const rowsB =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from flow_ship_test_b.checkouts
                        where external_order_id = $1
                        `,
                        [
                            orderId,
                        ],
                    );


                expect(
                    rowsA,
                ).toHaveLength(
                    0,
                );


                expect(
                    rowsB,
                ).toHaveLength(
                    0,
                );
            },
        );


        /*
         * =============================================================
         * TEST 7
         * API key → correct tenant
         * =============================================================
         */

        it(
            'should route Tenant A and Tenant B requests to their own schemas',
            async () => {
                const orderIdA =
                    `E2E-TENANT-A-${randomUUID()}`;


                const orderIdB =
                    `E2E-TENANT-B-${randomUUID()}`;


                createdOrderIds.push(
                    orderIdA,
                    orderIdB,
                );


                /*
                 * גם אם ה-business pipeline מחזיר failure בגלל
                 * configuration/inventory של tenant מסוים,
                 * ה-checkout עצמו אמור להישמר בסכמה שנבחרה
                 * לפי ה-API key.
                 */

                await request(
                    app.getHttpServer(),
                )
                    .post(
                        '/checkout',
                    )
                    .set(
                        'x-api-key',
                        tenantAApiKey,
                    )
                    .send(
                        createValidPayload(
                            orderIdA,
                        ),
                    );


                await request(
                    app.getHttpServer(),
                )
                    .post(
                        '/checkout',
                    )
                    .set(
                        'x-api-key',
                        tenantBApiKey,
                    )
                    .send(
                        createValidPayload(
                            orderIdB,
                        ),
                    );


                const aInA =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from flow_ship_test_a.checkouts
                        where external_order_id = $1
                        `,
                        [
                            orderIdA,
                        ],
                    );


                const aInB =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from flow_ship_test_b.checkouts
                        where external_order_id = $1
                        `,
                        [
                            orderIdA,
                        ],
                    );


                const bInA =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from flow_ship_test_a.checkouts
                        where external_order_id = $1
                        `,
                        [
                            orderIdB,
                        ],
                    );


                const bInB =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from flow_ship_test_b.checkouts
                        where external_order_id = $1
                        `,
                        [
                            orderIdB,
                        ],
                    );


                expect(
                    aInA,
                ).toHaveLength(
                    1,
                );


                expect(
                    aInB,
                ).toHaveLength(
                    0,
                );


                expect(
                    bInA,
                ).toHaveLength(
                    0,
                );


                expect(
                    bInB,
                ).toHaveLength(
                    1,
                );
            },
            60000,
        );


        /*
         * =============================================================
         * TEST 8
         * Cross-Tenant write isolation
         * =============================================================
         */

        it(
            'should never write a Tenant B API request into Tenant A schema',
            async () => {
                const orderId =
                    `E2E-B-ISOLATION-${randomUUID()}`;


                createdOrderIds.push(
                    orderId,
                );


                await request(
                    app.getHttpServer(),
                )
                    .post(
                        '/checkout',
                    )
                    .set(
                        'x-api-key',
                        tenantBApiKey,
                    )
                    .send(
                        createValidPayload(
                            orderId,
                        ),
                    );


                const tenantARows =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from flow_ship_test_a.checkouts
                        where external_order_id = $1
                        `,
                        [
                            orderId,
                        ],
                    );


                const tenantBRows =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from flow_ship_test_b.checkouts
                        where external_order_id = $1
                        `,
                        [
                            orderId,
                        ],
                    );


                expect(
                    tenantARows,
                ).toHaveLength(
                    0,
                );


                expect(
                    tenantBRows,
                ).toHaveLength(
                    1,
                );
            },
            60000,
        );
    },
);