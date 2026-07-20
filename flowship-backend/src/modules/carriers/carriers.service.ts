import { Injectable } from '@nestjs/common';
import { DbService } from '../../infrastructure/database/db.service';
import { CarrierRegistry } from './carrier-registry.service';
import { CarrierCode } from './enums/carrier-code.enum';
import {
    CarrierQuoteOption,
    CarrierQuoteRequest,
} from './interfaces/carrier-adapter.interface';

type TenantContext = {
    id: string;
    name: string;
    schemaName: string;
    status: string;
};

type ProviderRow = {
    id: string;
    code: string;
    name: string;
    adapter_key: string;
    is_mock: boolean;
    is_active: boolean;
    priority_score: string | number;
};

type ProviderCallStatus = 'success' | 'failed';

@Injectable()
export class CarriersService {
    constructor(
        private readonly carrierRegistry: CarrierRegistry,
        private readonly db: DbService,
    ) { }

    async getQuotes(request: CarrierQuoteRequest, tenant: TenantContext) {
        const schemaName = this.safeSchemaName(tenant.schemaName);

        const providers = await this.db.query<ProviderRow>(
            `
      select id, code, name, adapter_key, is_mock, is_active, priority_score
      from ${schemaName}.providers
      where is_active = true
      `,
        );

        const results = await Promise.allSettled(
            providers.map(async (provider) => {
                const startedAt = Date.now();

                try {
                    const adapter = this.carrierRegistry.getAdapter(
                        provider.adapter_key as CarrierCode,
                    );

                    const quotes = await adapter.getQuote(request);

                    const responseTimeMs = Date.now() - startedAt;

                    const quotesWithProvider = quotes.map((quote) => ({
                        ...quote,
                        providerPriority: Number(provider.priority_score),
                        providerCode: provider.code,
                        providerId: provider.id,
                        adapterKey: provider.adapter_key,
                    }));

                    await this.logProviderCall(schemaName, {
                        providerId: provider.id,
                        action: 'get_quote',
                        request: {
                            providerCode: provider.code,
                            providerName: provider.name,
                            adapterKey: provider.adapter_key,
                            payload: request,
                        },
                        response: {
                            quotesCount: quotes.length,
                            quotes: quotesWithProvider,
                        },
                        status: 'success',
                        responseTimeMs,
                        errorMessage: null,
                    });

                    return quotesWithProvider;
                } catch (error) {
                    const responseTimeMs = Date.now() - startedAt;

                    const errorMessage =
                        error instanceof Error ? error.message : String(error);

                    await this.logProviderCall(schemaName, {
                        providerId: provider.id,
                        action: 'get_quote',
                        request: {
                            providerCode: provider.code,
                            providerName: provider.name,
                            adapterKey: provider.adapter_key,
                            payload: request,
                        },
                        response: null,
                        status: 'failed',
                        responseTimeMs,
                        errorMessage,
                    });

                    throw {
                        providerCode: provider.code,
                        providerName: provider.name,
                        adapterKey: provider.adapter_key,
                        error: errorMessage,
                    };
                }
            }),
        );

        const successfulQuotes = results
            .filter((result) => result.status === 'fulfilled')
            .flatMap((result) => result.value);

        const failedProviders = results
            .filter((result) => result.status === 'rejected')
            .map((result) => result.reason);

        return {
            quotes: successfulQuotes,
            failedProviders,
        };
    }

    private async logProviderCall(
        schemaName: string,
        data: {
            providerId: string;
            action: string;
            request: unknown;
            response: unknown;
            status: ProviderCallStatus;
            responseTimeMs: number;
            errorMessage: string | null;
        },
    ) {
        await this.db.query(
            `
      insert into ${schemaName}.provider_call_logs (
        provider_id,
        action,
        request,
        response,
        status,
        response_time_ms,
        error_message
      )
      values (
        $1,
        $2,
        $3::jsonb,
        $4::jsonb,
        $5,
        $6,
        $7
      )
      `,
            [
                data.providerId,
                data.action,
                JSON.stringify(data.request),
                data.response === null ? null : JSON.stringify(data.response),
                data.status,
                data.responseTimeMs,
                data.errorMessage,
            ],
        );
    }

    private safeSchemaName(schemaName: string): string {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
            throw new Error(`Invalid schema name: ${schemaName}`);
        }

        return `"${schemaName}"`;
    }
}