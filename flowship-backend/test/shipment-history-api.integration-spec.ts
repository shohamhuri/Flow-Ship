import {
    INestApplication,
    UnauthorizedException,
    ValidationPipe,
} from '@nestjs/common';

import {
    ConfigModule,
    ConfigService,
} from '@nestjs/config';

import {
    Test,
    TestingModule,
} from '@nestjs/testing';

import request from 'supertest';

import {
    randomUUID,
} from 'crypto';

import {
    DbService,
} from '../src/infrastructure/database/db.service';

import {
    AuthService,
} from '../src/modules/auth/auth.service';

import {
    SupabaseAuthGuard,
} from '../src/modules/auth/supabase-auth.guard';

import {
    TenantsService,
    CurrentTenant,
} from '../src/modules/tenants/tenants.service';

import {
    ShipmentHistoryController,
} from '../src/modules/shipments/shipment-history.controller';

import {
    ShipmentHistoryService,
} from '../src/modules/shipments/shipment-history.service';

import {
    ShipmentHistoryRepository,
} from '../src/modules/shipments/shipment-history.repository';


describe(
    'Shipment History Admin API + Auth + Tenant Isolation Integration',
    () => {
        let app: INestApplication;
        let moduleRef: TestingModule;

        let db: DbService;
        let config: ConfigService;
        let tenantsService: TenantsService;

        let tenantA: CurrentTenant;
        let tenantB: CurrentTenant;

        const tokenA =
            'shipment-history-token-a';

        const tokenB =
            'shipment-history-token-b';


        const checkoutADeliveredId =
            randomUUID();

        const checkoutAFailedId =
            randomUUID();

        const checkoutBDeliveredId =
            randomUUID();


        const shipmentADeliveredId =
            randomUUID();

        const shipmentAFailedId =
            randomUUID();

        const shipmentBDeliveredId =
            randomUUID();


        const processingADeliveredId =
            randomUUID();

        const processingAFailedId =
            randomUUID();

        const processingBDeliveredId =
            randomUUID();


        const stopAPickupId =
            randomUUID();

        const stopADropoffId =
            randomUUID();

        const stopAFailedPickupId =
            randomUUID();

        const stopAFailedDropoffId =
            randomUUID();


        const deliveredOrderA =
            `HISTORY-A-DELIVERED-${Date.now()}`;

        const failedOrderA =
            `HISTORY-A-FAILED-${Date.now()}`;

        const deliveredOrderB =
            `HISTORY-B-DELIVERED-${Date.now()}`;


        const trackingA =
            `TRACK-A-${Date.now()}`;

        const trackingAFailed =
            `TRACK-FAIL-A-${Date.now()}`;

        const trackingB =
            `TRACK-B-${Date.now()}`;


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
        ): string {
            return `Bearer ${token}`;
        }


        beforeAll(
            async () => {
                const authServiceMock = {
                    authenticateAccessToken:
                        jest.fn(
                            async (
                                token: string,
                            ) => {
                                if (
                                    token ===
                                    tokenA
                                ) {
                                    return {
                                        user: {
                                            id:
                                                'history-user-a',

                                            email:
                                                'history-a@test.local',

                                            displayName:
                                                'History A',

                                            role:
                                                'admin',
                                        },

                                        tenant:
                                            tenantA,
                                    };
                                }


                                if (
                                    token ===
                                    tokenB
                                ) {
                                    return {
                                        user: {
                                            id:
                                                'history-user-b',

                                            email:
                                                'history-b@test.local',

                                            displayName:
                                                'History B',

                                            role:
                                                'admin',
                                        },

                                        tenant:
                                            tenantB,
                                    };
                                }


                                throw new UnauthorizedException(
                                    'Invalid or expired access token',
                                );
                            },
                        ),
                };


                moduleRef =
                    await Test
                        .createTestingModule({
                            imports: [
                                ConfigModule.forRoot({
                                    isGlobal:
                                        true,
                                }),
                            ],

                            controllers: [
                                ShipmentHistoryController,
                            ],

                            providers: [
                                DbService,
                                ConfigService,
                                TenantsService,

                                ShipmentHistoryRepository,
                                ShipmentHistoryService,

                                SupabaseAuthGuard,

                                {
                                    provide:
                                        AuthService,

                                    useValue:
                                        authServiceMock,
                                },
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


                const schemaA =
                    qSchema(
                        tenantA.schemaName,
                    );

                const schemaB =
                    qSchema(
                        tenantB.schemaName,
                    );


                /*
                 * ============================================
                 * Tenant A - delivered checkout
                 * ============================================
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
                        '2026-09-10T08:00:00Z'
                    )
                    `,
                    [
                        checkoutADeliveredId,
                        deliveredOrderA,
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
                    insert into ${schemaA}.checkout_processing (
                        id,
                        checkout_id,
                        status,
                        current_step
                    )
                    values (
                        $1,
                        $2,
                        'processing',
                        'awaiting_quotes'
                    )
                    `,
                    [
                        processingADeliveredId,
                        checkoutADeliveredId,
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
                        'history-plan-a',
                        'history-option-a',
                        'History Carrier A',
                        'Express',
                        25,
                        'ILS',
                        1,
                        'delivered',
                        $4,
                        'EXT-A-DELIVERED',
                        '2026-09-11T10:00:00Z',
                        '2026-09-10T09:00:00Z'
                    )
                    `,
                    [
                        shipmentADeliveredId,
                        checkoutADeliveredId,
                        deliveredOrderA,
                        trackingA,
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
                        $3::jsonb,
                        'completed'
                    ),
                    (
                        $4,
                        $2,
                        2,
                        'dropoff',
                        $5::jsonb,
                        'completed'
                    )
                    `,
                    [
                        stopAPickupId,
                        shipmentADeliveredId,

                        JSON.stringify({
                            city:
                                'Tel Aviv',

                            street:
                                'Dizengoff',
                        }),

                        stopADropoffId,

                        JSON.stringify({
                            city:
                                'Jerusalem',

                            street:
                                'Jaffa',
                        }),
                    ],
                );


                /*
                 * ============================================
                 * Tenant A - failed checkout
                 * ============================================
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
                        'failed',
                        '2026-09-12T08:00:00Z'
                    )
                    `,
                    [
                        checkoutAFailedId,
                        failedOrderA,

                        JSON.stringify({
                            country:
                                'Israel',

                            city:
                                'Haifa',

                            street:
                                'Hanassi',

                            houseNumber:
                                '20',
                        }),
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
                        'Carrier delivery failed',
                        '2026-09-13T12:00:00Z'
                    )
                    `,
                    [
                        processingAFailedId,
                        checkoutAFailedId,
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
                        'history-plan-fail-a',
                        'history-option-fail-a',
                        'History Failed Carrier',
                        'Standard',
                        60,
                        'ILS',
                        3,
                        'failed',
                        $4,
                        'EXT-A-FAILED',
                        'Address not found',
                        '2026-09-13T12:00:00Z',
                        '2026-09-12T09:00:00Z'
                    )
                    `,
                    [
                        shipmentAFailedId,
                        checkoutAFailedId,
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
                        $3::jsonb,
                        'completed'
                    ),
                    (
                        $4,
                        $2,
                        2,
                        'dropoff',
                        $5::jsonb,
                        'pending'
                    )
                    `,
                    [
                        stopAFailedPickupId,
                        shipmentAFailedId,

                        JSON.stringify({
                            city:
                                'Netanya',
                        }),

                        stopAFailedDropoffId,

                        JSON.stringify({
                            city:
                                'Haifa',
                        }),
                    ],
                );


                /*
                 * ============================================
                 * Tenant B - delivered checkout
                 * ============================================
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
                        $3::jsonb,
                        '{}'::jsonb,
                        'delivered',
                        '2026-09-11T08:00:00Z'
                    )
                    `,
                    [
                        checkoutBDeliveredId,
                        deliveredOrderB,

                        JSON.stringify({
                            country:
                                'Israel',

                            city:
                                'Beer Sheva',
                        }),
                    ],
                );


                await db.query(
                    `
                    insert into ${schemaB}.checkout_processing (
                        id,
                        checkout_id,
                        status,
                        current_step
                    )
                    values (
                        $1,
                        $2,
                        'processing',
                        'awaiting_quotes'
                    )
                    `,
                    [
                        processingBDeliveredId,
                        checkoutBDeliveredId,
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
                        'history-plan-b',
                        'history-option-b',
                        'History Carrier B',
                        'Express',
                        90,
                        'ILS',
                        1,
                        'delivered',
                        $4,
                        'EXT-B-DELIVERED',
                        '2026-09-12T10:00:00Z',
                        '2026-09-11T09:00:00Z'
                    )
                    `,
                    [
                        shipmentBDeliveredId,
                        checkoutBDeliveredId,
                        deliveredOrderB,
                        trackingB,
                    ],
                );
            },
            30000,
        );


        afterAll(
            async () => {
                if (
                    db &&
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


                    await db.query(
                        `
                        delete from ${schemaA}.shipment_stops
                        where shipment_id =
                            any($1::uuid[])
                        `,
                        [[
                            shipmentADeliveredId,
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
                            shipmentADeliveredId,
                            shipmentAFailedId,
                        ]],
                    );


                    await db.query(
                        `
                        delete from ${schemaA}.checkout_processing
                        where id =
                            any($1::uuid[])
                        `,
                        [[
                            processingADeliveredId,
                            processingAFailedId,
                        ]],
                    );


                    await db.query(
                        `
                        delete from ${schemaA}.checkouts
                        where id =
                            any($1::uuid[])
                        `,
                        [[
                            checkoutADeliveredId,
                            checkoutAFailedId,
                        ]],
                    );


                    await db.query(
                        `
                        delete from ${schemaB}.shipments
                        where id = $1
                        `,
                        [
                            shipmentBDeliveredId,
                        ],
                    );


                    await db.query(
                        `
                        delete from ${schemaB}.checkout_processing
                        where id = $1
                        `,
                        [
                            processingBDeliveredId,
                        ],
                    );


                    await db.query(
                        `
                        delete from ${schemaB}.checkouts
                        where id = $1
                        `,
                        [
                            checkoutBDeliveredId,
                        ],
                    );
                }


                if (app) {
                    await app.close();
                }
            },
            30000,
        );


        it(
            'should reject shipment history request without Authorization header',
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


        it(
            'should reject shipment history request with invalid token',
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
                                tokenA,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body.ok,
                ).toBe(
                    true,
                );


                expect(
                    response.body
                        .tenant
                        .schemaName,
                ).toBe(
                    tenantA.schemaName,
                );


                const orderIds =
                    response.body.items.map(
                        (
                            item:
                                any,
                        ) =>
                            item.orderId,
                    );


                expect(
                    orderIds,
                ).toContain(
                    deliveredOrderA,
                );


                expect(
                    orderIds,
                ).toContain(
                    failedOrderA,
                );
            },
        );


        it(
            'should not expose Tenant A history to Tenant B',
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
                                tokenB,
                            ),
                        )
                        .expect(
                            200,
                        );


                const orderIds =
                    response.body.items.map(
                        (
                            item:
                                any,
                        ) =>
                            item.orderId,
                    );


                expect(
                    orderIds,
                ).toContain(
                    deliveredOrderB,
                );


                expect(
                    orderIds,
                ).not.toContain(
                    deliveredOrderA,
                );


                expect(
                    orderIds,
                ).not.toContain(
                    failedOrderA,
                );
            },
        );


        it(
            'should filter delivered history',
            async () => {
                const response =
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
                                'HISTORY-A-',
                        })
                        .set(
                            'Authorization',
                            bearer(
                                tokenA,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body.items,
                ).toHaveLength(
                    1,
                );


                expect(
                    response.body.items[0]
                        .orderId,
                ).toBe(
                    deliveredOrderA,
                );


                expect(
                    response.body.items[0]
                        .resultStatus,
                ).toBe(
                    'delivered',
                );
            },
        );


        it(
            'should filter failed history',
            async () => {
                const response =
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
                                'HISTORY-A-',
                        })
                        .set(
                            'Authorization',
                            bearer(
                                tokenA,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body.items,
                ).toHaveLength(
                    1,
                );


                expect(
                    response.body.items[0]
                        .orderId,
                ).toBe(
                    failedOrderA,
                );


                expect(
                    response.body.items[0]
                        .failureReason,
                ).toBe(
                    'Address not found',
                );
            },
        );


        it(
            'should filter shipment history by carrier name',
            async () => {
                const response =
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
                                tokenA,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body.items.some(
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


                expect(
                    response.body.items.some(
                        (
                            item:
                                any,
                        ) =>
                            item.orderId ===
                            deliveredOrderA,
                    ),
                ).toBe(
                    false,
                );
            },
        );


        it(
            'should search shipment history by order id',
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
                                tokenA,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body.items,
                ).toHaveLength(
                    1,
                );


                expect(
                    response.body.items[0]
                        .orderId,
                ).toBe(
                    failedOrderA,
                );
            },
        );


        it(
            'should search shipment history by tracking number',
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
                                trackingA,
                        })
                        .set(
                            'Authorization',
                            bearer(
                                tokenA,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body.items,
                ).toHaveLength(
                    1,
                );


                expect(
                    response.body.items[0]
                        .orderId,
                ).toBe(
                    deliveredOrderA,
                );
            },
        );


        it(
            'should reject invalid shipment history query',
            async () => {
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
                            tokenA,
                        ),
                    )
                    .expect(
                        400,
                    );
            },
        );


        it(
            'should sort Tenant A history by total shipping price descending',
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
                                'HISTORY-A-',

                            sortBy:
                                'totalShippingPrice',

                            sortDirection:
                                'desc',
                        })
                        .set(
                            'Authorization',
                            bearer(
                                tokenA,
                            ),
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body.items,
                ).toHaveLength(
                    2,
                );


                expect(
                    response.body.items[0]
                        .orderId,
                ).toBe(
                    failedOrderA,
                );


                expect(
                    response.body.items[0]
                        .totalShippingPrice,
                ).toBe(
                    60,
                );


                expect(
                    response.body.items[1]
                        .orderId,
                ).toBe(
                    deliveredOrderA,
                );


                expect(
                    response.body.items[1]
                        .totalShippingPrice,
                ).toBe(
                    25,
                );
            },
        );


        it(
            'should return shipment details including stops and failure information',
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
                                tokenA,
                            ),
                        )
                        .expect(
                            200,
                        );


                const item =
                    response.body.items[0];


                expect(
                    item.totalShipments,
                ).toBe(
                    1,
                );


                expect(
                    item.failedShipments,
                ).toBe(
                    1,
                );


                expect(
                    item.deliveredShipments,
                ).toBe(
                    0,
                );


                expect(
                    item.failureStage,
                ).toBe(
                    'shipment_delivery',
                );


                expect(
                    item.failureReason,
                ).toBe(
                    'Address not found',
                );


                expect(
                    item.shipments,
                ).toHaveLength(
                    1,
                );


                expect(
                    item.shipments[0]
                        .trackingNumber,
                ).toBe(
                    trackingAFailed,
                );


                expect(
                    item.shipments[0]
                        .pickup
                        .city,
                ).toBe(
                    'Netanya',
                );


                expect(
                    item.shipments[0]
                        .dropoff
                        .city,
                ).toBe(
                    'Haifa',
                );


                expect(
                    item.shipments[0]
                        .failureReason,
                ).toBe(
                    'Address not found',
                );
            },
        );
    },
);