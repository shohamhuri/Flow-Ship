import {
    IsBoolean,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
} from 'class-validator';

export class CreateDecisionPriorityCardDto {
    @IsOptional()
    @IsUUID()
    providerId?: string | null;

    @IsString()
    @IsNotEmpty()
    criterionKey!: string;

    @IsOptional()
    @IsString()
    title?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsObject()
    config?: Record<string, unknown>;
}