import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';

import { DbService } from '../src/infrastructure/database/db.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import { ShipmentHistoryRepository } from '../src/modules/shipments/shipment-history.repository';

describe('ShipmentHistoryRepository Integration', () => {
    let db: DbService;

    let tenantsService: TenantsService;

    let repository: ShipmentHistoryRepository;

    let config: ConfigService;

    let tenantA: CurrentTenant;
    let tenantB: CurrentTenant;

    let checkoutAId: string;
    let checkoutBId: string;

    let shipmentA1Id: string;
    let shipmentA2Id: string;
    let shipmentBId: string;

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
                    ShipmentHistoryRepository,
                ],
            }).compile();

        db =
            moduleRef.get(DbService);

        tenantsService =
            moduleRef.get(TenantsService);

        repository =
            moduleRef.get(
                ShipmentHistoryRepository,
            );

        config =
            moduleRef.get(ConfigService);

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
            await tenantsService.findByApiKey(
                tenantAApiKey,
            );

        tenantB =
            await tenantsService.findByApiKey(
                tenantBApiKey,
            );

        checkoutAId =
            randomUUID();

        checkoutBId =
            randomUUID();

        shipmentA1Id =
            randomUUID();

        shipmentA2Id =
            randomUUID();

        shipmentBId =
            randomUUID();

        /*
         * Tenant A:
         * הזמנה עם שני משלוחים delivered.
         */

        await db.query(
            `
            insert into flow_ship_test_a.checkouts (
                id,
                external_order_id,
                platform,
                status,
                destination,
                raw_payload,
                created_at
            )
            values (
                $1,
                $2,
                'integration-test',
                'completed',
                $3,
                '{}'::jsonb,
                now() - interval '2 hours'
            )
            `,
            [
                checkoutAId,
                `HISTORY-A-${Date.now()}`,
                {
                    country:
                        'IL',
                    city:
                        'Tel Aviv',
                    street:
                        'History A Street',
                    houseNumber:
                        '1',
                },
            ],
        );

        await db.query(
            `
            insert into flow_ship_test_a.shipments (
                id,
                checkout_id,
                order_id,
                status,
                carrier_name,
                service_name,
                price,
                currency,
                tracking_number,
                external_shipment_id,
                pickup,
                dropoff,
                delivered_at,
                created_at
            )
            values
                (
                    $1,
                    $3,
                    'HISTORY-A',
                    'delivered',
                    'Carrier Alpha',
                    'Standard',
                    25,
                    'ILS',
                    'TRACK-A-1',
                    'EXT-A-1',
                    '{"city":"Fallback Pickup A"}'::jsonb,
                    '{"city":"Fallback Dropoff A"}'::jsonb,
                    now() - interval '30 minutes',
                    now() - interval '90 minutes'
                ),
                (
                    $2,
                    $3,
                    'HISTORY-A',
                    'delivered',
                    'Carrier Beta',
                    'Express',
                    40,
                    'ILS',
                    'TRACK-A-2',
                    'EXT-A-2',
                    '{"city":"Fallback Pickup A2"}'::jsonb,
                    '{"city":"Fallback Dropoff A2"}'::jsonb,
                    now() - interval '20 minutes',
                    now() - interval '80 minutes'
                )
            `,
            [
                shipmentA1Id,
                shipmentA2Id,
                checkoutAId,
            ],
        );

        await db.query(
            `
            insert into flow_ship_test_a.shipment_stops (
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
                    $3,
                    1,
                    'pickup',
                    $5,
                    'completed'
                ),
                (
                    $2,
                    $3,
                    2,
                    'dropoff',
                    $6,
                    'completed'
                ),
                (
                    $4,
                    $7,
                    1,
                    'pickup',
                    $8,
                    'completed'
                )
            `,
            [
                randomUUID(),
                randomUUID(),
                shipmentA1Id,
                randomUUID(),
                {
                    country:
                        'IL',
                    city:
                        'Rishon LeZion',
                    street:
                        'Pickup A Street',
                    houseNumber:
                        '10',
                },
                {
                    country:
                        'IL',
                    city:
                        'Tel Aviv',
                    street:
                        'Dropoff A Street',
                    houseNumber:
                        '20',
                },
                shipmentA2Id,
                {
                    country:
                        'IL',
                    city:
                        'Holon',
                    street:
                        'Pickup A2 Street',
                    houseNumber:
                        '30',
                },
            ],
        );

        /*
         * Tenant B:
         * הזמנה עם Shipment שנכשל.
         */

        await db.query(
            `
            insert into flow_ship_test_b.checkouts (
                id,
                external_order_id,
                platform,
                status,
                destination,
                raw_payload,
                created_at
            )
            values (
                $1,
                $2,
                'integration-test',
                'failed',
                $3,
                '{}'::jsonb,
                now() - interval '1 hour'
            )
            `,
            [
                checkoutBId,
                `HISTORY-B-${Date.now()}`,
                {
                    country:
                        'IL',
                    city:
                        'Jerusalem',
                    street:
                        'History B Street',
                    houseNumber:
                        '2',
                },
            ],
        );

        await db.query(
            `
            insert into flow_ship_test_b.shipments (
                id,
                checkout_id,
                order_id,
                status,
                carrier_name,
                service_name,
                price,
                currency,
                tracking_number,
                external_shipment_id,
                failure_reason,
                failed_at,
                created_at
            )
            values (
                $1,
                $2,
                'HISTORY-B',
                'failed',
                'Carrier Failure',
                'Express',
                55,
                'ILS',
                'TRACK-B-FAIL',
                'EXT-B-FAIL',
                'Integration delivery failure',
                now() - interval '10 minutes',
                now() - interval '40 minutes'
            )
            `,
            [
                shipmentBId,
                checkoutBId,
            ],
        );
    }, 30000);

    afterAll(async () => {
        await db.query(
            `
            delete from flow_ship_test_a.shipment_stops
            where shipment_id = any($1::uuid[])
            `,
            [[
                shipmentA1Id,
                shipmentA2Id,
            ]],
        );

        await db.query(
            `
            delete from flow_ship_test_a.shipments
            where id = any($1::uuid[])
            `,
            [[
                shipmentA1Id,
                shipmentA2Id,
            ]],
        );

        await db.query(
            `
            delete from flow_ship_test_b.shipments
            where id = $1
            `,
            [shipmentBId],
        );

        await db.query(
            `
            delete from flow_ship_test_a.checkouts
            where id = $1
            `,
            [checkoutAId],
        );

        await db.query(
            `
            delete from flow_ship_test_b.checkouts
            where id = $1
            `,
            [checkoutBId],
        );

        await db.onModuleDestroy();
    }, 30000);

    it('should return delivered final order for Tenant A', async () => {
        const history =
            await repository.findFinalOrders(
                tenantA,
            );

        const order =
            history.find(
                (item) =>
                    item.checkoutId ===
                    checkoutAId,
            );

        expect(order).toBeDefined();

        expect(order).toMatchObject({
            checkoutId:
                checkoutAId,

            resultStatus:
                'delivered',

            totalShipments:
                2,

            deliveredShipments:
                2,

            failedShipments:
                0,

            currency:
                'ILS',
        });
    });

    it('should return failed final order for Tenant B', async () => {
        const history =
            await repository.findFinalOrders(
                tenantB,
            );

        const order =
            history.find(
                (item) =>
                    item.checkoutId ===
                    checkoutBId,
            );

        expect(order).toBeDefined();

        expect(order).toMatchObject({
            checkoutId:
                checkoutBId,

            resultStatus:
                'failed',

            totalShipments:
                1,

            deliveredShipments:
                0,

            failedShipments:
                1,

            failureStage:
                'shipment_delivery',

            failureReason:
                'Integration delivery failure',
        });
    });

    it('should calculate shipment counts correctly', async () => {
        const history =
            await repository.findFinalOrders(
                tenantA,
            );

        const order =
            history.find(
                (item) =>
                    item.checkoutId ===
                    checkoutAId,
            );

        expect(order).toBeDefined();

        expect(
            order?.totalShipments,
        ).toBe(2);

        expect(
            order?.deliveredShipments,
        ).toBe(2);

        expect(
            order?.failedShipments,
        ).toBe(0);
    });

    it('should calculate total shipping price correctly', async () => {
        const history =
            await repository.findFinalOrders(
                tenantA,
            );

        const order =
            history.find(
                (item) =>
                    item.checkoutId ===
                    checkoutAId,
            );

        expect(order).toBeDefined();

        expect(
            order?.totalShippingPrice,
        ).toBe(65);
    });

    it('should return pickup and dropoff from shipment stops', async () => {
        const history =
            await repository.findFinalOrders(
                tenantA,
            );

        const order =
            history.find(
                (item) =>
                    item.checkoutId ===
                    checkoutAId,
            );

        expect(order).toBeDefined();

        expect(
            order?.shipments,
        ).toHaveLength(2);

        const shipment =
            order?.shipments.find(
                (item) =>
                    item.id ===
                    shipmentA1Id,
            );

        expect(shipment).toBeDefined();

        expect(
            shipment?.pickup,
        ).toMatchObject({
            city:
                'Rishon LeZion',
            street:
                'Pickup A Street',
        });

        expect(
            shipment?.dropoff,
        ).toMatchObject({
            city:
                'Tel Aviv',
            street:
                'Dropoff A Street',
        });
    });

    it('should filter by delivered result status', async () => {
        const history =
            await repository.findFinalOrders(
                tenantA,
                {
                    resultStatus:
                        'delivered',
                },
            );

        const order =
            history.find(
                (item) =>
                    item.checkoutId ===
                    checkoutAId,
            );

        expect(order).toBeDefined();

        expect(
            order?.resultStatus,
        ).toBe(
            'delivered',
        );
    });

    it('should filter by carrier name', async () => {
        const history =
            await repository.findFinalOrders(
                tenantA,
                {
                    carrierName:
                        'Alpha',
                },
            );

        const order =
            history.find(
                (item) =>
                    item.checkoutId ===
                    checkoutAId,
            );

        expect(order).toBeDefined();
    });

    it('should search by tracking number', async () => {
        const history =
            await repository.findFinalOrders(
                tenantA,
                {
                    search:
                        'TRACK-A-2',
                },
            );

        expect(
            history.some(
                (item) =>
                    item.checkoutId ===
                    checkoutAId,
            ),
        ).toBe(true);
    });

    it('should sort by total shipping price', async () => {
        const history =
            await repository.findFinalOrders(
                tenantA,
                {
                    sortBy:
                        'totalShippingPrice',

                    sortDirection:
                        'desc',
                },
            );

        const order =
            history.find(
                (item) =>
                    item.checkoutId ===
                    checkoutAId,
            );

        expect(order).toBeDefined();

        expect(
            order?.totalShippingPrice,
        ).toBe(65);
    });

    it('should keep shipment history isolated between tenants', async () => {
        const historyA =
            await repository.findFinalOrders(
                tenantA,
            );

        const historyB =
            await repository.findFinalOrders(
                tenantB,
            );

        expect(
            historyA.some(
                (item) =>
                    item.checkoutId ===
                    checkoutBId,
            ),
        ).toBe(false);

        expect(
            historyB.some(
                (item) =>
                    item.checkoutId ===
                    checkoutAId,
            ),
        ).toBe(false);
    });
});