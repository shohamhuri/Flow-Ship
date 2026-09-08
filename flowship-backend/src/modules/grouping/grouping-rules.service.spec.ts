import {
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals';

import { Test } from '@nestjs/testing';

import {
    CurrentTenant,
} from '../tenants/tenants.service';

import {
    GroupingRulesService,
} from './grouping-rules.service';

import {
    GroupingStrategySettingsRepository,
} from './grouping-strategy-settings.repository';

import {
    GroupingStrategySetting,
} from './interfaces/grouping-strategy-setting.interface';

describe('GroupingRulesService', () => {
    let service: GroupingRulesService;


    let repositoryMock: {
        findActiveStrategies: jest.MockedFunction<
            GroupingStrategySettingsRepository['findActiveStrategies']
        >;

        findAllStrategies: jest.MockedFunction<
            GroupingStrategySettingsRepository['findAllStrategies']
        >;

        updateStrategy: jest.MockedFunction<
            GroupingStrategySettingsRepository['updateStrategy']
        >;

        reorderStrategies: jest.MockedFunction<
            GroupingStrategySettingsRepository['reorderStrategies']
        >;
    };
    const tenant: CurrentTenant = {
        id: 'tenant-1',
        name: 'FLOW_SHIP_TEST',
        schemaName: 'flow_ship_test',
        status: 'active',
    };

    const createStrategy = (
        overrides: Partial<GroupingStrategySetting> = {},
    ): GroupingStrategySetting => {
        return {
            id: 'strategy-1',
            strategyKey: 'group_by_source',
            displayName: 'Group by source',
            isEnabled: true,
            executionOrder: 1,
            conflictPriority: 1,
            config: {},
            createdAt: new Date(
                '2026-08-01T00:00:00.000Z',
            ),
            updatedAt: new Date(
                '2026-08-01T00:00:00.000Z',
            ),
            ...overrides,
        };
    };

    beforeEach(async () => {
        repositoryMock = {
            findActiveStrategies: jest.fn(),
            findAllStrategies: jest.fn(),
            updateStrategy: jest.fn(),
            reorderStrategies: jest.fn(),
        };

        const moduleRef =
            await Test.createTestingModule({
                providers: [
                    GroupingRulesService,
                    {
                        provide:
                            GroupingStrategySettingsRepository,
                        useValue: repositoryMock,
                    },
                ],
            }).compile();

        service =
            moduleRef.get(GroupingRulesService);
    });

    describe('getHandlingGroup', () => {
        it(
            'should return standard when category is missing',
            () => {
                expect(
                    service.getHandlingGroup(),
                ).toBe('standard');
            },
        );

        it(
            'should return standard for a regular category',
            () => {
                expect(
                    service.getHandlingGroup(
                        'fashion',
                    ),
                ).toBe('standard');
            },
        );

        it.each([
            'frozen',
            'refrigerated',
            'cold',
        ])(
            'should return cold-chain for %s',
            (category) => {
                expect(
                    service.getHandlingGroup(
                        category,
                    ),
                ).toBe('cold-chain');
            },
        );

        it.each([
            'hazardous',
            'dangerous-goods',
        ])(
            'should return hazardous for %s',
            (category) => {
                expect(
                    service.getHandlingGroup(
                        category,
                    ),
                ).toBe('hazardous');
            },
        );

        it(
            'should return fragile for fragile category',
            () => {
                expect(
                    service.getHandlingGroup(
                        'fragile',
                    ),
                ).toBe('fragile');
            },
        );

        it(
            'should normalize spaces and uppercase letters',
            () => {
                expect(
                    service.getHandlingGroup(
                        '  FROZEN  ',
                    ),
                ).toBe('cold-chain');
            },
        );

        it(
            'should return standard for an unknown category',
            () => {
                expect(
                    service.getHandlingGroup(
                        'electronics',
                    ),
                ).toBe('standard');
            },
        );
    });

    describe('getActiveStrategies', () => {
        it(
            'should return active strategies from repository',
            async () => {
                const strategies:
                    GroupingStrategySetting[] = [
                        createStrategy(),
                    ];

                repositoryMock
                    .findActiveStrategies
                    .mockResolvedValue(
                        strategies,
                    );

                const result =
                    await service
                        .getActiveStrategies(
                            tenant,
                        );

                expect(
                    repositoryMock
                        .findActiveStrategies,
                ).toHaveBeenCalledWith(
                    tenant,
                );

                expect(result).toEqual(
                    strategies,
                );
            },
        );

        it(
            'should accept group by source strategy',
            async () => {
                const strategies:
                    GroupingStrategySetting[] = [
                        createStrategy({
                            strategyKey:
                                'group_by_source',
                            displayName:
                                'Group by source',
                            config: {},
                        }),
                    ];

                repositoryMock
                    .findActiveStrategies
                    .mockResolvedValue(
                        strategies,
                    );

                await expect(
                    service
                        .getActiveStrategies(
                            tenant,
                        ),
                ).resolves.toEqual(
                    strategies,
                );
            },
        );

        it(
            'should accept valid max weight configuration',
            async () => {
                const strategies:
                    GroupingStrategySetting[] = [
                        createStrategy({
                            strategyKey:
                                'split_by_max_weight',
                            displayName:
                                'Split by max weight',
                            config: {
                                maxWeightKg: 20,
                            },
                        }),
                    ];

                repositoryMock
                    .findActiveStrategies
                    .mockResolvedValue(
                        strategies,
                    );

                await expect(
                    service
                        .getActiveStrategies(
                            tenant,
                        ),
                ).resolves.toEqual(
                    strategies,
                );
            },
        );

        it(
            'should reject zero max weight configuration',
            async () => {
                const strategies:
                    GroupingStrategySetting[] = [
                        createStrategy({
                            strategyKey:
                                'split_by_max_weight',
                            displayName:
                                'Split by max weight',
                            config: {
                                maxWeightKg: 0,
                            },
                        }),
                    ];

                repositoryMock
                    .findActiveStrategies
                    .mockResolvedValue(
                        strategies,
                    );

                await expect(
                    service
                        .getActiveStrategies(
                            tenant,
                        ),
                ).rejects.toThrow(
                    'Invalid maxWeightKg configuration',
                );
            },
        );

        it(
            'should reject negative max weight configuration',
            async () => {
                const strategies:
                    GroupingStrategySetting[] = [
                        createStrategy({
                            strategyKey:
                                'split_by_max_weight',
                            displayName:
                                'Split by max weight',
                            config: {
                                maxWeightKg: -5,
                            },
                        }),
                    ];

                repositoryMock
                    .findActiveStrategies
                    .mockResolvedValue(
                        strategies,
                    );

                await expect(
                    service
                        .getActiveStrategies(
                            tenant,
                        ),
                ).rejects.toThrow(
                    'Invalid maxWeightKg configuration',
                );
            },
        );

        it(
            'should reject missing max weight configuration',
            async () => {
                const strategies:
                    GroupingStrategySetting[] = [
                        createStrategy({
                            strategyKey:
                                'split_by_max_weight',
                            displayName:
                                'Split by max weight',
                            config: {},
                        }),
                    ];

                repositoryMock
                    .findActiveStrategies
                    .mockResolvedValue(
                        strategies,
                    );

                await expect(
                    service
                        .getActiveStrategies(
                            tenant,
                        ),
                ).rejects.toThrow(
                    'Invalid maxWeightKg configuration',
                );
            },
        );

        it(
            'should accept valid max items configuration',
            async () => {
                const strategies:
                    GroupingStrategySetting[] = [
                        createStrategy({
                            strategyKey:
                                'split_by_max_items',
                            displayName:
                                'Split by max items',
                            config: {
                                maxItems: 10,
                            },
                        }),
                    ];

                repositoryMock
                    .findActiveStrategies
                    .mockResolvedValue(
                        strategies,
                    );

                await expect(
                    service
                        .getActiveStrategies(
                            tenant,
                        ),
                ).resolves.toEqual(
                    strategies,
                );
            },
        );

        it(
            'should reject non-integer max items configuration',
            async () => {
                const strategies:
                    GroupingStrategySetting[] = [
                        createStrategy({
                            strategyKey:
                                'split_by_max_items',
                            displayName:
                                'Split by max items',
                            config: {
                                maxItems: 2.5,
                            },
                        }),
                    ];

                repositoryMock
                    .findActiveStrategies
                    .mockResolvedValue(
                        strategies,
                    );

                await expect(
                    service
                        .getActiveStrategies(
                            tenant,
                        ),
                ).rejects.toThrow(
                    'Invalid maxItems configuration',
                );
            },
        );
        it('should reject maxWeightKg when it is not a number', async () => {
            const strategies = [
                createStrategy({
                    strategyKey:
                        'split_by_max_weight',

                    config: {
                        maxWeightKg:
                            '20' as any,
                    },
                }),
            ];

            repositoryMock
                .findActiveStrategies
                .mockResolvedValue(
                    strategies,
                );

            await expect(
                service.getActiveStrategies(
                    tenant,
                ),
            ).rejects.toThrow(
                'Invalid maxWeightKg configuration',
            );
        });

        it(
            'should reject zero max items configuration',
            async () => {
                const strategies:
                    GroupingStrategySetting[] = [
                        createStrategy({
                            strategyKey:
                                'split_by_max_items',
                            displayName:
                                'Split by max items',
                            config: {
                                maxItems: 0,
                            },
                        }),
                    ];

                repositoryMock
                    .findActiveStrategies
                    .mockResolvedValue(
                        strategies,
                    );

                await expect(
                    service
                        .getActiveStrategies(
                            tenant,
                        ),
                ).rejects.toThrow(
                    'Invalid maxItems configuration',
                );
            },
        );

        it(
            'should reject negative max items configuration',
            async () => {
                const strategies:
                    GroupingStrategySetting[] = [
                        createStrategy({
                            strategyKey:
                                'split_by_max_items',
                            displayName:
                                'Split by max items',
                            config: {
                                maxItems: -1,
                            },
                        }),
                    ];

                repositoryMock
                    .findActiveStrategies
                    .mockResolvedValue(
                        strategies,
                    );

                await expect(
                    service
                        .getActiveStrategies(
                            tenant,
                        ),
                ).rejects.toThrow(
                    'Invalid maxItems configuration',
                );
            },
        );

        it(
            'should reject missing max items configuration',
            async () => {
                const strategies:
                    GroupingStrategySetting[] = [
                        createStrategy({
                            strategyKey:
                                'split_by_max_items',
                            displayName:
                                'Split by max items',
                            config: {},
                        }),
                    ];

                repositoryMock
                    .findActiveStrategies
                    .mockResolvedValue(
                        strategies,
                    );

                await expect(
                    service
                        .getActiveStrategies(
                            tenant,
                        ),
                ).rejects.toThrow(
                    'Invalid maxItems configuration',
                );
            },
        );

        it(
            'should validate every strategy returned by repository',
            async () => {
                const strategies:
                    GroupingStrategySetting[] = [
                        createStrategy({
                            id: 'strategy-1',
                            executionOrder: 1,
                            strategyKey:
                                'group_by_source',
                        }),
                        createStrategy({
                            id: 'strategy-2',
                            executionOrder: 2,
                            strategyKey:
                                'split_by_max_weight',
                            config: {
                                maxWeightKg: 25,
                            },
                        }),
                        createStrategy({
                            id: 'strategy-3',
                            executionOrder: 3,
                            strategyKey:
                                'split_by_max_items',
                            config: {
                                maxItems: 8,
                            },
                        }),
                    ];

                repositoryMock
                    .findActiveStrategies
                    .mockResolvedValue(
                        strategies,
                    );

                await expect(
                    service
                        .getActiveStrategies(
                            tenant,
                        ),
                ).resolves.toEqual(
                    strategies,
                );
            },
        );
    });
    describe('getAllStrategies', () => {
        it('should return all strategies from repository', async () => {
            const strategies = [
                createStrategy({
                    id: 'strategy-1',
                }),
                createStrategy({
                    id: 'strategy-2',
                    strategyKey:
                        'split_by_max_weight',
                    config: {
                        maxWeightKg: 25,
                    },
                }),
            ];

            repositoryMock
                .findAllStrategies
                .mockResolvedValue(
                    strategies,
                );

            const result =
                await service.getAllStrategies(
                    tenant,
                );

            expect(
                repositoryMock
                    .findAllStrategies,
            ).toHaveBeenCalledWith(
                tenant,
            );

            expect(result).toEqual(
                strategies,
            );
        });

        it('should call findAllStrategies exactly once', async () => {
            repositoryMock
                .findAllStrategies
                .mockResolvedValue([]);

            await service.getAllStrategies(
                tenant,
            );

            expect(
                repositoryMock
                    .findAllStrategies,
            ).toHaveBeenCalledTimes(1);
        });
    });

    describe('updateStrategy', () => {
        it('should pass tenant, strategy id and changes to repository', async () => {
            const updatedStrategy =
                createStrategy({
                    id: 'strategy-1',
                    displayName:
                        'Updated strategy',
                });

            repositoryMock
                .updateStrategy
                .mockResolvedValue(
                    updatedStrategy,
                );

            const changes = {
                displayName:
                    'Updated strategy',
                isEnabled: false,
                executionOrder: 3,
                conflictPriority: 5,
            };

            await service.updateStrategy(
                tenant,
                'strategy-1',
                changes,
            );

            expect(
                repositoryMock
                    .updateStrategy,
            ).toHaveBeenCalledWith(
                tenant,
                'strategy-1',
                changes,
            );
        });

        it('should return null when repository does not find the strategy', async () => {
            repositoryMock
                .updateStrategy
                .mockResolvedValue(null);

            const result =
                await service.updateStrategy(
                    tenant,
                    'missing-strategy',
                    {
                        isEnabled: false,
                    },
                );

            expect(result).toBeNull();
        });

        it('should return a valid updated strategy', async () => {
            const updatedStrategy =
                createStrategy({
                    strategyKey:
                        'split_by_max_weight',
                    config: {
                        maxWeightKg: 30,
                    },
                });

            repositoryMock
                .updateStrategy
                .mockResolvedValue(
                    updatedStrategy,
                );

            const result =
                await service.updateStrategy(
                    tenant,
                    'strategy-1',
                    {
                        config: {
                            maxWeightKg: 30,
                        },
                    },
                );

            expect(result).toBe(
                updatedStrategy,
            );
        });

        it('should reject an invalid strategy configuration returned after update', async () => {
            const invalidStrategy =
                createStrategy({
                    strategyKey:
                        'split_by_max_weight',

                    config: {
                        maxWeightKg: 0,
                    },
                });

            repositoryMock
                .updateStrategy
                .mockResolvedValue(
                    invalidStrategy,
                );

            await expect(
                service.updateStrategy(
                    tenant,
                    'strategy-1',
                    {
                        config: {
                            maxWeightKg: 0,
                        },
                    },
                ),
            ).rejects.toThrow(
                'Invalid maxWeightKg configuration',
            );
        });

        it('should reject an unsupported grouping strategy', async () => {
            const unsupportedStrategy =
                createStrategy({
                    strategyKey:
                        'unsupported_strategy' as any,
                });

            repositoryMock
                .updateStrategy
                .mockResolvedValue(
                    unsupportedStrategy,
                );

            await expect(
                service.updateStrategy(
                    tenant,
                    'strategy-1',
                    {},
                ),
            ).rejects.toThrow(
                'Unsupported grouping strategy: unsupported_strategy',
            );
        });
    });

    describe('reorderStrategies', () => {
        it('should reorder strategies through repository and return the result', async () => {
            const items = [
                {
                    id: 'strategy-2',
                    executionOrder: 1,
                    conflictPriority: 10,
                },
                {
                    id: 'strategy-1',
                    executionOrder: 2,
                    conflictPriority: 5,
                },
            ];

            const reordered = [
                createStrategy({
                    id: 'strategy-2',
                    executionOrder: 1,
                    conflictPriority: 10,
                }),

                createStrategy({
                    id: 'strategy-1',
                    executionOrder: 2,
                    conflictPriority: 5,
                }),
            ];

            repositoryMock
                .reorderStrategies
                .mockResolvedValue(
                    reordered,
                );

            const result =
                await service.reorderStrategies(
                    tenant,
                    items,
                );

            expect(
                repositoryMock
                    .reorderStrategies,
            ).toHaveBeenCalledWith(
                tenant,
                items,
            );

            expect(result).toEqual(
                reordered,
            );
        });
    });
});