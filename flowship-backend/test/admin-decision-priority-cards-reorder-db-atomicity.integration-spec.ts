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
    'Admin Decision Priority Cards Reorder DB Atomicity Integration',
    () => {
        let moduleRef:
            TestingModule;

        let db:
            DbService;

        let config:
            ConfigService;

        let tenantsService:
            TenantsService;

        let adminService:
            AdminService;

        let tenant:
            CurrentTenant;


        const CARD_1_ID =
            '31111111-1111-4111-8111-111111111111';

        const CARD_2_ID =
            '32222222-2222-4222-8222-222222222222';

        const CARD_3_ID =
            '33333333-3333-4333-8333-333333333333';


        const CARD_IDS = [
            CARD_1_ID,
            CARD_2_ID,
            CARD_3_ID,
        ];


        function qSchema(
            schemaName: string,
        ): string {
            if (
                !/^[a-zA-Z_][a-zA-Z0-9_]*$/
                    .test(
                        schemaName,
                    )
            ) {
                throw new Error(
                    `Invalid schema name: ${schemaName}`,
                );
            }

            return `"${schemaName}"`;
        }


        async function ensureCriteria() {
            const schema =
                qSchema(
                    tenant.schemaName,
                );

            const criteria = [
                'price',
                'speed',
                'provider_priority',
            ];

            for (
                const key of criteria
            ) {
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
                        1,
                        true
                    )
                    on conflict (key)
                    do nothing
                    `,
                    [
                        key,
                        key,
                        'Integration atomicity criterion',
                    ],
                );
            }
        }


        async function cleanupCards() {
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
                    CARD_IDS,
                ],
            );
        }


        async function seedCards() {
            const schema =
                qSchema(
                    tenant.schemaName,
                );

            await cleanupCards();

            await db.query(
                `
                insert into ${schema}.decision_priority_cards (
                    id,
                    provider_id,
                    criterion_key,
                    title,
                    priority_rank,
                    is_active,
                    config
                )
                values
                    (
                        $1,
                        null,
                        'price',
                        'INTEGRATION ATOMICITY CARD 1',
                        1,
                        true,
                        '{}'::jsonb
                    ),
                    (
                        $2,
                        null,
                        'speed',
                        'INTEGRATION ATOMICITY CARD 2',
                        2,
                        true,
                        '{}'::jsonb
                    ),
                    (
                        $3,
                        null,
                        'provider_priority',
                        'INTEGRATION ATOMICITY CARD 3',
                        3,
                        true,
                        '{}'::jsonb
                    )
                `,
                [
                    CARD_1_ID,
                    CARD_2_ID,
                    CARD_3_ID,
                ],
            );
        }


        async function getRanks() {
            const schema =
                qSchema(
                    tenant.schemaName,
                );

            const rows =
                await db.query<{
                    id: string;
                    priority_rank: number;
                }>(
                    `
                    select
                        id,
                        priority_rank
                    from ${schema}.decision_priority_cards
                    where id = any($1::uuid[])
                    order by id
                    `,
                    [
                        CARD_IDS,
                    ],
                );

            return new Map(
                rows.map(
                    (row) => [
                        row.id,
                        Number(
                            row.priority_rank,
                        ),
                    ],
                ),
            );
        }


        function expectOriginalRanks(
            ranks: Map<
                string,
                number
            >,
        ) {
            expect(
                ranks.get(
                    CARD_1_ID,
                ),
            ).toBe(
                1,
            );

            expect(
                ranks.get(
                    CARD_2_ID,
                ),
            ).toBe(
                2,
            );

            expect(
                ranks.get(
                    CARD_3_ID,
                ),
            ).toBe(
                3,
            );
        }


        beforeAll(
            async () => {
                moduleRef =
                    await Test
                        .createTestingModule({
                            imports: [
                                ConfigModule
                                    .forRoot({
                                        isGlobal:
                                            true,
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


                const apiKey =
                    config.get<string>(
                        'TEST_FLOW_SHIP_A_API_KEY',
                    );

                if (!apiKey) {
                    throw new Error(
                        'Missing TEST_FLOW_SHIP_A_API_KEY',
                    );
                }


                tenant =
                    await tenantsService
                        .findByApiKey(
                            apiKey,
                        );


                await ensureCriteria();

                await cleanupCards();
            },
            30000,
        );


        beforeEach(
            async () => {
                await seedCards();
            },
        );


        afterAll(
            async () => {
                if (tenant) {
                    await cleanupCards();
                }

                if (moduleRef) {
                    await moduleRef.close();
                }
            },
            30000,
        );


        /*
         * ============================================================
         * TEST 1
         *
         * Normal successful reorder.
         * ============================================================
         */
        it(
            'should persist all priority ranks when reorder succeeds',
            async () => {
                await adminService
                    .reorderDecisionPriorityCards(
                        tenant,
                        {
                            cards: [
                                {
                                    id:
                                        CARD_1_ID,

                                    priorityRank:
                                        30,
                                },
                                {
                                    id:
                                        CARD_2_ID,

                                    priorityRank:
                                        20,
                                },
                                {
                                    id:
                                        CARD_3_ID,

                                    priorityRank:
                                        10,
                                },
                            ],
                        },
                    );


                const ranks =
                    await getRanks();


                expect(
                    ranks.get(
                        CARD_1_ID,
                    ),
                ).toBe(
                    30,
                );

                expect(
                    ranks.get(
                        CARD_2_ID,
                    ),
                ).toBe(
                    20,
                );

                expect(
                    ranks.get(
                        CARD_3_ID,
                    ),
                ).toBe(
                    10,
                );
            },
        );


        /*
         * ============================================================
         * TEST 2
         *
         * First UPDATE succeeds.
         * Second UPDATE contains an invalid UUID and fails.
         *
         * The first UPDATE must be rolled back.
         * ============================================================
         */
        it(
            'should rollback the first update when a later reorder update fails',
            async () => {
                await expect(
                    adminService
                        .reorderDecisionPriorityCards(
                            tenant,
                            {
                                cards: [
                                    {
                                        id:
                                            CARD_1_ID,

                                        priorityRank:
                                            99,
                                    },
                                    {
                                        id:
                                            'not-a-valid-uuid',

                                        priorityRank:
                                            98,
                                    },
                                ],
                            },
                        ),
                ).rejects.toThrow();


                const ranks =
                    await getRanks();


                expectOriginalRanks(
                    ranks,
                );
            },
        );


        /*
         * ============================================================
         * TEST 3
         *
         * Two successful writes followed by DB failure.
         * Both successful writes must be rolled back.
         * ============================================================
         */
        it(
            'should rollback all earlier updates when the third reorder update fails',
            async () => {
                await expect(
                    adminService
                        .reorderDecisionPriorityCards(
                            tenant,
                            {
                                cards: [
                                    {
                                        id:
                                            CARD_1_ID,

                                        priorityRank:
                                            50,
                                    },
                                    {
                                        id:
                                            CARD_2_ID,

                                        priorityRank:
                                            51,
                                    },
                                    {
                                        id:
                                            'still-not-a-valid-uuid',

                                        priorityRank:
                                            52,
                                    },
                                ],
                            },
                        ),
                ).rejects.toThrow();


                const ranks =
                    await getRanks();


                expectOriginalRanks(
                    ranks,
                );
            },
        );


        /*
         * ============================================================
         * TEST 4
         *
         * Failed reorder must not poison the next attempt.
         *
         * 1. Reorder fails.
         * 2. Verify original state.
         * 3. Retry with valid data.
         * 4. Verify complete successful state.
         * ============================================================
         */
        it(
            'should keep original state after failure and allow a clean retry',
            async () => {
                await expect(
                    adminService
                        .reorderDecisionPriorityCards(
                            tenant,
                            {
                                cards: [
                                    {
                                        id:
                                            CARD_1_ID,

                                        priorityRank:
                                            100,
                                    },
                                    {
                                        id:
                                            'invalid-uuid-for-retry-test',

                                        priorityRank:
                                            101,
                                    },
                                ],
                            },
                        ),
                ).rejects.toThrow();


                const afterFailure =
                    await getRanks();


                expectOriginalRanks(
                    afterFailure,
                );


                await adminService
                    .reorderDecisionPriorityCards(
                        tenant,
                        {
                            cards: [
                                {
                                    id:
                                        CARD_1_ID,

                                    priorityRank:
                                        13,
                                },
                                {
                                    id:
                                        CARD_2_ID,

                                    priorityRank:
                                        12,
                                },
                                {
                                    id:
                                        CARD_3_ID,

                                    priorityRank:
                                        11,
                                },
                            ],
                        },
                    );


                const afterRetry =
                    await getRanks();


                expect(
                    afterRetry.get(
                        CARD_1_ID,
                    ),
                ).toBe(
                    13,
                );

                expect(
                    afterRetry.get(
                        CARD_2_ID,
                    ),
                ).toBe(
                    12,
                );

                expect(
                    afterRetry.get(
                        CARD_3_ID,
                    ),
                ).toBe(
                    11,
                );
            },
        );
    },
);