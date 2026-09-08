import {
    IsBoolean,
    IsNumber,
    IsOptional,
    Max,
    Min,
} from 'class-validator';

export class UpdateProviderDto {
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1)
    priorityScore?: number;
}