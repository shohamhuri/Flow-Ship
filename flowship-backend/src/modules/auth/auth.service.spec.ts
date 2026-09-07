import {
    UnauthorizedException,
} from '@nestjs/common';

import {
    createClient,
} from '@supabase/supabase-js';

import {
    AuthService,
} from './auth.service';

import {
    DbService,
} from '../../infrastructure/database/db.service';

jest.mock(
    '@supabase/supabase-js',
    () => ({
        createClient: jest.fn(),
    }),
);

describe('AuthService', () => {
    const originalEnv =
        process.env;

    const createClientMock =
        createClient as jest.MockedFunction<
            typeof createClient
        >;

    let queryMock: jest.Mock;

    let getUserMock: jest.Mock;

    const createService = () => {
        queryMock =
            jest.fn();

        getUserMock =
            jest.fn();

        createClientMock
            .mockReturnValue({
                auth: {
                    getUser:
                        getUserMock,
                },
            } as any);

        const databaseServiceMock = {
            query: queryMock,
        } as unknown as DbService;

        return new AuthService(
            databaseServiceMock,
        );
    };

    beforeEach(() => {
        jest.clearAllMocks();

        process.env = {
            ...originalEnv,
            SUPABASE_URL:
                'https://test.supabase.co',
            SUPABASE_PUBLISHABLE_KEY:
                'test-publishable-key',
        };
    });

    afterEach(() => {
        process.env =
            originalEnv;
    });

    it('should throw when SUPABASE_URL is missing', () => {
        delete process.env
            .SUPABASE_URL;

        const databaseServiceMock = {
            query: jest.fn(),
        } as unknown as DbService;

        expect(
            () =>
                new AuthService(
                    databaseServiceMock,
                ),
        ).toThrow(
            'SUPABASE_URL environment variable is missing',
        );

        expect(
            createClientMock,
        ).not.toHaveBeenCalled();
    });

    it('should throw when SUPABASE_PUBLISHABLE_KEY is missing', () => {
        delete process.env
            .SUPABASE_PUBLISHABLE_KEY;

        const databaseServiceMock = {
            query: jest.fn(),
        } as unknown as DbService;

        expect(
            () =>
                new AuthService(
                    databaseServiceMock,
                ),
        ).toThrow(
            'SUPABASE_PUBLISHABLE_KEY environment variable is missing',
        );

        expect(
            createClientMock,
        ).not.toHaveBeenCalled();
    });

    it('should create Supabase client with the correct configuration', () => {
        createService();

        expect(
            createClientMock,
        ).toHaveBeenCalledTimes(
            1,
        );

        expect(
            createClientMock,
        ).toHaveBeenCalledWith(
            'https://test.supabase.co',
            'test-publishable-key',
            {
                auth: {
                    persistSession:
                        false,

                    autoRefreshToken:
                        false,

                    detectSessionInUrl:
                        false,
                },
            },
        );
    });

    it('should pass the access token to Supabase getUser', async () => {
        const service =
            createService();

        getUserMock
            .mockResolvedValue({
                data: {
                    user: {
                        id:
                            'user-1',
                        email:
                            'user@example.com',
                    },
                },
                error: null,
            });

        queryMock
            .mockResolvedValue([
                {
                    user_id:
                        'user-1',

                    display_name:
                        'Test User',

                    user_role:
                        'admin',

                    user_status:
                        'active',

                    tenant_id:
                        'tenant-1',

                    tenant_name:
                        'QUEEN',

                    schema_name:
                        'queen',

                    tenant_status:
                        'active',
                },
            ]);

        await service
            .authenticateAccessToken(
                'access-token-123',
            );

        expect(
            getUserMock,
        ).toHaveBeenCalledWith(
            'access-token-123',
        );
    });

    it('should reject when Supabase returns an authentication error', async () => {
        const service =
            createService();

        getUserMock
            .mockResolvedValue({
                data: {
                    user: null,
                },
                error: {
                    message:
                        'Invalid JWT',
                },
            });

        await expect(
            service.authenticateAccessToken(
                'invalid-token',
            ),
        ).rejects.toThrow(
            'Invalid or expired access token',
        );

        await expect(
            service.authenticateAccessToken(
                'invalid-token',
            ),
        ).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    it('should reject when Supabase does not return a user', async () => {
        const service =
            createService();

        getUserMock
            .mockResolvedValue({
                data: {
                    user: null,
                },
                error: null,
            });

        await expect(
            service.authenticateAccessToken(
                'token-without-user',
            ),
        ).rejects.toThrow(
            'Invalid or expired access token',
        );
    });

    it('should not query the database when the access token is invalid', async () => {
        const service =
            createService();

        getUserMock
            .mockResolvedValue({
                data: {
                    user: null,
                },
                error: {
                    message:
                        'Invalid token',
                },
            });

        await expect(
            service.authenticateAccessToken(
                'invalid-token',
            ),
        ).rejects.toThrow();

        expect(
            queryMock,
        ).not.toHaveBeenCalled();
    });

    it('should query the FlowShip profile using the Supabase user id', async () => {
        const service =
            createService();

        getUserMock
            .mockResolvedValue({
                data: {
                    user: {
                        id:
                            'supabase-user-123',

                        email:
                            'user@example.com',
                    },
                },
                error: null,
            });

        queryMock
            .mockResolvedValue([
                {
                    user_id:
                        'supabase-user-123',

                    display_name:
                        'Shoham',

                    user_role:
                        'admin',

                    user_status:
                        'active',

                    tenant_id:
                        'tenant-1',

                    tenant_name:
                        'QUEEN',

                    schema_name:
                        'queen',

                    tenant_status:
                        'active',
                },
            ]);

        await service
            .authenticateAccessToken(
                'valid-token',
            );

        expect(
            queryMock,
        ).toHaveBeenCalledTimes(
            1,
        );

        expect(
            queryMock,
        ).toHaveBeenCalledWith(
            expect.any(String),
            [
                'supabase-user-123',
            ],
        );

        const sql =
            queryMock.mock.calls[0][0];

        expect(sql).toContain(
            'from public.flowship_user_profiles',
        );

        expect(sql).toContain(
            'inner join public.flowship_tenants',
        );

        expect(sql).toContain(
            'where p.user_id = $1',
        );
    });

    it('should reject when FlowShip profile is not found', async () => {
        const service =
            createService();

        getUserMock
            .mockResolvedValue({
                data: {
                    user: {
                        id:
                            'user-without-profile',
                    },
                },
                error: null,
            });

        queryMock
            .mockResolvedValue([]);

        await expect(
            service.authenticateAccessToken(
                'valid-token',
            ),
        ).rejects.toThrow(
            'FlowShip profile was not found for this user',
        );

        await expect(
            service.authenticateAccessToken(
                'valid-token',
            ),
        ).rejects.toBeInstanceOf(
            UnauthorizedException,
        );
    });

    it('should reject when FlowShip user is disabled', async () => {
        const service =
            createService();

        getUserMock
            .mockResolvedValue({
                data: {
                    user: {
                        id:
                            'user-1',
                    },
                },
                error: null,
            });

        queryMock
            .mockResolvedValue([
                {
                    user_id:
                        'user-1',

                    display_name:
                        'Disabled User',

                    user_role:
                        'admin',

                    user_status:
                        'disabled',

                    tenant_id:
                        'tenant-1',

                    tenant_name:
                        'QUEEN',

                    schema_name:
                        'queen',

                    tenant_status:
                        'active',
                },
            ]);

        await expect(
            service.authenticateAccessToken(
                'valid-token',
            ),
        ).rejects.toThrow(
            'FlowShip user is disabled',
        );
    });

    it('should reject when FlowShip tenant is disabled', async () => {
        const service =
            createService();

        getUserMock
            .mockResolvedValue({
                data: {
                    user: {
                        id:
                            'user-1',
                    },
                },
                error: null,
            });

        queryMock
            .mockResolvedValue([
                {
                    user_id:
                        'user-1',

                    display_name:
                        'Test User',

                    user_role:
                        'admin',

                    user_status:
                        'active',

                    tenant_id:
                        'tenant-1',

                    tenant_name:
                        'QUEEN',

                    schema_name:
                        'queen',

                    tenant_status:
                        'disabled',
                },
            ]);

        await expect(
            service.authenticateAccessToken(
                'valid-token',
            ),
        ).rejects.toThrow(
            'FlowShip tenant is disabled',
        );
    });

    it('should return the mapped FlowShip user and tenant context', async () => {
        const service =
            createService();

        getUserMock
            .mockResolvedValue({
                data: {
                    user: {
                        id:
                            'user-1',

                        email:
                            undefined,
                    },
                },
                error: null,
            });

        queryMock
            .mockResolvedValue([
                {
                    user_id:
                        'user-1',

                    display_name:
                        'Shoham',

                    user_role:
                        'admin',

                    user_status:
                        'active',

                    tenant_id:
                        'tenant-1',

                    tenant_name:
                        'QUEEN',

                    schema_name:
                        'queen',

                    tenant_status:
                        'active',
                },
            ]);

        const result =
            await service
                .authenticateAccessToken(
                    'valid-token',
                );

        expect(result).toEqual({
            user: {
                id:
                    'user-1',

                email:
                    null,

                displayName:
                    'Shoham',

                role:
                    'admin',
            },

            tenant: {
                id:
                    'tenant-1',

                name:
                    'QUEEN',

                schemaName:
                    'queen',

                status:
                    'active',
            },
        });
    });
});