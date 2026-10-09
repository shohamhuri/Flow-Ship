import { IsInt, Min } from 'class-validator';

export class UpdateStoreSettingsDto {
    @IsInt()
    @Min(1)
    expressMaxMinutes!: number;

    @IsInt()
    @Min(1)
    sameDayMaxMinutes!: number;
}