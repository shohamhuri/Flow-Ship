import {
    Body,
    Controller,
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
    CarriersService,
} from './carriers.service';

import {
    CarrierQuoteRequestDto,
} from './dto/carrier-quote-request.dto';

@Controller('carriers')
@UseGuards(SupabaseAuthGuard)
export class CarriersController {
    constructor(
        private readonly carriersService:
            CarriersService,
    ) { }

    @Post('quotes')
    async getQuotes(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,

        @Body()
        body: CarrierQuoteRequestDto,
    ) {
        const tenant = auth.tenant;

        const carrierResult =
            await this.carriersService.getQuotes(
                body,
                tenant,
            );

        return {
            ok: true,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                schemaName:
                    tenant.schemaName,
            },
            count:
                carrierResult.quotes.length,
            failedProviders:
                carrierResult.failedProviders,
            quotes:
                carrierResult.quotes,
        };
    }
}