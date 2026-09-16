import {
    Test,
    TestingModule,
} from '@nestjs/testing';

import {
    ConfigModule,
} from '@nestjs/config';

import {
    DatabaseModule,
} from '../src/infrastructure/database/database.module';

import {
    DbService,
} from '../src/infrastructure/database/db.service';

import {
    TenantsModule,
} from '../src/modules/tenants/tenants.module';

import {
    TenantsService,
    CurrentTenant,
} from '../src/modules/tenants/tenants.service';

import {
    CheckoutRepository,
} from '../src/modules/checkout/checkout.repository';


describe(
    'Tenant Schema Security Integration',
    () => {
        jest.setTimeout(30000);

        let moduleRef: TestingModule;

        let db: DbService;

        let tenantsService:
            TenantsService;

        let checkoutRepository:
            CheckoutRepository;

        let tenantA:
            CurrentTenant;


        const CHECKOUT_ID =
            '91111111-1111-4111-8111-111111111111';


        function createTenantWithSchema(
            schemaName: string,
        ): CurrentTenant {
            return {
                ...tenantA,
                schemaName,
            };
        }


        async function cleanup():
            Promise<void> {

            if (!tenantA) {
                return;
            }

            await db.query(
                `
                delete from "${tenantA.schemaName}".checkouts
                where id = $1
                `,
                [
                    CHECKOUT_ID,
                ],
            );
        }


        async function seed():
            Promise<void> {

            await cleanup();

            await db.query(
                `
                insert into "${tenantA.schemaName}".checkouts
                (
                    id,
                    external_order_id,
                    platform,
                    customer,
                    cart,
                    destination,
                    raw_payload,
                    status
                )
                values
                (
                    $1,
                    $2,
                    'integration-test',
                    '{}'::jsonb,
                    '[]'::jsonb,
                    '{}'::jsonb,
                    '{}'::jsonb,
                    'processing'
                )
                `,
                [
                    CHECKOUT_ID,
                    'tenant-schema-security-order',
                ],
            );
        }


        beforeAll(
            async () => {

                moduleRef =
                    await Test
                        .createTestingModule({
                            imports: [
                                ConfigModule.forRoot({
                                    isGlobal: true,
                                }),

                                DatabaseModule,

                                TenantsModule,
                            ],

                            providers: [
                                CheckoutRepository,
                            ],
                        })
                        .compile();


                db =
                    moduleRef.get(
                        DbService,
                    );


                tenantsService =
                    moduleRef.get(
                        TenantsService,
                    );


                checkoutRepository =
                    moduleRef.get(
                        CheckoutRepository,
                    );


                tenantA =
                    await tenantsService
                        .findByApiKey(
                            process.env
                                .TEST_FLOW_SHIP_A_API_KEY,
                        );


                await seed();
            },
            30000,
        );


        afterEach(
            async () => {

                /*
                 * כל בדיקה זדונית אמורה להיכשל
                 * לפני שינוי הנתונים.
                 *
                 * כאן אנחנו גם מוודאים שה-fixture
                 * עדיין קיים לבדיקה הבאה.
                 */

                const rows =
                    await db.query<{
                        id: string;
                    }>(
                        `
                        select id
                        from "${tenantA.schemaName}".checkouts
                        where id = $1
                        `,
                        [
                            CHECKOUT_ID,
                        ],
                    );


                if (!rows[0]) {
                    await seed();
                }
            },
            30000,
        );


        afterAll(
            async () => {

                await cleanup();

                if (moduleRef) {
                    await moduleRef.close();
                }
            },
            30000,
        );


        it(
            '1. allows a valid tenant schema name',
            async () => {

                const details =
                    await checkoutRepository
                        .getCheckoutById(
                            tenantA,
                            CHECKOUT_ID,
                        );


                expect(details)
                    .not
                    .toBeNull();


                expect(details!.id)
                    .toBe(
                        CHECKOUT_ID,
                    );


                expect(details!.orderId)
                    .toBe(
                        'tenant-schema-security-order',
                    );
            },
        );


        it(
            '2. rejects a schema name containing a semicolon',
            async () => {

                const maliciousTenant =
                    createTenantWithSchema(
                        `${tenantA.schemaName}; drop schema public cascade`,
                    );


                await expect(
                    checkoutRepository
                        .getCheckoutById(
                            maliciousTenant,
                            CHECKOUT_ID,
                        ),
                ).rejects.toThrow(
                    'Invalid schema name',
                );
            },
        );


        it(
            '3. rejects a schema name containing SQL comment syntax',
            async () => {

                const maliciousTenant =
                    createTenantWithSchema(
                        `${tenantA.schemaName}--`,
                    );


                await expect(
                    checkoutRepository
                        .getCheckoutById(
                            maliciousTenant,
                            CHECKOUT_ID,
                        ),
                ).rejects.toThrow(
                    'Invalid schema name',
                );
            },
        );


        it(
            '4. rejects a schema name containing quotes',
            async () => {

                const maliciousTenant =
                    createTenantWithSchema(
                        `${tenantA.schemaName}"`,
                    );


                await expect(
                    checkoutRepository
                        .getCheckoutById(
                            maliciousTenant,
                            CHECKOUT_ID,
                        ),
                ).rejects.toThrow(
                    'Invalid schema name',
                );
            },
        );


        it(
            '5. rejects a schema name containing spaces',
            async () => {

                const maliciousTenant =
                    createTenantWithSchema(
                        `${tenantA.schemaName} other_schema`,
                    );


                await expect(
                    checkoutRepository
                        .getCheckoutById(
                            maliciousTenant,
                            CHECKOUT_ID,
                        ),
                ).rejects.toThrow(
                    'Invalid schema name',
                );
            },
        );


        it(
            '6. rejects an empty schema name',
            async () => {

                const maliciousTenant =
                    createTenantWithSchema(
                        '',
                    );


                await expect(
                    checkoutRepository
                        .getCheckoutById(
                            maliciousTenant,
                            CHECKOUT_ID,
                        ),
                ).rejects.toThrow(
                    'Invalid schema name',
                );
            },
        );


        it(
            '7. rejects an attempt to append another schema name',
            async () => {

                const maliciousTenant =
                    createTenantWithSchema(
                        `${tenantA.schemaName}.public`,
                    );


                await expect(
                    checkoutRepository
                        .getCheckoutById(
                            maliciousTenant,
                            CHECKOUT_ID,
                        ),
                ).rejects.toThrow(
                    'Invalid schema name',
                );
            },
        );


        it(
            '8. getCheckoutById does not execute a malicious schema name',
            async () => {

                const maliciousTenant =
                    createTenantWithSchema(
                        `${tenantA.schemaName}"; delete from public.flowship_tenants; --`,
                    );


                await expect(
                    checkoutRepository
                        .getCheckoutById(
                            maliciousTenant,
                            CHECKOUT_ID,
                        ),
                ).rejects.toThrow(
                    'Invalid schema name',
                );


                const details =
                    await checkoutRepository
                        .getCheckoutById(
                            tenantA,
                            CHECKOUT_ID,
                        );


                expect(details)
                    .not
                    .toBeNull();
            },
        );


        it(
            '9. updateGroupingSplitReasons rejects a malicious schema name',
            async () => {

                const maliciousTenant =
                    createTenantWithSchema(
                        `${tenantA.schemaName}"; drop table checkouts; --`,
                    );


                await expect(
                    checkoutRepository
                        .updateGroupingSplitReasons(
                            maliciousTenant,
                            CHECKOUT_ID,
                            [
                                'SECURITY_TEST',
                            ],
                        ),
                ).rejects.toThrow(
                    'Invalid schema name',
                );


                const details =
                    await checkoutRepository
                        .getCheckoutById(
                            tenantA,
                            CHECKOUT_ID,
                        );


                expect(details)
                    .not
                    .toBeNull();


                expect(
                    details!
                        .groupingSplitReasons,
                ).toEqual([]);
            },
        );


        it(
            '10. malicious schema attempts do not modify Tenant A data',
            async () => {

                const maliciousSchemas = [
                    `${tenantA.schemaName}; delete from checkouts`,
                    `${tenantA.schemaName}--`,
                    `${tenantA.schemaName}"`,
                    `${tenantA.schemaName} public`,
                    `${tenantA.schemaName}.public`,
                ];


                for (
                    const schemaName
                    of maliciousSchemas
                ) {

                    const maliciousTenant =
                        createTenantWithSchema(
                            schemaName,
                        );


                    await expect(
                        checkoutRepository
                            .getCheckoutById(
                                maliciousTenant,
                                CHECKOUT_ID,
                            ),
                    ).rejects.toThrow(
                        'Invalid schema name',
                    );
                }


                const rows =
                    await db.query<{
                        id: string;
                        external_order_id: string;
                        status: string;
                    }>(
                        `
                        select
                            id,
                            external_order_id,
                            status
                        from "${tenantA.schemaName}".checkouts
                        where id = $1
                        `,
                        [
                            CHECKOUT_ID,
                        ],
                    );


                expect(rows)
                    .toHaveLength(1);


                expect(rows[0])
                    .toEqual(
                        expect.objectContaining({
                            id:
                                CHECKOUT_ID,

                            external_order_id:
                                'tenant-schema-security-order',

                            status:
                                'processing',
                        }),
                    );
            },
        );
    },
);