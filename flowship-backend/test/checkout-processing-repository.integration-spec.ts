import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';

import { DbService } from '../src/infrastructure/database/db.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import { CheckoutProcessingRepository } from '../src/modules/checkout/checkout-processing.repository';

describe('CheckoutProcessingRepository Integration', () => {
    let db: DbService;

    let tenantsService: TenantsService;

    let repository: CheckoutProcessingRepository;

    let config: ConfigService;

    let tenantA: CurrentTenant;
    let tenantB: CurrentTenant;

    let checkoutAId: string;
    let checkoutBId: string;

    let processingAId: string;
    let processingBId: string;

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
                    CheckoutProcessingRepository,
                ],
            }).compile();

        db =
            moduleRef.get(DbService);

        tenantsService =
            moduleRef.get(TenantsService);

        repository =
            moduleRef.get(
                CheckoutProcessingRepository,
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

        /*
         * checkout_processing תלוי ב-checkout,
         * לכן יוצרים Checkout מינימלי בכל schema.
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
            values ($1, $2, $3, $4, $5)
            `,
            [
                checkoutAId,
                `PROCESSING-A-${Date.now()}`,
                'integration-test',
                'received',
                {},
            ],
        );

        await db.query(
            `
            insert into flow_ship_test_b.checkouts (
                id,
                external_order_id,
                platform,
                status,
                raw_payload
            )
            values ($1, $2, $3, $4, $5)
            `,
            [
                checkoutBId,
                `PROCESSING-B-${Date.now()}`,
                'integration-test',
                'received',
                {},
            ],
        );

        processingAId =
            await repository.create(
                tenantA,
                checkoutAId,
            );

        processingBId =
            await repository.create(
                tenantB,
                checkoutBId,
            );
    }, 30000);

    afterAll(async () => {
        if (checkoutAId) {
            await db.query(
                `
                delete from flow_ship_test_a.checkout_processing
                where checkout_id = $1
                `,
                [checkoutAId],
            );

            await db.query(
                `
                delete from flow_ship_test_a.checkouts
                where id = $1
                `,
                [checkoutAId],
            );
        }

        if (checkoutBId) {
            await db.query(
                `
                delete from flow_ship_test_b.checkout_processing
                where checkout_id = $1
                `,
                [checkoutBId],
            );

            await db.query(
                `
                delete from flow_ship_test_b.checkouts
                where id = $1
                `,
                [checkoutBId],
            );
        }

        await db.onModuleDestroy();
    }, 30000);

    it('should create processing record for Tenant A', async () => {
        const rows =
            await db.query<{
                id: string;
                checkout_id: string;
                status: string;
                current_step: string;
            }>(
                `
                select
                    id,
                    checkout_id,
                    status,
                    current_step
                from flow_ship_test_a.checkout_processing
                where id = $1
                `,
                [processingAId],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            id:
                processingAId,

            checkout_id:
                checkoutAId,

            status:
                'processing',

            current_step:
                'checkout_received',
        });
    });

    it('should create processing record for Tenant B', async () => {
        const rows =
            await db.query<{
                id: string;
                checkout_id: string;
                status: string;
                current_step: string;
            }>(
                `
                select
                    id,
                    checkout_id,
                    status,
                    current_step
                from flow_ship_test_b.checkout_processing
                where id = $1
                `,
                [processingBId],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            id:
                processingBId,

            checkout_id:
                checkoutBId,

            status:
                'processing',

            current_step:
                'checkout_received',
        });
    });

    it('should not store Tenant A processing in Tenant B schema', async () => {
        const rows =
            await db.query(
                `
                select id
                from flow_ship_test_b.checkout_processing
                where id = $1
                `,
                [processingAId],
            );

        expect(rows).toHaveLength(0);
    });

    it('should not store Tenant B processing in Tenant A schema', async () => {
        const rows =
            await db.query(
                `
                select id
                from flow_ship_test_a.checkout_processing
                where id = $1
                `,
                [processingBId],
            );

        expect(rows).toHaveLength(0);
    });

    it('should mark sourcing as completed for Tenant A', async () => {
        await repository.markSourcingCompleted(
            tenantA,
            checkoutAId,
        );

        const rows =
            await db.query<{
                sourcing_completed: boolean;
                current_step: string;
            }>(
                `
                select
                    sourcing_completed,
                    current_step
                from flow_ship_test_a.checkout_processing
                where checkout_id = $1
                `,
                [checkoutAId],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            sourcing_completed:
                true,

            current_step:
                'grouping',
        });
    });

    it('should mark grouping as completed for Tenant A', async () => {
        await repository.markGroupingCompleted(
            tenantA,
            checkoutAId,
        );

        const rows =
            await db.query<{
                grouping_completed: boolean;
                status: string;
                current_step: string;
            }>(
                `
                select
                    grouping_completed,
                    status,
                    current_step
                from flow_ship_test_a.checkout_processing
                where checkout_id = $1
                `,
                [checkoutAId],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            grouping_completed:
                true,

            status:
                'processing',

            current_step:
                'awaiting_quotes',
        });
    });

    it('should mark Tenant B processing as failed', async () => {
        await repository.markFailed(
            tenantB,
            checkoutBId,
            'sourcing',
            'Integration test failure',
        );

        const rows =
            await db.query<{
                status: string;
                current_step: string;
                error_message: string;
                completed_at: Date | null;
            }>(
                `
                select
                    status,
                    current_step,
                    error_message,
                    completed_at
                from flow_ship_test_b.checkout_processing
                where checkout_id = $1
                `,
                [checkoutBId],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            status:
                'failed',

            current_step:
                'sourcing',

            error_message:
                'Integration test failure',
        });

        expect(
            rows[0].completed_at,
        ).not.toBeNull();
    });

    it('should keep Tenant A isolated from Tenant B updates', async () => {
        const tenantARows =
            await db.query<{
                status: string;
                current_step: string;
                error_message: string | null;
            }>(
                `
                select
                    status,
                    current_step,
                    error_message
                from flow_ship_test_a.checkout_processing
                where checkout_id = $1
                `,
                [checkoutAId],
            );

        expect(tenantARows).toHaveLength(1);

        expect(tenantARows[0]).toMatchObject({
            status:
                'processing',

            current_step:
                'awaiting_quotes',

            error_message:
                null,
        });
    });
});