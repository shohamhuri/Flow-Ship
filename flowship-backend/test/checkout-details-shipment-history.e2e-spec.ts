import {
    INestApplication,
    UnauthorizedException,
    ValidationPipe,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';

import { AppModule } from '../src/app.module';

import {
    DbService,
} from '../src/infrastructure/database/db.service';

import {
    AuthService,
} from '../src/modules/auth/auth.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';


describe(
    'Checkout Details & Shipment History E2E',
    () => {
        let app: INestApplication;
        let moduleRef: TestingModule;

        let db: DbService;
        let config: ConfigService;
        let tenantsService: TenantsService;
        let authService: AuthService;

        let tenantA: CurrentTenant;
        let tenantB: CurrentTenant;


        const TOKEN_A =
            'e2e-details-history-a';

        const TOKEN_B =
            'e2e-details-history-b';


        const checkoutAId =
            randomUUID();

        const checkoutBId =
            randomUUID();

        const shipmentAId =
            randomUUID();

        const shipmentAFailedId =
            randomUUID();

        const shipmentBId =
            randomUUID();

        const stopAPickupId =
            randomUUID();

        const stopADropoffId =
            randomUUID();

        const stopAFailedPickupId =
            randomUUID();

        const stopAFailedDropoffId =
            randomUUID();


        const orderA =
            `E2E-HISTORY-A-${Date.now()}`;

        const failedOrderA =
            `E2E-HISTORY-A-FAILED-${Date.now()}`;

        const orderB =
            `E2E-HISTORY-B-${Date.now()}`;

        const trackingA =
            `E2E-TRACK-A-${Date.now()}`;

        const trackingAFailed =
            `E2E-TRACK-FAIL-A-${Date.now()}`;

        const trackingB =
            `E2E-TRACK-B-${Date.now()}`;


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


        function bearer(
            token: string,
        ) {
            return `Bearer ${token}`;
        }


        function authContext(
            tenant: CurrentTenant,
        ) {
            return {
                user: {
                    id:
                        `e2e-history-${tenant.id}`,

                    email:
                        'e2e-history@flowship.test',

                    displayName:
                        'E2E History',

                    role:
                        'admin',
                },

                tenant,
            };
        }


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


                app.useGlobalPipes(
                    new ValidationPipe({
                        whitelist:
                            true,

                        transform:
                            true,

                        forbidNonWhitelisted:
                            true,
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


                authService =
                    moduleRef.get(
                        AuthService,
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


                tenantA =
                    await tenantsService
                        .findByApiKey(
                            apiKeyA,
                        );


                tenantB =
                    await tenantsService
                        .findByApiKey(
                            apiKeyB,
                        );


                expect(
                    tenantA.schemaName,
                ).not.toBe(
                    tenantB.schemaName,
                );


                jest.spyOn(
                    authService,
                    'authenticateAccessToken',
                )
                    .mockImplementation(
                        async (
                            token: string,
                        ) => {
                            if (
                                token ===
                                TOKEN_A
                            ) {
                                return authContext(
                                    tenantA,
                                );
                            }


                            if (
                                token ===
                                TOKEN_B
                            ) {
                                return authContext(
                                    tenantB,
                                );
                            }


                            throw new UnauthorizedException(
                                'Invalid or expired access token',
                            );
                        },
                    );


                const schemaA =
                    qSchema(
                        tenantA.schemaName,
                    );

                const schemaB =
                    qSchema(
                        tenantB.schemaName,
                    );


                /*
                 * ==================================================
                 * Tenant A - delivered checkout
                 * ==================================================
                 */

                await db.query(
                    `
                    insert into ${schemaA}.checkouts (
                        id,
                        platform,
                        external_checkout_id,
                        external_order_id,
                        customer,
                        cart,
                        destination,
                        raw_payload,
                        status,
                        created_at
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
                        'delivered',
                        now()
                    )
                    `,
                    [
                        checkoutAId,
                        orderA,

                        JSON.stringify({
                            country:
                                'Israel',

                            city:
                                'Jerusalem',

                            street:
                                'Jaffa',

                            houseNumber:
                                '10',
                        }),
                    ],
                );


                await db.query(
                    `
                    insert into ${schemaA}.shipments (
                        id,
                        checkout_id,
                        order_id,
                        selected_plan_id,
                        selected_delivery_option_key,
                        carrier_name,
                        service_name,
                        price,
                        currency,
                        estimated_delivery_days,
                        status,
                        tracking_number,
                        external_shipment_id,
                        delivered_at,
                        created_at
                    )
                    values (
                        $1,
                        $2,
                        $3,
                        'e2e-plan-a',
                        'e2e-option-a',
                        'E2E Carrier A',
                        'Express',
                        25,
                        'ILS',
                        1,
                        'delivered',
                        $4,
                        'E2E-EXT-A',
                        now(),
                        now()
                    )
                    `,
                    [
                        shipmentAId,
                        checkoutAId,
                        orderA,
                        trackingA,
                    ],
                );


                /*
                 * Insert stops deliberately backwards.
                 */
                await db.query(
                    `
                    insert into ${schemaA}.shipment_stops (
                        id,
                        shipment_id,
                        stop_order,
                        stop_type,
                        address,
                        status
                    )
                    values
                    (
                        $1,
                        $2,
                        2,
                        'dropoff',
                        $3::jsonb,
                        'completed'
                    ),
                    (
                        $4,
                        $2,
                        1,
                        'pickup',
                        $5::jsonb,
                        'completed'
                    )
                    `,
                    [
                        stopADropoffId,
                        shipmentAId,

                        JSON.stringify({
                            city:
                                'Jerusalem',

                            street:
                                'Jaffa',
                        }),

                        stopAPickupId,

                        JSON.stringify({
                            city:
                                'Tel Aviv',

                            street:
                                'Dizengoff',
                        }),
                    ],
                );


                /*
                 * ==================================================
                 * Tenant A - failed checkout
                 * ==================================================
                 */

                const failedCheckoutId =
                    randomUUID();


                (global as any)
                    .__E2E_FAILED_CHECKOUT_ID__ =
                    failedCheckoutId;


                await db.query(
                    `
                    insert into ${schemaA}.checkouts (
                        id,
                        platform,
                        external_checkout_id,
                        external_order_id,
                        customer,
                        cart,
                        destination,
                        raw_payload,
                        status,
                        created_at
                    )
                    values (
                        $1,
                        'manual',
                        $2,
                        $2,
                        '{}'::jsonb,
                        '[]'::jsonb,
                        '{}'::jsonb,
                        '{}'::jsonb,
                        'failed',
                        now()
                    )
                    `,
                    [
                        failedCheckoutId,
                        failedOrderA,
                    ],
                );


                await db.query(
                    `
                    insert into ${schemaA}.checkout_processing (
                        id,
                        checkout_id,
                        status,
                        current_step,
                        error_message,
                        completed_at
                    )
                    values (
                        $1,
                        $2,
                        'failed',
                        'shipment_delivery',
                        'Address not found',
                        now()
                    )
                    `,
                    [
                        randomUUID(),
                        failedCheckoutId,
                    ],
                );


                await db.query(
                    `
                    insert into ${schemaA}.shipments (
                        id,
                        checkout_id,
                        order_id,
                        selected_plan_id,
                        selected_delivery_option_key,
                        carrier_name,
                        service_name,
                        price,
                        currency,
                        estimated_delivery_days,
                        status,
                        tracking_number,
                        external_shipment_id,
                        failure_reason,
                        failed_at,
                        created_at
                    )
                    values (
                        $1,
                        $2,
                        $3,
                        'e2e-failed-plan',
                        'e2e-failed-option',
                        'Failed Carrier',
                        'Express',
                        55,
                        'ILS',
                        1,
                        'failed',
                        $4,
                        'E2E-EXT-FAILED',
                        'Address not found',
                        now(),
                        now()
                    )
                    `,
                    [
                        shipmentAFailedId,
                        failedCheckoutId,
                        failedOrderA,
                        trackingAFailed,
                    ],
                );


                await db.query(
                    `
                    insert into ${schemaA}.shipment_stops (
                        id,
                        shipment_id,
                        stop_order,
                        stop_type,
                        address,
                        status
                    )
                    values
                    (
                        $1,
                        $2,
                        1,
                        'pickup',
                        '{}'::jsonb,
                        'completed'
                    ),
                    (
                        $3,
                        $2,
                        2,
                        'dropoff',
                        '{}'::jsonb,
                        'failed'
                    )
                    `,
                    [
                        stopAFailedPickupId,
                        shipmentAFailedId,

                        stopAFailedDropoffId,
                    ],
                );


                /*
                 * ==================================================
                 * Tenant B
                 * ==================================================
                 */

                await db.query(
                    `
                    insert into ${schemaB}.checkouts (
                        id,
                        platform,
                        external_checkout_id,
                        external_order_id,
                        customer,
                        cart,
                        destination,
                        raw_payload,
                        status,
                        created_at
                    )
                    values (
                        $1,
                        'manual',
                        $2,
                        $2,
                        '{}'::jsonb,
                        '[]'::jsonb,
                        '{}'::jsonb,
                        '{}'::jsonb,
                        'delivered',
                        now()
                    )
                    `,
                    [
                        checkoutBId,
                        orderB,
                    ],
                );


                await db.query(
                    `
                    insert into ${schemaB}.shipments (
                        id,
                        checkout_id,
                        order_id,
                        selected_plan_id,
                        selected_delivery_option_key,
                        carrier_name,
                        service_name,
                        price,
                        currency,
                        estimated_delivery_days,
                        status,
                        tracking_number,
                        external_shipment_id,
                        delivered_at,
                        created_at
                    )
                    values (
                        $1,
                        $2,
                        $3,
                        'e2e-plan-b',
                        'e2e-option-b',
                        'E2E Carrier B',
                        'Standard',
                        40,
                        'ILS',
                        2,
                        'delivered',
                        $4,
                        'E2E-EXT-B',
                        now(),
                        now()
                    )
                    `,
                    [
                        shipmentBId,
                        checkoutBId,
                        orderB,
                        trackingB,
                    ],
                );
            },
            60000,
        );


        afterAll(
            async () => {
                if (
                    tenantA &&
                    tenantB
                ) {
                    const schemaA =
                        qSchema(
                            tenantA.schemaName,
                        );

                    const schemaB =
                        qSchema(
                            tenantB.schemaName,
                        );


                    const failedCheckoutId =
                        (global as any)
                            .__E2E_FAILED_CHECKOUT_ID__;


                    await db.query(
                        `
                        delete from ${schemaA}.shipment_stops
                        where shipment_id =
                            any($1::uuid[])
                        `,
                        [[
                            shipmentAId,
                            shipmentAFailedId,
                        ]],
                    );


                    await db.query(
                        `
                        delete from ${schemaA}.shipments
                        where id =
                            any($1::uuid[])
                        `,
                        [[
                            shipmentAId,
                            shipmentAFailedId,
                        ]],
                    );


                    if (
                        failedCheckoutId
                    ) {
                        await db.query(
                            `
                            delete from ${schemaA}.checkout_processing
                            where checkout_id = $1
                            `,
                            [
                                failedCheckoutId,
                            ],
                        );
                    }


                    await db.query(
                        `
                        delete from ${schemaA}.checkouts
                        where id =
                            any($1::uuid[])
                        `,
                        [[
                            checkoutAId,
                            failedCheckoutId,
                        ]],
                    );


                    await db.query(
                        `
                        delete from ${schemaB}.shipments
                        where id = $1
                        `,
                        [
                            shipmentBId,
                        ],
                    );


                    await db.query(
                        `
                        delete from ${schemaB}.checkouts
                        where id = $1
                        `,
                        [
                            checkoutBId,
                        ],
                    );
                }


                if (app) {
                    await app.close();
                }
            },
            60000,
        );


        /*
         * TEST 1
         */
        it(
            'should reject checkout details without Authorization',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .get(
                        `/checkout/${checkoutAId}`,
                    )
                    .expect(
                        401,
                    );
            },
        );


        /*
         * TEST 2
         */
        it(
            'should reject checkout details with invalid token',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .get(
                        `/checkout/${checkoutAId}`,
                    )
                    .set(
                        'Authorization',
                        bearer(
                            'invalid-token',
                        ),
                    )
                    .expect(
                        401,
                    );
            },
        );


        /*
         * TEST 3
         */
        it(
            'should return Tenant A checkout details',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            `/checkout/${checkoutAId}`,
                        )
                        .set(
                            'Authorization',
                            bearer(
                                TOKEN_A,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body.id,
                ).toBe(
                    checkoutAId,
                );


                expect(
                    response.body.orderId,
                ).toBe(
                    orderA,
                );
            },
        );


        /*
         * TEST 4
         */
        it(
            'should return checkout items groups and shipments arrays',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            `/checkout/${checkoutAId}`,
                        )
                        .set(
                            'Authorization',
                            bearer(
                                TOKEN_A,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    Array.isArray(
                        response.body.items,
                    ),
                ).toBe(
                    true,
                );


                expect(
                    Array.isArray(
                        response.body
                            .shipmentGroups,
                    ),
                ).toBe(
                    true,
                );


                expect(
                    response.body
                        .shipments
                        .some(
                            (
                                shipment:
                                    any,
                            ) =>
                                shipment.id ===
                                shipmentAId,
                        ),
                ).toBe(
                    true,
                );
            },
        );


        /*
         * TEST 5
         */
        it(
            'should return shipment stops ordered by stopOrder',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            `/checkout/${checkoutAId}`,
                        )
                        .set(
                            'Authorization',
                            bearer(
                                TOKEN_A,
                            ),
                        )
                        .expect(
                            200,
                        );


                const shipment =
                    response.body
                        .shipments
                        .find(
                            (
                                row:
                                    any,
                            ) =>
                                row.id ===
                                shipmentAId,
                        );


                expect(
                    shipment,
                ).toBeDefined();


                expect(
                    shipment.stops.map(
                        (
                            stop:
                                any,
                        ) =>
                            stop.stopOrder,
                    ),
                ).toEqual([
                    1,
                    2,
                ]);


                expect(
                    shipment.stops[0]
                        .stopType,
                ).toBe(
                    'pickup',
                );


                expect(
                    shipment.stops[1]
                        .stopType,
                ).toBe(
                    'dropoff',
                );
            },
        );


        /*
         * TEST 6
         */
        it(
            'should not expose Tenant A checkout to Tenant B',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .get(
                        `/checkout/${checkoutAId}`,
                    )
                    .set(
                        'Authorization',
                        bearer(
                            TOKEN_B,
                        ),
                    )
                    .expect(
                        404,
                    );
            },
        );


        /*
         * TEST 7
         */
        it(
            'should reject shipment history without Authorization',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .get(
                        '/admin/shipment-history',
                    )
                    .expect(
                        401,
                    );
            },
        );


        /*
         * TEST 8
         */
        it(
            'should reject shipment history with invalid token',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .get(
                        '/admin/shipment-history',
                    )
                    .set(
                        'Authorization',
                        bearer(
                            'invalid-token',
                        ),
                    )
                    .expect(
                        401,
                    );
            },
        );


        /*
         * TEST 9
         */
        it(
            'should return Tenant A shipment history',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/shipment-history',
                        )
                        .set(
                            'Authorization',
                            bearer(
                                TOKEN_A,
                            ),
                        )
                        .expect(
                            200,
                        );


                const orderIds =
                    response.body
                        .items
                        .map(
                            (
                                item:
                                    any,
                            ) =>
                                item.orderId,
                        );


                expect(
                    orderIds,
                ).toContain(
                    orderA,
                );


                expect(
                    orderIds,
                ).toContain(
                    failedOrderA,
                );


                expect(
                    orderIds,
                ).not.toContain(
                    orderB,
                );
            },
        );


        /*
         * TEST 10
         */
        it(
            'should isolate Tenant B shipment history',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/shipment-history',
                        )
                        .set(
                            'Authorization',
                            bearer(
                                TOKEN_B,
                            ),
                        )
                        .expect(
                            200,
                        );


                const orderIds =
                    response.body
                        .items
                        .map(
                            (
                                item:
                                    any,
                            ) =>
                                item.orderId,
                        );


                expect(
                    orderIds,
                ).toContain(
                    orderB,
                );


                expect(
                    orderIds,
                ).not.toContain(
                    orderA,
                );


                expect(
                    orderIds,
                ).not.toContain(
                    failedOrderA,
                );
            },
        );


        /*
         * TEST 11
         */
        it(
            'should filter delivered and failed shipment history',
            async () => {
                const delivered =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/shipment-history',
                        )
                        .query({
                            resultStatus:
                                'delivered',

                            search:
                                'E2E-HISTORY-A-',
                        })
                        .set(
                            'Authorization',
                            bearer(
                                TOKEN_A,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    delivered.body
                        .items,
                ).toHaveLength(
                    1,
                );


                expect(
                    delivered.body
                        .items[0]
                        .orderId,
                ).toBe(
                    orderA,
                );


                const failed =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/shipment-history',
                        )
                        .query({
                            resultStatus:
                                'failed',

                            search:
                                'E2E-HISTORY-A-',
                        })
                        .set(
                            'Authorization',
                            bearer(
                                TOKEN_A,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    failed.body.items,
                ).toHaveLength(
                    1,
                );


                expect(
                    failed.body
                        .items[0]
                        .orderId,
                ).toBe(
                    failedOrderA,
                );
            },
        );


        /*
         * TEST 12
         */
        it(
            'should search history by order id and tracking number',
            async () => {
                const byOrder =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/shipment-history',
                        )
                        .query({
                            search:
                                failedOrderA,
                        })
                        .set(
                            'Authorization',
                            bearer(
                                TOKEN_A,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    byOrder.body
                        .items,
                ).toHaveLength(
                    1,
                );


                expect(
                    byOrder.body
                        .items[0]
                        .orderId,
                ).toBe(
                    failedOrderA,
                );


                const byTracking =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/shipment-history',
                        )
                        .query({
                            search:
                                trackingA,
                        })
                        .set(
                            'Authorization',
                            bearer(
                                TOKEN_A,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    byTracking.body
                        .items,
                ).toHaveLength(
                    1,
                );


                expect(
                    byTracking.body
                        .items[0]
                        .orderId,
                ).toBe(
                    orderA,
                );
            },
        );


        /*
         * TEST 13
         */
        it(
            'should filter by carrier and reject invalid history query',
            async () => {
                const filtered =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/shipment-history',
                        )
                        .query({
                            carrierName:
                                'Failed Carrier',
                        })
                        .set(
                            'Authorization',
                            bearer(
                                TOKEN_A,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    filtered.body
                        .items
                        .some(
                            (
                                item:
                                    any,
                            ) =>
                                item.orderId ===
                                failedOrderA,
                        ),
                ).toBe(
                    true,
                );


                await request(
                    app.getHttpServer(),
                )
                    .get(
                        '/admin/shipment-history',
                    )
                    .query({
                        resultStatus:
                            'cancelled',

                        sortDirection:
                            'sideways',
                    })
                    .set(
                        'Authorization',
                        bearer(
                            TOKEN_A,
                        ),
                    )
                    .expect(
                        400,
                    );
            },
        );


        /*
         * TEST 14
         */
        it(
            'should expose failed shipment information in history',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/shipment-history',
                        )
                        .query({
                            search:
                                failedOrderA,
                        })
                        .set(
                            'Authorization',
                            bearer(
                                TOKEN_A,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body
                        .items,
                ).toHaveLength(
                    1,
                );


                expect(
                    response.body
                        .items[0],
                ).toMatchObject({
                    orderId:
                        failedOrderA,

                    resultStatus:
                        'failed',

                    failureReason:
                        'Address not found',
                });
            },
        );
    },
);