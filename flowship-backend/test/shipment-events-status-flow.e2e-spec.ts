import {
    INestApplication,
    ValidationPipe,
} from '@nestjs/common';
import {
    AuthService,
} from '../src/modules/auth/auth.service';
import {
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
    AppModule,
} from '../src/app.module';

import {
    DbService,
} from '../src/infrastructure/database/db.service';

import {
    CheckoutRepository,
} from '../src/modules/checkout/checkout.repository';

import {
    Checkout,
} from '../src/modules/checkout/interfaces/checkout.interface';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';


describe(
    'Shipment Events & Status Flow E2E',
    () => {
        let app: INestApplication;
        let moduleRef: TestingModule;

        let db: DbService;
        let config: ConfigService;
        let tenantsService: TenantsService;
        let checkoutRepository: CheckoutRepository;
        let authService: AuthService;
        let tenantA: CurrentTenant;
        let tenantB: CurrentTenant;

        let apiKeyA: string;
        let apiKeyB: string;

        let checkoutAId: string | null = null;
        let checkoutBId: string | null = null;


        /*
         * ============================================================
         * Isolated fixture IDs
         * ============================================================
         */

        const shipmentAId =
            randomUUID();

        const shipmentBId =
            randomUUID();

        const groupAId =
            randomUUID();

        const groupBId =
            randomUUID();


        /*
         * ============================================================
         * Event timestamps
         * ============================================================
         */

        const firstPickupAt =
            '2026-09-23T08:00:00.000Z';

        const firstDeliveredAt =
            '2026-09-23T12:00:00.000Z';

        const secondDeliveredAt =
            '2026-09-23T12:15:00.000Z';

        const firstFailedAt =
            '2026-09-23T10:00:00.000Z';

        const secondFailedAt =
            '2026-09-23T10:20:00.000Z';


        /*
         * ============================================================
         * Helpers
         * ============================================================
         */

        function qSchema(
            schemaName: string,
        ): string {
            if (
                !/^[a-zA-Z0-9_]+$/
                    .test(schemaName)
            ) {
                throw new Error(
                    `Invalid schema name: ${schemaName}`,
                );
            }

            return `"${schemaName}"`;
        }


        async function cleanupTenant(
            tenant: CurrentTenant,
            shipmentId: string,
            groupId: string,
            checkoutId: string | null,
        ): Promise<void> {
            const schema =
                qSchema(
                    tenant.schemaName,
                );
            await db.query(
                `
    DELETE FROM ${schema}.shipment_events
    WHERE shipment_id = $1
    `,
                [
                    shipmentId,
                ],
            );

            await db.query(
                `
                delete from ${schema}.shipment_stops
                where shipment_id = $1
                `,
                [
                    shipmentId,
                ],
            );


            await db.query(
                `
                delete from ${schema}.shipments
                where id = $1
                `,
                [
                    shipmentId,
                ],
            );


            await db.query(
                `
                delete from ${schema}.shipment_groups
                where id = $1
                `,
                [
                    groupId,
                ],
            );


            if (checkoutId) {
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
        }


        async function cleanup(): Promise<void> {
            if (
                tenantA
            ) {
                await cleanupTenant(
                    tenantA,
                    shipmentAId,
                    groupAId,
                    checkoutAId,
                );
            }


            if (
                tenantB
            ) {
                await cleanupTenant(
                    tenantB,
                    shipmentBId,
                    groupBId,
                    checkoutBId,
                );
            }


            checkoutAId =
                null;

            checkoutBId =
                null;
        }


        function buildCheckout(
            orderId: string,
        ): Checkout {
            return {
                orderId,

                storeId:
                    'e2e-shipment-events-store',

                destination: {
                    country:
                        'IL',

                    city:
                        'Tel Aviv',

                    street:
                        'E2E Shipment Events',

                    houseNumber:
                        '1',

                    postalCode:
                        '6100000',
                },

                items: [
                    {
                        sku:
                            'E2E-SHIPMENT-EVENT-SKU',

                        name:
                            'E2E Shipment Event Item',

                        quantity:
                            1,

                        unitWeight:
                            1,

                        unitPrice:
                            100,

                        category:
                            'e2e-test',
                    },
                ],

                totalItems:
                    1,

                totalPrice:
                    100,

                createdAt:
                    new Date(),
            };
        }


        async function seedTenant(
            tenant: CurrentTenant,
            shipmentId: string,
            groupId: string,
            orderId: string,
        ): Promise<string> {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            const checkoutId =
                await checkoutRepository
                    .saveCheckout(
                        tenant,
                        buildCheckout(orderId),
                        'e2e-test',
                        `shipment-events-e2e:${orderId}`,
                    );

            await db.query(
                `
    insert into ${schema}.shipment_groups
    (
        id,
        checkout_id,
        handling_group,
        total_items,
        total_weight,
        total_price,
        grouping_reasons,
        status
    )
    values
    (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7::jsonb,
        $8
    )
    `,
                [
                    groupId,
                    checkoutId,
                    'standard',
                    1,
                    1,
                    100,
                    JSON.stringify([
                        'E2E shipment events fixture',
                    ]),
                    'planned',
                ],
            );


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

                    'e2e-test-plan',
                    'e2e-test-option',

                    'E2E Carrier',
                    'E2E Service',

                    100,
                    'ILS',
                    1,

                    'created'
                )
                `,
                [
                    shipmentId,
                    checkoutId,
                    orderId,
                    groupId,
                ],
            );


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
                    1,
                    'pickup',
                    '{"city":"E2E Pickup"}'::jsonb,
                    'pending'
                ),
                (
                    $1,
                    2,
                    'dropoff',
                    '{"city":"E2E Dropoff"}'::jsonb,
                    'pending'
                )
                `,
                [
                    shipmentId,
                ],
            );


            return checkoutId;
        }


        async function resetFixture():
            Promise<void> {
            await cleanup();


            checkoutAId =
                await seedTenant(
                    tenantA,
                    shipmentAId,
                    groupAId,
                    'e2e-shipment-events-order-a',
                );


            checkoutBId =
                await seedTenant(
                    tenantB,
                    shipmentBId,
                    groupBId,
                    'e2e-shipment-events-order-b',
                );
        }


        async function getShipment(
            tenant: CurrentTenant,
            shipmentId: string,
        ): Promise<any> {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            const rows =
                await db.query<any>(
                    `
                SELECT
    id,
    status,
    external_shipment_id,
    metadata,
    preparation_time_minutes,
    estimated_delivery_at,
    created_at,
    updated_at,
    delivered_at,
    failed_at,
    failure_reason
                    from ${schema}.shipments
                    where id = $1
                    `,
                    [
                        shipmentId,
                    ],
                );


            return rows[0];
        }

        async function getShipmentEvents(
            tenant: CurrentTenant,
            shipmentId: string,
        ): Promise<any[]> {
            const schema = qSchema(tenant.schemaName);

            return db.query<any>(
                `
        SELECT
            id,
            shipment_id,
            event_type,
            previous_status,
            new_status,
            occurred_at,
            recorded_at
        FROM ${schema}.shipment_events
        WHERE shipment_id = $1
        ORDER BY recorded_at ASC, id ASC
        `,
                [shipmentId],
            );
        }
        async function getCheckout(
            tenant: CurrentTenant,
            checkoutId: string,
        ): Promise<any> {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            const rows =
                await db.query<any>(
                    `
                    select
                        id,
                        status
                    from ${schema}.checkouts
                    where id = $1
                    `,
                    [
                        checkoutId,
                    ],
                );


            return rows[0];
        }


        async function getPickup(
            tenant: CurrentTenant,
            shipmentId: string,
        ): Promise<any> {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            const rows =
                await db.query<any>(
                    `
                    select
                        status,
                        arrived_at,
                        completed_at
                    from ${schema}.shipment_stops
                    where shipment_id = $1
                      and stop_type = 'pickup'
                      and stop_order = 1
                    `,
                    [
                        shipmentId,
                    ],
                );


            return rows[0];
        }


        async function getDropoff(
            tenant: CurrentTenant,
            shipmentId: string,
        ): Promise<any> {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            const rows =
                await db.query<any>(
                    `
                    select
                        status,
                        arrived_at,
                        completed_at
                    from ${schema}.shipment_stops
                    where shipment_id = $1
                      and stop_type = 'dropoff'
                    `,
                    [
                        shipmentId,
                    ],
                );


            return rows[0];
        }


        function sendEvent(
            apiKey: string,
            payload: {
                shipmentId: string;
                event:
                | 'picked_up'
                | 'in_transit'
                | 'delivered'
                | 'failed';
                reason?: string;
                occurredAt?: string;
                stopOrder?: number;
            },
        ) {
            return request(
                app.getHttpServer(),
            )
                .post(
                    '/shipments/events',
                )
                .set(
                    'x-api-key',
                    apiKey,
                )
                .send(
                    payload,
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


                checkoutRepository =
                    moduleRef.get(
                        CheckoutRepository,
                    );
                authService =
                    moduleRef.get(AuthService);

                apiKeyA =
                    config.get<string>(
                        'TEST_FLOW_SHIP_A_API_KEY',
                    ) ?? '';


                apiKeyB =
                    config.get<string>(
                        'TEST_FLOW_SHIP_B_API_KEY',
                    ) ?? '';


                if (
                    !apiKeyA
                ) {
                    throw new Error(
                        'TEST_FLOW_SHIP_A_API_KEY is missing',
                    );
                }


                if (
                    !apiKeyB
                ) {
                    throw new Error(
                        'TEST_FLOW_SHIP_B_API_KEY is missing',
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


                if (
                    tenantA.schemaName !==
                    'flow_ship_test_a'
                ) {
                    throw new Error(
                        `Unexpected Tenant A schema: ${tenantA.schemaName}`,
                    );
                }


                if (
                    tenantB.schemaName !==
                    'flow_ship_test_b'
                ) {
                    throw new Error(
                        `Unexpected Tenant B schema: ${tenantB.schemaName}`,
                    );
                }


                await cleanup();
            },
            60000,
        );


        beforeEach(
            async () => {
                await resetFixture();
            },
            60000,
        );
        it(
            'should read persisted shipment events through authenticated HTTP',
            async () => {
                const authSpy = jest.spyOn(
                    authService,
                    'authenticateAccessToken',
                ).mockImplementation(async (token: string) => {
                    if (token !== 'test-token-a') {
                        throw new Error('Unexpected test token');
                    }

                    return {
                        user: {
                            id: randomUUID(),
                            email: 'test@example.com',
                            displayName: 'Test User',
                            role: 'admin',
                        },
                        tenant: tenantA,
                    };
                });

                try {
                    const eventResponse = await sendEvent(
                        apiKeyA,
                        {
                            shipmentId: shipmentAId,
                            event: 'picked_up',
                            stopOrder: 1,
                            occurredAt: firstPickupAt,
                        },
                    );

                    expect(eventResponse.status).toBe(201);

                    expect(eventResponse.status).toBe(201);

                    const response = await request(
                        app.getHttpServer(),
                    )
                        .get(
                            `/admin/shipment-history/${shipmentAId}/events`,
                        )
                        .set(
                            'Authorization',
                            'Bearer test-token-a',
                        );

                    expect(response.status).toBe(200);
                    expect(response.body.ok).toBe(true);
                    expect(response.body.shipmentId).toBe(shipmentAId);
                    expect(response.body.count).toBe(1);

                    expect(response.body.events[0]).toMatchObject({
                        shipmentId: shipmentAId,
                        eventType: 'PICKED_UP',
                        previousStatus: 'created',
                        newStatus: 'picked_up',
                        occurredAt: firstPickupAt,
                    });

                    expect(
                        response.body.events[0].recordedAt,
                    ).toBeTruthy();
                } finally {
                    authSpy.mockRestore();
                }
            },
            60000,
        );

        afterAll(
            async () => {
                if (
                    db &&
                    tenantA &&
                    tenantB
                ) {
                    await cleanup();
                }


                if (
                    app
                ) {
                    await app.close();
                }
            },
            60000,
        );


        /*
         * ============================================================
         * TEST 1
         *
         * picked_up through real HTTP.
         * ============================================================
         */
        it(
            'should isolate shipment events between tenants',
            async () => {
                const authSpy = jest.spyOn(
                    authService,
                    'authenticateAccessToken',
                ).mockImplementation(async (token: string) => {
                    if (token !== 'test-token-b') {
                        throw new Error('Unexpected test token');
                    }

                    return {
                        user: {
                            id: randomUUID(),
                            email: 'tenant-b@example.com',
                            displayName: 'Tenant B User',
                            role: 'admin',
                        },
                        tenant: tenantB,
                    };
                });

                try {
                    const eventResponse = await sendEvent(
                        apiKeyA,
                        {
                            shipmentId: shipmentAId,
                            event: 'picked_up',
                            stopOrder: 1,
                            occurredAt: firstPickupAt,
                        },
                    );

                    expect(eventResponse.status).toBe(201);

                    const response = await request(
                        app.getHttpServer(),
                    )
                        .get(
                            `/admin/shipment-history/${shipmentAId}/events`,
                        )
                        .set(
                            'Authorization',
                            'Bearer test-token-b',
                        );

                    expect(response.status).toBe(200);
                    expect(response.body.count).toBe(0);
                    expect(response.body.events).toEqual([]);
                } finally {
                    authSpy.mockRestore();
                }
            },
            60000,
        );
        it(
            'should reject shipment event history without authentication',
            async () => {
                const response = await request(
                    app.getHttpServer(),
                )
                    .get(
                        `/admin/shipment-history/${shipmentAId}/events`,
                    );

                expect(response.status).toBe(401);

                expect(response.body.message).toBe(
                    'Authorization header is missing',
                );
            },
            60000,
        );
        it(
            'should preserve shipment events after application restart',
            async () => {

                await db.query(
                    `
    UPDATE "flow_ship_test_a".shipments
    SET
        external_shipment_id = $2,
        metadata = $3::jsonb,
        preparation_time_minutes = $4,
        estimated_delivery_at = $5,
        updated_at = now()
    WHERE id = $1
    `,
                    [
                        shipmentAId,
                        'supplier-restart-test-123',
                        JSON.stringify({
                            deliveryMethod: 'self_delivery',
                            sourceId: 'test-source-123',
                        }),
                        45,
                        '2026-11-01T14:30:00.000Z',
                    ],
                );

                const eventResponse = await sendEvent(
                    apiKeyA,
                    {
                        shipmentId: shipmentAId,
                        event: 'picked_up',
                        stopOrder: 1,
                        occurredAt: firstPickupAt,
                    },
                );

                expect(eventResponse.status).toBe(201);
                const deliveredResponse = await sendEvent(
                    apiKeyA,
                    {
                        shipmentId: shipmentAId,
                        event: 'delivered',
                        occurredAt: firstDeliveredAt,
                    },
                );

                expect(deliveredResponse.status).toBe(201);
                const eventsBefore = await getShipmentEvents(
                    tenantA,
                    shipmentAId,
                );

                expect(eventsBefore).toHaveLength(2); const shipmentBefore = await getShipment(
                    tenantA,
                    shipmentAId,
                );

                expect(shipmentBefore).toBeDefined();
                expect(shipmentBefore.status).toBe('delivered');

                expect(
                    new Date(shipmentBefore.delivered_at).toISOString(),
                ).toBe(firstDeliveredAt);
                expect(shipmentBefore).toMatchObject({
                    external_shipment_id: 'supplier-restart-test-123',
                    preparation_time_minutes: 45,
                    metadata: {
                        deliveryMethod: 'self_delivery',
                        sourceId: 'test-source-123',
                    },
                });

                expect(
                    new Date(shipmentBefore.estimated_delivery_at).toISOString(),
                ).toBe('2026-11-01T14:30:00.000Z');
                // Close the original NestJS application and its DB pool.
                await app.close();

                // Start a completely new NestJS application.
                moduleRef = await Test
                    .createTestingModule({
                        imports: [AppModule],
                    })
                    .compile();

                app = moduleRef.createNestApplication();

                app.useGlobalPipes(
                    new ValidationPipe({
                        whitelist: true,
                        transform: true,
                        forbidNonWhitelisted: true,
                    }),
                );

                await app.init();

                // Replace the closed database connection.
                db = moduleRef.get(DbService);
                checkoutRepository =
                    moduleRef.get(CheckoutRepository);

                tenantsService =
                    moduleRef.get(TenantsService);

                config =
                    moduleRef.get(ConfigService);
                const authServiceAfterRestart =
                    moduleRef.get(AuthService);

                const authSpy = jest.spyOn(
                    authServiceAfterRestart,
                    'authenticateAccessToken',
                ).mockResolvedValue({
                    user: {
                        id: randomUUID(),
                        email: 'restart-test@example.com',
                        displayName: 'Restart Test',
                        role: 'admin',
                    },
                    tenant: tenantA,
                });

                try {
                    const response = await request(
                        app.getHttpServer(),
                    )
                        .get(
                            `/admin/shipment-history/${shipmentAId}/events`,
                        )
                        .set(
                            'Authorization',
                            'Bearer restart-test-token',
                        );

                    expect(response.status).toBe(200);

                    const shipmentAfter = await getShipment(
                        tenantA,
                        shipmentAId,
                    );

                    expect(shipmentAfter).toBeDefined();

                    // Compare the complete persisted shipment state.
                    expect(shipmentAfter).toEqual(shipmentBefore);

                    // Explicitly verify the tracking fields after restart.
                    expect(shipmentAfter.status).toBe('delivered');

                    expect(
                        new Date(shipmentAfter.delivered_at).toISOString(),
                    ).toBe(firstDeliveredAt);
                    expect(shipmentAfter.external_shipment_id).toBe(
                        'supplier-restart-test-123',
                    );

                    expect(shipmentAfter.metadata).toMatchObject({
                        deliveryMethod: 'self_delivery',
                        sourceId: 'test-source-123',
                    });

                    expect(shipmentAfter.preparation_time_minutes).toBe(45);

                    expect(
                        new Date(shipmentAfter.estimated_delivery_at).toISOString(),
                    ).toBe('2026-11-01T14:30:00.000Z');

                    expect(response.body.count).toBe(2);
                    expect(response.body.events).toHaveLength(2);

                    expect(
                        response.body.events.map((event: any) => event.eventType),
                    ).toEqual(['PICKED_UP', 'DELIVERED']);

                    expect(
                        response.body.events.map((event: any) => event.id),
                    ).toEqual(eventsBefore.map((event: any) => event.id));

                    expect(response.body.events[1]).toMatchObject({
                        shipmentId: shipmentAId,
                        eventType: 'DELIVERED',
                        previousStatus: 'picked_up',
                        newStatus: 'delivered',
                        occurredAt: firstDeliveredAt,
                    });

                    expect(
                        new Date(response.body.events[1].recordedAt).toISOString(),
                    ).toBe(
                        new Date(eventsBefore[1].recorded_at).toISOString(),
                    );
                    expect(response.body.events[0]).toMatchObject({
                        id: eventsBefore[0].id,
                        shipmentId: shipmentAId,
                        eventType: 'PICKED_UP',
                        previousStatus: 'created',
                        newStatus: 'picked_up',
                        occurredAt: firstPickupAt,
                    });

                    expect(
                        new Date(response.body.events[0].recordedAt)
                            .toISOString(),
                    ).toBe(
                        new Date(eventsBefore[0].recorded_at)
                            .toISOString(),
                    );
                } finally {
                    authSpy.mockRestore();
                }
            },
            60000,
        );
        it(
            'should preserve failed shipment data after application restart',
            async () => {
                const failedResponse = await sendEvent(apiKeyA, {
                    shipmentId: shipmentAId,
                    event: 'failed',
                    reason: 'E2E restart failure',
                    occurredAt: firstFailedAt,
                });

                expect(failedResponse.status).toBe(201);

                const shipmentBefore = await getShipment(
                    tenantA,
                    shipmentAId,
                );

                const eventsBefore = await getShipmentEvents(
                    tenantA,
                    shipmentAId,
                );

                expect(shipmentBefore.status).toBe('failed');
                expect(shipmentBefore.failure_reason).toBe(
                    'E2E restart failure',
                );
                expect(
                    new Date(shipmentBefore.failed_at).toISOString(),
                ).toBe(firstFailedAt);

                expect(eventsBefore).toHaveLength(1);
                // Close the original application and its database connections.
                await app.close();

                // Start a new NestJS application.
                moduleRef = await Test.createTestingModule({
                    imports: [AppModule],
                }).compile();

                app = moduleRef.createNestApplication();

                app.useGlobalPipes(
                    new ValidationPipe({
                        whitelist: true,
                        transform: true,
                        forbidNonWhitelisted: true,
                    }),
                );

                await app.init();

                // Restore references from the new application.
                db = moduleRef.get(DbService);
                checkoutRepository = moduleRef.get(CheckoutRepository);
                tenantsService = moduleRef.get(TenantsService);
                config = moduleRef.get(ConfigService);

                // Read the persisted data using the new database connection.
                const shipmentAfter = await getShipment(
                    tenantA,
                    shipmentAId,
                );

                const eventsAfter = await getShipmentEvents(
                    tenantA,
                    shipmentAId,
                );

                // Verify the complete shipment state survived restart.
                expect(shipmentAfter).toEqual(shipmentBefore);

                expect(shipmentAfter.status).toBe('failed');
                expect(shipmentAfter.failure_reason).toBe(
                    'E2E restart failure',
                );

                expect(
                    new Date(shipmentAfter.failed_at).toISOString(),
                ).toBe(firstFailedAt);

                // Verify the event history survived restart.
                expect(eventsAfter).toEqual(eventsBefore);
                expect(eventsAfter).toHaveLength(1);
            },
            60000,
        );
        it(
            'should process picked_up event through HTTP and complete pickup stop',
            async () => {
                const response =
                    await sendEvent(
                        apiKeyA,
                        {
                            shipmentId:
                                shipmentAId,

                            event:
                                'picked_up',

                            stopOrder:
                                1,

                            occurredAt:
                                firstPickupAt,
                        },
                    );


                expect(
                    response.status,
                ).toBe(
                    201,
                );


                expect(
                    response.body,
                ).toEqual(
                    expect.objectContaining({
                        ok:
                            true,

                        shipmentId:
                            shipmentAId,

                        event:
                            'picked_up',
                    }),
                );


                const shipment =
                    await getShipment(
                        tenantA,
                        shipmentAId,
                    );


                const pickup =
                    await getPickup(
                        tenantA,
                        shipmentAId,
                    );


                expect(
                    shipment.status,
                ).toBe(
                    'picked_up',
                );


                expect(
                    pickup.status,
                ).toBe(
                    'completed',
                );


                expect(
                    new Date(
                        pickup.completed_at,
                    ).toISOString(),
                ).toBe(
                    firstPickupAt,
                );
                const events = await getShipmentEvents(
                    tenantA,
                    shipmentAId,
                );

                expect(events).toHaveLength(1);

                expect(events[0]).toEqual(
                    expect.objectContaining({
                        shipment_id: shipmentAId,
                        event_type: 'PICKED_UP',
                        previous_status: 'created',
                        new_status: 'picked_up',
                    }),
                );

                expect(
                    new Date(events[0].occurred_at).toISOString(),
                ).toBe(firstPickupAt);

                expect(events[0].recorded_at).not.toBeNull();
            },
        );


        /*
         * ============================================================
         * TEST 2
         *
         * in_transit through real HTTP.
         * ============================================================
         */

        it(
            'should process in_transit event through HTTP',
            async () => {
                await sendEvent(
                    apiKeyA,
                    {
                        shipmentId:
                            shipmentAId,

                        event:
                            'in_transit',
                    },
                )
                    .expect(
                        201,
                    );


                const shipment =
                    await getShipment(
                        tenantA,
                        shipmentAId,
                    );


                expect(
                    shipment.status,
                ).toBe(
                    'in_transit',
                );
            },
        );


        /*
         * ============================================================
         * TEST 3
         *
         * delivered updates shipment, dropoff and checkout.
         * ============================================================
         */

        it(
            'should process delivered event and update shipment, dropoff and checkout',
            async () => {
                await sendEvent(
                    apiKeyA,
                    {
                        shipmentId:
                            shipmentAId,

                        event:
                            'delivered',

                        occurredAt:
                            firstDeliveredAt,
                    },
                )
                    .expect(
                        201,
                    );


                const shipment =
                    await getShipment(
                        tenantA,
                        shipmentAId,
                    );


                const dropoff =
                    await getDropoff(
                        tenantA,
                        shipmentAId,
                    );


                const checkout =
                    await getCheckout(
                        tenantA,
                        checkoutAId!,
                    );


                expect(
                    shipment.status,
                ).toBe(
                    'delivered',
                );


                expect(
                    new Date(
                        shipment.delivered_at,
                    ).toISOString(),
                ).toBe(
                    firstDeliveredAt,
                );


                expect(
                    dropoff.status,
                ).toBe(
                    'completed',
                );


                expect(
                    new Date(
                        dropoff.completed_at,
                    ).toISOString(),
                ).toBe(
                    firstDeliveredAt,
                );


                expect(
                    checkout.status,
                ).toBe(
                    'delivered',
                );
            },
        );


        /*
         * ============================================================
         * TEST 4
         *
         * failed persists failure data.
         * ============================================================
         */

        it(
            'should process failed event and persist failure reason and time',
            async () => {
                await sendEvent(
                    apiKeyA,
                    {
                        shipmentId:
                            shipmentAId,

                        event:
                            'failed',

                        reason:
                            'E2E carrier failure',

                        occurredAt:
                            firstFailedAt,
                    },
                )
                    .expect(
                        201,
                    );


                const shipment =
                    await getShipment(
                        tenantA,
                        shipmentAId,
                    );


                const checkout =
                    await getCheckout(
                        tenantA,
                        checkoutAId!,
                    );


                expect(
                    shipment.status,
                ).toBe(
                    'failed',
                );


                expect(
                    shipment.failure_reason,
                ).toBe(
                    'E2E carrier failure',
                );


                expect(
                    new Date(
                        shipment.failed_at,
                    ).toISOString(),
                ).toBe(
                    firstFailedAt,
                );


                expect(
                    checkout.status,
                ).toBe(
                    'failed',
                );
            },
        );


        /*
         * ============================================================
         * TEST 5
         *
         * duplicate delivered must preserve first timestamp.
         * ============================================================
         */

        it(
            'should keep original delivered_at when delivered event is received twice',
            async () => {
                await sendEvent(
                    apiKeyA,
                    {
                        shipmentId:
                            shipmentAId,

                        event:
                            'delivered',

                        occurredAt:
                            firstDeliveredAt,
                    },
                )
                    .expect(
                        201,
                    );


                await sendEvent(
                    apiKeyA,
                    {
                        shipmentId:
                            shipmentAId,

                        event:
                            'delivered',

                        occurredAt:
                            secondDeliveredAt,
                    },
                )
                    .expect(
                        201,
                    );


                const shipment =
                    await getShipment(
                        tenantA,
                        shipmentAId,
                    );


                expect(
                    shipment.status,
                ).toBe(
                    'delivered',
                );


                expect(
                    new Date(
                        shipment.delivered_at,
                    ).toISOString(),
                ).toBe(
                    firstDeliveredAt,
                );
                const events = await getShipmentEvents(
                    tenantA,
                    shipmentAId,
                );

                expect(events).toHaveLength(1);

                expect(events[0]).toEqual(
                    expect.objectContaining({
                        shipment_id: shipmentAId,
                        event_type: 'DELIVERED',
                        previous_status: 'created',
                        new_status: 'delivered',
                    }),
                );

                expect(
                    new Date(events[0].occurred_at).toISOString(),
                ).toBe(firstDeliveredAt);
            },
        );


        /*
         * ============================================================
         * TEST 6
         *
         * duplicate failed must preserve first failure.
         * ============================================================
         */

        it(
            'should keep original failure data when failed event is received twice',
            async () => {
                await sendEvent(
                    apiKeyA,
                    {
                        shipmentId:
                            shipmentAId,

                        event:
                            'failed',

                        reason:
                            'Original E2E failure',

                        occurredAt:
                            firstFailedAt,
                    },
                )
                    .expect(
                        201,
                    );


                await sendEvent(
                    apiKeyA,
                    {
                        shipmentId:
                            shipmentAId,

                        event:
                            'failed',

                        reason:
                            'Duplicate E2E failure',

                        occurredAt:
                            secondFailedAt,
                    },
                )
                    .expect(
                        201,
                    );


                const shipment =
                    await getShipment(
                        tenantA,
                        shipmentAId,
                    );


                expect(
                    shipment.status,
                ).toBe(
                    'failed',
                );


                expect(
                    shipment.failure_reason,
                ).toBe(
                    'Original E2E failure',
                );


                expect(
                    new Date(
                        shipment.failed_at,
                    ).toISOString(),
                ).toBe(
                    firstFailedAt,
                );
                const events = await getShipmentEvents(
                    tenantA,
                    shipmentAId,
                );

                expect(events).toHaveLength(1);

                expect(events[0]).toEqual(
                    expect.objectContaining({
                        shipment_id: shipmentAId,
                        event_type: 'FAILED',
                        previous_status: 'created',
                        new_status: 'failed',
                    }),
                );

                expect(
                    new Date(events[0].occurred_at).toISOString(),
                ).toBe(firstFailedAt);
            },
        );


        /*
         * ============================================================
         * TEST 7
         *
         * delivered is terminal.
         * A late in_transit must not regress it.
         * ============================================================
         */

        it(
            'should not regress delivered shipment when late in_transit event arrives',
            async () => {
                await sendEvent(
                    apiKeyA,
                    {
                        shipmentId:
                            shipmentAId,

                        event:
                            'delivered',

                        occurredAt:
                            firstDeliveredAt,
                    },
                )
                    .expect(
                        201,
                    );


                await sendEvent(
                    apiKeyA,
                    {
                        shipmentId:
                            shipmentAId,

                        event:
                            'in_transit',
                    },
                )
                    .expect(
                        201,
                    );


                const shipment =
                    await getShipment(
                        tenantA,
                        shipmentAId,
                    );


                const checkout =
                    await getCheckout(
                        tenantA,
                        checkoutAId!,
                    );


                expect(
                    shipment.status,
                ).toBe(
                    'delivered',
                );


                expect(
                    new Date(
                        shipment.delivered_at,
                    ).toISOString(),
                ).toBe(
                    firstDeliveredAt,
                );


                expect(
                    checkout.status,
                ).toBe(
                    'delivered',
                );
            },
        );


        /*
         * ============================================================
         * TEST 8
         *
         * Tenant isolation through x-api-key.
         * ============================================================
         */

        it(
            'should update only Tenant A when event is sent with Tenant A API key',
            async () => {
                /*
                 * Important:
                 *
                 * shipmentA exists only in A.
                 * shipmentB exists only in B.
                 *
                 * We send an event for A through A's API key.
                 */

                await sendEvent(
                    apiKeyA,
                    {
                        shipmentId:
                            shipmentAId,

                        event:
                            'delivered',

                        occurredAt:
                            firstDeliveredAt,
                    },
                )
                    .expect(
                        201,
                    );


                const shipmentA =
                    await getShipment(
                        tenantA,
                        shipmentAId,
                    );


                const shipmentB =
                    await getShipment(
                        tenantB,
                        shipmentBId,
                    );


                const checkoutA =
                    await getCheckout(
                        tenantA,
                        checkoutAId!,
                    );


                const checkoutB =
                    await getCheckout(
                        tenantB,
                        checkoutBId!,
                    );


                expect(
                    shipmentA.status,
                ).toBe(
                    'delivered',
                );


                expect(
                    checkoutA.status,
                ).toBe(
                    'delivered',
                );


                /*
                 * Tenant B must remain untouched.
                 */
                expect(
                    shipmentB.status,
                ).toBe(
                    'created',
                );


                expect(
                    shipmentB.delivered_at,
                ).toBeNull();


                expect(
                    shipmentB.failed_at,
                ).toBeNull();


                expect(
                    checkoutB.status,
                ).not.toBe(
                    'delivered',
                );
            },
        );
    },
); 0