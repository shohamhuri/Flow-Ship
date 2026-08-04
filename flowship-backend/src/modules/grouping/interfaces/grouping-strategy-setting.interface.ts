export type GroupingStrategyKey =
    | 'group_by_source'
    | 'split_by_max_weight'
    | 'split_by_max_items';

export interface GroupingStrategyConfig {
    maxWeightKg?: number;
    maxItems?: number;
}

export interface GroupingStrategySetting {
    id: string;

    strategyKey: GroupingStrategyKey;
    displayName: string;

    isEnabled: boolean;

    executionOrder: number;
    conflictPriority: number;

    config: GroupingStrategyConfig;

    createdAt: Date;
    updatedAt: Date;
}