import { QuotesService } from './quotes.service';
import { CarriersService } from '../carriers/carriers.service';
import { DecisionService } from '../decision/decision.service';

describe('QuotesService', () => {
    let service: QuotesService;

    const carriersServiceMock = {
        getQuotes: jest.fn(),
    };

    const decisionServiceMock = {
        getDecisionSettings: jest.fn(),
        selectBestQuote: jest.fn(),
    };

    const tenant = {
        id: 'tenant-1',
        name: 'QUEEN',
        schemaName: 'queen',
        status: 'active',
    };

    const dto = {
        pickupCities: ['Tel Aviv', 'Ramat Gan'],
        destinationCity: 'Jerusalem',
        weightKg: 5,
    };

    beforeEach(() => {
        jest.clearAllMocks();

        service = new QuotesService(
            carriersServiceMock as unknown as CarriersService,
            decisionServiceMock as unknown as DecisionService,
        );
    });

    it('should pass the mapped quote request and tenant to CarriersService', async () => {
        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [],
            failedProviders: [],
        });

        decisionServiceMock.getDecisionSettings.mockResolvedValue({});
        decisionServiceMock.selectBestQuote.mockReturnValue(null);

        await service.getQuoteOptions(dto as any, tenant);

        expect(carriersServiceMock.getQuotes).toHaveBeenCalledWith(
            {
                pickupCities: dto.pickupCities,
                destinationCity: dto.destinationCity,
                weightKg: dto.weightKg,
            },
            tenant,
        );
    });

    it('should request decision settings for the current tenant', async () => {
        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes: [],
            failedProviders: [],
        });

        decisionServiceMock.getDecisionSettings.mockResolvedValue({
            priceWeight: 0.5,
            speedWeight: 0.5,
        });

        decisionServiceMock.selectBestQuote.mockReturnValue(null);

        await service.getQuoteOptions(dto as any, tenant);

        expect(
            decisionServiceMock.getDecisionSettings,
        ).toHaveBeenCalledWith(tenant);
    });

    it('should pass quotes and decision settings to selectBestQuote', async () => {
        const quotes = [
            {
                providerCode: 'mock',
                price: 25,
                deliveryDays: 2,
            },
            {
                providerCode: 'mock-yango',
                price: 35,
                deliveryDays: 1,
            },
        ];

        const decisionSettings = {
            priceWeight: 0.6,
            speedWeight: 0.4,
        };

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes,
            failedProviders: [],
        });

        decisionServiceMock.getDecisionSettings.mockResolvedValue(
            decisionSettings,
        );

        decisionServiceMock.selectBestQuote.mockReturnValue(quotes[0]);

        await service.getQuoteOptions(dto as any, tenant);

        expect(
            decisionServiceMock.selectBestQuote,
        ).toHaveBeenCalledWith(
            quotes,
            decisionSettings,
        );
    });

    it('should return the number of quote options', async () => {
        const quotes = [
            { providerCode: 'mock', price: 25 },
            { providerCode: 'mock-yango', price: 35 },
        ];

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes,
            failedProviders: [],
        });

        decisionServiceMock.getDecisionSettings.mockResolvedValue({});
        decisionServiceMock.selectBestQuote.mockReturnValue(quotes[0]);

        const result = await service.getQuoteOptions(
            dto as any,
            tenant,
        );

        expect(result.count).toBe(2);
    });

    it('should return failed providers without removing successful quotes', async () => {
        const quotes = [
            {
                providerCode: 'mock',
                price: 25,
            },
        ];

        const failedProviders = [
            {
                providerCode: 'mock-yango',
                error: 'Provider unavailable',
            },
        ];

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes,
            failedProviders,
        });

        decisionServiceMock.getDecisionSettings.mockResolvedValue({});
        decisionServiceMock.selectBestQuote.mockReturnValue(quotes[0]);

        const result = await service.getQuoteOptions(
            dto as any,
            tenant,
        );

        expect(result.quotes).toEqual(quotes);
        expect(result.failedProviders).toEqual(failedProviders);
        expect(result.count).toBe(1);
    });

    it('should return the complete quote response', async () => {
        const quotes = [
            {
                providerCode: 'mock',
                price: 25,
                deliveryDays: 2,
            },
        ];

        const decisionSettings = {
            priceWeight: 0.7,
            speedWeight: 0.3,
        };

        const bestQuote = quotes[0];

        carriersServiceMock.getQuotes.mockResolvedValue({
            quotes,
            failedProviders: [],
        });

        decisionServiceMock.getDecisionSettings.mockResolvedValue(
            decisionSettings,
        );

        decisionServiceMock.selectBestQuote.mockReturnValue(
            bestQuote,
        );

        const result = await service.getQuoteOptions(
            dto as any,
            tenant,
        );

        expect(result).toEqual({
            ok: true,

            tenant: {
                id: tenant.id,
                name: tenant.name,
                schemaName: tenant.schemaName,
            },

            decisionSettings,
            count: 1,
            bestQuote,
            failedProviders: [],
            quotes,
        });
    });
});