import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    IsArray,
    IsNotEmpty,
    IsString,
    ValidateNested,
} from 'class-validator';
import { CheckoutDestinationDto } from './checkout-destination.dto';
import { CheckoutItemDto } from './checkout-item.dto';

export class CreateCheckoutDto {
    @IsString()
    @IsNotEmpty()
    orderId!: string;

    @IsString()
    @IsNotEmpty()
    storeId!: string;

    @ValidateNested()
    @Type(() => CheckoutDestinationDto)
    destination!: CheckoutDestinationDto;

    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => CheckoutItemDto)
    items!: CheckoutItemDto[];
}