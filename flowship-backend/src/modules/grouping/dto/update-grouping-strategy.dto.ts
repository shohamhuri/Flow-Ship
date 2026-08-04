import {
    IsBoolean,
    IsInt,
    IsObject,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

export class UpdateGroupingStrategyDto {
    @IsOptional()
    @IsString()
    displayName?: string;

    @IsOptional()
    @IsBoolean()
    isEnabled?: boolean;

    @IsOptional()
    @IsInt()
    @Min(1)
    executionOrder?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    conflictPriority?: number;

    @IsOptional()
    @IsObject()
    config?: Record<string, unknown>;
}