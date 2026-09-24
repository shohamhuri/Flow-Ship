import {
    INestApplication,
    UnauthorizedException,
    ValidationPipe,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

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


describe(
    'Admin Decision Priority Cards E2E',
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
            'e2e-priority-card-token-a';

        const TOKEN_B =
            'e2e-priority-card-token-b';


        const createdCardsA: string[] = [];
        const createdCardsB: string[] = [];


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


        /*
         * ============================================================
         * Helpers
         * ============================================================
         */

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
                        `e2e-user-${tenant.id}`,

                    email:
                        'e2e-priority@flowship.test',

                    displayName:
                        'E2E Priority Test',

                    role:
                        'admin',
                },

                tenant,
            };
        }


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
                    `e2e_priority_${suffix}`,
                    `E2E Priority Provider ${suffix}`,
                    'mock',
                ],
            );
        }


        async function cleanupProvider(
            tenant: CurrentTenant,
            providerId: string,
        ) {
            await db.query(
                `
                delete from ${qSchema(
                    tenant.schemaName,
                )}.providers
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
            await db.query(
                `
                insert into ${qSchema(
                    tenant.schemaName,
                )}.decision_criteria (
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


        async function getCardById(
            tenant: CurrentTenant,
            cardId: string,
        ) {
            const rows =
                await db.query<{
                    id: string;
                    provider_id: string | null;
                    criterion_key: string;
                    title: string | null;
                    priority_rank: number;
                    is_active: boolean;
                    config:
                    Record<string, unknown>;
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
                    from ${qSchema(
                        tenant.schemaName,
                    )}.decision_priority_cards
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


            await db.query(
                `
                delete from ${qSchema(
                    tenant.schemaName,
                )}.decision_priority_cards
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
            await db.query(
                `
                delete from ${qSchema(
                    tenant.schemaName,
                )}.decision_priority_cards
                where title like 'E2E PRIORITY CARD%'
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

                        forbidNonWhitelisted:
                            true,

                        transform:
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


                if (
                    tenantA.schemaName ===
                    tenantB.schemaName
                ) {
                    throw new Error(
                        'E2E tenants must use different schemas',
                    );
                }


                /*
                 * Mock only external authentication.
                 */
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
                                'Invalid access token',
                            );
                        },
                    );


                /*
                 * Remove leftovers from previous E2E runs.
                 */
                await deleteExistingTestCards(
                    tenantA,
                );


                await deleteExistingTestCards(
                    tenantB,
                );


                /*
                 * Ensure required criteria exist.
                 */
                for (
                    const key
                    of TEST_CRITERIA
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
                 * Dedicated providers.
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
            60000,
        );


        /*
         * ============================================================
         * Cleanup
         * ============================================================
         */

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


                    await deleteExistingTestCards(
                        tenantB,
                    );


                    await cleanupProvider(
                        tenantB,
                        TEST_PROVIDER_B_ID,
                    );
                }


                if (app) {
                    await app.close();
                }
            },
            60000,
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
                    response.body
                        .tenant
                        .id,
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
         * ============================================================
         */

        it(
            'should create and persist a global decision priority card in Tenant A',
            async () => {
                const title =
                    `E2E PRIORITY CARD GLOBAL ${Date.now()}`;


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
                            criterionKey:
                                CRITERION_PRICE,

                            title,

                            isActive:
                                true,

                            config: {
                                e2e:
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
                    response.body
                        .tenant
                        .id,
                ).toBe(
                    tenantA.id,
                );


                expect(
                    response.body
                        .card
                        .id,
                ).toEqual(
                    expect.any(
                        String,
                    ),
                );


                createdCardsA.push(
                    response.body
                        .card
                        .id,
                );


                const persisted =
                    await getCardById(
                        tenantA,
                        response.body
                            .card
                            .id,
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
                        CRITERION_PRICE,

                    title,

                    is_active:
                        true,
                });


                expect(
                    persisted!
                        .config,
                ).toEqual({
                    e2e:
                        true,
                });
            },
        );


        /*
         * ============================================================
         * TEST 5
         * ============================================================
         */

        it(
            'should create a provider-specific decision priority card',
            async () => {
                const title =
                    `E2E PRIORITY CARD PROVIDER ${Date.now()}`;


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
                                TEST_PROVIDER_A_ID,

                            criterionKey:
                                CRITERION_PRICE,

                            title,

                            isActive:
                                true,
                        })
                        .expect(
                            201,
                        );


                createdCardsA.push(
                    response.body
                        .card
                        .id,
                );


                const persisted =
                    await getCardById(
                        tenantA,
                        response.body
                            .card
                            .id,
                    );


                expect(
                    persisted,
                ).not.toBeNull();


                expect(
                    persisted!
                        .provider_id,
                ).toBe(
                    TEST_PROVIDER_A_ID,
                );


                expect(
                    persisted!
                        .criterion_key,
                ).toBe(
                    CRITERION_PRICE,
                );
            },
        );


        /*
         * ============================================================
         * TEST 6
         * ============================================================
         */

        it(
            'should return 409 for duplicate provider and criterion card',
            async () => {
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
                            providerId:
                                TEST_PROVIDER_B_ID,

                            criterionKey:
                                CRITERION_PRICE,

                            title:
                                `E2E PRIORITY CARD DUPLICATE ${Date.now()}`,
                        })
                        .expect(
                            201,
                        );


                createdCardsB.push(
                    first.body
                        .card
                        .id,
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
                            providerId:
                                TEST_PROVIDER_B_ID,

                            criterionKey:
                                CRITERION_PRICE,

                            title:
                                'E2E PRIORITY CARD DUPLICATE SECOND',
                        })
                        .expect(
                            409,
                        );


                expect(
                    duplicate.body
                        .message,
                ).toBe(
                    'Decision priority card already exists for this provider and criterion',
                );
            },
        );


        /*
         * ============================================================
         * TEST 7
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
                    response.body
                        .message,
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
         * ============================================================
         */

        it(
            'should update and persist a decision priority card',
            async () => {
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
                                CRITERION_SPEED,

                            title:
                                `E2E PRIORITY CARD UPDATE ${Date.now()}`,
                        })
                        .expect(
                            201,
                        );


                const cardId =
                    created.body
                        .card
                        .id;


                createdCardsA.push(
                    cardId,
                );


                const updatedTitle =
                    `E2E PRIORITY CARD UPDATED ${Date.now()}`;


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
                    response.body
                        .card
                        .id,
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
                    persisted!
                        .config,
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
                    response.body
                        .message,
                ).toBe(
                    'Decision priority card not found',
                );
            },
        );


        /*
         * ============================================================
         * TEST 10
         * ============================================================
         */

        it(
            'should delete a decision priority card',
            async () => {
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
                                CRITERION_PROVIDER_PRIORITY,

                            title:
                                `E2E PRIORITY CARD DELETE ${Date.now()}`,
                        })
                        .expect(
                            201,
                        );


                const cardId =
                    created.body
                        .card
                        .id;


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
                    response.body
                        .message,
                ).toBe(
                    'Decision priority card not found',
                );
            },
        );


        /*
         * ============================================================
         * TEST 12
         * Strong Tenant Isolation
         * ============================================================
         */

        it(
            'should isolate decision priority cards between Tenant A and Tenant B',
            async () => {
                const title =
                    `E2E PRIORITY CARD TENANT ISOLATION ${Date.now()}`;


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
                                CRITERION_SHIPMENT_COUNT,

                            title,
                        })
                        .expect(
                            201,
                        );


                const cardId =
                    created.body
                        .card
                        .id;


                createdCardsA.push(
                    cardId,
                );


                /*
                 * Tenant B must not see A's card.
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
                 * Tenant B must not update A's card.
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
                 * Tenant B must not delete A's card.
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
                 * A's row must still exist.
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
                    persistedA!
                        .title,
                ).toBe(
                    title,
                );


                /*
                 * And it must not exist in B schema.
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