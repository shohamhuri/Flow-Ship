import {
    INestApplication,
    UnauthorizedException,
    ValidationPipe,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
    Test,
    TestingModule,
} from '@nestjs/testing';

import { ConfigService } from '@nestjs/config';

import request from 'supertest';

import { AppModule } from '../src/app.module';

import {
    DbService,
} from '../src/infrastructure/database/db.service';

import {
    AuthService,
} from '../src/modules/auth/auth.service';

import type {
    FlowShipAuthContext,
} from '../src/modules/auth/auth.types';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';


describe(
    'Admin Authentication & Tenant Isolation E2E',
    () => {
        let app: INestApplication;
        let moduleRef: TestingModule;

        let db: DbService;
        let config: ConfigService;
        let authService: AuthService;
        let tenantsService: TenantsService;

        let tenantA: CurrentTenant;
        let tenantB: CurrentTenant;

        const TOKEN_A =
            'e2e-admin-token-a';

        const TOKEN_B =
            'e2e-admin-token-b';

        const INVALID_TOKEN =
            'e2e-invalid-token';


        const providerAId =
            randomUUID();

        const providerBId =
            randomUUID();

        const providerACode =
            `E2E_ADMIN_A_${Date.now()}`;

        const providerBCode =
            `E2E_ADMIN_B_${Date.now()}`;

        const settingsAId =
            randomUUID();

        const settingsBId =
            randomUUID();
        /*
         * =============================================================
         * Helper
         * =============================================================
         */

        function createAuthContext(
            tenant: CurrentTenant,
            suffix: string,
        ): FlowShipAuthContext {
            return {
                user: {
                    id:
                        `e2e-admin-user-${suffix}`,

                    email:
                        `e2e-admin-${suffix}@flowship.test`,

                    displayName:
                        `E2E Admin ${suffix}`,

                    role:
                        'admin',
                },

                tenant,
            };
        }


        beforeAll(
            async () => {
                /*
                 * =====================================================
                 * Real AppModule
                 * =====================================================
                 */

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


                /*
                 * זהה ל-main.ts
                 */
                app.useGlobalPipes(
                    new ValidationPipe({
                        whitelist: true,
                        transform: true,
                        forbidNonWhitelisted: true,
                    }),
                );


                await app.init();


                /*
                 * =====================================================
                 * Real services
                 * =====================================================
                 */

                db =
                    moduleRef.get(
                        DbService,
                    );


                config =
                    moduleRef.get(
                        ConfigService,
                    );


                authService =
                    moduleRef.get(
                        AuthService,
                    );


                tenantsService =
                    moduleRef.get(
                        TenantsService,
                    );


                /*
                 * =====================================================
                 * Resolve real test tenants
                 * =====================================================
                 */

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
                ).toBe(
                    'flow_ship_test_a',
                );


                expect(
                    tenantB.schemaName,
                ).toBe(
                    'flow_ship_test_b',
                );


                /*
                 * =====================================================
                 * Mock ONLY external authentication boundary
                 * =====================================================
                 *
                 * SupabaseAuthGuard עצמו נשאר אמיתי.
                 *
                 * כשה-Guard קורא:
                 *
                 * authService.authenticateAccessToken(token)
                 *
                 * אנחנו מחזירים FlowShipAuthContext ידוע מראש.
                 */

                jest
                    .spyOn(
                        authService,
                        'authenticateAccessToken',
                    )
                    .mockImplementation(
                        async (
                            accessToken: string,
                        ): Promise<FlowShipAuthContext> => {
                            if (
                                accessToken ===
                                TOKEN_A
                            ) {
                                return createAuthContext(
                                    tenantA,
                                    'a',
                                );
                            }


                            if (
                                accessToken ===
                                TOKEN_B
                            ) {
                                return createAuthContext(
                                    tenantB,
                                    'b',
                                );
                            }


                            throw new UnauthorizedException(
                                'Invalid or expired access token',
                            );
                        },
                    );


                /*
  * =====================================================
  * Create isolated E2E providers
  * =====================================================
  */

                await db.query(
                    `
    insert into flow_ship_test_a.providers (
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
        $5,
        $6,
        $7
    )
    `,
                    [
                        providerAId,
                        providerACode,
                        'E2E Admin Provider A',
                        'mock',
                        true,
                        true,
                        0.61,
                    ],
                );


                await db.query(
                    `
    insert into flow_ship_test_b.providers (
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
        $5,
        $6,
        $7
    )
    `,
                    [
                        providerBId,
                        providerBCode,
                        'E2E Admin Provider B',
                        'mock',
                        true,
                        true,
                        0.72,
                    ],
                );
                /*
  * =====================================================
  * Create isolated E2E decision settings
  * =====================================================
  */

                await db.query(
                    `
    insert into flow_ship_test_a.decision_settings (
        id,
        price_weight,
        speed_weight,
        provider_priority_weight,
        is_active
    )
    values (
        $1,
        $2,
        $3,
        $4,
        true
    )
    `,
                    [
                        settingsAId,
                        0.40,
                        0.35,
                        0.25,
                    ],
                );


                await db.query(
                    `
    insert into flow_ship_test_b.decision_settings (
        id,
        price_weight,
        speed_weight,
        provider_priority_weight,
        is_active
    )
    values (
        $1,
        $2,
        $3,
        $4,
        true
    )
    `,
                    [
                        settingsBId,
                        0.20,
                        0.50,
                        0.30,
                    ],
                );
            },
            60000,
        );
        afterAll(
            async () => {
                /*
  * =====================================================
  * Delete isolated E2E providers
  * =====================================================
  */

                if (db) {
                    await db.query(
                        `
        delete from flow_ship_test_a.providers
        where id = $1
        `,
                        [
                            providerAId,
                        ],
                    );


                    await db.query(
                        `
        delete from flow_ship_test_b.providers
        where id = $1
        `,
                        [
                            providerBId,
                        ],
                    );
                }

                /*
* =====================================================
* Delete isolated E2E decision settings
* =====================================================
*/

                if (db) {
                    await db.query(
                        `
        delete from flow_ship_test_a.decision_settings
        where id = $1
        `,
                        [
                            settingsAId,
                        ],
                    );


                    await db.query(
                        `
        delete from flow_ship_test_b.decision_settings
        where id = $1
        `,
                        [
                            settingsBId,
                        ],
                    );
                }

                jest.restoreAllMocks();


                if (app) {
                    await app.close();
                }
            },
            60000,
        );


        /*
         * =============================================================
         * TEST 1
         * Missing Authorization
         * =============================================================
         */

        it(
            'should reject Admin API request without Authorization header',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/providers',
                        )
                        .expect(
                            401,
                        );


                expect(
                    response.body.message,
                ).toBe(
                    'Authorization header is missing',
                );
            },
        );


        /*
         * =============================================================
         * TEST 2
         * Invalid Authorization scheme
         * =============================================================
         */

        it(
            'should reject Admin API request when Authorization is not Bearer',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/providers',
                        )
                        .set(
                            'Authorization',
                            'Basic abc123',
                        )
                        .expect(
                            401,
                        );


                expect(
                    response.body.message,
                ).toBe(
                    'Authorization header must use Bearer token',
                );
            },
        );


        /*
         * =============================================================
         * TEST 3
         * Invalid Bearer token
         * =============================================================
         */

        it(
            'should reject Admin API request with invalid Bearer token',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/providers',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${INVALID_TOKEN}`,
                        )
                        .expect(
                            401,
                        );


                expect(
                    response.body.message,
                ).toBe(
                    'Invalid or expired access token',
                );
            },
        );


        /*
         * =============================================================
         * TEST 4
         * Tenant A providers
         * =============================================================
         */

        it(
            'should return Tenant A providers for Tenant A authenticated admin',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/providers',
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
                    response.body.tenant.schemaName,
                ).toBe(
                    tenantA.schemaName,
                );


                expect(
                    Array.isArray(
                        response.body.providers,
                    ),
                ).toBe(
                    true,
                );


                expect(
                    response.body.providers.some(
                        (
                            provider: {
                                id: string;
                            },
                        ) =>
                            provider.id ===
                            providerAId,
                    ),
                ).toBe(
                    true,
                );
            },
        );


        /*
         * =============================================================
         * TEST 5
         * Tenant B cannot see Tenant A provider
         * =============================================================
         */

        it(
            'should not expose Tenant A provider to Tenant B authenticated admin',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/providers',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_B}`,
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body.tenant.id,
                ).toBe(
                    tenantB.id,
                );


                expect(
                    response.body.tenant.schemaName,
                ).toBe(
                    tenantB.schemaName,
                );


                expect(
                    response.body.providers.some(
                        (
                            provider: {
                                id: string;
                            },
                        ) =>
                            provider.id ===
                            providerAId,
                    ),
                ).toBe(
                    false,
                );


                expect(
                    response.body.providers.some(
                        (
                            provider: {
                                id: string;
                            },
                        ) =>
                            provider.id ===
                            providerBId,
                    ),
                ).toBe(
                    true,
                );
            },
        );


        /*
         * =============================================================
         * TEST 6
         * Provider update isolation
         * =============================================================
         */

        it(
            'should update Tenant A provider without changing Tenant B provider',
            async () => {
                const newPriorityScore =
                    0.37;


                await request(
                    app.getHttpServer(),
                )
                    .patch(
                        `/admin/providers/${providerAId}`,
                    )
                    .set(
                        'Authorization',
                        `Bearer ${TOKEN_A}`,
                    )
                    .send({
                        priorityScore:
                            newPriorityScore,
                    })
                    .expect(
                        200,
                    );


                const providerA =
                    await db.query<{
                        priority_score: number;
                    }>(
                        `
                select priority_score
                from flow_ship_test_a.providers
                where id = $1
                `,
                        [
                            providerAId,
                        ],
                    );


                const providerB =
                    await db.query<{
                        priority_score: number;
                    }>(
                        `
                select priority_score
                from flow_ship_test_b.providers
                where id = $1
                `,
                        [
                            providerBId,
                        ],
                    );


                expect(
                    providerA,
                ).toHaveLength(
                    1,
                );


                expect(
                    Number(
                        providerA[0]
                            .priority_score,
                    ),
                ).toBeCloseTo(
                    newPriorityScore,
                );


                /*
                 * Provider B נוצר עם 0.72.
                 * שינוי של A אסור שישפיע עליו.
                 */
                expect(
                    providerB,
                ).toHaveLength(
                    1,
                );


                expect(
                    Number(
                        providerB[0]
                            .priority_score,
                    ),
                ).toBeCloseTo(
                    0.72,
                );
            },
        );

        /*
         * =============================================================
         * TEST 7
         * Decision settings tenant routing
         * =============================================================
         */

        it(
            'should return decision settings from the authenticated tenant',
            async () => {
                const responseA =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/decision-settings',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_A}`,
                        )
                        .expect(
                            200,
                        );


                const responseB =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/admin/decision-settings',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${TOKEN_B}`,
                        )
                        .expect(
                            200,
                        );


                expect(
                    responseA.body.tenant.id,
                ).toBe(
                    tenantA.id,
                );


                expect(
                    responseA.body.tenant.schemaName,
                ).toBe(
                    tenantA.schemaName,
                );


                expect(
                    responseB.body.tenant.id,
                ).toBe(
                    tenantB.id,
                );


                expect(
                    responseB.body.tenant.schemaName,
                ).toBe(
                    tenantB.schemaName,
                );


                expect(
                    Number(
                        responseA.body
                            .settings
                            .priceWeight,
                    ),
                ).toBeCloseTo(
                    0.40,
                );


                expect(
                    Number(
                        responseB.body
                            .settings
                            .priceWeight,
                    ),
                ).toBeCloseTo(
                    0.20,
                );
            },
        );


        /*
         * =============================================================
         * TEST 8
         * Decision settings update isolation
         * =============================================================
         */

        it(
            'should update Tenant A decision settings without changing Tenant B',
            async () => {
                /*
                 * הערכים מסתכמים ל-1.
                 */
                const newSettings = {
                    priceWeight:
                        0.50,

                    speedWeight:
                        0.30,

                    providerPriorityWeight:
                        0.20,
                };


                await request(
                    app.getHttpServer(),
                )
                    .patch(
                        '/admin/decision-settings',
                    )
                    .set(
                        'Authorization',
                        `Bearer ${TOKEN_A}`,
                    )
                    .send(
                        newSettings,
                    )
                    .expect(
                        200,
                    );


                const settingsA =
                    await db.query<{
                        price_weight: number;
                        speed_weight: number;
                        provider_priority_weight: number;
                    }>(
                        `
                        select
                            price_weight,
                            speed_weight,
                            provider_priority_weight
                        from flow_ship_test_a.decision_settings
                        limit 1
                        `,
                    );


                const settingsB =
                    await db.query<{
                        price_weight: number;
                        speed_weight: number;
                        provider_priority_weight: number;
                    }>(
                        `
                        select
                            price_weight,
                            speed_weight,
                            provider_priority_weight
                        from flow_ship_test_b.decision_settings
                        limit 1
                        `,
                    );

                expect(
                    Number(
                        settingsA[0]
                            .price_weight,
                    ),
                ).toBeCloseTo(
                    0.50,
                );


                expect(
                    Number(
                        settingsA[0]
                            .speed_weight,
                    ),
                ).toBeCloseTo(
                    0.30,
                );


                expect(
                    Number(
                        settingsA[0]
                            .provider_priority_weight,
                    ),
                ).toBeCloseTo(
                    0.20,
                );
                /*
* Tenant B חייב להישאר בדיוק כפי שיצרנו אותו.
*/

                expect(
                    Number(
                        settingsB[0]
                            .price_weight,
                    ),
                ).toBeCloseTo(
                    0.20,
                );


                expect(
                    Number(
                        settingsB[0]
                            .speed_weight,
                    ),
                ).toBeCloseTo(
                    0.50,
                );


                expect(
                    Number(
                        settingsB[0]
                            .provider_priority_weight,
                    ),
                ).toBeCloseTo(
                    0.30,
                );
            },
        );
    },
);