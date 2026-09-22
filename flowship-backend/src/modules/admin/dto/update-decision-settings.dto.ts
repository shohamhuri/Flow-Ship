import {
    IsNumber,
    IsOptional,
    Max,
    Min,
} from 'class-validator';

export class UpdateDecisionSettingsDto {
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1)
    priceWeight?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1)
    speedWeight?: number;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1)
    providerPriorityWeight?: number;
}