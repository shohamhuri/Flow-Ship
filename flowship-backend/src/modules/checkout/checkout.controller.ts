import {
    Body,
    Controller,
    Headers,
    Post,
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