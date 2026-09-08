import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { DbService } from '../src/infrastructure/database/db.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import { CheckoutRepository } from '../src/modules/checkout/checkout.repository';

import { Checkout } from '../src/modules/checkout/interfaces/checkout.interface';

describe('Checkout Repository Multi-Tenant Integration', () => {
    let db: DbService;

    let tenantsService: TenantsService;

    let checkoutRepository: CheckoutRepository;

    let config: ConfigService;

    let tenantA: CurrentTenant;
    let tenantB: CurrentTenant;

    let checkoutAId: string;
    let checkoutBId: string;

    let orderAId: string;
    let orderBId: string;

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
                    CheckoutRepository,
                ],
            }).compile();

        db =
            moduleRef.get(DbService);

        tenantsService =
            moduleRef.get(TenantsService);

        checkoutRepository =
            moduleRef.get(CheckoutRepository);

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

        const uniqueId =
            Date.now().toString();

        orderAId =
            `INTEGRATION-TENANT-A-${uniqueId}`;

        orderBId =
            `INTEGRATION-TENANT-B-${uniqueId}`;

        const checkoutA: Checkout = {
            orderId:
                orderAId,

            storeId:
                'integration-store-a',

            destination: {
                country:
                    'IL',

                city:
                    'Tel Aviv',

                street:
                    'Integration A',

                houseNumber:
                    '1',

                postalCode:
                    '6100000',
            },

            items: [
                {
                    sku:
                        'TEST-A-SKU',

                    name:
                        'Tenant A Integration Item',

                    quantity:
                        2,

                    unitWeight:
                        1.5,

                    unitPrice:
                        100,

                    category:
                        'integration-test',
                },
            ],

            totalItems:
                2,

            totalPrice:
                200,

            createdAt:
                new Date(),
        };

        const checkoutB: Checkout = {
            orderId:
                orderBId,

            storeId:
                'integration-store-b',

            destination: {
                country:
                    'IL',

                city:
                    'Jerusalem',

                street:
                    'Integration B',

                houseNumber:
                    '2',

                postalCode:
                    '9100000',
            },

            items: [
                {
                    sku:
                        'TEST-B-SKU',

                    name:
                        'Tenant B Integration Item',

                    quantity:
                        3,

                    unitWeight:
                        2,

                    unitPrice:
                        50,

                    category:
                        'integration-test',
                },
            ],

            totalItems:
                3,

            totalPrice:
                150,

            createdAt:
                new Date(),
        };

        /*
         * שמירת Checkout אמיתית דרך
         * CheckoutRepository.
         */

        checkoutAId =
            await checkoutRepository.saveCheckout(
                tenantA,
                checkoutA,
                'integration-test',
            );

        await checkoutRepository.saveCheckoutItems(
            tenantA,
            checkoutAId,
            checkoutA,
        );

        checkoutBId =
            await checkoutRepository.saveCheckout(
                tenantB,
                checkoutB,
                'integration-test',
            );

        await checkoutRepository.saveCheckoutItems(
            tenantB,
            checkoutBId,
            checkoutB,
        );
    }, 30000);

    afterAll(async () => {
        /*
         * Cleanup.
         *
         * מוחקים קודם checkout_items בגלל
         * הקשר שלהם ל-checkouts.
         */

        if (checkoutAId) {
            await db.query(
                `
                delete from flow_ship_test_a.checkout_items
                where checkout_id = $1
                `,
                [
                    checkoutAId,
                ],
            );

            await db.query(
                `
                delete from flow_ship_test_a.checkouts
                where id = $1
                `,
                [
                    checkoutAId,
                ],
            );
        }

        if (checkoutBId) {
            await db.query(
                `
                delete from flow_ship_test_b.checkout_items
                where checkout_id = $1
                `,
                [
                    checkoutBId,
                ],
            );

            await db.query(
                `
                delete from flow_ship_test_b.checkouts
                where id = $1
                `,
                [
                    checkoutBId,
                ],
            );
        }

        await db.onModuleDestroy();
    }, 30000);

    it('should save Tenant A checkout only in Tenant A schema', async () => {
        const rows =
            await db.query<{
                id: string;
                external_order_id: string;
            }>(
                `
                select
                    id,
                    external_order_id
                from flow_ship_test_a.checkouts
                where id = $1
                `,
                [
                    checkoutAId,
                ],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            id:
                checkoutAId,

            external_order_id:
                orderAId,
        });

        const rowsInTenantB =
            await db.query(
                `
                select id
                from flow_ship_test_b.checkouts
                where id = $1
                `,
                [
                    checkoutAId,
                ],
            );

        expect(
            rowsInTenantB,
        ).toHaveLength(0);
    });

    it('should save Tenant B checkout only in Tenant B schema', async () => {
        const rows =
            await db.query<{
                id: string;
                external_order_id: string;
            }>(
                `
                select
                    id,
                    external_order_id
                from flow_ship_test_b.checkouts
                where id = $1
                `,
                [
                    checkoutBId,
                ],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            id:
                checkoutBId,

            external_order_id:
                orderBId,
        });

        const rowsInTenantA =
            await db.query(
                `
                select id
                from flow_ship_test_a.checkouts
                where id = $1
                `,
                [
                    checkoutBId,
                ],
            );

        expect(
            rowsInTenantA,
        ).toHaveLength(0);
    });

    it('should return only Tenant A checkout from Tenant A repository query', async () => {
        const checkouts =
            await checkoutRepository.getCheckouts(
                tenantA,
            );

        const tenantACheckout =
            checkouts.find(
                (checkout) =>
                    checkout.id ===
                    checkoutAId,
            );

        const tenantBCheckout =
            checkouts.find(
                (checkout) =>
                    checkout.id ===
                    checkoutBId,
            );

        expect(
            tenantACheckout,
        ).toBeDefined();

        expect(
            tenantACheckout?.orderId,
        ).toBe(
            orderAId,
        );

        expect(
            tenantBCheckout,
        ).toBeUndefined();
    });

    it('should return only Tenant B checkout from Tenant B repository query', async () => {
        const checkouts =
            await checkoutRepository.getCheckouts(
                tenantB,
            );

        const tenantBCheckout =
            checkouts.find(
                (checkout) =>
                    checkout.id ===
                    checkoutBId,
            );

        const tenantACheckout =
            checkouts.find(
                (checkout) =>
                    checkout.id ===
                    checkoutAId,
            );

        expect(
            tenantBCheckout,
        ).toBeDefined();

        expect(
            tenantBCheckout?.orderId,
        ).toBe(
            orderBId,
        );

        expect(
            tenantACheckout,
        ).toBeUndefined();
    });

    it('should allow Tenant A to read its checkout details but not Tenant B', async () => {
        const detailsFromTenantA =
            await checkoutRepository.getCheckoutById(
                tenantA,
                checkoutAId,
            );

        expect(
            detailsFromTenantA,
        ).not.toBeNull();

        expect(
            detailsFromTenantA?.orderId,
        ).toBe(
            orderAId,
        );

        expect(
            detailsFromTenantA?.items,
        ).toHaveLength(1);

        expect(
            detailsFromTenantA?.items[0],
        ).toMatchObject({
            sku:
                'TEST-A-SKU',

            quantity:
                2,

            unitPrice:
                '100.00',
        });
        const detailsFromTenantB =
            await checkoutRepository.getCheckoutById(
                tenantB,
                checkoutAId,
            );

        expect(
            detailsFromTenantB,
        ).toBeNull();
    });

    it('should allow Tenant B to read its checkout details but not Tenant A', async () => {
        const detailsFromTenantB =
            await checkoutRepository.getCheckoutById(
                tenantB,
                checkoutBId,
            );

        expect(
            detailsFromTenantB,
        ).not.toBeNull();

        expect(
            detailsFromTenantB?.orderId,
        ).toBe(
            orderBId,
        );

        expect(
            detailsFromTenantB?.items,
        ).toHaveLength(1);

        expect(
            detailsFromTenantB?.items[0],
        ).toMatchObject({
            sku:
                'TEST-B-SKU',

            quantity:
                3,

            unitPrice:
                '50.00',
        });
        const detailsFromTenantA =
            await checkoutRepository.getCheckoutById(
                tenantA,
                checkoutBId,
            );

        expect(
            detailsFromTenantA,
        ).toBeNull();
    });
});