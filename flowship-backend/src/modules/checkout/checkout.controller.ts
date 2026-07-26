import { Body, Controller, Post } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import type { Checkout } from './interfaces/checkout.interface';

@Controller('checkout')
export class CheckoutController {
    constructor(private readonly checkoutService: CheckoutService) { }

    @Post()
    createCheckout(
        @Body() createCheckoutDto: CreateCheckoutDto,
    ): Checkout {
        return this.checkoutService.createCheckout(createCheckoutDto);
    }
}