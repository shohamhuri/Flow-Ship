import {
    IsBoolean,
    IsInt,
    IsObject,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

export class UpdateDecisionPriorityCardDto {
    @IsOptional()
    @IsString()
    providerId?: string | null;

    @IsOptional()
    @IsString()
    criterionKey?: string;

    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    priorityRank?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsObject()
    config?: Record<string, unknown>;
}