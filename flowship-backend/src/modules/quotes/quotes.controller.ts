import {
    Body,
    Controller,
    Headers,
    Post,
    UnauthorizedException,
} from '@nestjs/common';
import { TenantsService } from '../tenants/tenants.service';
import { QuoteRequestDto } from './dto/quote-request.dto';
import { QuotesService } from './quotes.service';

@Controller('quotes')
export class QuotesController {
    constructor(
        private readonly quotesService: QuotesService,
        private readonly tenantsService: TenantsService,
    ) { }

    @Post()
    async getQuoteOptions(
        @Headers('x-api-key') apiKey: string | undefined,
        @Body() dto: QuoteRequestDto,
    ) {
        if (!apiKey) {
            throw new UnauthorizedException('Missing x-api-key header');
        }

        const tenant = await this.tenantsService.findByApiKey(apiKey);

        if (!tenant) {
            throw new UnauthorizedException('Invalid API key');
        }

        return this.quotesService.getQuoteOptions(dto, tenant);
    }
}