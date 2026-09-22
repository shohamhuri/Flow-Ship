import {
    INestApplication,
    UnauthorizedException,
    ValidationPipe,
} from '@nestjs/common';

import {
    Test,
    TestingModule,
} from '@nestjs/testing';

import request from 'supertest';

import {
    ConfigModule,
    ConfigService,
} from '@nestjs/config';

import {
    DbService,
} from '../src/infrastructure/database/db.service';

import {
    TenantsService,
    CurrentTenant,
} from '../src/modules/tenants/tenants.service';

import {
    AuthService,
} from '../src/modules/auth/auth.service';

import {
    SupabaseAuthGuard,
} from '../src/modules/auth/supabase-auth.guard';

import {
    AdminController,
} from '../src/modules/admin/admin.controller';

import {
    AdminService,
} from '../src/modules/admin/admin.service';


describe(
    'Admin Decision Priority Cards API Integration',
    () => {
        let app:
            INestApplication;

        let moduleRef:
            TestingModule;

        let db:
            DbService;

        let config:
            ConfigService;

        let tenantsService:
            TenantsService;

        let tenantA:
            CurrentTenant;

        let tenantB:
            CurrentTenant;


        const TOKEN_A =
            'priority-card-token-a';

        const TOKEN_B =
            'priority-card-token-b';


        const createdCardsA:
            string[] = [];

        const createdCardsB:
            string[] = [];

        const CRITERION_PRICE =
            'price';

        const CRITERION_SPEED =
            'speed';

        const CRITERION_PROVIDER_PRIORITY =
            'provider_priority';

        const CRITERION_SHIPMENT_COUNT =
            'shipment_count';

        const TEST_CRITERIA = [
            CRITERION_PRICE,
            CRITERION_SPEED,
            CRITERION_PROVIDER_PRIORITY,
            CRITERION_SHIPMENT_COUNT,
        ];

        const TEST_PROVIDER_A_ID =
            '11111111-1111-4111-8111-111111111111';

        const TEST_PROVIDER_B_ID =
            '22222222-2222-4222-8222-222222222222';
        const authServiceMock = {
            authenticateAccessToken:
                jest.fn(),
        };


        /*
         * ============================================================
         * Helpers
         * ============================================================
         */
        async function seedProvider(
            tenant: CurrentTenant,
            id: string,
            suffix: string,
        ) {
            const schema =
                qSchema(
                    tenant.schemaName,
                );

            await db.query(
                `
        insert into ${schema}.providers (
            id,
            code,
            name,
            adapter_key,
            is_mock,
            is_active,
            priority_score
        )
        values (
            $1,
            $2,
            $3,
            $4,
            true,
            true,
            0.5
        )
        on conflict (id)
        do nothing
        `,
                [
                    id,
                    `integration_priority_${suffix}`,
                    `Integration Priority Provider ${suffix}`,
                    'mock',
                ],
            );
        }

        async function cleanupProvider(
            tenant: CurrentTenant,
            providerId: string,
        ) {
            const schema =
                qSchema(
                    tenant.schemaName,
                );

            await db.query(
                `
        delete from ${schema}.providers
        where id = $1
        `,
                [
                    providerId,
                ],
            );
        }
        async function seedDecisionCriterion(
            tenant: CurrentTenant,
            key: string,
        ) {
            const schema =
                qSchema(
                    tenant.schemaName,
                );

            await db.query(
                `
        insert into ${schema}.decision_criteria (
            key,
            label,
            description,
            weight,
            is_active
        )
        values (
            $1,
            $2,
            $3,
            $4,
            $5
        )
        on conflict (key)
        do nothing
        `,
                [
                    key,
                    'Price',
                    'Price criterion',
                    1,
                    true,
                ],
            );
        }
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


        function authContext(
            tenant: CurrentTenant,
        ) {
            return {
                user: {
                    id:
                        `user-${tenant.id}`,

                    email:
                        'integration@flowship.test',

                    displayName:
                        'Integration Test',

                    role:
                        'admin',
                },

                tenant,
            };
        }



        async function getProviderId(
            tenant: CurrentTenant,
        ): Promise<string> {
            if (
                tenant.id ===
                tenantA.id
            ) {
                return TEST_PROVIDER_A_ID;
            }

            if (
                tenant.id ===
                tenantB.id
            ) {
                return TEST_PROVIDER_B_ID;
            }

            throw new Error(
                `Unknown integration test tenant: ${tenant.id}`,
            );
        }
        async function getCardById(
            tenant: CurrentTenant,
            cardId: string,
        ) {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            const rows =
                await db.query<{
                    id: string;
                    provider_id: string | null;
                    criterion_key: string;
                    title: string | null;
                    priority_rank: number;
                    is_active: boolean;
                    config: Record<string, unknown>;
                }>(
                    `
                    select
                        id,
                        provider_id,
                        criterion_key,
                        title,
                        priority_rank,
                        is_active,
                        config
                    from ${schema}.decision_priority_cards
                    where id = $1
                    `,
                    [
                        cardId,
                    ],
                );


            return rows[0] ?? null;
        }


        async function cleanupCards(
            tenant: CurrentTenant,
            ids: string[],
        ) {
            if (
                ids.length === 0
            ) {
                return;
            }


            const schema =
                qSchema(
                    tenant.schemaName,
                );


            await db.query(
                `
                delete from ${schema}.decision_priority_cards
                where id = any($1::uuid[])
                `,
                [
                    ids,
                ],
            );
        }


        async function deleteExistingTestCards(
            tenant: CurrentTenant,
        ) {
            const schema =
                qSchema(
                    tenant.schemaName,
                );


            await db.query(
                `
                delete from ${schema}.decision_priority_cards
                where title like 'INTEGRATION PRIORITY CARD%'
                `,
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
                                ConfigModule.forRoot({
                                    isGlobal: true,
                                }),
                            ],

                            controllers: [
                                AdminController,
                            ],

                            providers: [
                                DbService,
                                ConfigService,
                                TenantsService,
                                AdminService,
                                SupabaseAuthGuard,

                                {
                                    provide: AuthService,
                                    useValue: authServiceMock,
                                },
                            ],
                        })
                        .compile();

                app =
                    moduleRef.createNestApplication();

                app.useGlobalPipes(
                    new ValidationPipe({
                        whitelist: true,
                        forbidNonWhitelisted: true,
                        transform: true,
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

                expect(
                    tenantA.schemaName,
                ).not.toBe(
                    tenantB.schemaName,
                );

                /*
                 * Clean leftovers from previous
                 * integration test runs.
                 */
                await deleteExistingTestCards(
                    tenantA,
                );

                await deleteExistingTestCards(
                    tenantB,
                );

                /*
                 * Make sure all supported decision
                 * criteria exist in both tenants.
                 */
                for (
                    const key of TEST_CRITERIA
                ) {
                    await seedDecisionCriterion(
                        tenantA,
                        key,
                    );

                    await seedDecisionCriterion(
                        tenantB,
                        key,
                    );
                }

                /*
                 * Create dedicated providers
                 * for this integration suite.
                 */
                await seedProvider(
                    tenantA,
                    TEST_PROVIDER_A_ID,
                    'a',
                );

                await seedProvider(
                    tenantB,
                    TEST_PROVIDER_B_ID,
                    'b',
                );
            },
            30000,
        );

        beforeEach(
            () => {
                jest.clearAllMocks();


                authServiceMock
                    .authenticateAccessToken
                    .mockImplementation(
                        async (
                            token:
                                string,
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
                                'Invalid access token',
                            );
                        },
                    );
            },
        );



        afterAll(
            async () => {
                if (tenantA) {
                    await cleanupCards(
                        tenantA,
                        createdCardsA,
                    );

                    await deleteExistingTestCards(
                        tenantA,
                    );
                    await cleanupProvider(
                        tenantA,
                        TEST_PROVIDER_A_ID,
                    );

                }

                if (tenantB) {
                    await cleanupCards(
                        tenantB,
                        createdCardsB,
                    );
                    await cleanupProvider(
                        tenantB,
                        TEST_PROVIDER_B_ID,
                    );
                    await deleteExistingTestCards(
                        tenantB,
                    );


                }

                if (app) {
                    await app.close();
                }
            },
            30000,
        );
        /*
         * ============================================================
         * TEST 1
         * ============================================================
         */

        it(
            'should return 401 when Authorization header is missing',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .get(
                        '/admin/decision-priority-cards',
                    )
                    .expect(
                        401,
                    );
            },
        );


        /*
         * ============================================================
         * TEST 2
         * ============================================================
         */

        it(
            'should return 401 for invalid access token',
            async () => {
                await request(
                    app.getHttpServer(),
                )
                    .get(
                        '/admin/decision-priority-cards',
                    )
                    .set(
                        'Authorization',
                        'Bearer invalid-token',
                    )
                    .expect(
                        401,
                    );
            },
        );


        /*
         * ============================================================
         * TEST 3
         *
         * GET must resolve against Tenant A.
         * ============================================================
         */

        it(
            'should return decision priority cards for Tenant A',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/decision-priority-cards',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_A}`,
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
                    response.body.tenant.id,
                ).toBe(
                    tenantA.id,
                );


                expect(
                    response.body
                        .tenant
                        .schemaName,
                ).toBe(
                    tenantA.schemaName,
                );


                expect(
                    response.body.cards,
                ).toEqual(
                    expect.any(
                        Array,
                    ),
                );
            },
        );


        /*
         * ============================================================
         * TEST 4
         *
         * POST without provider = global / ALL card.
         * Verify real DB persistence.
         * ============================================================
         */

        it(
            'should create and persist a global decision priority card in Tenant A',
            async () => {
                const criterionKey =
                    CRITERION_PRICE;

                const title =
                    `INTEGRATION PRIORITY CARD GLOBAL ${Date.now()}`;


                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/admin/decision-priority-cards',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_A}`,
                        )
                        .send({
                            criterionKey,
                            title,
                            isActive:
                                true,

                            config: {
                                integration:
                                    true,
                            },
                        })
                        .expect(
                            201,
                        );


                expect(
                    response.body.ok,
                ).toBe(
                    true,
                );


                expect(
                    response.body.tenant.id,
                ).toBe(
                    tenantA.id,
                );


                expect(
                    response.body.card.id,
                ).toEqual(
                    expect.any(
                        String,
                    ),
                );


                createdCardsA.push(
                    response.body.card.id,
                );


                const persisted =
                    await getCardById(
                        tenantA,
                        response.body.card.id,
                    );


                expect(
                    persisted,
                ).not.toBeNull();


                expect(
                    persisted,
                ).toMatchObject({
                    provider_id:
                        null,

                    criterion_key:
                        criterionKey,

                    title,

                    is_active:
                        true,
                });


                expect(
                    persisted!.config,
                ).toEqual({
                    integration:
                        true,
                });
            },
        );


        /*
         * ============================================================
         * TEST 5
         *
         * POST with provider.
         * ============================================================
         */

        it(
            'should create a provider-specific decision priority card',
            async () => {
                const criterionKey =
                    CRITERION_PRICE;

                const providerId =
                    await getProviderId(
                        tenantA,
                    );


                const title =
                    `INTEGRATION PRIORITY CARD PROVIDER ${Date.now()}`;


                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/admin/decision-priority-cards',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_A}`,
                        )
                        .send({
                            providerId,
                            criterionKey,
                            title,
                            isActive:
                                true,
                        })
                        .expect(
                            201,
                        );


                createdCardsA.push(
                    response.body.card.id,
                );


                const persisted =
                    await getCardById(
                        tenantA,
                        response.body.card.id,
                    );


                expect(
                    persisted,
                ).not.toBeNull();


                expect(
                    persisted!
                        .provider_id,
                ).toBe(
                    providerId,
                );


                expect(
                    persisted!
                        .criterion_key,
                ).toBe(
                    criterionKey,
                );
            },
        );


        /*
         * ============================================================
         * TEST 6
         *
         * Same provider + criterion is explicitly
         * protected by AdminService.
         *
         * Expected HTTP 409.
         * ============================================================
         */

        it(
            'should return 409 for duplicate provider and criterion card',
            async () => {
                const criterionKey =
                    CRITERION_PRICE;

                const providerId =
                    await getProviderId(
                        tenantB,
                    );


                const first =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/admin/decision-priority-cards',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_B}`,
                        )
                        .send({
                            providerId,
                            criterionKey,

                            title:
                                `INTEGRATION PRIORITY CARD DUPLICATE ${Date.now()}`,
                        })
                        .expect(
                            201,
                        );


                createdCardsB.push(
                    first.body.card.id,
                );


                const duplicate =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/admin/decision-priority-cards',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_B}`,
                        )
                        .send({
                            providerId,
                            criterionKey,

                            title:
                                'INTEGRATION PRIORITY CARD DUPLICATE SECOND',
                        })
                        .expect(
                            409,
                        );


                expect(
                    duplicate.body.message,
                ).toBe(
                    'Decision priority card already exists for this provider and criterion',
                );
            },
        );


        /*
         * ============================================================
         * TEST 7
         *
         * ValidationPipe + Create DTO.
         * ============================================================
         */

        it(
            'should return 400 for invalid create DTO',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/admin/decision-priority-cards',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_A}`,
                        )
                        .send({
                            providerId:
                                'not-a-uuid',

                            criterionKey:
                                '',

                            isActive:
                                'yes',

                            unknownField:
                                'not-allowed',
                        })
                        .expect(
                            400,
                        );


                expect(
                    response.body.message,
                ).toEqual(
                    expect.any(
                        Array,
                    ),
                );
            },
        );


        /*
         * ============================================================
         * TEST 8
         *
         * PATCH and verify DB persistence.
         * ============================================================
         */

        it(
            'should update and persist a decision priority card',
            async () => {
                const criterionKey =
                    CRITERION_SPEED;

                const created =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/admin/decision-priority-cards',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_A}`,
                        )
                        .send({
                            criterionKey,

                            title:
                                `INTEGRATION PRIORITY CARD UPDATE ${Date.now()}`,
                        })
                        .expect(
                            201,
                        );


                const cardId =
                    created.body.card.id;


                createdCardsA.push(
                    cardId,
                );


                const updatedTitle =
                    `INTEGRATION PRIORITY CARD UPDATED ${Date.now()}`;


                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .patch(
                            `/admin/decision-priority-cards/${cardId}`,
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_A}`,
                        )
                        .send({
                            title:
                                updatedTitle,

                            priorityRank:
                                50,

                            isActive:
                                false,

                            config: {
                                updated:
                                    true,
                            },
                        })
                        .expect(
                            200,
                        );


                expect(
                    response.body.ok,
                ).toBe(
                    true,
                );


                expect(
                    response.body.card.id,
                ).toBe(
                    cardId,
                );


                const persisted =
                    await getCardById(
                        tenantA,
                        cardId,
                    );


                expect(
                    persisted,
                ).toMatchObject({
                    title:
                        updatedTitle,

                    priority_rank:
                        50,

                    is_active:
                        false,
                });


                expect(
                    persisted!.config,
                ).toEqual({
                    updated:
                        true,
                });
            },
        );


        /*
         * ============================================================
         * TEST 9
         * ============================================================
         */

        it(
            'should return 404 when updating a missing decision priority card',
            async () => {
                const fakeId =
                    '00000000-0000-4000-8000-000000000001';


                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .patch(
                            `/admin/decision-priority-cards/${fakeId}`,
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_A}`,
                        )
                        .send({
                            title:
                                'Missing card',
                        })
                        .expect(
                            404,
                        );


                expect(
                    response.body.message,
                ).toBe(
                    'Decision priority card not found',
                );
            },
        );


        /*
         * ============================================================
         * TEST 10
         *
         * DELETE existing card.
         * ============================================================
         */

        it(
            'should delete a decision priority card',
            async () => {
                const criterionKey =
                    CRITERION_PROVIDER_PRIORITY;

                const created =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/admin/decision-priority-cards',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_A}`,
                        )
                        .send({
                            criterionKey,

                            title:
                                `INTEGRATION PRIORITY CARD DELETE ${Date.now()}`,
                        })
                        .expect(
                            201,
                        );


                const cardId =
                    created.body.card.id;


                /*
                 * No need to push to cleanup list:
                 * this test deletes it itself.
                 */
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .delete(
                            `/admin/decision-priority-cards/${cardId}`,
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_A}`,
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body,
                ).toEqual({
                    ok:
                        true,

                    deletedId:
                        cardId,
                });


                const persisted =
                    await getCardById(
                        tenantA,
                        cardId,
                    );


                expect(
                    persisted,
                ).toBeNull();
            },
        );


        /*
         * ============================================================
         * TEST 11
         * ============================================================
         */

        it(
            'should return 404 when deleting a missing decision priority card',
            async () => {
                const fakeId =
                    '00000000-0000-4000-8000-000000000002';


                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .delete(
                            `/admin/decision-priority-cards/${fakeId}`,
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_A}`,
                        )
                        .expect(
                            404,
                        );


                expect(
                    response.body.message,
                ).toBe(
                    'Decision priority card not found',
                );
            },
        );


        /*
         * ============================================================
         * TEST 12
         *
         * Strong tenant isolation:
         *
         * Create in A.
         * B must not see it.
         * B must not update it.
         * B must not delete it.
         * A must remain unchanged.
         * ============================================================
         */

        it(
            'should isolate decision priority cards between Tenant A and Tenant B',
            async () => {
                const criterionKeyA =
                    CRITERION_SHIPMENT_COUNT;

                const title =
                    `INTEGRATION PRIORITY CARD TENANT ISOLATION ${Date.now()}`;


                const created =
                    await request(
                        app.getHttpServer(),
                    )
                        .post(
                            '/admin/decision-priority-cards',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_A}`,
                        )
                        .send({
                            criterionKey:
                                criterionKeyA,

                            title,
                        })
                        .expect(
                            201,
                        );


                const cardId =
                    created.body.card.id;


                createdCardsA.push(
                    cardId,
                );


                /*
                 * GET through B must not contain A card.
                 */
                const tenantBResponse =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/decision-priority-cards',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_B}`,
                        )
                        .expect(
                            200,
                        );


                expect(
                    tenantBResponse
                        .body
                        .cards
                        .some(
                            (
                                card:
                                    { id: string },
                            ) =>
                                card.id ===
                                cardId,
                        ),
                ).toBe(
                    false,
                );


                /*
                 * PATCH through B.
                 */
                await request(
                    app.getHttpServer(),
                )
                    .patch(
                        `/admin/decision-priority-cards/${cardId}`,
                    )
                    .set(
                        'Authorization',
                        `Bearer ${TOKEN_B}`,
                    )
                    .send({
                        title:
                            'SHOULD NOT UPDATE',
                    })
                    .expect(
                        404,
                    );


                /*
                 * DELETE through B.
                 */
                await request(
                    app.getHttpServer(),
                )
                    .delete(
                        `/admin/decision-priority-cards/${cardId}`,
                    )
                    .set(
                        'Authorization',
                        `Bearer ${TOKEN_B}`,
                    )
                    .expect(
                        404,
                    );


                /*
                 * A row must still exist and remain unchanged.
                 */
                const persistedA =
                    await getCardById(
                        tenantA,
                        cardId,
                    );


                expect(
                    persistedA,
                ).not.toBeNull();


                expect(
                    persistedA!.title,
                ).toBe(
                    title,
                );


                /*
                 * Direct DB check against B schema.
                 */
                const persistedB =
                    await getCardById(
                        tenantB,
                        cardId,
                    );


                expect(
                    persistedB,
                ).toBeNull();
            },
        );
    },
);