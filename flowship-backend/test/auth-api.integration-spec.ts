import {
    INestApplication,
    UnauthorizedException,
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
    AuthController,
} from '../src/modules/auth/auth.controller';

import {
    AuthService,
} from '../src/modules/auth/auth.service';

import {
    SupabaseAuthGuard,
} from '../src/modules/auth/supabase-auth.guard';

import {
    TenantsService,
    CurrentTenant,
} from '../src/modules/tenants/tenants.service';

import {
    DbService,
} from '../src/infrastructure/database/db.service';


describe(
    'Auth API /me Integration',
    () => {
        let app: INestApplication;
        let moduleRef: TestingModule;

        let config: ConfigService;
        let tenantsService: TenantsService;

        let tenantA: CurrentTenant;
        let tenantB: CurrentTenant;

        const tokenA =
            'integration-auth-me-token-a';

        const tokenB =
            'integration-auth-me-token-b';

        let authenticateAccessTokenMock:
            jest.Mock;


        beforeAll(
            async () => {
                authenticateAccessTokenMock =
                    jest.fn(
                        async (
                            token: string,
                        ) => {
                            if (
                                token === tokenA
                            ) {
                                return {
                                    user: {
                                        id:
                                            'auth-api-user-a',

                                        email:
                                            'auth-a@test.local',

                                        displayName:
                                            'Auth API User A',

                                        role:
                                            'admin',
                                    },

                                    tenant:
                                        tenantA,
                                };
                            }


                            if (
                                token === tokenB
                            ) {
                                return {
                                    user: {
                                        id:
                                            'auth-api-user-b',

                                        email:
                                            'auth-b@test.local',

                                        displayName:
                                            'Auth API User B',

                                        role:
                                            'admin',
                                    },

                                    tenant:
                                        tenantB,
                                };
                            }


                            throw new UnauthorizedException(
                                'Invalid or expired access token',
                            );
                        },
                    );


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
                                AuthController,
                            ],

                            providers: [
                                DbService,
                                ConfigService,
                                TenantsService,

                                SupabaseAuthGuard,

                                {
                                    provide:
                                        AuthService,

                                    useValue: {
                                        authenticateAccessToken:
                                            authenticateAccessTokenMock,
                                    },
                                },
                            ],
                        })
                        .compile();


                app =
                    moduleRef
                        .createNestApplication();


                await app.init();


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
            },
            30000,
        );


        afterAll(
            async () => {
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
            'should reject /auth/me without Authorization header',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/auth/me',
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
         * TEST 2
         */
        it(
            'should reject /auth/me when Authorization is not Bearer',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/auth/me',
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
         * TEST 3
         */
        it(
            'should reject /auth/me with invalid Bearer token',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/auth/me',
                        )
                        .set(
                            'Authorization',
                            'Bearer invalid-token',
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
         * TEST 4
         */
        it(
            'should return authenticated user and Tenant A context',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/auth/me',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${tokenA}`,
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body.user,
                ).toEqual({
                    id:
                        'auth-api-user-a',

                    email:
                        'auth-a@test.local',

                    displayName:
                        'Auth API User A',

                    role:
                        'admin',
                });


                expect(
                    response.body.tenant,
                ).toEqual({
                    id:
                        tenantA.id,

                    name:
                        tenantA.name,

                    schemaName:
                        tenantA.schemaName,

                    status:
                        tenantA.status,
                });
            },
        );


        /*
         * TEST 5
         */
        it(
            'should return authenticated user and Tenant B context',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/auth/me',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${tokenB}`,
                        )
                        .expect(
                            200,
                        );


                expect(
                    response.body.user,
                ).toEqual({
                    id:
                        'auth-api-user-b',

                    email:
                        'auth-b@test.local',

                    displayName:
                        'Auth API User B',

                    role:
                        'admin',
                });


                expect(
                    response.body.tenant
                        .schemaName,
                ).toBe(
                    tenantB.schemaName,
                );


                expect(
                    response.body.tenant.id,
                ).toBe(
                    tenantB.id,
                );
            },
        );


        /*
         * TEST 6
         */
        it(
            'should keep Tenant A and Tenant B auth contexts isolated',
            async () => {
                const responseA =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/auth/me',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${tokenA}`,
                        )
                        .expect(
                            200,
                        );


                const responseB =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/auth/me',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${tokenB}`,
                        )
                        .expect(
                            200,
                        );


                expect(
                    responseA.body.user.id,
                ).not.toBe(
                    responseB.body.user.id,
                );


                expect(
                    responseA.body.tenant.id,
                ).not.toBe(
                    responseB.body.tenant.id,
                );


                expect(
                    responseA.body.tenant
                        .schemaName,
                ).toBe(
                    tenantA.schemaName,
                );


                expect(
                    responseB.body.tenant
                        .schemaName,
                ).toBe(
                    tenantB.schemaName,
                );
            },
        );


        /*
         * TEST 7
         */
        it(
            'should pass the exact Bearer access token to AuthService',
            async () => {
                authenticateAccessTokenMock
                    .mockClear();


                await request(
                    app.getHttpServer(),
                )
                    .get(
                        '/auth/me',
                    )
                    .set(
                        'Authorization',
                        `Bearer ${tokenA}`,
                    )
                    .expect(
                        200,
                    );


                expect(
                    authenticateAccessTokenMock,
                ).toHaveBeenCalledTimes(
                    1,
                );


                expect(
                    authenticateAccessTokenMock,
                ).toHaveBeenCalledWith(
                    tokenA,
                );
            },
        );


        /*
         * TEST 8
         */
        it(
            'should expose only user and tenant in /auth/me response',
            async () => {
                const response =
                    await request(
                        app.getHttpServer(),
                    )
                        .get(
                            '/auth/me',
                        )
                        .set(
                            'Authorization',
                            `Bearer ${tokenA}`,
                        )
                        .expect(
                            200,
                        );


                expect(
                    Object.keys(
                        response.body,
                    ).sort(),
                ).toEqual([
                    'tenant',
                    'user',
                ]);


                expect(
                    response.body,
                ).not.toHaveProperty(
                    'accessToken',
                );


                expect(
                    response.body,
                ).not.toHaveProperty(
                    'password',
                );


                expect(
                    response.body.user,
                ).not.toHaveProperty(
                    'password',
                );
            },
        );
    },
);