import {
    INestApplication,
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
    TenantsService,
    CurrentTenant,
} from '../src/modules/tenants/tenants.service';

import {
    ShipmentsController,
} from '../src/modules/shipments/shipments.controller';

import {
    ShipmentsRepository,
} from '../src/modules/shipments/shipments.repository';

import {
    ShipmentStatusService,
} from '../src/modules/shipments/shipment-status.service';


describe(
    'Shipment Events API + Tenant Isolation Integration',
    () => {
        let app: INestApplication;
        let moduleRef: TestingModule;

        let db: DbService;
        let config: ConfigService;
        let tenantsService: TenantsService;
        let shipmentsRepository: ShipmentsRepository;

        let tenantA: CurrentTenant;
        let tenantB: CurrentTenant;

        let apiKeyA: string;
        let apiKeyB: string;

        const createdCheckoutsA: string[] = [];
        const createdCheckoutsB: string[] = [];

        const createdGroupsA: string[] = [];
        const createdGroupsB: string[] = [];

        const createdShipmentsA: string[] = [];
        const createdShipmentsB: string[] = [];


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


        async function createShipmentFixture(
            tenant: CurrentTenant,
            label: string,
        ) {
            const checkoutId =
                randomUUID();

            const groupId =
                randomUUID();

            const orderId =
                `SHIPMENT-API-${label}-${Date.now()}-${randomUUID()}`;

            const schema =
                qSchema(
                    tenant.schemaName,
                );


            await db.query(
                `
                insert into ${schema}.checkouts (
                    id,
                    store_id,
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
                    null,
                    'manual',
                    $2,
                    $2,
                    '{}'::jsonb,
                    '[]'::jsonb,
                    $3::jsonb,
                    $4::jsonb,
                    'processing'
                )
                `,
                [
                    checkoutId,
                    orderId,
                    JSON.stringify({
                        country: 'IL',
                        city: 'Netivot',
                        street: 'Test Street',
                        houseNumber: '1',
                    }),
                    JSON.stringify({
                        orderId,
                        items: [],
                        destination: {
                            country: 'IL',
                            city: 'Netivot',
                            street: 'Test Street',
                            houseNumber: '1',
                        },
                    }),
                ],
            );


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


            const shipmentId =
                await shipmentsRepository
                    .createShipment(
                        tenant,
                        {
                            checkoutId,
                            orderId,
                            shipmentGroupId:
                                groupId,

                            selectedPlanId:
                                `plan-${label}`,

                            selectedDeliveryOptionKey:
                                `delivery-${label}`,

                            providerCode:
                                'MOCK',

                            adapterKey:
                                'mock',

                            carrierName:
                                'Shipment API Test Carrier',

                            serviceName:
                                'Shipment API Test Service',

                            price:
                                25,

                            currency:
                                'ILS',

                            estimatedDeliveryDays:
                                2,

                            status:
                                'created',
                        },
                    );


            await shipmentsRepository
                .createShipmentStops(
                    tenant,
                    shipmentId,
                    [
                        {
                            country: 'IL',
                            city: 'Rishon LeZion',
                            street: 'Pickup Street',
                            houseNumber: '10',
                        },
                    ],
                    {
                        country: 'IL',
                        city: 'Netivot',
                        street: 'Dropoff Street',
                        houseNumber: '20',
                    },
                );


            if (
                tenant.id === tenantA.id
            ) {
                createdCheckoutsA.push(
                    checkoutId,
                );

                createdGroupsA.push(
                    groupId,
                );

                createdShipmentsA.push(
                    shipmentId,
                );
            } else {
                createdCheckoutsB.push(
                    checkoutId,
                );

                createdGroupsB.push(
                    groupId,
                );

                createdShipmentsB.push(
                    shipmentId,
                );
            }


            return {
                checkoutId,
                groupId,
                shipmentId,
                orderId,
            };
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

                            controllers: [
                                ShipmentsController,
                            ],

                            providers: [
                                DbService,
                                ConfigService,
                                TenantsService,
                                ShipmentsRepository,
                                ShipmentStatusService,
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

                shipmentsRepository =
                    moduleRef.get(
                        ShipmentsRepository,
                    );


                const configuredApiKeyA =
                    config.get<string>(
                        'TEST_FLOW_SHIP_A_API_KEY',
                    );

                const configuredApiKeyB =
                    config.get<string>(
                        'TEST_FLOW_SHIP_B_API_KEY',
                    );


                if (!configuredApiKeyA) {
                    throw new Error(
                        'Missing TEST_FLOW_SHIP_A_API_KEY',
                    );
                }

                if (!configuredApiKeyB) {
                    throw new Error(
                        'Missing TEST_FLOW_SHIP_B_API_KEY',
                    );
                }


                apiKeyA =
                    configuredApiKeyA;

                apiKeyB =
                    configuredApiKeyB;


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


                    if (
                        createdShipmentsA.length
                    ) {
                        await db.query(
                            `
                            delete from ${schemaA}.shipment_stops
                            where shipment_id =
                                any($1::uuid[])
                            `,
                            [
                                createdShipmentsA,
                            ],
                        );

                        await db.query(
                            `
                            delete from ${schemaA}.shipments
                            where id =
                                any($1::uuid[])
                            `,
                            [
                                createdShipmentsA,
                            ],
                        );
                    }


                    if (
                        createdShipmentsB.length
                    ) {
                        await db.query(
                            `
                            delete from ${schemaB}.shipment_stops
                            where shipment_id =
                                any($1::uuid[])
                            `,
                            [
                                createdShipmentsB,
                            ],
                        );

                        await db.query(
                            `
                            delete from ${schemaB}.shipments
                            where id =
                                any($1::uuid[])
                            `,
                            [
                                createdShipmentsB,
                            ],
                        );
                    }


                    if (
                        createdGroupsA.length
                    ) {
                        await db.query(
                            `
                            delete from ${schemaA}.shipment_groups
                            where id =
                                any($1::uuid[])
                            `,
                            [
                                createdGroupsA,
                            ],
                        );
                    }


                    if (
                        createdGroupsB.length
                    ) {
                        await db.query(
                            `
                            delete from ${schemaB}.shipment_groups
                            where id =
                                any($1::uuid[])
                            `,
                            [
                                createdGroupsB,
                            ],
                        );
                    }


                    if (
                        createdCheckoutsA.length
                    ) {
                        await db.query(
                            `
                            delete from ${schemaA}.checkouts
                            where id =
                                any($1::uuid[])
                            `,
                            [
                                createdCheckoutsA,
                            ],
                        );
                    }


                    if (
                        createdCheckoutsB.length
                    ) {
                        await db.query(
                            `
                            delete from ${schemaB}.checkouts
                            where id =
                                any($1::uuid[])
                            `,
                            [
                                createdCheckoutsB,
                            ],
                        );
                    }
                }


                if (app) {
                    await app.close();
                }
            },
            30000,
        );


        /*
         * TEST 1
         */
        it(
            'should reject shipment event without x-api-key',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .post(
                        '/shipments/events',
                    )
                    .send({
                        shipmentId:
                            randomUUID(),

                        event:
                            'in_transit',
                    })
                    .expect(
                        401,
                    );
            },
        );


        /*
         * TEST 2
         */
        it(
            'should reject shipment event with invalid x-api-key',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .post(
                        '/shipments/events',
                    )
                    .set(
                        'x-api-key',
                        'invalid-shipment-api-key',
                    )
                    .send({
                        shipmentId:
                            randomUUID(),

                        event:
                            'in_transit',
                    })
                    .expect(
                        401,
                    );
            },
        );


        /*
         * TEST 3
         */
        it(
            'should reject invalid shipmentId',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .post(
                        '/shipments/events',
                    )
                    .set(
                        'x-api-key',
                        apiKeyA,
                    )
                    .send({
                        shipmentId:
                            'not-a-uuid',

                        event:
                            'in_transit',
                    })
                    .expect(
                        400,
                    );
            },
        );


        /*
         * TEST 4
         */
        it(
            'should reject unsupported shipment event',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .post(
                        '/shipments/events',
                    )
                    .set(
                        'x-api-key',
                        apiKeyA,
                    )
                    .send({
                        shipmentId:
                            randomUUID(),

                        event:
                            'teleported',
                    })
                    .expect(
                        400,
                    );
            },
        );


        /*
         * TEST 5
         */
        it(
            'should reject picked_up event without stopOrder',
            async () => {
                const fixture =
                    await createShipmentFixture(
                        tenantA,
                        'PICKUP-MISSING-STOP',
                    );


                await request(
                    app.getHttpServer(),
                )
                    .post(
                        '/shipments/events',
                    )
                    .set(
                        'x-api-key',
                        apiKeyA,
                    )
                    .send({
                        shipmentId:
                            fixture.shipmentId,

                        event:
                            'picked_up',
                    })
                    .expect(
                        400,
                    );
            },
        );


        /*
         * TEST 6
         */
        it(
            'should mark pickup stop completed and shipment picked_up',
            async () => {
                const fixture =
                    await createShipmentFixture(
                        tenantA,
                        'PICKED-UP',
                    );


                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/shipments/events',
                        )
                        .set(
                            'x-api-key',
                            apiKeyA,
                        )
                        .send({
                            shipmentId:
                                fixture.shipmentId,

                            event:
                                'picked_up',

                            stopOrder:
                                1,

                            occurredAt:
                                '2026-09-14T10:00:00.000Z',
                        })
                        .expect(
                            201,
                        );


                expect(
                    response.body,
                ).toEqual({
                    ok:
                        true,

                    shipmentId:
                        fixture.shipmentId,

                    event:
                        'picked_up',
                });


                const shipmentRows =
                    await db.query<{
                        status: string;
                    }>(
                        `
                        select status
                        from ${qSchema(
                            tenantA.schemaName,
                        )}.shipments
                        where id = $1
                        `,
                        [
                            fixture.shipmentId,
                        ],
                    );


                expect(
                    shipmentRows[0].status,
                ).toBe(
                    'picked_up',
                );


                const stopRows =
                    await db.query<{
                        status: string;
                        completed_at: Date | null;
                    }>(
                        `
                        select
                            status,
                            completed_at
                        from ${qSchema(
                            tenantA.schemaName,
                        )}.shipment_stops
                        where shipment_id = $1
                          and stop_order = 1
                        `,
                        [
                            fixture.shipmentId,
                        ],
                    );


                expect(
                    stopRows[0].status,
                ).toBe(
                    'completed',
                );

                expect(
                    stopRows[0].completed_at,
                ).not.toBeNull();
            },
        );


        /*
         * TEST 7
         */
        it(
            'should mark shipment in_transit',
            async () => {
                const fixture =
                    await createShipmentFixture(
                        tenantA,
                        'IN-TRANSIT',
                    );


                await request(
                    app.getHttpServer(),
                )
                    .post(
                        '/shipments/events',
                    )
                    .set(
                        'x-api-key',
                        apiKeyA,
                    )
                    .send({
                        shipmentId:
                            fixture.shipmentId,

                        event:
                            'in_transit',
                    })
                    .expect(
                        201,
                    );


                const rows =
                    await db.query<{
                        status: string;
                    }>(
                        `
                        select status
                        from ${qSchema(
                            tenantA.schemaName,
                        )}.shipments
                        where id = $1
                        `,
                        [
                            fixture.shipmentId,
                        ],
                    );


                expect(
                    rows[0].status,
                ).toBe(
                    'in_transit',
                );
            },
        );


        /*
         * TEST 8
         */
        it(
            'should mark shipment delivered, complete dropoff and synchronize checkout',
            async () => {
                const fixture =
                    await createShipmentFixture(
                        tenantA,
                        'DELIVERED',
                    );


                await request(
                    app.getHttpServer(),
                )
                    .post(
                        '/shipments/events',
                    )
                    .set(
                        'x-api-key',
                        apiKeyA,
                    )
                    .send({
                        shipmentId:
                            fixture.shipmentId,

                        event:
                            'delivered',

                        occurredAt:
                            '2026-09-14T11:00:00.000Z',
                    })
                    .expect(
                        201,
                    );


                const shipmentRows =
                    await db.query<{
                        status: string;
                        delivered_at: Date | null;
                    }>(
                        `
                        select
                            status,
                            delivered_at
                        from ${qSchema(
                            tenantA.schemaName,
                        )}.shipments
                        where id = $1
                        `,
                        [
                            fixture.shipmentId,
                        ],
                    );


                expect(
                    shipmentRows[0].status,
                ).toBe(
                    'delivered',
                );

                expect(
                    shipmentRows[0].delivered_at,
                ).not.toBeNull();


                const dropoffRows =
                    await db.query<{
                        status: string;
                        completed_at: Date | null;
                    }>(
                        `
                        select
                            status,
                            completed_at
                        from ${qSchema(
                            tenantA.schemaName,
                        )}.shipment_stops
                        where shipment_id = $1
                          and stop_type = 'dropoff'
                        `,
                        [
                            fixture.shipmentId,
                        ],
                    );


                expect(
                    dropoffRows[0].status,
                ).toBe(
                    'completed',
                );

                expect(
                    dropoffRows[0].completed_at,
                ).not.toBeNull();


                const checkoutRows =
                    await db.query<{
                        status: string;
                    }>(
                        `
                        select status
                        from ${qSchema(
                            tenantA.schemaName,
                        )}.checkouts
                        where id = $1
                        `,
                        [
                            fixture.checkoutId,
                        ],
                    );


                expect(
                    checkoutRows[0].status,
                ).toBe(
                    'delivered',
                );
            },
        );


        /*
         * TEST 9
         */
        it(
            'should reject failed shipment event without a valid reason',
            async () => {
                const fixture =
                    await createShipmentFixture(
                        tenantA,
                        'FAILED-NO-REASON',
                    );


                await request(
                    app.getHttpServer(),
                )
                    .post(
                        '/shipments/events',
                    )
                    .set(
                        'x-api-key',
                        apiKeyA,
                    )
                    .send({
                        shipmentId:
                            fixture.shipmentId,

                        event:
                            'failed',

                        reason:
                            '   ',
                    })
                    .expect(
                        400,
                    );
            },
        );


        /*
         * TEST 10
         */
        it(
            'should fail Tenant A shipment and keep Tenant B isolated',
            async () => {
                const fixtureA =
                    await createShipmentFixture(
                        tenantA,
                        'FAILED-A',
                    );

                const fixtureB =
                    await createShipmentFixture(
                        tenantB,
                        'FAILED-B-CONTROL',
                    );


                await request(
                    app.getHttpServer(),
                )
                    .post(
                        '/shipments/events',
                    )
                    .set(
                        'x-api-key',
                        apiKeyA,
                    )
                    .send({
                        shipmentId:
                            fixtureA.shipmentId,

                        event:
                            'failed',

                        reason:
                            'Integration test carrier failure',

                        occurredAt:
                            '2026-09-14T12:00:00.000Z',
                    })
                    .expect(
                        201,
                    );


                const rowsA =
                    await db.query<{
                        status: string;
                        failure_reason: string | null;
                        failed_at: Date | null;
                    }>(
                        `
                        select
                            status,
                            failure_reason,
                            failed_at
                        from ${qSchema(
                            tenantA.schemaName,
                        )}.shipments
                        where id = $1
                        `,
                        [
                            fixtureA.shipmentId,
                        ],
                    );


                expect(
                    rowsA[0].status,
                ).toBe(
                    'failed',
                );

                expect(
                    rowsA[0].failure_reason,
                ).toBe(
                    'Integration test carrier failure',
                );

                expect(
                    rowsA[0].failed_at,
                ).not.toBeNull();


                const checkoutRowsA =
                    await db.query<{
                        status: string;
                    }>(
                        `
                        select status
                        from ${qSchema(
                            tenantA.schemaName,
                        )}.checkouts
                        where id = $1
                        `,
                        [
                            fixtureA.checkoutId,
                        ],
                    );


                expect(
                    checkoutRowsA[0].status,
                ).toBe(
                    'failed',
                );


                const rowsB =
                    await db.query<{
                        status: string;
                        failure_reason: string | null;
                    }>(
                        `
                        select
                            status,
                            failure_reason
                        from ${qSchema(
                            tenantB.schemaName,
                        )}.shipments
                        where id = $1
                        `,
                        [
                            fixtureB.shipmentId,
                        ],
                    );


                expect(
                    rowsB[0].status,
                ).toBe(
                    'created',
                );

                expect(
                    rowsB[0].failure_reason,
                ).toBeNull();
            },
        );
    },
);