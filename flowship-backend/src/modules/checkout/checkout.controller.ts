import {
    Body,
    Controller,
    Get,
    Headers,
    NotFoundException,
    Param,
    Post,
    UseGuards,
} from '@nestjs/common';

import {
    CurrentFlowShipAuth,
} from '../auth/current-auth.decorator';

import type {
    FlowShipAuthContext,
} from '../auth/auth.types';

import {
    SupabaseAuthGuard,
} from '../auth/supabase-auth.guard';

import {
    CurrentTenant,
    TenantsService,
} from '../tenants/tenants.service';

import { CheckoutService } from './checkout.service';

import type {
    CheckoutProcessingResult,
} from './checkout.service';

import {
    CreateCheckoutDto,
} from './dto/create-checkout.dto';

@Controller('checkout')
export class CheckoutController {
    constructor(
        private readonly checkoutService:
            CheckoutService,

        private readonly tenantsService:
            TenantsService,
    ) { }

    /**
     * מסך Admin:
     * מחזיר Checkouts של הטננט
     * של המשתמש המחובר.
     */
    @Get()
    @UseGuards(SupabaseAuthGuard)
    async getCheckouts(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,
    ) {
        return this.checkoutService
            .getCheckouts(auth.tenant);
    }

    /**
     * מסך Admin:
     * מחזיר Checkout מסוים,
     * רק מתוך הטננט של המשתמש.
     */
    @Get(':checkoutId')
    @UseGuards(SupabaseAuthGuard)
    async getCheckoutById(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,

        @Param('checkoutId')
        checkoutId: string,
    ) {
        const checkout =
            await this.checkoutService
                .getCheckoutById(
                    auth.tenant,
                    checkoutId,
                );

        if (!checkout) {
            throw new NotFoundException(
                `Checkout not found: ${checkoutId}`,
            );
        }

        return checkout;
    }

    /**
     * API של מערכת חיצונית:
     * למשל חנות, Shopify או פלטפורמה אחרת.
     *
     */
    @Post()
    async createCheckout(
        @Body()
        createCheckoutDto: CreateCheckoutDto,

        @Headers('x-api-key')
        apiKey: string | undefined,
    ): Promise<CheckoutProcessingResult> {
        const tenant: CurrentTenant =
            await this.tenantsService
                .findByApiKey(apiKey);

        return this.checkoutService
            .createCheckout(
                createCheckoutDto,
                tenant,
            );
    }
}