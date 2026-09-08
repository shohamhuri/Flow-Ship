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
                pickupCities: dto.pickupCities,
                destinationCity: dto.destinationCity,
                weightKg: dto.weightKg,
            },
            tenant,
        );

        const quotes = carrierResult.quotes;
        const failedProviders = carrierResult.failedProviders;
        const decisionSettings =
            await this.decisionService
                .getDecisionSettings(tenant);

        const bestQuote =
            this.decisionService
                .selectBestQuote(
                    quotes,
                    decisionSettings,
                );
        return {
            ok: true,

            tenant: {
                id: tenant.id,
                name: tenant.name,
                schemaName: tenant.schemaName,
            },

            decisionSettings,

            count: quotes.length,
            bestQuote,
            failedProviders,
            quotes,
        };
    }
}