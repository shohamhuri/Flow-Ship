import {
    IsBoolean,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

export class CreateWeightEstimationRuleDto {
    @IsOptional()
    @IsString()
    category?: string;

    @IsOptional()
    @IsString()
    productType?: string;

    @IsOptional()
    @IsString()
    size?: string;

    @IsNumber()
    @Min(0.001)
    estimatedWeightKg!: number;

    @IsOptional()
    @IsNumber()
    priority?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}