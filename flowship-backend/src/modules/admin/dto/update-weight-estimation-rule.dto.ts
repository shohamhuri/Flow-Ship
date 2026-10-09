import {
    IsBoolean,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

export class UpdateWeightEstimationRuleDto {
    @IsOptional()
    @IsString()
    category?: string | null;

    @IsOptional()
    @IsString()
    productType?: string | null;

    @IsOptional()
    @IsString()
    size?: string | null;
    @IsOptional()
    @IsNumber()
    @Min(0.001)
    estimatedWeightKg?: number;

    @IsOptional()
    @IsNumber()
    priority?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}