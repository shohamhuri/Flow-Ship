import { Type } from 'class-transformer';

import {
    IsArray,
    IsInt,
    IsUUID,
    Min,
    ValidateNested,
} from 'class-validator';

export class ReorderGroupingStrategyItemDto {
    @IsUUID()
    id!: string;

    @IsInt()
    @Min(1)
    executionOrder!: number;

    @IsInt()
    @Min(0)
    conflictPriority!: number;
}

export class ReorderGroupingStrategiesDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReorderGroupingStrategyItemDto)
    items!: ReorderGroupingStrategyItemDto[];
}