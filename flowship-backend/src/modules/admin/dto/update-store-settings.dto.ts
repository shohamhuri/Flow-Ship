
import {
    IsIn,
    IsInt,
    IsOptional,
    Matches,
    Min,
    ValidateIf,
} from 'class-validator';

export class UpdateStoreSettingsDto {
    @IsInt()
    @Min(1)
    expressMaxMinutes!: number;

    @IsInt()
    @Min(1)
    sameDayMaxMinutes!: number;

    @ValidateIf((_, value) => value !== undefined && value !== null)
    @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
    expressCutoffTime?: string | null;

    @IsOptional()
    @IsIn(['extended', 'disabled'])
    expressAfterCutoffMode?: 'extended' | 'disabled';

    @ValidateIf((_, value) => value !== undefined && value !== null)
    @IsInt()
    @Min(1)
    expressAfterCutoffMaxMinutes?: number | null;
    @IsOptional()
    @IsInt()
    @Min(0)
    pickupLeadTimeMinutes?: number;
}
