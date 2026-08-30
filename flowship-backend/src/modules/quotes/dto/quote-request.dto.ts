import {
    ArrayMinSize,
    IsArray,
    IsNumber,
    IsPositive,
    IsString,
} from 'class-validator';

export class QuoteRequestDto {
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    pickupCities!: string[];

    @IsString()
    destinationCity!: string;

    @IsNumber()
    @IsPositive()
    weightKg!: number;
}