import {
    IsEmail,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

import { Type } from 'class-transformer';

export class CheckoutRecipientDto {
    @IsString()
    @IsNotEmpty()
    name!: string;

    @IsString()
    @IsNotEmpty()
    phone!: string;

    @IsOptional()
    @IsEmail()
    email?: string;
}

export class ConfirmCheckoutDto {
    @IsString()
    @IsNotEmpty()
    orderId!: string;

    @IsString()
    @IsNotEmpty()
    storeId!: string;

    @IsString()
    @IsNotEmpty()
    paymentReference!: string;

    @IsString()
    @IsNotEmpty()
    selectedDeliveryOptionId!: string;

    @ValidateNested()
    @Type(() => CheckoutRecipientDto)
    recipient!: CheckoutRecipientDto;
}