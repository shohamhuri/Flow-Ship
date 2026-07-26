import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CheckoutDestinationDto {
    @IsString()
    @IsNotEmpty()
    country!: string;

    @IsString()
    @IsNotEmpty()
    city!: string;

    @IsString()
    @IsNotEmpty()
    street!: string;

    @IsString()
    @IsNotEmpty()
    houseNumber!: string;

    @IsOptional()
    @IsString()
    postalCode?: string;
}