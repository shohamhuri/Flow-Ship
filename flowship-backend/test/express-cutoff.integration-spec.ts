
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { DbService } from '../src/infrastructure/database/db.service';
import { DeliverySettingsService } from '../src/modules/planning/delivery-settings.service';
import { CurrentTenant } from '../src/modules/tenants/tenants.service';
import { ShipmentPlanQuoteService } from '../src/modules/planning/shipment-plan-quote.service';
import { CarriersService } from '../src/modules/carriers/carriers.service';
import { CapacityPlanningService } from '../src/modules/checkout/capacity-planning.service';
import { DistanceProvider } from '../src/modules/sourcing/interfaces/distance-provider.interface';
describe('Express Cutoff Integration', () => {
    let moduleRef: TestingModule;
    let db: DbService;
    let deliverySettingsService: DeliverySettingsService;

    const tenant = {
        id: 'flow-ship-test',
        name: 'FLOW_SHIP_TEST',
        schemaName: 'flow_ship_test',
        timezone: 'Asia/Jerusalem',
    } as CurrentTenant;

    beforeAll(async () => {
        moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({
                    isGlobal: true,
                }),
            ],
            providers: [
                DbService,
                DeliverySettingsService,
            ],
        }).compile();

        db = moduleRef.get(DbService);
        deliverySettingsService =
            moduleRef.get(DeliverySettingsService);
    });

    afterAll(async () => {
        await moduleRef?.close();
    });

    it('loads the real express cutoff settings from Supabase', async () => {
        const settings =
            await deliverySettingsService.getSettings(tenant);

        expect(settings).toEqual({
            expressMaxMinutes: 120,
            sameDayMaxMinutes: 1440,
            expressCutoffTime: '12:00:00',
            expressAfterCutoffMode: 'extended',
            expressAfterCutoffMaxMinutes: 300,
        });
    });
    it('uses real tenant cutoff settings to filter carrier urgencies', async () => {
        const carriersMock = {
            getQuotes: jest.fn().mockResolvedValue({
                quotes: [],
                failedProviders: [],
            }),
            getActiveProviders: jest.fn().mockResolvedValue([]),
        };

        const distanceMock = {
            getDistance: jest.fn().mockResolvedValue({
                distanceKm: 15,
                durationMinutes: 60,
            }),
        };

        const capacityMock = {
            planVehiclesForProviders: jest.fn().mockReturnValue([]),
            planVehicleTraceForProvider: jest.fn(),
        };

        const service = new ShipmentPlanQuoteService(
            carriersMock as unknown as CarriersService,
            distanceMock as unknown as DistanceProvider,
            deliverySettingsService,
            capacityMock as unknown as CapacityPlanningService,
        );

        const source = {
            id: 'source-1',
            location: {
                country: 'Israel',
                city: 'Jerusalem',
                street: 'Test Street',
                houseNumber: '10',
            },
        };

        const plan = {
            id: 'plan-1',
            status: 'evaluated',
            assignments: [],
            grouping: {
                orderId: 'order-1',
                shipmentGroups: [{
                    groupId: 'group-1',
                    sources: [source],
                    items: [],
                    totalWeight: 5,
                }],
                ungroupedItems: [],
                totalGroups: 1,
                totalGroupedItems: 1,
                hasUngroupedItems: false,
                splitReasons: [],
            },
            metrics: {
                shipmentCount: 1,
                totalSourceScore: 0.8,
                averageSourceScore: 0.8,
            },
        } as any;

        const destination = {
            country: 'Israel',
            city: 'Tel Aviv',
            street: 'Dizengoff',
            houseNumber: '50',
        };

        // 11:59 and 12:01 in Israel, during daylight saving time.
        const scenarios = [
            {
                orderCreatedAt: '2026-09-27T08:59:00.000Z',
                expected: ['express', 'standard'],
            },
            {
                orderCreatedAt: '2026-09-27T09:01:00.000Z',
                expected: ['urgent', 'express', 'standard'],
            },
        ];

        for (const scenario of scenarios) {
            carriersMock.getQuotes.mockClear();

            const orderCreatedAt = new Date(scenario.orderCreatedAt);

            const confirmations = [{
                plan,
                confirmed: true,
                confirmations: [{
                    sourceId: 'source-1',
                    available: true,
                    preparationMinutes: 90,
                    confirmedAt: orderCreatedAt.toISOString(),
                    items: [],
                }],
            }] as any;

            await service.getQuotesForPlans(
                [plan],
                destination,
                tenant,
                confirmations,
                orderCreatedAt,
            );

            expect(carriersMock.getQuotes).toHaveBeenCalledTimes(1);

            expect(carriersMock.getQuotes).toHaveBeenCalledWith(
                expect.objectContaining({
                    allowedUrgencies: scenario.expected,
                }),
                tenant,
            );
        }
    });
});
