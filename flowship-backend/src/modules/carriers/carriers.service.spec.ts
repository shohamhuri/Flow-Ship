import { CarriersService } from './carriers.service';
import { CarrierRegistry } from './carrier-registry.service';
import { DbService } from '../../infrastructure/database/db.service';
import {
    CarrierAdapter,
    CarrierQuoteOption,
    CarrierQuoteRequest,
} from './interfaces/carrier-adapter.interface';
import { CarrierCode } from './enums/carrier-code.enum';

describe('CarriersService', () => {
    let service: CarriersService;
    let dbQueryMock: jest.Mock;
    let getAdapterMock: jest.Mock;

    const tenant = {
        id: 'tenant-1',
        name: 'FLOW_SHIP_TEST',
        schemaName: 'flow_ship_test',
        status: 'active',
    };

    const request: CarrierQuoteRequest = {
        pickupCities: ['Tel Aviv'],
        destinationCity: 'Jerusalem',
        weightKg: 3,
    };

    const provider = {
        id: 'provider-1',
        code: 'MOCK',
        name: 'Mock Express',
        adapter_key: 'mock',
        is_mock: true,
        is_active: true,
        priority_score: '0.9',
    };

    const createAdapter = (
        quotes: CarrierQuoteOption[] = [],
    ): CarrierAdapter => ({
        code: CarrierCode.MOCK,
        getQuote: jest.fn().mockResolvedValue(quotes),
    });

    beforeEach(() => {
        dbQueryMock = jest.fn();
        getAdapterMock = jest.fn();

        const dbMock = {
            query: dbQueryMock,
        } as unknown as DbService;

        const registryMock = {
            getAdapter: getAdapterMock,
        } as unknown as CarrierRegistry;

        service = new CarriersService(registryMock, dbMock);
    });

    describe('getQuotes', () => {
        it('should query only active providers from the tenant schema', async () => {
            dbQueryMock.mockResolvedValueOnce([]);

            await service.getQuotes(request, tenant);

            expect(dbQueryMock).toHaveBeenCalledTimes(1);

            const [sql] = dbQueryMock.mock.calls[0];

            expect(sql).toContain('from "flow_ship_test".providers');
            expect(sql).toContain('where is_active = true');
        });

        it('should return an empty result when there are no active providers', async () => {
            dbQueryMock.mockResolvedValueOnce([]);

            const result = await service.getQuotes(request, tenant);

            expect(result).toEqual({
                quotes: [],
                failedProviders: [],
            });

            expect(getAdapterMock).not.toHaveBeenCalled();
        });

        it('should call the matching adapter with the quote request', async () => {
            const adapter = createAdapter([
                {
                    carrierName: 'Mock Express',
                    serviceName: 'Budget Delivery',
                    price: 25,
                    currency: 'ILS',
                    estimatedDays: 3,
                },
            ]);

            dbQueryMock
                .mockResolvedValueOnce([provider])
                .mockResolvedValueOnce([]);

            getAdapterMock.mockReturnValue(adapter);

            await service.getQuotes(request, tenant);

            expect(getAdapterMock).toHaveBeenCalledWith(CarrierCode.MOCK);
            expect(adapter.getQuote).toHaveBeenCalledWith(request);
        });

        it('should enrich returned quotes with provider metadata', async () => {
            const adapter = createAdapter([
                {
                    carrierName: 'Mock Express',
                    serviceName: 'Budget Delivery',
                    price: 25,
                    currency: 'ILS',
                    estimatedDays: 3,
                },
            ]);

            dbQueryMock
                .mockResolvedValueOnce([provider])
                .mockResolvedValueOnce([]);

            getAdapterMock.mockReturnValue(adapter);

            const result = await service.getQuotes(request, tenant);

            expect(result.quotes).toEqual([
                {
                    carrierName: 'Mock Express',
                    serviceName: 'Budget Delivery',
                    price: 25,
                    currency: 'ILS',
                    estimatedDays: 3,
                    providerPriority: 0.9,
                    providerCode: 'MOCK',
                    providerId: 'provider-1',
                    adapterKey: 'mock',
                },
            ]);
        });

        it('should convert provider priority from a database string to a number', async () => {
            const adapter = createAdapter([
                {
                    carrierName: 'Mock Express',
                    serviceName: 'Budget Delivery',
                    price: 25,
                    currency: 'ILS',
                    estimatedDays: 3,
                },
            ]);

            dbQueryMock
                .mockResolvedValueOnce([
                    {
                        ...provider,
                        priority_score: '0.75',
                    },
                ])
                .mockResolvedValueOnce([]);

            getAdapterMock.mockReturnValue(adapter);

            const result = await service.getQuotes(request, tenant);

            expect(result.quotes[0].providerPriority).toBe(0.75);
            expect(typeof result.quotes[0].providerPriority).toBe('number');
        });

        it('should flatten multiple quotes returned by a provider', async () => {
            const adapter = createAdapter([
                {
                    carrierName: 'Mock Express',
                    serviceName: 'Budget Delivery',
                    price: 25,
                    currency: 'ILS',
                    estimatedDays: 3,
                },
                {
                    carrierName: 'Mock Express',
                    serviceName: 'Fast Delivery',
                    price: 45,
                    currency: 'ILS',
                    estimatedDays: 1,
                },
            ]);

            dbQueryMock
                .mockResolvedValueOnce([provider])
                .mockResolvedValueOnce([]);

            getAdapterMock.mockReturnValue(adapter);

            const result = await service.getQuotes(request, tenant);

            expect(result.quotes).toHaveLength(2);
            expect(result.failedProviders).toEqual([]);
        });

        it('should keep successful quotes when another provider fails', async () => {
            const successfulProvider = provider;
            const failedProvider = {
                ...provider,
                id: 'provider-2',
                code: 'MOCK_YANGO',
                name: 'Mock Yango',
                adapter_key: 'mock-yango',
                priority_score: 0.6,
            };

            const successfulAdapter = createAdapter([
                {
                    carrierName: 'Mock Express',
                    serviceName: 'Budget Delivery',
                    price: 25,
                    currency: 'ILS',
                    estimatedDays: 3,
                },
            ]);

            const failingAdapter: CarrierAdapter = {
                code: CarrierCode.MOCK_YANGO,
                getQuote: jest.fn().mockRejectedValue(
                    new Error('Provider timeout'),
                ),
            };

            dbQueryMock
                .mockResolvedValueOnce([
                    successfulProvider,
                    failedProvider,
                ])
                .mockResolvedValue([]);

            getAdapterMock.mockImplementation((code: CarrierCode) => {
                if (code === CarrierCode.MOCK) {
                    return successfulAdapter;
                }

                return failingAdapter;
            });

            const result = await service.getQuotes(request, tenant);

            expect(result.quotes).toHaveLength(1);
            expect(result.quotes[0].providerCode).toBe('MOCK');

            expect(result.failedProviders).toEqual([
                {
                    providerCode: 'MOCK_YANGO',
                    providerName: 'Mock Yango',
                    adapterKey: 'mock-yango',
                    error: 'Provider timeout',
                },
            ]);
        });

        it('should report a missing carrier adapter as a failed provider', async () => {
            dbQueryMock
                .mockResolvedValueOnce([provider])
                .mockResolvedValueOnce([]);

            getAdapterMock.mockImplementation(() => {
                throw new Error('Carrier adapter not found: mock');
            });

            const result = await service.getQuotes(request, tenant);

            expect(result.quotes).toEqual([]);
            expect(result.failedProviders).toEqual([
                {
                    providerCode: 'MOCK',
                    providerName: 'Mock Express',
                    adapterKey: 'mock',
                    error: 'Carrier adapter not found: mock',
                },
            ]);
        });

        it('should write a success log after a provider returns quotes', async () => {
            const adapter = createAdapter([
                {
                    carrierName: 'Mock Express',
                    serviceName: 'Budget Delivery',
                    price: 25,
                    currency: 'ILS',
                    estimatedDays: 3,
                },
            ]);

            dbQueryMock
                .mockResolvedValueOnce([provider])
                .mockResolvedValueOnce([]);

            getAdapterMock.mockReturnValue(adapter);

            await service.getQuotes(request, tenant);

            expect(dbQueryMock).toHaveBeenCalledTimes(2);

            const [logSql, logParams] = dbQueryMock.mock.calls[1];

            expect(logSql).toContain(
                'insert into "flow_ship_test".provider_call_logs',
            );
            expect(logParams[0]).toBe('provider-1');
            expect(logParams[1]).toBe('get_quote');
            expect(logParams[4]).toBe('success');
            expect(logParams[6]).toBeNull();
        });

        it('should write a failed log when the provider throws an error', async () => {
            const failingAdapter: CarrierAdapter = {
                code: CarrierCode.MOCK,
                getQuote: jest.fn().mockRejectedValue(
                    new Error('Provider unavailable'),
                ),
            };

            dbQueryMock
                .mockResolvedValueOnce([provider])
                .mockResolvedValueOnce([]);

            getAdapterMock.mockReturnValue(failingAdapter);

            await service.getQuotes(request, tenant);

            expect(dbQueryMock).toHaveBeenCalledTimes(2);

            const [logSql, logParams] = dbQueryMock.mock.calls[1];

            expect(logSql).toContain(
                'insert into "flow_ship_test".provider_call_logs',
            );
            expect(logParams[0]).toBe('provider-1');
            expect(logParams[1]).toBe('get_quote');
            expect(logParams[3]).toBeNull();
            expect(logParams[4]).toBe('failed');
            expect(logParams[6]).toBe('Provider unavailable');
        });

        it('should reject an invalid tenant schema before querying the database', async () => {
            const invalidTenant = {
                ...tenant,
                schemaName: 'flow_ship_test; drop table providers;',
            };

            await expect(
                service.getQuotes(request, invalidTenant),
            ).rejects.toThrow('Invalid schema name');

            expect(dbQueryMock).not.toHaveBeenCalled();
            expect(getAdapterMock).not.toHaveBeenCalled();
        });
    });
});
