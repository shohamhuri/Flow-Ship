import {
    ArrayMinSize,
    IsArray,
    IsIn,
    IsNumber,
    IsOptional,
    IsPositive,
    IsString,
} from 'class-validator';

export class CarrierQuoteRequestDto {
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    pickupCities!: string[];

    @IsString()
    destinationCity!: string;

    @IsNumber()
    @IsPositive()
    weightKg!: number;

    @IsOptional()
    @IsString()
    pickupAddress?: string;

    @IsOptional()
    @IsString()
    destinationAddress?: string;

    @IsOptional()
    @IsIn(['scooter', 'car', 'van'])
    vehicleType?: 'scooter' | 'car' | 'commercial';

    @IsOptional()
    @IsIn(['urgent', 'express', 'standard'])
    urgency?: 'urgent' | 'express' | 'standard';


}