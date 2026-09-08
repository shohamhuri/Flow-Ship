import { BadRequestException } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';

import { DbService } from '../src/infrastructure/database/db.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import { ShipmentsRepository } from '../src/modules/shipments/shipments.repository';

import { ShipmentStatusService } from '../src/modules/shipments/shipment-status.service';

describe('ShipmentStatusService Integration', () => {
    let db: DbService;

    let tenantsService: TenantsService;

    let shipmentsRepository: ShipmentsRepository;

    let shipmentStatusService: ShipmentStatusService;

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
                    ShipmentsRepository,
                    ShipmentStatusService,
                ],
            }).compile();

        db =
            moduleRef.get(DbService);

        tenantsService =
            moduleRef.get(TenantsService);

        shipmentsRepository =
            moduleRef.get(
                ShipmentsRepository,
            );

        shipmentStatusService =
            moduleRef.get(
                ShipmentStatusService,
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
         * Checkout A עם שני shipments.
         */

        await db.query(
            `
            insert into flow_ship_test_a.checkouts (
                id,
                external_order_id,
                platform,
                status,
                raw_payload
            )
            values (
                $1,
                $2,
                'integration-test',
                'processing',
                '{}'::jsonb
            )
            `,
            [
                checkoutAId,
                `STATUS-A-${Date.now()}`,
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
                currency
            )
            values
                (
                    $1,
                    $3,
                    'STATUS-A-1',
                    'created',
                    'Carrier A1',
                    'Standard',
                    20,
                    'ILS'
                ),
                (
                    $2,
                    $3,
                    'STATUS-A-2',
                    'created',
                    'Carrier A2',
                    'Standard',
                    30,
                    'ILS'
                )
            `,
            [
                shipmentA1Id,
                shipmentA2Id,
                checkoutAId,
            ],
        );

        /*
         * Shipment A1 מקבל שני pickup stops
         * כדי לבדוק את המעבר ל-picked_up
         * רק אחרי האחרון.
         */

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
                    '{"city":"Pickup A1"}'::jsonb,
                    'pending'
                ),
                (
                    $2,
                    $3,
                    2,
                    'pickup',
                    '{"city":"Pickup A2"}'::jsonb,
                    'pending'
                ),
                (
                    $4,
                    $3,
                    3,
                    'dropoff',
                    '{"city":"Dropoff A"}'::jsonb,
                    'pending'
                )
            `,
            [
                randomUUID(),
                randomUUID(),
                shipmentA1Id,
                randomUUID(),
            ],
        );

        /*
         * Shipment A2 צריך dropoff
         * כדי שנוכל לסמן אותו delivered.
         */

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
                    $2,
                    1,
                    'pickup',
                    '{"city":"Pickup A2"}'::jsonb,
                    'completed'
                ),
                (
                    $3,
                    $2,
                    2,
                    'dropoff',
                    '{"city":"Dropoff A2"}'::jsonb,
                    'pending'
                )
            `,
            [
                randomUUID(),
                shipmentA2Id,
                randomUUID(),
            ],
        );

        /*
         * Tenant B נפרד לחלוטין.
         */

        await db.query(
            `
            insert into flow_ship_test_b.checkouts (
                id,
                external_order_id,
                platform,
                status,
                raw_payload
            )
            values (
                $1,
                $2,
                'integration-test',
                'processing',
                '{}'::jsonb
            )
            `,
            [
                checkoutBId,
                `STATUS-B-${Date.now()}`,
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
                currency
            )
            values (
                $1,
                $2,
                'STATUS-B-1',
                'created',
                'Carrier B',
                'Standard',
                40,
                'ILS'
            )
            `,
            [
                shipmentBId,
                checkoutBId,
            ],
        );

        await db.query(
            `
            insert into flow_ship_test_b.shipment_stops (
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
                    '{"city":"Pickup B"}'::jsonb,
                    'completed'
                ),
                (
                    $3,
                    $2,
                    2,
                    'dropoff',
                    '{"city":"Dropoff B"}'::jsonb,
                    'pending'
                )
            `,
            [
                randomUUID(),
                shipmentBId,
                randomUUID(),
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
            delete from flow_ship_test_b.shipment_stops
            where shipment_id = $1
            `,
            [shipmentBId],
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

    it('should not mark shipment as picked up after only the first pickup', async () => {
        const occurredAt =
            new Date();

        await shipmentStatusService.markPickedUp(
            tenantA,
            shipmentA1Id,
            1,
            occurredAt,
        );

        const rows =
            await db.query<{
                status: string;
            }>(
                `
                select status
                from flow_ship_test_a.shipments
                where id = $1
                `,
                [shipmentA1Id],
            );

        expect(
            rows[0].status,
        ).toBe(
            'created',
        );
    });

    it('should mark shipment as picked_up after all pickups are completed', async () => {
        const occurredAt =
            new Date();

        await shipmentStatusService.markPickedUp(
            tenantA,
            shipmentA1Id,
            2,
            occurredAt,
        );

        const rows =
            await db.query<{
                status: string;
            }>(
                `
                select status
                from flow_ship_test_a.shipments
                where id = $1
                `,
                [shipmentA1Id],
            );

        expect(
            rows[0].status,
        ).toBe(
            'picked_up',
        );
    });

    it('should mark shipment as in transit', async () => {
        await shipmentStatusService.markInTransit(
            tenantA,
            shipmentA1Id,
        );

        const rows =
            await db.query<{
                status: string;
            }>(
                `
                select status
                from flow_ship_test_a.shipments
                where id = $1
                `,
                [shipmentA1Id],
            );

        expect(
            rows[0].status,
        ).toBe(
            'in_transit',
        );
    });

    it('should keep checkout in processing while no shipment is delivered or failed', async () => {
        const rows =
            await db.query<{
                status: string;
            }>(
                `
                select status
                from flow_ship_test_a.checkouts
                where id = $1
                `,
                [checkoutAId],
            );

        expect(
            rows[0].status,
        ).toBe(
            'processing',
        );
    });

    it('should set checkout to partially_delivered when one of two shipments is delivered', async () => {
        const occurredAt =
            new Date();

        await shipmentStatusService.markDelivered(
            tenantA,
            shipmentA1Id,
            occurredAt,
        );

        const shipmentRows =
            await db.query<{
                status: string;
            }>(
                `
                select status
                from flow_ship_test_a.shipments
                where id = $1
                `,
                [shipmentA1Id],
            );

        const checkoutRows =
            await db.query<{
                status: string;
            }>(
                `
                select status
                from flow_ship_test_a.checkouts
                where id = $1
                `,
                [checkoutAId],
            );

        expect(
            shipmentRows[0].status,
        ).toBe(
            'delivered',
        );

        expect(
            checkoutRows[0].status,
        ).toBe(
            'partially_delivered',
        );
    });

    it('should set checkout to delivered when all shipments are delivered', async () => {
        const occurredAt =
            new Date();

        await shipmentStatusService.markDelivered(
            tenantA,
            shipmentA2Id,
            occurredAt,
        );

        const rows =
            await db.query<{
                status: string;
            }>(
                `
                select status
                from flow_ship_test_a.checkouts
                where id = $1
                `,
                [checkoutAId],
            );

        expect(
            rows[0].status,
        ).toBe(
            'delivered',
        );
    });

    it('should set checkout to failed when its only shipment fails', async () => {
        const occurredAt =
            new Date();

        await shipmentStatusService.markFailed(
            tenantB,
            shipmentBId,
            'Integration failure',
            occurredAt,
        );

        const shipmentRows =
            await db.query<{
                status: string;
                failure_reason: string | null;
            }>(
                `
                select
                    status,
                    failure_reason
                from flow_ship_test_b.shipments
                where id = $1
                `,
                [shipmentBId],
            );

        const checkoutRows =
            await db.query<{
                status: string;
            }>(
                `
                select status
                from flow_ship_test_b.checkouts
                where id = $1
                `,
                [checkoutBId],
            );

        expect(
            shipmentRows[0],
        ).toMatchObject({
            status:
                'failed',

            failure_reason:
                'Integration failure',
        });

        expect(
            checkoutRows[0].status,
        ).toBe(
            'failed',
        );
    });

    it('should set checkout to partially_failed when one shipment is delivered and another fails', async () => {
        await db.query(
            `
            update flow_ship_test_a.shipments
            set
                status = 'delivered',
                delivered_at = now(),
                failed_at = null,
                failure_reason = null
            where id = $1
            `,
            [shipmentA1Id],
        );

        await db.query(
            `
            update flow_ship_test_a.shipments
            set
                status = 'created',
                delivered_at = null,
                failed_at = null,
                failure_reason = null
            where id = $1
            `,
            [shipmentA2Id],
        );

        await db.query(
            `
            update flow_ship_test_a.checkouts
            set status = 'processing'
            where id = $1
            `,
            [checkoutAId],
        );

        await shipmentStatusService.markFailed(
            tenantA,
            shipmentA2Id,
            'Second shipment failed',
            new Date(),
        );

        const rows =
            await db.query<{
                status: string;
            }>(
                `
                select status
                from flow_ship_test_a.checkouts
                where id = $1
                `,
                [checkoutAId],
            );

        expect(
            rows[0].status,
        ).toBe(
            'partially_failed',
        );
    });

    it('should reject empty failure reason', async () => {
        await expect(
            shipmentStatusService.markFailed(
                tenantA,
                shipmentA1Id,
                '   ',
            ),
        ).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it('should keep Tenant B isolated from Tenant A shipment events', async () => {
        const rows =
            await db.query<{
                status: string;
            }>(
                `
                select status
                from flow_ship_test_b.checkouts
                where id = $1
                `,
                [checkoutBId],
            );

        expect(
            rows[0].status,
        ).toBe(
            'failed',
        );

        const wrongTenantRows =
            await db.query(
                `
                select id
                from flow_ship_test_b.shipments
                where id = $1
                `,
                [shipmentA1Id],
            );

        expect(
            wrongTenantRows,
        ).toHaveLength(0);
    });
});