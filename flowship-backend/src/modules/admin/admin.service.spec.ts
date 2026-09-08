import { ConflictException } from '@nestjs/common';

import { AdminService } from './admin.service';

import { DbService } from '../../infrastructure/database/db.service';

describe('AdminService', () => {
    let service: AdminService;

    let dbMock: {
        query: jest.Mock;
    };

    const tenant = {
        id: 'tenant-1',
        name: 'QUEEN',
        schemaName: 'queen',
        status: 'active',
    };

    const providerRow = {
        id: 'provider-1',
        code: 'MOCK',
        name: 'Mock Carrier',
        adapter_key: 'mock',
        is_mock: true,
        is_active: true,
        priority_score: '0.85',
        created_at: new Date('2026-09-01T10:00:00.000Z'),
        updated_at: new Date('2026-09-02T10:00:00.000Z'),
    };

    const decisionSettingsRow = {
        id: 'settings-1',
        price_weight: '0.6',
        speed_weight: '0.3',
        provider_priority_weight: '0.1',
        is_active: true,
        created_at: new Date('2026-09-01T10:00:00.000Z'),
        updated_at: new Date('2026-09-02T10:00:00.000Z'),
    };

    const providerCallLogRow = {
        id: 'log-1',
        provider_id: 'provider-1',
        provider_code: 'MOCK',
        provider_name: 'Mock Carrier',
        action: 'quote',
        request: {
            city: 'Tel Aviv',
        },
        response: {
            price: 30,
        },
        status: 'success',
        response_time_ms: 125,
        error_message: null,
        created_at: new Date('2026-09-07T10:00:00.000Z'),
    };

    const criterionRow = {
        id: 'criterion-1',
        key: 'price',
        label: 'Price',
        description: 'Prefer cheaper shipping',
        weight: '0.6',
        is_active: true,
        created_at: new Date('2026-09-01T10:00:00.000Z'),
        updated_at: new Date('2026-09-02T10:00:00.000Z'),
    };

    const priorityCardRow = {
        id: 'card-1',

        provider_id: 'provider-1',
        provider_name: 'Mock Carrier',
        provider_code: 'MOCK',

        criterion_key: 'price',
        criterion_label: 'Price',
        criterion_description: 'Prefer cheaper shipping',

        title: 'Mock Carrier Price',
        priority_rank: 1,
        is_active: true,

        config: {
            multiplier: 2,
        },

        created_at: new Date('2026-09-01T10:00:00.000Z'),
        updated_at: new Date('2026-09-02T10:00:00.000Z'),
    };

    beforeEach(() => {
        dbMock = {
            query: jest.fn(),
        };

        service = new AdminService(
            dbMock as unknown as DbService,
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // =========================================================
    // getProviders
    // =========================================================

    describe('getProviders', () => {
        it('should query providers from the tenant schema', async () => {
            dbMock.query.mockResolvedValue([]);

            await service.getProviders(tenant);

            expect(
                dbMock.query,
            ).toHaveBeenCalledTimes(1);

            const sql =
                dbMock.query.mock.calls[0][0];

            expect(sql).toContain(
                '"queen".providers',
            );

            expect(sql).toContain(
                'order by created_at asc',
            );
        });

        it('should map provider DB fields to API fields and convert priorityScore to number', async () => {
            dbMock.query.mockResolvedValue([
                providerRow,
            ]);

            const result =
                await service.getProviders(
                    tenant,
                );

            expect(result).toEqual([
                {
                    id: 'provider-1',
                    code: 'MOCK',
                    name: 'Mock Carrier',
                    adapterKey: 'mock',
                    isMock: true,
                    isActive: true,
                    priorityScore: 0.85,
                    createdAt:
                        providerRow.created_at,
                    updatedAt:
                        providerRow.updated_at,
                },
            ]);

            expect(
                typeof result[0].priorityScore,
            ).toBe('number');
        });

        it('should reject invalid tenant schema before querying DB', async () => {
            const invalidTenant = {
                ...tenant,
                schemaName:
                    'queen; drop table providers;',
            };

            await expect(
                service.getProviders(
                    invalidTenant,
                ),
            ).rejects.toThrow(
                'Invalid schema name',
            );

            expect(
                dbMock.query,
            ).not.toHaveBeenCalled();
        });
    });

    // =========================================================
    // updateProvider
    // =========================================================

    describe('updateProvider', () => {
        it('should update provider using expected values', async () => {
            dbMock.query.mockResolvedValue([
                providerRow,
            ]);

            await service.updateProvider(
                tenant,
                'provider-1',
                {
                    isActive: false,
                    priorityScore: 0.7,
                },
            );

            expect(
                dbMock.query,
            ).toHaveBeenCalledWith(
                expect.stringContaining(
                    '"queen".providers',
                ),
                [
                    false,
                    0.7,
                    'provider-1',
                ],
            );
        });

        it('should use null for omitted provider update fields and map returned provider', async () => {
            dbMock.query.mockResolvedValue([
                providerRow,
            ]);

            const result =
                await service.updateProvider(
                    tenant,
                    'provider-1',
                    {},
                );

            expect(
                dbMock.query,
            ).toHaveBeenCalledWith(
                expect.any(String),
                [
                    null,
                    null,
                    'provider-1',
                ],
            );

            expect(result).toEqual({
                id: 'provider-1',
                code: 'MOCK',
                name: 'Mock Carrier',
                adapterKey: 'mock',
                isMock: true,
                isActive: true,
                priorityScore: 0.85,
                createdAt:
                    providerRow.created_at,
                updatedAt:
                    providerRow.updated_at,
            });
        });

        it('should return null when provider does not exist', async () => {
            dbMock.query.mockResolvedValue([]);

            const result =
                await service.updateProvider(
                    tenant,
                    'missing-provider',
                    {
                        isActive: true,
                    },
                );

            expect(result).toBeNull();
        });
    });

    // =========================================================
    // getDecisionSettings
    // =========================================================

    describe('getDecisionSettings', () => {
        it('should query only the latest active decision settings', async () => {
            dbMock.query.mockResolvedValue([]);

            await service.getDecisionSettings(
                tenant,
            );

            const sql =
                dbMock.query.mock.calls[0][0];

            expect(sql).toContain(
                '"queen".decision_settings',
            );

            expect(sql).toContain(
                'where is_active = true',
            );

            expect(sql).toContain(
                'order by created_at desc',
            );

            expect(sql).toContain(
                'limit 1',
            );
        });

        it('should map decision settings and convert weights to numbers', async () => {
            dbMock.query.mockResolvedValue([
                decisionSettingsRow,
            ]);

            const result =
                await service
                    .getDecisionSettings(
                        tenant,
                    );

            expect(result).toEqual({
                id: 'settings-1',

                priceWeight: 0.6,

                speedWeight: 0.3,

                providerPriorityWeight:
                    0.1,

                isActive: true,

                createdAt:
                    decisionSettingsRow
                        .created_at,

                updatedAt:
                    decisionSettingsRow
                        .updated_at,
            });
        });

        it('should return null when active decision settings do not exist', async () => {
            dbMock.query.mockResolvedValue([]);

            const result =
                await service
                    .getDecisionSettings(
                        tenant,
                    );

            expect(result).toBeNull();
        });
    });

    // =========================================================
    // updateDecisionSettings
    // =========================================================

    describe('updateDecisionSettings', () => {
        it('should update decision settings with supplied values', async () => {
            dbMock.query.mockResolvedValue([
                decisionSettingsRow,
            ]);

            await service.updateDecisionSettings(
                tenant,
                {
                    priceWeight: 0.5,
                    speedWeight: 0.4,
                    providerPriorityWeight:
                        0.1,
                },
            );

            expect(
                dbMock.query,
            ).toHaveBeenCalledWith(
                expect.stringContaining(
                    '"queen".decision_settings',
                ),
                [
                    0.5,
                    0.4,
                    0.1,
                ],
            );
        });

        it('should use null for omitted decision setting values and map result', async () => {
            dbMock.query.mockResolvedValue([
                decisionSettingsRow,
            ]);

            const result =
                await service
                    .updateDecisionSettings(
                        tenant,
                        {
                            speedWeight:
                                0.5,
                        },
                    );

            expect(
                dbMock.query,
            ).toHaveBeenCalledWith(
                expect.any(String),
                [
                    null,
                    0.5,
                    null,
                ],
            );

            expect(result).toEqual({
                id: 'settings-1',
                priceWeight: 0.6,
                speedWeight: 0.3,
                providerPriorityWeight:
                    0.1,
                isActive: true,
                createdAt:
                    decisionSettingsRow
                        .created_at,
                updatedAt:
                    decisionSettingsRow
                        .updated_at,
            });
        });

        it('should return null when no active decision settings row was updated', async () => {
            dbMock.query.mockResolvedValue([]);

            const result =
                await service
                    .updateDecisionSettings(
                        tenant,
                        {
                            priceWeight:
                                0.5,
                        },
                    );

            expect(result).toBeNull();
        });
    });

    // =========================================================
    // getProviderCallLogs
    // =========================================================

    describe('getProviderCallLogs', () => {
        it('should use default pagination when filters are omitted', async () => {
            dbMock.query
                .mockResolvedValueOnce([
                    {
                        total: '0',
                    },
                ])
                .mockResolvedValueOnce([]);

            const result =
                await service
                    .getProviderCallLogs(
                        tenant,
                    );

            expect(result.limit).toBe(10);
            expect(result.offset).toBe(0);

            expect(
                dbMock.query.mock.calls[0][1],
            ).toEqual([
                null,
                null,
                null,
                null,
                null,
                null,
            ]);

            expect(
                dbMock.query.mock.calls[1][1],
            ).toEqual([
                null,
                null,
                null,
                null,
                null,
                null,
                10,
                0,
            ]);
        });

        it('should pass all provider log filters to count and data queries', async () => {
            dbMock.query
                .mockResolvedValueOnce([
                    {
                        total: 1,
                    },
                ])
                .mockResolvedValueOnce([]);

            await service
                .getProviderCallLogs(
                    tenant,
                    {
                        status:
                            'failed',

                        providerCode:
                            'MOCK',

                        action:
                            'quote',

                        search:
                            ' timeout ',

                        fromDate:
                            '2026-09-01',

                        toDate:
                            '2026-09-07',

                        limit: 25,

                        offset: 50,
                    },
                );

            expect(
                dbMock.query.mock.calls[0][1],
            ).toEqual([
                'failed',
                'MOCK',
                'quote',
                'timeout',
                '2026-09-01',
                '2026-09-07',
            ]);

            expect(
                dbMock.query.mock.calls[1][1],
            ).toEqual([
                'failed',
                'MOCK',
                'quote',
                'timeout',
                '2026-09-01',
                '2026-09-07',
                25,
                50,
            ]);
        });

        it('should trim search and convert empty search to null', async () => {
            dbMock.query
                .mockResolvedValueOnce([
                    {
                        total: 0,
                    },
                ])
                .mockResolvedValueOnce([]);

            await service
                .getProviderCallLogs(
                    tenant,
                    {
                        search:
                            '     ',
                    },
                );

            expect(
                dbMock.query.mock.calls[0][1][3],
            ).toBeNull();
        });

        it('should fallback to safe pagination for invalid limit and offset', async () => {
            dbMock.query
                .mockResolvedValueOnce([
                    {
                        total: 0,
                    },
                ])
                .mockResolvedValueOnce([]);

            const result =
                await service
                    .getProviderCallLogs(
                        tenant,
                        {
                            limit: 500,
                            offset: -10,
                        },
                    );

            expect(result.limit).toBe(10);
            expect(result.offset).toBe(0);

            const dataParams =
                dbMock.query.mock.calls[1][1];

            expect(
                dataParams[6],
            ).toBe(10);

            expect(
                dataParams[7],
            ).toBe(0);
        });

        it('should map provider logs and convert total to number', async () => {
            dbMock.query
                .mockResolvedValueOnce([
                    {
                        total: '12',
                    },
                ])
                .mockResolvedValueOnce([
                    providerCallLogRow,
                ]);

            const result =
                await service
                    .getProviderCallLogs(
                        tenant,
                    );

            expect(result.total).toBe(12);

            expect(result.logs).toEqual([
                {
                    id: 'log-1',

                    providerId:
                        'provider-1',

                    providerCode:
                        'MOCK',

                    providerName:
                        'Mock Carrier',

                    action:
                        'quote',

                    status:
                        'success',

                    responseTimeMs:
                        125,

                    errorMessage:
                        null,

                    request: {
                        city:
                            'Tel Aviv',
                    },

                    response: {
                        price:
                            30,
                    },

                    createdAt:
                        providerCallLogRow
                            .created_at,
                },
            ]);
        });

        it('should use inclusive toDate logic through next-day boundary', async () => {
            dbMock.query
                .mockResolvedValueOnce([
                    {
                        total: 0,
                    },
                ])
                .mockResolvedValueOnce([]);

            await service
                .getProviderCallLogs(
                    tenant,
                    {
                        toDate:
                            '2026-09-07',
                    },
                );

            const countSql =
                dbMock.query.mock.calls[0][0];

            const logsSql =
                dbMock.query.mock.calls[1][0];

            expect(countSql).toContain(
                "$6::date + interval '1 day'",
            );

            expect(logsSql).toContain(
                "$6::date + interval '1 day'",
            );
        });
    });

    // =========================================================
    // Decision criteria
    // =========================================================

    describe('getDecisionCriteria', () => {
        it('should query criteria from tenant schema and map rows', async () => {
            dbMock.query.mockResolvedValue([
                criterionRow,
            ]);

            const result =
                await service
                    .getDecisionCriteria(
                        tenant,
                    );

            const sql =
                dbMock.query.mock.calls[0][0];

            expect(sql).toContain(
                '"queen".decision_criteria',
            );

            expect(result).toEqual([
                {
                    id: 'criterion-1',
                    key: 'price',
                    label: 'Price',
                    description:
                        'Prefer cheaper shipping',
                    weight: 0.6,
                    isActive: true,
                    createdAt:
                        criterionRow.created_at,
                    updatedAt:
                        criterionRow.updated_at,
                },
            ]);
        });

        it('should convert decision criterion weight to number', async () => {
            dbMock.query.mockResolvedValue([
                {
                    ...criterionRow,
                    weight: '0.75',
                },
            ]);

            const result =
                await service
                    .getDecisionCriteria(
                        tenant,
                    );

            expect(
                result[0].weight,
            ).toBe(0.75);

            expect(
                typeof result[0].weight,
            ).toBe('number');
        });
    });

    describe('updateDecisionCriterion', () => {
        it('should update criterion and map returned row', async () => {
            dbMock.query.mockResolvedValue([
                criterionRow,
            ]);

            const result =
                await service
                    .updateDecisionCriterion(
                        tenant,
                        'criterion-1',
                        {
                            weight: 0.8,
                            isActive: false,
                        } as any,
                    );

            expect(
                dbMock.query,
            ).toHaveBeenCalledWith(
                expect.stringContaining(
                    '"queen".decision_criteria',
                ),
                [
                    0.8,
                    false,
                    'criterion-1',
                ],
            );

            expect(result).toEqual({
                id: 'criterion-1',
                key: 'price',
                label: 'Price',

                description:
                    'Prefer cheaper shipping',

                weight: 0.6,

                isActive: true,

                createdAt:
                    criterionRow.created_at,

                updatedAt:
                    criterionRow.updated_at,
            });
        });

        it('should return null when criterion does not exist', async () => {
            dbMock.query.mockResolvedValue([]);

            const result =
                await service
                    .updateDecisionCriterion(
                        tenant,
                        'missing',
                        {
                            weight: 0.8,
                        } as any,
                    );

            expect(result).toBeNull();
        });
    });

    // =========================================================
    // Decision Priority Cards - get
    // =========================================================

    describe('getDecisionPriorityCards', () => {
        it('should map decision priority cards', async () => {
            dbMock.query.mockResolvedValue([
                priorityCardRow,
            ]);

            const result =
                await service
                    .getDecisionPriorityCards(
                        tenant,
                    );

            expect(result).toEqual([
                {
                    id:
                        'card-1',

                    providerId:
                        'provider-1',

                    providerName:
                        'Mock Carrier',

                    providerCode:
                        'MOCK',

                    criterionKey:
                        'price',

                    criterionLabel:
                        'Price',

                    criterionDescription:
                        'Prefer cheaper shipping',

                    title:
                        'Mock Carrier Price',

                    priorityRank:
                        1,

                    isActive:
                        true,

                    config: {
                        multiplier:
                            2,
                    },

                    createdAt:
                        priorityCardRow
                            .created_at,

                    updatedAt:
                        priorityCardRow
                            .updated_at,
                },
            ]);
        });

        it('should use ALL and generated title when provider and title are missing', async () => {
            dbMock.query.mockResolvedValue([
                {
                    ...priorityCardRow,

                    provider_id:
                        null,

                    provider_name:
                        null,

                    provider_code:
                        null,

                    title:
                        null,

                    config:
                        null,
                },
            ]);

            const result =
                await service
                    .getDecisionPriorityCards(
                        tenant,
                    );

            expect(
                result[0].providerName,
            ).toBe('ALL');

            expect(
                result[0].providerCode,
            ).toBe('ALL');

            expect(
                result[0].title,
            ).toBe(
                'ALL + Price',
            );

            expect(
                result[0].config,
            ).toEqual({});
        });

        it('should order priority cards by rank and creation date', async () => {
            dbMock.query.mockResolvedValue([]);

            await service
                .getDecisionPriorityCards(
                    tenant,
                );

            const sql =
                dbMock.query.mock.calls[0][0];

            expect(sql).toContain(
                'order by card.priority_rank asc, card.created_at asc',
            );
        });
    });

    // =========================================================
    // Decision Priority Cards - create
    // =========================================================

    describe('createDecisionPriorityCard', () => {
        it('should reject duplicate provider and criterion combination', async () => {
            dbMock.query.mockResolvedValueOnce([
                {
                    id: 'existing-card',
                },
            ]);

            await expect(
                service
                    .createDecisionPriorityCard(
                        tenant,
                        {
                            providerId:
                                'provider-1',

                            criterionKey:
                                'price',
                        } as any,
                    ),
            ).rejects.toBeInstanceOf(
                ConflictException,
            );

            expect(
                dbMock.query,
            ).toHaveBeenCalledTimes(1);
        });

        it('should check duplicate global card using null provider id', async () => {
            dbMock.query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([
                    {
                        max_rank: 0,
                    },
                ])
                .mockResolvedValueOnce([
                    {
                        id:
                            'card-new',
                    },
                ]);

            await service
                .createDecisionPriorityCard(
                    tenant,
                    {
                        criterionKey:
                            'price',
                    } as any,
                );

            expect(
                dbMock.query.mock.calls[0][1],
            ).toEqual([
                'price',
                null,
            ]);
        });

        it('should calculate next priority rank using current maximum rank', async () => {
            dbMock.query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([
                    {
                        max_rank:
                            '7',
                    },
                ])
                .mockResolvedValueOnce([
                    {
                        id:
                            'card-new',
                    },
                ]);

            await service
                .createDecisionPriorityCard(
                    tenant,
                    {
                        providerId:
                            'provider-1',

                        criterionKey:
                            'price',

                        title:
                            'Price card',

                        isActive:
                            true,

                        config: {
                            foo:
                                'bar',
                        },
                    } as any,
                );

            const insertParams =
                dbMock.query.mock.calls[2][1];

            expect(
                insertParams[3],
            ).toBe(8);
        });

        it('should insert new priority card with expected parameters and serialized config', async () => {
            dbMock.query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([
                    {
                        max_rank:
                            2,
                    },
                ])
                .mockResolvedValueOnce([
                    {
                        id:
                            'card-new',
                    },
                ]);

            await service
                .createDecisionPriorityCard(
                    tenant,
                    {
                        providerId:
                            'provider-1',

                        criterionKey:
                            'speed',

                        title:
                            'Fast carrier',

                        isActive:
                            false,

                        config: {
                            multiplier:
                                1.5,
                        },
                    } as any,
                );

            expect(
                dbMock.query.mock.calls[2][1],
            ).toEqual([
                'provider-1',
                'speed',
                'Fast carrier',
                3,
                false,
                JSON.stringify({
                    multiplier:
                        1.5,
                }),
            ]);
        });

        it('should return the newly created priority card row', async () => {
            const createdRow = {
                id:
                    'card-created',

                criterion_key:
                    'price',
            };

            dbMock.query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([
                    {
                        max_rank:
                            0,
                    },
                ])
                .mockResolvedValueOnce([
                    createdRow,
                ]);

            const result =
                await service
                    .createDecisionPriorityCard(
                        tenant,
                        {
                            criterionKey:
                                'price',
                        } as any,
                    );

            expect(result).toBe(
                createdRow,
            );
        });
    });

    // =========================================================
    // Decision Priority Cards - update
    // =========================================================

    describe('updateDecisionPriorityCard', () => {
        it('should update priority card with expected values and JSON config', async () => {
            const updatedRow = {
                id:
                    'card-1',
            };

            dbMock.query.mockResolvedValue([
                updatedRow,
            ]);

            const result =
                await service
                    .updateDecisionPriorityCard(
                        tenant,
                        'card-1',
                        {
                            providerId:
                                'provider-2',

                            criterionKey:
                                'speed',

                            title:
                                'Updated card',

                            priorityRank:
                                4,

                            isActive:
                                false,

                            config: {
                                test:
                                    true,
                            },
                        } as any,
                    );

            expect(
                dbMock.query,
            ).toHaveBeenCalledWith(
                expect.stringContaining(
                    '"queen".decision_priority_cards',
                ),
                [
                    'provider-2',
                    'speed',
                    'Updated card',
                    4,
                    false,
                    JSON.stringify({
                        test:
                            true,
                    }),
                    'card-1',
                ],
            );

            expect(result).toBe(
                updatedRow,
            );
        });

        it('should return null when priority card does not exist', async () => {
            dbMock.query.mockResolvedValue([]);

            const result =
                await service
                    .updateDecisionPriorityCard(
                        tenant,
                        'missing-card',
                        {} as any,
                    );

            expect(result).toBeNull();
        });
    });

    // =========================================================
    // Decision Priority Cards - reorder
    // =========================================================

    describe('reorderDecisionPriorityCards', () => {
        it('should update each card priority rank and return refreshed cards', async () => {
            dbMock.query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([
                    priorityCardRow,
                ]);

            const result =
                await service
                    .reorderDecisionPriorityCards(
                        tenant,
                        {
                            cards: [
                                {
                                    id:
                                        'card-a',

                                    priorityRank:
                                        1,
                                },

                                {
                                    id:
                                        'card-b',

                                    priorityRank:
                                        2,
                                },
                            ],
                        } as any,
                    );

            expect(
                dbMock.query,
            ).toHaveBeenNthCalledWith(
                1,
                expect.stringContaining(
                    '"queen".decision_priority_cards',
                ),
                [
                    1,
                    'card-a',
                ],
            );

            expect(
                dbMock.query,
            ).toHaveBeenNthCalledWith(
                2,
                expect.stringContaining(
                    '"queen".decision_priority_cards',
                ),
                [
                    2,
                    'card-b',
                ],
            );

            expect(
                dbMock.query,
            ).toHaveBeenCalledTimes(3);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(
                'card-1',
            );
        });

        it('should perform no update queries for empty cards array and still return current cards', async () => {
            dbMock.query.mockResolvedValueOnce([
                priorityCardRow,
            ]);

            const result =
                await service
                    .reorderDecisionPriorityCards(
                        tenant,
                        {
                            cards: [],
                        } as any,
                    );

            expect(
                dbMock.query,
            ).toHaveBeenCalledTimes(1);

            const sql =
                dbMock.query.mock.calls[0][0];

            expect(sql).toContain(
                'select',
            );

            expect(result).toHaveLength(1);
        });
    });

    // =========================================================
    // Decision Priority Cards - delete
    // =========================================================

    describe('deleteDecisionPriorityCard', () => {
        it('should delete priority card by id and return deleted row', async () => {
            const deletedRow = {
                id:
                    'card-1',
            };

            dbMock.query.mockResolvedValue([
                deletedRow,
            ]);

            const result =
                await service
                    .deleteDecisionPriorityCard(
                        tenant,
                        'card-1',
                    );

            expect(
                dbMock.query,
            ).toHaveBeenCalledWith(
                expect.stringContaining(
                    'delete from "queen".decision_priority_cards',
                ),
                [
                    'card-1',
                ],
            );

            expect(result).toBe(
                deletedRow,
            );
        });

        it('should return null when priority card does not exist', async () => {
            dbMock.query.mockResolvedValue([]);

            const result =
                await service
                    .deleteDecisionPriorityCard(
                        tenant,
                        'missing-card',
                    );

            expect(result).toBeNull();
        });
    });
});