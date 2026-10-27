import {
    IsBoolean,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    Min,
    ValidateIf,
} from 'class-validator';

export class UpdateSourceDeliveryPermissionDto {
    @IsString()
    @IsNotEmpty()
    storeId!: string;

    @IsBoolean()
    selfDeliveryAllowed!: boolean;

    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(99999999.99)
    selfDeliveryPrice?: number | null;
}