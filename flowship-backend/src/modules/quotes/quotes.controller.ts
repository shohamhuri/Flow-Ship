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
    QuoteRequestDto,
} from './dto/quote-request.dto';

import {
    QuotesService,
} from './quotes.service';

@Controller('quotes')
@UseGuards(SupabaseAuthGuard)
export class QuotesController {
    constructor(
        private readonly quotesService:
            QuotesService,
    ) { }

    @Post()
    async getQuoteOptions(
        @CurrentFlowShipAuth()
        auth: FlowShipAuthContext,

        @Body()
        dto: QuoteRequestDto,
    ) {
        return this.quotesService
            .getQuoteOptions(
                dto,
                auth.tenant,
            );
    }
}