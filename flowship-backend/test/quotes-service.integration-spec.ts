import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';

import { DbService } from '../src/infrastructure/database/db.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import { CarrierRegistry } from '../src/modules/carriers/carrier-registry.service';
import { CarriersService } from '../src/modules/carriers/carriers.service';

import { MockCarrierAdapter } from '../src/modules/carriers/adapters/mock-carrier.adapter';
import { MockYangoAdapter } from '../src/modules/carriers/adapters/mock-yango.adapter';

import { DecisionService } from '../src/modules/decision/decision.service';
import { QuotesService } from '../src/modules/quotes/quotes.service';

describe(
    'QuotesService Integration',
    () => {
        let db: DbService;

        let tenantsService: TenantsService;

        let quotesService: QuotesService;

        let config: ConfigService;

        let tenantA: CurrentTenant;
        let tenantB: CurrentTenant;

        let providerAMockId: string;
        let providerAYangoId: string;
        let providerAInvalidId: string;

        let providerBMockId: string;

        let settingsAId: string;
        let settingsBId: string;

        beforeAll(async () => {
            const moduleRef =
                await Test.createTestingModule({
                    imports: [
                        ConfigModule.forRoot({
                            isGlobal: true,
                        }),
                    ],

                    providers: [
                        DbService,
                        TenantsService,

                        MockCarrierAdapter,
                        MockYangoAdapter,

                        CarrierRegistry,
                        CarriersService,

                        DecisionService,

                        QuotesService,
                    ],
                }).compile();

            db =
                moduleRef.get(
                    DbService,
                );

            tenantsService =
                moduleRef.get(
                    TenantsService,
                );

            quotesService =
                moduleRef.get(
                    QuotesService,
                );

            config =
                moduleRef.get(
                    ConfigService,
                );

            const tenantAApiKey =
                config.get<string>(
                    'TEST_FLOW_SHIP_A_API_KEY',
                );

            const tenantBApiKey =
                config.get<string>(
                    'TEST_FLOW_SHIP_B_API_KEY',
                );

            if (!tenantAApiKey) {
                throw new Error(
                    'Missing TEST_FLOW_SHIP_A_API_KEY',
                );
            }

            if (!tenantBApiKey) {
                throw new Error(
                    'Missing TEST_FLOW_SHIP_B_API_KEY',
                );
            }

            tenantA =
                await tenantsService
                    .findByApiKey(
                        tenantAApiKey,
                    );

            tenantB =
                await tenantsService
                    .findByApiKey(
                        tenantBApiKey,
                    );

            providerAMockId =
                randomUUID();

            providerAYangoId =
                randomUUID();

            providerAInvalidId =
                randomUUID();

            providerBMockId =
                randomUUID();

            settingsAId =
                randomUUID();

            settingsBId =
                randomUUID();

            /*
             * מבטלים נתוני test קיימים
             * כדי לקבל תוצאה deterministic.
             */
            await db.query(
                `
                update flow_ship_test_a.providers
                set is_active = false
                `,
            );

            await db.query(
                `
                update flow_ship_test_b.providers
                set is_active = false
                `,
            );

            await db.query(
                `
                update flow_ship_test_a.decision_settings
                set is_active = false
                `,
            );

            await db.query(
                `
                update flow_ship_test_b.decision_settings
                set is_active = false
                `,
            );

            /*
             * Tenant A providers.
             */
            await db.query(
                `
                insert into flow_ship_test_a.providers (
                    id,
                    code,
                    name,
                    adapter_key,
                    is_mock,
                    is_active,
                    priority_score
                )
                values
                    (
                        $1,
                        'quotes-a-mock',
                        'Quotes A Mock',
                        'mock',
                        true,
                        true,
                        0.50
                    ),
                    (
                        $2,
                        'quotes-a-yango',
                        'Quotes A Yango',
                        'mock-yango',
                        true,
                        true,
                        0.50
                    ),
                    (
                        $3,
                        'quotes-a-invalid',
                        'Quotes A Invalid',
                        'does-not-exist',
                        true,
                        false,
                        0.50
                    )
                `,
                [
                    providerAMockId,
                    providerAYangoId,
                    providerAInvalidId,
                ],
            );

            /*
             * Tenant B provider.
             */
            await db.query(
                `
                insert into flow_ship_test_b.providers (
                    id,
                    code,
                    name,
                    adapter_key,
                    is_mock,
                    is_active,
                    priority_score
                )
                values (
                    $1,
                    'quotes-b-mock',
                    'Quotes B Mock',
                    'mock',
                    true,
                    true,
                    0.90
                )
                `,
                [
                    providerBMockId,
                ],
            );

            /*
             * Tenant A מתחיל עם העדפה חזקה למחיר.
             */
            await db.query(
                `
                insert into flow_ship_test_a.decision_settings (
                    id,
                    price_weight,
                    speed_weight,
                    provider_priority_weight,
                    is_active
                )
                values (
                    $1,
                    0.8,
                    0.1,
                    0.1,
                    true
                )
                `,
                [
                    settingsAId,
                ],
            );

            /*
             * Tenant B settings שונים.
             */
            await db.query(
                `
                insert into flow_ship_test_b.decision_settings (
                    id,
                    price_weight,
                    speed_weight,
                    provider_priority_weight,
                    is_active
                )
                values (
                    $1,
                    0.2,
                    0.7,
                    0.1,
                    true
                )
                `,
                [
                    settingsBId,
                ],
            );
        }, 30000);

        afterAll(async () => {
            await db.query(
                `
                delete from flow_ship_test_a.provider_call_logs
                where provider_id = any($1::uuid[])
                `,
                [[
                    providerAMockId,
                    providerAYangoId,
                    providerAInvalidId,
                ]],
            );

            await db.query(
                `
                delete from flow_ship_test_b.provider_call_logs
                where provider_id = $1
                `,
                [
                    providerBMockId,
                ],
            );

            await db.query(
                `
                delete from flow_ship_test_a.providers
                where id = any($1::uuid[])
                `,
                [[
                    providerAMockId,
                    providerAYangoId,
                    providerAInvalidId,
                ]],
            );

            await db.query(
                `
                delete from flow_ship_test_b.providers
                where id = $1
                `,
                [
                    providerBMockId,
                ],
            );

            await db.query(
                `
                delete from flow_ship_test_a.decision_settings
                where id = $1
                `,
                [
                    settingsAId,
                ],
            );

            await db.query(
                `
                delete from flow_ship_test_b.decision_settings
                where id = $1
                `,
                [
                    settingsBId,
                ],
            );

            await db.onModuleDestroy();
        }, 30000);

        function createDto() {
            return {
                pickupCities: [
                    'Tel Aviv',
                ],

                destinationCity:
                    'Jerusalem',

                weightKg:
                    3,
            };
        }

        it(
            'should return the current tenant information',
            async () => {
                const result =
                    await quotesService
                        .getQuoteOptions(
                            createDto(),
                            tenantA,
                        );

                expect(
                    result.ok,
                ).toBe(
                    true,
                );

                expect(
                    result.tenant,
                ).toEqual({
                    id:
                        tenantA.id,

                    name:
                        tenantA.name,

                    schemaName:
                        'flow_ship_test_a',
                });
            },
        );

        it(
            'should return quotes from all active Tenant A providers',
            async () => {
                const result =
                    await quotesService
                        .getQuoteOptions(
                            createDto(),
                            tenantA,
                        );

                expect(
                    result.count,
                ).toBe(
                    2,
                );

                expect(
                    result.quotes,
                ).toHaveLength(
                    2,
                );

                expect(
                    result.failedProviders,
                ).toHaveLength(
                    0,
                );

                const providerIds =
                    result.quotes
                        .map(
                            (quote) =>
                                quote.providerId,
                        )
                        .sort();

                expect(
                    providerIds,
                ).toEqual(
                    [
                        providerAMockId,
                        providerAYangoId,
                    ].sort(),
                );
            },
        );

        it(
            'should return decision settings loaded from the real database',
            async () => {
                const result =
                    await quotesService
                        .getQuoteOptions(
                            createDto(),
                            tenantA,
                        );

                expect(
                    result.decisionSettings,
                ).toEqual({
                    priceWeight:
                        0.8,

                    speedWeight:
                        0.1,

                    providerPriorityWeight:
                        0.1,
                });
            },
        );

        it(
            'should select the cheap Mock quote when price has the highest weight',
            async () => {
                const result =
                    await quotesService
                        .getQuoteOptions(
                            createDto(),
                            tenantA,
                        );

                expect(
                    result.bestQuote,
                ).not.toBeNull();

                expect(
                    result.bestQuote,
                ).toMatchObject({
                    providerId:
                        providerAMockId,

                    providerCode:
                        'quotes-a-mock',

                    carrierName:
                        'Mock Express',

                    serviceName:
                        'Budget Delivery',

                    price:
                        15,

                    estimatedDays:
                        7,
                });

                /*
                 * Mock:
                 * priceScore = 1
                 * speedScore = 0
                 * providerPriority = 0.5
                 *
                 * 1 * 0.8 +
                 * 0 * 0.1 +
                 * 0.5 * 0.1
                 * = 0.85
                 */
                expect(
                    result.bestQuote?.score,
                ).toBe(
                    0.85,
                );
            },
        );

        it(
            'should select the fast Yango quote when speed has the highest weight',
            async () => {
                await db.query(
                    `
                    update flow_ship_test_a.decision_settings
                    set
                        price_weight = 0.1,
                        speed_weight = 0.8,
                        provider_priority_weight = 0.1
                    where id = $1
                    `,
                    [
                        settingsAId,
                    ],
                );

                const result =
                    await quotesService
                        .getQuoteOptions(
                            createDto(),
                            tenantA,
                        );

                expect(
                    result.decisionSettings,
                ).toEqual({
                    priceWeight:
                        0.1,

                    speedWeight:
                        0.8,

                    providerPriorityWeight:
                        0.1,
                });

                expect(
                    result.bestQuote,
                ).toMatchObject({
                    providerId:
                        providerAYangoId,

                    providerCode:
                        'quotes-a-yango',

                    carrierName:
                        'Mock Yango',

                    serviceName:
                        'Yango Same Day',

                    price:
                        150,

                    estimatedDays:
                        0,
                });

                /*
                 * Yango:
                 * priceScore = 0
                 * speedScore = 1
                 * providerPriority = 0.5
                 *
                 * 0 * 0.1 +
                 * 1 * 0.8 +
                 * 0.5 * 0.1
                 * = 0.85
                 */
                expect(
                    result.bestQuote?.score,
                ).toBe(
                    0.85,
                );
            },
        );

        it(
            'should change the winning quote when decision settings change in the database',
            async () => {
                /*
                 * מחיר קודם.
                 */
                await db.query(
                    `
                    update flow_ship_test_a.decision_settings
                    set
                        price_weight = 0.8,
                        speed_weight = 0.1,
                        provider_priority_weight = 0.1
                    where id = $1
                    `,
                    [
                        settingsAId,
                    ],
                );

                const priceResult =
                    await quotesService
                        .getQuoteOptions(
                            createDto(),
                            tenantA,
                        );

                expect(
                    priceResult.bestQuote
                        ?.providerId,
                ).toBe(
                    providerAMockId,
                );

                /*
                 * עכשיו משנים רק config ב-DB.
                 */
                await db.query(
                    `
                    update flow_ship_test_a.decision_settings
                    set
                        price_weight = 0.1,
                        speed_weight = 0.8,
                        provider_priority_weight = 0.1
                    where id = $1
                    `,
                    [
                        settingsAId,
                    ],
                );

                const speedResult =
                    await quotesService
                        .getQuoteOptions(
                            createDto(),
                            tenantA,
                        );

                expect(
                    speedResult.bestQuote
                        ?.providerId,
                ).toBe(
                    providerAYangoId,
                );

                expect(
                    speedResult.bestQuote
                        ?.providerId,
                ).not.toBe(
                    priceResult.bestQuote
                        ?.providerId,
                );
            },
        );

        it(
            'should keep returning successful quotes when one provider has an invalid adapter',
            async () => {
                await db.query(
                    `
                    update flow_ship_test_a.providers
                    set is_active = true
                    where id = $1
                    `,
                    [
                        providerAInvalidId,
                    ],
                );

                const result =
                    await quotesService
                        .getQuoteOptions(
                            createDto(),
                            tenantA,
                        );

                expect(
                    result.ok,
                ).toBe(
                    true,
                );

                expect(
                    result.count,
                ).toBe(
                    2,
                );

                expect(
                    result.quotes,
                ).toHaveLength(
                    2,
                );

                expect(
                    result.bestQuote,
                ).not.toBeNull();

                expect(
                    result.failedProviders,
                ).toHaveLength(
                    1,
                );

                expect(
                    result.failedProviders[0],
                ).toMatchObject({
                    providerCode:
                        'quotes-a-invalid',

                    providerName:
                        'Quotes A Invalid',

                    adapterKey:
                        'does-not-exist',
                });

                expect(
                    result.failedProviders[0]
                        .error,
                ).toContain(
                    'Carrier adapter not found',
                );

                /*
                 * Restore.
                 */
                await db.query(
                    `
                    update flow_ship_test_a.providers
                    set is_active = false
                    where id = $1
                    `,
                    [
                        providerAInvalidId,
                    ],
                );
            },
        );

        it(
            'should keep providers and decision settings isolated between tenants',
            async () => {
                const result =
                    await quotesService
                        .getQuoteOptions(
                            createDto(),
                            tenantB,
                        );

                expect(
                    result.tenant.schemaName,
                ).toBe(
                    'flow_ship_test_b',
                );

                expect(
                    result.decisionSettings,
                ).toEqual({
                    priceWeight:
                        0.2,

                    speedWeight:
                        0.7,

                    providerPriorityWeight:
                        0.1,
                });

                expect(
                    result.count,
                ).toBe(
                    1,
                );

                expect(
                    result.quotes,
                ).toHaveLength(
                    1,
                );

                expect(
                    result.quotes[0],
                ).toMatchObject({
                    providerId:
                        providerBMockId,

                    providerCode:
                        'quotes-b-mock',

                    carrierName:
                        'Mock Express',

                    price:
                        15,

                    providerPriority:
                        0.9,
                });

                expect(
                    result.quotes.some(
                        (quote) =>
                            quote.providerId ===
                            providerAMockId ||
                            quote.providerId ===
                            providerAYangoId,
                    ),
                ).toBe(
                    false,
                );
            },
        );
    },
);