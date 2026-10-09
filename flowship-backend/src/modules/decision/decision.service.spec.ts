import { DecisionService } from './decision.service';
import { DbService } from '../../infrastructure/database/db.service';
import { CarrierQuoteOption } from '../carriers/interfaces/carrier-adapter.interface';

describe('DecisionService', () => {
    let service: DecisionService;
    let dbQueryMock: jest.Mock;

    const tenant = {
        id: 'tenant-1',
        name: 'FLOW_SHIP_TEST',
        schemaName: 'flow_ship_test',
        status: 'active',
    };

    const createQuote = (
        overrides: Partial<CarrierQuoteOption> = {},
    ): CarrierQuoteOption => ({
        carrierName: 'Test Carrier',
        serviceName: 'Standard',
        price: 30,
        currency: 'ILS',
        estimatedDays: 2,
        providerPriority: 0.5,
        providerId: 'provider-1',
        providerCode: 'TEST',
        adapterKey: 'mock',
        ...overrides,
    });

    beforeEach(() => {
        dbQueryMock = jest.fn();

        const dbMock = {
            query: dbQueryMock,
        } as unknown as DbService;

        service = new DecisionService(dbMock);
    });

    describe('selectBestQuote', () => {
        it('should return null when there are no quotes', () => {
            const result = service.selectBestQuote([], {
                priceWeight: 0.6,
                speedWeight: 0.3,
                providerPriorityWeight: 0.1,
            });

            expect(result).toBeNull();
        });

        it('should select the cheapest quote when only price has weight', () => {
            const cheapQuote = createQuote({
                carrierName: 'Cheap Carrier',
                price: 25,
                estimatedDays: 3,
            });

            const expensiveQuote = createQuote({
                carrierName: 'Expensive Carrier',
                price: 45,
                estimatedDays: 1,
            });

            const result = service.selectBestQuote(
                [cheapQuote, expensiveQuote],
                {
                    priceWeight: 1,
                    speedWeight: 0,
                    providerPriorityWeight: 0,
                },
            );

            expect(result?.carrierName).toBe('Cheap Carrier');
            expect(result?.scoreBreakdown.priceScore).toBe(1);
        });

        it('should select the fastest quote when only speed has weight', () => {
            const slowQuote = createQuote({
                carrierName: 'Slow Carrier',
                price: 20,
                estimatedDays: 4,
            });

            const fastQuote = createQuote({
                carrierName: 'Fast Carrier',
                price: 50,
                estimatedDays: 1,
            });

            const result = service.selectBestQuote(
                [slowQuote, fastQuote],
                {
                    priceWeight: 0,
                    speedWeight: 1,
                    providerPriorityWeight: 0,
                },
            );

            expect(result?.carrierName).toBe('Fast Carrier');
            expect(result?.scoreBreakdown.speedScore).toBe(1);
        });

        it('should use provider priority when quotes have the same price and speed', () => {
            const lowPriorityQuote = createQuote({
                carrierName: 'Low Priority',
                providerPriority: 0.2,
            });

            const highPriorityQuote = createQuote({
                carrierName: 'High Priority',
                providerPriority: 0.9,
            });

            const result = service.selectBestQuote(
                [lowPriorityQuote, highPriorityQuote],
                {
                    priceWeight: 0,
                    speedWeight: 0,
                    providerPriorityWeight: 1,
                },
            );

            expect(result?.carrierName).toBe('High Priority');
            expect(
                result?.scoreBreakdown.providerPriorityScore,
            ).toBe(0.9);
        });

        it('should default provider priority to 0.5 when it is missing', () => {
            const quote = createQuote({
                providerPriority: undefined,
            });

            const result = service.selectBestQuote([quote], {
                priceWeight: 0,
                speedWeight: 0,
                providerPriorityWeight: 1,
            });

            expect(result?.score).toBe(0.5);
            expect(
                result?.scoreBreakdown.providerPriorityScore,
            ).toBe(0.5);
        });

        it('should apply the configured weights to the final score', () => {
            const cheapSlowQuote = createQuote({
                carrierName: 'Cheap Slow',
                price: 25,
                estimatedDays: 3,
                providerPriority: 0.5,
            });

            const expensiveFastQuote = createQuote({
                carrierName: 'Expensive Fast',
                price: 45,
                estimatedDays: 1,
                providerPriority: 0.5,
            });

            const result = service.selectBestQuote(
                [cheapSlowQuote, expensiveFastQuote],
                {
                    priceWeight: 0.6,
                    speedWeight: 0.3,
                    providerPriorityWeight: 0.1,
                },
            );

            expect(result?.carrierName).toBe('Cheap Slow');
            expect(result?.score).toBe(0.65);
            expect(result?.scoreBreakdown).toEqual({
                priceScore: 1,
                speedScore: 0,
                providerPriorityScore: 0.5,
            });
        });
    });
    describe('selectBestDeliveryOption', () => {
        it('should use shipment count when scoring delivery options', () => {
            const optionWithOneShipment = {
                id: 'option-1',
                planId: 'plan-1',
                selectedGroupQuotes: [],
                metrics: {
                    totalShippingPrice: 50,
                    estimatedDeliveryDays: 1,
                    averageProviderPriority: 0.9,
                    shipmentCount: 1,
                },
            };

            const optionWithTwoShipments = {
                id: 'option-2',
                planId: 'plan-1',
                selectedGroupQuotes: [],
                metrics: {
                    totalShippingPrice: 50,
                    estimatedDeliveryDays: 1,
                    averageProviderPriority: 0.9,
                    shipmentCount: 2,
                },
            };

            const result =
                service.selectBestDeliveryOption(
                    [
                        optionWithOneShipment,
                        optionWithTwoShipments,
                    ],
                    [
                        {
                            id: 'shipment-count-card',
                            criterionKey: 'shipment_count',
                            providerId: null,
                            weight: 1,
                        },
                    ] as any,
                );

            expect(result?.id).toBe(
                'option-1',
            );

            expect(
                result?.scoreBreakdown
                    .shipmentCountScore,
            ).toBe(1);
        });
        it('should use provider priority when scoring delivery options', () => {
            const lowPriorityOption = {
                id: 'option-low-priority',
                planId: 'plan-1',
                selectedGroupQuotes: [],
                metrics: {
                    totalShippingPrice: 50,
                    estimatedDeliveryDays: 1,
                    averageProviderPriority: 0.2,
                    shipmentCount: 2,
                },
            };

            const highPriorityOption = {
                id: 'option-high-priority',
                planId: 'plan-1',
                selectedGroupQuotes: [],
                metrics: {
                    totalShippingPrice: 50,
                    estimatedDeliveryDays: 1,
                    averageProviderPriority: 0.9,
                    shipmentCount: 2,
                },
            };

            const result =
                service.selectBestDeliveryOption(
                    [
                        lowPriorityOption,
                        highPriorityOption,
                    ],
                    [
                        {
                            id: 'provider-priority-card',
                            criterionKey: 'provider_priority',
                            providerId: null,
                            weight: 1,
                        },
                    ] as any,
                );

            expect(result?.id).toBe(
                'option-high-priority',
            );

            expect(
                result?.scoreBreakdown
                    .providerPriorityScore,
            ).toBe(0.9);
        });
    });
    describe('getDecisionSettings', () => {
        it('should return default settings when the database has no active settings', async () => {
            dbQueryMock.mockResolvedValue([]);

            const result = await service.getDecisionSettings(tenant);

            expect(result).toEqual({
                priceWeight: 0.6,
                speedWeight: 0.3,
                providerPriorityWeight: 0.1,
            });
        });

        it('should convert database string weights to numbers', async () => {
            dbQueryMock.mockResolvedValue([
                {
                    price_weight: '0.5',
                    speed_weight: '0.35',
                    provider_priority_weight: '0.15',
                },
            ]);

            const result = await service.getDecisionSettings(tenant);

            expect(result).toEqual({
                priceWeight: 0.5,
                speedWeight: 0.35,
                providerPriorityWeight: 0.15,
            });
        });

        it('should reject an invalid tenant schema before querying the database', async () => {
            const invalidTenant = {
                ...tenant,
                schemaName: 'flow_ship_test; drop table providers;',
            };

            await expect(
                service.getDecisionSettings(invalidTenant),
            ).rejects.toThrow('Invalid schema name');

            expect(dbQueryMock).not.toHaveBeenCalled();
        });
    });
});
