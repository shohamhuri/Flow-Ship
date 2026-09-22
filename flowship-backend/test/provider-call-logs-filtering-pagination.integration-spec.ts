import {
    ConfigModule,
    ConfigService,
} from '@nestjs/config';

import {
    Test,
    TestingModule,
} from '@nestjs/testing';

import {
    DbService,
} from '../src/infrastructure/database/db.service';

import {
    TenantsService,
    CurrentTenant,
} from '../src/modules/tenants/tenants.service';

import {
    AdminService,
} from '../src/modules/admin/admin.service';


describe(
    'Provider Call Logs Filtering & Pagination Integration',
    () => {
        let moduleRef: TestingModule;

        let db: DbService;
        let config: ConfigService;
        let tenantsService: TenantsService;
        let adminService: AdminService;

        let tenantA: CurrentTenant;
        let tenantB: CurrentTenant;


        const PROVIDER_A_ID =
            '41111111-1111-4111-8111-111111111111';

        const PROVIDER_B_ID =
            '42222222-2222-4222-8222-222222222222';


        const PROVIDER_A_CODE =
            'integration_logs_provider_a';

        const PROVIDER_B_CODE =
            'integration_logs_provider_b';


        const PROVIDER_A_NAME =
            'Integration Logs Provider Alpha';

        const PROVIDER_B_NAME =
            'Integration Logs Provider Beta';


        const LOG_A_1 =
            '51111111-1111-4111-8111-111111111111';

        const LOG_A_2 =
            '52222222-2222-4222-8222-222222222222';

        const LOG_A_3 =
            '53333333-3333-4333-8333-333333333333';

        const LOG_A_4 =
            '54444444-4444-4444-8444-444444444444';

        const LOG_A_5 =
            '55555555-5555-4555-8555-555555555555';

        const LOG_B_1 =
            '56666666-6666-4666-8666-666666666666';


        const LOG_IDS_A = [
            LOG_A_1,
            LOG_A_2,
            LOG_A_3,
            LOG_A_4,
            LOG_A_5,
        ];

        const LOG_IDS_B = [
            LOG_B_1,
        ];


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


        async function cleanupLogs(
            tenant: CurrentTenant,
            ids: string[],
        ) {
            const schema =
                qSchema(
                    tenant.schemaName,
                );

            await db.query(
                `
                delete from ${schema}.provider_call_logs
                where id = any($1::uuid[])
                `,
                [
                    ids,
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
    delete from ${schema}.provider_call_logs
    where provider_id = $1
    `,
                [
                    providerId,
                ],
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


        async function seedProvider(
            tenant: CurrentTenant,
            providerId: string,
            code: string,
            name: string,
        ) {
            const schema =
                qSchema(
                    tenant.schemaName,
                );

            await cleanupProvider(
                tenant,
                providerId,
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
                    'mock',
                    true,
                    true,
                    0.5
                )
                `,
                [
                    providerId,
                    code,
                    name,
                ],
            );
        }


        async function seedTenantALogs() {
            const schema =
                qSchema(
                    tenantA.schemaName,
                );

            await cleanupLogs(
                tenantA,
                LOG_IDS_A,
            );

            await db.query(
                `
                insert into ${schema}.provider_call_logs (
                    id,
                    provider_id,
                    action,
                    request,
                    response,
                    status,
                    response_time_ms,
                    error_message,
                    created_at
                )
                values
                    (
                        $1,
                        $6,
                        'quote',
                        '{"integration":true,"case":1}'::jsonb,
                        '{"ok":true}'::jsonb,
                        'success',
                        101,
                        null,
                        '2026-09-10T08:00:00Z'
                    ),
                    (
                        $2,
                        $6,
                        'create_shipment',
                        '{"integration":true,"case":2}'::jsonb,
                        '{"ok":false}'::jsonb,
                        'error',
                        202,
                        'INTEGRATION carrier timeout alpha',
                        '2026-09-11T09:00:00Z'
                    ),
                    (
                        $3,
                        $6,
                        'quote',
                        '{"integration":true,"case":3}'::jsonb,
                        '{"ok":true}'::jsonb,
                        'success',
                        303,
                        null,
                        '2026-09-12T10:00:00Z'
                    ),
                    (
                        $4,
                        $6,
                        'cancel_shipment',
                        '{"integration":true,"case":4}'::jsonb,
                        '{"ok":false}'::jsonb,
                        'error',
                        404,
                        'INTEGRATION cancellation rejected',
                        '2026-09-12T23:30:00Z'
                    ),
                    (
                        $5,
                        $6,
                        'track_shipment',
                        '{"integration":true,"case":5}'::jsonb,
                        '{"ok":true}'::jsonb,
                        'success',
                        505,
                        null,
                        '2026-09-13T11:00:00Z'
                    )
                `,
                [
                    LOG_A_1,
                    LOG_A_2,
                    LOG_A_3,
                    LOG_A_4,
                    LOG_A_5,
                    PROVIDER_A_ID,
                ],
            );
        }


        async function seedTenantBLogs() {
            const schema =
                qSchema(
                    tenantB.schemaName,
                );

            await cleanupLogs(
                tenantB,
                LOG_IDS_B,
            );

            await db.query(
                `
                insert into ${schema}.provider_call_logs (
                    id,
                    provider_id,
                    action,
                    request,
                    response,
                    status,
                    response_time_ms,
                    error_message,
                    created_at
                )
                values (
                    $1,
                    $2,
                    'quote',
                    '{"integration":true,"tenant":"B"}'::jsonb,
                    '{"ok":true}'::jsonb,
                    'success',
                    777,
                    'INTEGRATION TENANT B ONLY',
                    '2026-09-14T12:00:00Z'
                )
                `,
                [
                    LOG_B_1,
                    PROVIDER_B_ID,
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
                            ],

                            providers: [
                                DbService,
                                ConfigService,
                                TenantsService,
                                AdminService,
                            ],
                        })
                        .compile();


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

                adminService =
                    moduleRef.get(
                        AdminService,
                    );


                const apiKeyA =
                    config.get<string>(
                        'TEST_FLOW_SHIP_A_API_KEY',
                    );

                const apiKeyB =
                    config.get<string>(
                        'TEST_FLOW_SHIP_B_API_KEY',
                    );


                if (
                    !apiKeyA ||
                    !apiKeyB
                ) {
                    throw new Error(
                        'Missing integration tenant API keys',
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


                await cleanupLogs(
                    tenantA,
                    LOG_IDS_A,
                );

                await cleanupLogs(
                    tenantB,
                    LOG_IDS_B,
                );


                await seedProvider(
                    tenantA,
                    PROVIDER_A_ID,
                    PROVIDER_A_CODE,
                    PROVIDER_A_NAME,
                );

                await seedProvider(
                    tenantB,
                    PROVIDER_B_ID,
                    PROVIDER_B_CODE,
                    PROVIDER_B_NAME,
                );


                await seedTenantALogs();
                await seedTenantBLogs();
            },
            30000,
        );


        afterAll(
            async () => {
                if (tenantA) {
                    await cleanupLogs(
                        tenantA,
                        LOG_IDS_A,
                    );

                    await cleanupProvider(
                        tenantA,
                        PROVIDER_A_ID,
                    );
                }

                if (tenantB) {
                    await cleanupLogs(
                        tenantB,
                        LOG_IDS_B,
                    );

                    await cleanupProvider(
                        tenantB,
                        PROVIDER_B_ID,
                    );
                }

                if (moduleRef) {
                    await moduleRef.close();
                }
            },
            30000,
        );


        it(
            'should return logs ordered by createdAt descending',
            async () => {
                const result =
                    await adminService
                        .getProviderCallLogs(
                            tenantA,
                            {
                                providerCode:
                                    PROVIDER_A_CODE,

                                limit:
                                    10,
                            },
                        );


                expect(
                    result.total,
                ).toBe(
                    5,
                );

                expect(
                    result.logs.map(
                        (log) =>
                            log.id,
                    ),
                ).toEqual([
                    LOG_A_5,
                    LOG_A_4,
                    LOG_A_3,
                    LOG_A_2,
                    LOG_A_1,
                ]);
            },
        );


        it(
            'should filter logs by status',
            async () => {
                const result =
                    await adminService
                        .getProviderCallLogs(
                            tenantA,
                            {
                                providerCode:
                                    PROVIDER_A_CODE,

                                status:
                                    'error',
                            },
                        );


                expect(
                    result.total,
                ).toBe(
                    2,
                );

                expect(
                    result.logs.map(
                        (log) =>
                            log.id,
                    ),
                ).toEqual([
                    LOG_A_4,
                    LOG_A_2,
                ]);
            },
        );


        it(
            'should filter logs by providerCode',
            async () => {
                const result =
                    await adminService
                        .getProviderCallLogs(
                            tenantA,
                            {
                                providerCode:
                                    PROVIDER_A_CODE,
                            },
                        );


                expect(
                    result.total,
                ).toBe(
                    5,
                );

                expect(
                    result.logs.every(
                        (log) =>
                            log.providerCode ===
                            PROVIDER_A_CODE,
                    ),
                ).toBe(
                    true,
                );
            },
        );


        it(
            'should filter logs by action',
            async () => {
                const result =
                    await adminService
                        .getProviderCallLogs(
                            tenantA,
                            {
                                providerCode:
                                    PROVIDER_A_CODE,

                                action:
                                    'quote',
                            },
                        );


                expect(
                    result.total,
                ).toBe(
                    2,
                );

                expect(
                    result.logs.map(
                        (log) =>
                            log.id,
                    ),
                ).toEqual([
                    LOG_A_3,
                    LOG_A_1,
                ]);
            },
        );


        it(
            'should search logs by provider name',
            async () => {
                const result =
                    await adminService
                        .getProviderCallLogs(
                            tenantA,
                            {
                                providerCode:
                                    PROVIDER_A_CODE,

                                search:
                                    'Provider Alpha',
                            },
                        );


                expect(
                    result.total,
                ).toBe(
                    5,
                );
            },
        );


        it(
            'should search logs by error message',
            async () => {
                const result =
                    await adminService
                        .getProviderCallLogs(
                            tenantA,
                            {
                                providerCode:
                                    PROVIDER_A_CODE,

                                search:
                                    'carrier timeout',
                            },
                        );


                expect(
                    result.total,
                ).toBe(
                    1,
                );

                expect(
                    result.logs[0].id,
                ).toBe(
                    LOG_A_2,
                );
            },
        );


        it(
            'should filter logs from fromDate inclusively',
            async () => {
                const result =
                    await adminService
                        .getProviderCallLogs(
                            tenantA,
                            {
                                providerCode:
                                    PROVIDER_A_CODE,

                                fromDate:
                                    '2026-09-12',
                            },
                        );


                expect(
                    result.total,
                ).toBe(
                    3,
                );

                expect(
                    result.logs.map(
                        (log) =>
                            log.id,
                    ),
                ).toEqual([
                    LOG_A_5,
                    LOG_A_4,
                    LOG_A_3,
                ]);
            },
        );


        it(
            'should include the entire toDate day',
            async () => {
                const result =
                    await adminService
                        .getProviderCallLogs(
                            tenantA,
                            {
                                providerCode:
                                    PROVIDER_A_CODE,

                                fromDate:
                                    '2026-09-12',

                                toDate:
                                    '2026-09-12',
                            },
                        );


                expect(
                    result.total,
                ).toBe(
                    2,
                );

                expect(
                    result.logs.map(
                        (log) =>
                            log.id,
                    ),
                ).toEqual([
                    LOG_A_4,
                    LOG_A_3,
                ]);
            },
        );


        it(
            'should combine multiple filters',
            async () => {
                const result =
                    await adminService
                        .getProviderCallLogs(
                            tenantA,
                            {
                                providerCode:
                                    PROVIDER_A_CODE,

                                status:
                                    'error',

                                action:
                                    'cancel_shipment',

                                search:
                                    'cancellation',

                                fromDate:
                                    '2026-09-12',

                                toDate:
                                    '2026-09-12',
                            },
                        );


                expect(
                    result.total,
                ).toBe(
                    1,
                );

                expect(
                    result.logs,
                ).toHaveLength(
                    1,
                );

                expect(
                    result.logs[0].id,
                ).toBe(
                    LOG_A_4,
                );
            },
        );


        it(
            'should paginate with limit and offset while preserving total',
            async () => {
                const firstPage =
                    await adminService
                        .getProviderCallLogs(
                            tenantA,
                            {
                                providerCode:
                                    PROVIDER_A_CODE,

                                limit:
                                    2,

                                offset:
                                    0,
                            },
                        );


                expect(
                    firstPage.total,
                ).toBe(
                    5,
                );

                expect(
                    firstPage.limit,
                ).toBe(
                    2,
                );

                expect(
                    firstPage.offset,
                ).toBe(
                    0,
                );

                expect(
                    firstPage.logs.map(
                        (log) =>
                            log.id,
                    ),
                ).toEqual([
                    LOG_A_5,
                    LOG_A_4,
                ]);


                const secondPage =
                    await adminService
                        .getProviderCallLogs(
                            tenantA,
                            {
                                providerCode:
                                    PROVIDER_A_CODE,

                                limit:
                                    2,

                                offset:
                                    2,
                            },
                        );


                expect(
                    secondPage.total,
                ).toBe(
                    5,
                );

                expect(
                    secondPage.logs.map(
                        (log) =>
                            log.id,
                    ),
                ).toEqual([
                    LOG_A_3,
                    LOG_A_2,
                ]);
            },
        );


        it(
            'should use default pagination for invalid limit and offset',
            async () => {
                const result =
                    await adminService
                        .getProviderCallLogs(
                            tenantA,
                            {
                                providerCode:
                                    PROVIDER_A_CODE,

                                limit:
                                    999,

                                offset:
                                    -10,
                            },
                        );


                expect(
                    result.limit,
                ).toBe(
                    10,
                );

                expect(
                    result.offset,
                ).toBe(
                    0,
                );

                expect(
                    result.total,
                ).toBe(
                    5,
                );

                expect(
                    result.logs,
                ).toHaveLength(
                    5,
                );
            },
        );


        it(
            'should isolate provider call logs between tenants',
            async () => {
                const resultA =
                    await adminService
                        .getProviderCallLogs(
                            tenantA,
                            {
                                search:
                                    'TENANT B ONLY',
                            },
                        );


                expect(
                    resultA.total,
                ).toBe(
                    0,
                );

                expect(
                    resultA.logs,
                ).toHaveLength(
                    0,
                );


                const resultB =
                    await adminService
                        .getProviderCallLogs(
                            tenantB,
                            {
                                search:
                                    'TENANT B ONLY',
                            },
                        );


                expect(
                    resultB.total,
                ).toBe(
                    1,
                );

                expect(
                    resultB.logs,
                ).toHaveLength(
                    1,
                );

                expect(
                    resultB.logs[0].id,
                ).toBe(
                    LOG_B_1,
                );

                expect(
                    resultB.logs[0]
                        .providerCode,
                ).toBe(
                    PROVIDER_B_CODE,
                );
            },
        );
    },
);