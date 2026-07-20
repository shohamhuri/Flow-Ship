import { Injectable } from '@nestjs/common';
import { CarriersService } from '../carriers/carriers.service';
import { DecisionService } from '../decision/decision.service';
import { QuoteRequestDto } from './dto/quote-request.dto';

type TenantContext = {
    id: string;
    name: string;
    schemaName: string;
    status: string;
};

@Injectable()
export class QuotesService {
    constructor(
        private readonly carriersService: CarriersService,
        private readonly decisionService: DecisionService,
    ) { }

    async getQuoteOptions(dto: QuoteRequestDto, tenant: TenantContext) {
        const carrierResult = await this.carriersService.getQuotes(
            {
                originCity: dto.originCity,
                destinationCity: dto.destinationCity,
                weightKg: dto.weightKg,
            },
            tenant,
        );

        const quotes = carrierResult.quotes;
        const failedProviders = carrierResult.failedProviders;
        const decisionCriteria =
            await this.decisionService.getCriteriaForTenant(tenant);
        const bestQuote = this.decisionService.selectBestQuote(
            quotes,
            decisionCriteria,
        );
        return {
            ok: true,
            tenant: {
                id: tenant.id,
                name: tenant.name,
                schemaName: tenant.schemaName,
            },
            decisionCriteria,
            count: quotes.length,
            bestQuote,
            failedProviders,
            quotes,
        };
    }
}