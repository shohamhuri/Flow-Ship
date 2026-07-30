import {
    Body,
    Controller,
    Get,
    Headers,
    Post,
    NotFoundException,
    Param,
} from '@nestjs/common';

import {
    CurrentTenant,
    TenantsService,
} from '../tenants/tenants.service';

import { CheckoutService } from './checkout.service';
import type { CheckoutProcessingResult } from './checkout.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@Controller('checkout')
export class CheckoutController {
    constructor(
        private readonly checkoutService: CheckoutService,
        private readonly tenantsService: TenantsService,
    ) { }

    @Get()
    async getCheckouts(
        @Headers('x-api-key') apiKey: string | undefined,
    ) {
        const tenant: CurrentTenant =
            await this.tenantsService.findByApiKey(apiKey);

        return this.checkoutService.getCheckouts(tenant);
    }
    @Get(':checkoutId')
    async getCheckoutById(
        @Param('checkoutId') checkoutId: string,
        @Headers('x-api-key') apiKey: string | undefined,
    ) {
        const tenant: CurrentTenant =
            await this.tenantsService.findByApiKey(apiKey);

        const checkout =
            await this.checkoutService.getCheckoutById(
                tenant,
                checkoutId,
            );

        if (!checkout) {
            throw new NotFoundException(
                `Checkout not found: ${checkoutId}`,
            );
        }

        return checkout;
    }
    @Post()
    async createCheckout(
        @Body() createCheckoutDto: CreateCheckoutDto,
        @Headers('x-api-key') apiKey: string | undefined,
    ): Promise<CheckoutProcessingResult> {
        const tenant: CurrentTenant =
            await this.tenantsService.findByApiKey(apiKey);

        return this.checkoutService.createCheckout(
            createCheckoutDto,
            tenant,
        );
    }
}