import {
    ConfigModule,
} from '@nestjs/config';

import {
    Test,
    TestingModule,
} from '@nestjs/testing';

import {
    UnauthorizedException,
} from '@nestjs/common';

import {
    randomUUID,
} from 'crypto';

import {
    User,
} from '@supabase/supabase-js';

import {
    DbService,
} from '../src/infrastructure/database/db.service';

import {
    AuthService,
} from '../src/modules/auth/auth.service';


describe(
    'AuthService + Supabase Authentication Flow Integration',
    () => {
        let moduleRef: TestingModule;

        let db: DbService;

        let authService: AuthService;

        /*
         * אנחנו לא רוצים לבצע Auth אמיתי
         * מול השרת החיצוני של Supabase.
         *
         * ה-AuthService עצמו אמיתי,
         * וה-DB אמיתי.
         *
         * רק התשובה של:
         *
         * supabase.auth.getUser()
         *
         * נשלטת מתוך הטסט.
         */
        let getUserMock:
            jest.SpyInstance;


        /*
         * =============================================================
         * Test tenants
         * =============================================================
         */

        let activeTenantId:
            string;

        let disabledTenantId:
            string;


        /*
         * =============================================================
         * Test users
         * =============================================================
         */

        let activeUserId:
            string;

        let disabledUserId:
            string;

        let disabledTenantUserId:
            string;

        let noProfileUserId:
            string;

        let noEmailUserId:
            string;


        beforeAll(
            async () => {
                moduleRef =
                    await Test
                        .createTestingModule({
                            imports: [
                                ConfigModule.forRoot({
                                    isGlobal:
                                        true,
                                }),
                            ],

                            providers: [
                                DbService,
                                AuthService,
                            ],
                        })
                        .compile();


                db =
                    moduleRef.get(
                        DbService,
                    );


                authService =
                    moduleRef.get(
                        AuthService,
                    );


                /*
                 * =====================================================
                 * Mock ONLY Supabase getUser()
                 * =====================================================
                 *
                 * authService.supabase הוא private,
                 * ולכן ניגשים אליו דרך any
                 * רק לצורך Integration Test.
                 */

                const supabaseClient =
                    (
                        authService as any
                    ).supabase;


                getUserMock =
                    jest.spyOn(
                        supabaseClient.auth,
                        'getUser',
                    );


                /*
                 * =====================================================
                 * IDs
                 * =====================================================
                 */

                activeTenantId =
                    randomUUID();

                disabledTenantId =
                    randomUUID();

                activeUserId =
                    randomUUID();

                disabledUserId =
                    randomUUID();

                disabledTenantUserId =
                    randomUUID();

                noProfileUserId =
                    randomUUID();

                noEmailUserId =
                    randomUUID();


                /*
                 * =====================================================
                 * Real tenants
                 * =====================================================
                 *
                 * אנחנו יוצרים Tenants ייעודיים לסוויטה הזאת,
                 * ולא משנים את FLOW_SHIP_TEST_A/B.
                 */

                await db.query(
                    `
                    insert into public.flowship_tenants (
                        id,
                        name,
                        schema_name,
                        status,
                        api_key
                    )
                    values
                        (
                            $1,
                            $2,
                            $3,
                            'active',
                            $4
                        ),
                        (
                            $5,
                            $6,
                            $7,
                            'inactive',
                            $8
                        )
                    `,
                    [
                        activeTenantId,
                        `AUTH_INTEGRATION_ACTIVE_${activeTenantId}`,

                        `auth_integration_active_${activeTenantId.replace(
                            /-/g,
                            '_',
                        )}`,

                        `auth-active-${randomUUID()}`,

                        disabledTenantId,
                        `AUTH_INTEGRATION_DISABLED_${disabledTenantId}`,

                        `auth_integration_disabled_${disabledTenantId.replace(
                            /-/g,
                            '_',
                        )}`,

                        `auth-disabled-${randomUUID()}`,
                    ],
                );


                /*
                 * =====================================================
                 * Real FlowShip profiles
                 * =====================================================
                 */
                await db.query(
                    `
    insert into auth.users (
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        is_sso_user,
        is_anonymous
    )
    values
        (
            $1,
            'authenticated',
            'authenticated',
            $2,
            '',
            now(),
            '{}'::jsonb,
            '{}'::jsonb,
            now(),
            now(),
            false,
            false
        ),
        (
            $3,
            'authenticated',
            'authenticated',
            $4,
            '',
            now(),
            '{}'::jsonb,
            '{}'::jsonb,
            now(),
            now(),
            false,
            false
        ),
        (
            $5,
            'authenticated',
            'authenticated',
            $6,
            '',
            now(),
            '{}'::jsonb,
            '{}'::jsonb,
            now(),
            now(),
            false,
            false
        ),
        (
            $7,
            'authenticated',
            'authenticated',
            null,
            '',
            now(),
            '{}'::jsonb,
            '{}'::jsonb,
            now(),
            now(),
            false,
            false
        )
    `,
                    [
                        activeUserId,
                        `auth-active-${activeUserId}@test.local`,

                        disabledUserId,
                        `auth-disabled-${disabledUserId}@test.local`,

                        disabledTenantUserId,
                        `auth-disabled-tenant-${disabledTenantUserId}@test.local`,

                        noEmailUserId,
                    ],
                );
                await db.query(
                    `
    insert into public.flowship_user_profiles (
        user_id,
        tenant_id,
        display_name,
        role,
        status
    )
    values
        (
            $1,
            $2,
            'Integration Active User',
            'admin',
            'active'
        ),
        (
            $3,
            $2,
            'Integration Disabled User',
            'admin',
            'disabled'
        ),
        (
            $4,
            $5,
            'Integration Disabled Tenant User',
            'admin',
            'active'
        ),
        (
            $6,
            $2,
            'Integration No Email User',
            'admin',
            'active'
        )
    `,
                    [
                        activeUserId,
                        activeTenantId,

                        disabledUserId,

                        disabledTenantUserId,
                        disabledTenantId,

                        noEmailUserId,
                    ],
                );
            },
            30000,
        );


        afterEach(
            () => {
                /*
                 * כל test מגדיר לעצמו
                 * התנהגות חדשה ל-getUser.
                 */

                getUserMock
                    .mockReset();
            },
        );


        afterAll(
            async () => {
                if (db) {
                    /*
                     * 1. Profiles קודם
                     */
                    await db.query(
                        `
                delete from public.flowship_user_profiles
                where user_id = any($1::uuid[])
                `,
                        [[
                            activeUserId,
                            disabledUserId,
                            disabledTenantUserId,
                            noEmailUserId,
                        ]],
                    );


                    /*
                     * 2. Auth users
                     */
                    await db.query(
                        `
                delete from auth.users
                where id = any($1::uuid[])
                `,
                        [[
                            activeUserId,
                            disabledUserId,
                            disabledTenantUserId,
                            noEmailUserId,
                        ]],
                    );


                    /*
                     * 3. Tenants
                     */
                    await db.query(
                        `
                delete from public.flowship_tenants
                where id = any($1::uuid[])
                `,
                        [[
                            activeTenantId,
                            disabledTenantId,
                        ]],
                    );
                }


                if (getUserMock) {
                    getUserMock.mockRestore();
                }


                if (moduleRef) {
                    await moduleRef.close();
                }
            },
            30000,
        );


        /*
         * =============================================================
         * Helper
         * =============================================================
         */

        function mockSupabaseUser(
            options: {
                id: string;
                email?: string;
            },
        ) {
            const user = {
                id:
                    options.id,

                email:
                    options.email,

                app_metadata:
                    {},

                user_metadata:
                    {},

                aud:
                    'authenticated',

                created_at:
                    new Date()
                        .toISOString(),
            } as User;


            getUserMock
                .mockResolvedValue({
                    data: {
                        user,
                    },

                    error:
                        null,
                });


            return user;
        }


        /*
         * =============================================================
         * TEST 1
         * Successful authentication
         * =============================================================
         */

        it(
            'should authenticate a valid Supabase user with an active FlowShip profile and tenant',
            async () => {
                mockSupabaseUser({
                    id:
                        activeUserId,

                    email:
                        'active@test.local',
                });


                const result =
                    await authService
                        .authenticateAccessToken(
                            'valid-access-token',
                        );


                expect(
                    result,
                ).toBeDefined();


                expect(
                    result.user,
                ).toBeDefined();


                expect(
                    result.tenant,
                ).toBeDefined();
            },
        );


        /*
         * =============================================================
         * TEST 2
         * User mapping
         * =============================================================
         */

        it(
            'should correctly map FlowShip user details from Supabase and the database',
            async () => {
                mockSupabaseUser({
                    id:
                        activeUserId,

                    email:
                        'active@test.local',
                });


                const result =
                    await authService
                        .authenticateAccessToken(
                            'user-mapping-token',
                        );


                expect(
                    result.user,
                ).toEqual({
                    id:
                        activeUserId,

                    email:
                        'active@test.local',

                    displayName:
                        'Integration Active User',

                    role:
                        'admin',
                });
            },
        );


        /*
         * =============================================================
         * TEST 3
         * Tenant mapping
         * =============================================================
         */

        it(
            'should correctly load the tenant connected to the FlowShip user profile',
            async () => {
                mockSupabaseUser({
                    id:
                        activeUserId,

                    email:
                        'active@test.local',
                });


                const result =
                    await authService
                        .authenticateAccessToken(
                            'tenant-mapping-token',
                        );


                expect(
                    result.tenant.id,
                ).toBe(
                    activeTenantId,
                );


                expect(
                    result.tenant.name,
                ).toBe(
                    `AUTH_INTEGRATION_ACTIVE_${activeTenantId}`,
                );


                expect(
                    result.tenant.schemaName,
                ).toBe(
                    `auth_integration_active_${activeTenantId.replace(
                        /-/g,
                        '_',
                    )}`,
                );


                expect(
                    result.tenant.status,
                ).toBe(
                    'active',
                );
            },
        );


        /*
         * =============================================================
         * TEST 4
         * Token forwarding
         * =============================================================
         */

        it(
            'should send the exact access token to Supabase getUser',
            async () => {
                mockSupabaseUser({
                    id:
                        activeUserId,

                    email:
                        'active@test.local',
                });


                const accessToken =
                    `integration-token-${randomUUID()}`;


                await authService
                    .authenticateAccessToken(
                        accessToken,
                    );


                expect(
                    getUserMock,
                ).toHaveBeenCalledTimes(
                    1,
                );


                expect(
                    getUserMock,
                ).toHaveBeenCalledWith(
                    accessToken,
                );
            },
        );


        /*
         * =============================================================
         * TEST 5
         * Invalid / expired token
         * =============================================================
         */

        it(
            'should reject an invalid or expired Supabase access token',
            async () => {
                getUserMock
                    .mockResolvedValue({
                        data: {
                            user:
                                null,
                        },

                        error: {
                            message:
                                'Invalid JWT',
                        },
                    });


                await expect(
                    authService
                        .authenticateAccessToken(
                            'invalid-token',
                        ),
                ).rejects.toThrow(
                    new UnauthorizedException(
                        'Invalid or expired access token',
                    ),
                );
            },
        );


        /*
         * =============================================================
         * TEST 6
         * Supabase response without user
         * =============================================================
         */

        it(
            'should reject when Supabase returns no authenticated user',
            async () => {
                getUserMock
                    .mockResolvedValue({
                        data: {
                            user:
                                null,
                        },

                        error:
                            null,
                    });


                await expect(
                    authService
                        .authenticateAccessToken(
                            'token-without-user',
                        ),
                ).rejects.toThrow(
                    'Invalid or expired access token',
                );
            },
        );


        /*
         * =============================================================
         * TEST 7
         * Supabase user without FlowShip profile
         * =============================================================
         */

        it(
            'should reject a valid Supabase user that has no FlowShip profile',
            async () => {
                mockSupabaseUser({
                    id:
                        noProfileUserId,

                    email:
                        'no-profile@test.local',
                });


                await expect(
                    authService
                        .authenticateAccessToken(
                            'no-profile-token',
                        ),
                ).rejects.toThrow(
                    'FlowShip profile was not found for this user',
                );


                /*
                 * וידוא שבאמת אין profile כזה ב-DB.
                 */

                const rows =
                    await db.query(
                        `
                        select user_id
                        from public.flowship_user_profiles
                        where user_id = $1
                        `,
                        [
                            noProfileUserId,
                        ],
                    );


                expect(
                    rows,
                ).toHaveLength(
                    0,
                );
            },
        );


        /*
         * =============================================================
         * TEST 8
         * Disabled FlowShip user
         * =============================================================
         */

        it(
            'should reject a disabled FlowShip user',
            async () => {
                mockSupabaseUser({
                    id:
                        disabledUserId,

                    email:
                        'disabled@test.local',
                });


                await expect(
                    authService
                        .authenticateAccessToken(
                            'disabled-user-token',
                        ),
                ).rejects.toThrow(
                    'FlowShip user is disabled',
                );
            },
        );


        /*
         * =============================================================
         * TEST 9
         * Disabled tenant
         * =============================================================
         */

        it(
            'should reject a user whose FlowShip tenant is disabled',
            async () => {
                mockSupabaseUser({
                    id:
                        disabledTenantUserId,

                    email:
                        'disabled-tenant@test.local',
                });


                await expect(
                    authService
                        .authenticateAccessToken(
                            'disabled-tenant-token',
                        ),
                ).rejects.toThrow(
                    'FlowShip tenant is disabled',
                );
            },
        );


        /*
         * =============================================================
         * TEST 10
         * User without email
         * =============================================================
         */

        it(
            'should return email as null when Supabase user has no email',
            async () => {
                mockSupabaseUser({
                    id:
                        noEmailUserId,
                });


                const result =
                    await authService
                        .authenticateAccessToken(
                            'no-email-token',
                        );


                expect(
                    result.user.id,
                ).toBe(
                    noEmailUserId,
                );


                expect(
                    result.user.email,
                ).toBeNull();


                expect(
                    result.user.displayName,
                ).toBe(
                    'Integration No Email User',
                );


                expect(
                    result.tenant.id,
                ).toBe(
                    activeTenantId,
                );
            },
        );
    },
);