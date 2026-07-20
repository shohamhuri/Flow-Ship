import {
    Body,
    Controller,
    Headers,
    Post,
    UnauthorizedException,
} from '@nestjs/common';
import { TenantsService } from '../tenants/tenants.service';
import { CarriersService } from './carriers.service';
import { CarrierQuoteRequestDto } from './dto/carrier-quote-request.dto';

@Controller('carriers')
export class CarriersController {
    constructor(
        private readonly carriersService: CarriersService,
        private readonly tenantsService: TenantsService,
    ) { }

    @Post('quotes')
    async getQuotes(
        @Headers('x-api-key') apiKey: string | undefined,
        @Body() body: CarrierQuoteRequestDto,
    ) {
        if (!apiKey) {
            throw new UnauthorizedException('Missing x-api-key header');
        }

        const tenant = await this.tenantsService.findByApiKey(apiKey);

        if (!tenant) {
            throw new UnauthorizedException('Invalid API key');
        }

        const carrierResult = await this.carriersService.getQuotes(body, tenant);

        return {
            ok: true,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                schemaName: tenant.schemaName,
            },
            count: carrierResult.quotes.length,
            failedProviders: carrierResult.failedProviders,
            quotes: carrierResult.quotes,
        };
    }
}