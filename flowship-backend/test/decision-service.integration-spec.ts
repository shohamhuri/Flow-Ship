import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';

import { DbService } from '../src/infrastructure/database/db.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import {
    DecisionService,
    ScoredShipmentPlanDeliveryOption,
} from '../src/modules/decision/decision.service';

import { ShipmentPlanDeliveryOption } from '../src/modules/planning/interfaces/shipment-plan-delivery-option.interface';

describe('DecisionService Integration', () => {
    let db: DbService;

    let tenantsService: TenantsService;

    let decisionService: DecisionService;

    let config: ConfigService;

    let tenantA: CurrentTenant;
    let tenantB: CurrentTenant;

    let criterionAPriceId: string;
    let criterionASpeedId: string;

    let criterionBPriceId: string;

    let cardAPriceId: string;
    let cardASpeedId: string;

    let settingsAId: string;
    let settingsBId: string;

    let checkoutAId: string;

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
                    DecisionService,
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

        decisionService =
            moduleRef.get(
                DecisionService,
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

        criterionAPriceId =
            randomUUID();

        criterionASpeedId =
            randomUUID();

        criterionBPriceId =
            randomUUID();

        cardAPriceId =
            randomUUID();

        cardASpeedId =
            randomUUID();

        settingsAId =
            randomUUID();

        settingsBId =
            randomUUID();

        checkoutAId =
            randomUUID();

        /*
         * כדי שהטסט לא יהיה תלוי
         * בנתונים שנשארו מטסטים אחרים,
         * נכבה זמנית decision rows קיימים
         * ב-test schemas.
         */
        await db.query(
            `
            update flow_ship_test_a.decision_criteria
            set is_active = false
            `,
        );

        await db.query(
            `
            update flow_ship_test_b.decision_criteria
            set is_active = false
            `,
        );

        await db.query(
            `
            update flow_ship_test_a.decision_priority_cards
            set is_active = false
            `,
        );

        await db.query(
            `
            update flow_ship_test_b.decision_priority_cards
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
         * Tenant A criteria
         */
        await db.query(
            `
            insert into flow_ship_test_a.decision_criteria (
                id,
                key,
                label,
                description,
                weight,
                is_active
            )
            values
                (
                    $1,
                    'price',
                    'Integration Price A',
                    'Price criterion A',
                    0.7,
                    true
                ),
                (
                    $2,
                    'speed',
                    'Integration Speed A',
                    'Speed criterion A',
                    0.3,
                    true
                )
            `,
            [
                criterionAPriceId,
                criterionASpeedId,
            ],
        );

        /*
         * Tenant B
         */
        await db.query(
            `
            insert into flow_ship_test_b.decision_criteria (
                id,
                key,
                label,
                description,
                weight,
                is_active
            )
            values (
                $1,
                'price',
                'Integration Price B',
                'Price criterion B',
                0.9,
                true
            )
            `,
            [
                criterionBPriceId,
            ],
        );

        /*
         * Decision settings.
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
                0.7,
                0.2,
                0.1,
                true
            )
            `,
            [
                settingsAId,
            ],
        );

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

        /*
         * Priority cards של Tenant A.
         *
         * rank 1 => price
         * rank 2 => speed
         */
        await db.query(
            `
            insert into flow_ship_test_a.decision_priority_cards (
                id,
                provider_id,
                criterion_key,
                title,
                priority_rank,
                is_active,
                config
            )
            values
                (
                    $1,
                    null,
                    'price',
                    'Integration Price Card',
                    1,
                    true,
                    '{}'::jsonb
                ),
                (
                    $2,
                    null,
                    'speed',
                    'Integration Speed Card',
                    2,
                    true,
                    '{}'::jsonb
                )
            `,
            [
                cardAPriceId,
                cardASpeedId,
            ],
        );

        /*
         * checkout אמיתי בשביל
         * shipment_decisions.
         */
        await db.query(
            `
            insert into flow_ship_test_a.checkouts (
                id,
                external_order_id,
                platform,
                status,
                raw_payload
            )
            values (
                $1,
                $2,
                'integration-test',
                'processing',
                '{}'::jsonb
            )
            `,
            [
                checkoutAId,
                `DECISION-${Date.now()}`,
            ],
        );
    }, 30000);

    afterAll(async () => {
        await db.query(
            `
            delete from flow_ship_test_a.shipment_decisions
            where checkout_id = $1
            `,
            [
                checkoutAId,
            ],
        );

        await db.query(
            `
            delete from flow_ship_test_a.checkouts
            where id = $1
            `,
            [
                checkoutAId,
            ],
        );

        await db.query(
            `
            delete from flow_ship_test_a.decision_priority_cards
            where id = any($1::uuid[])
            `,
            [[
                cardAPriceId,
                cardASpeedId,
            ]],
        );

        await db.query(
            `
            delete from flow_ship_test_a.decision_criteria
            where id = any($1::uuid[])
            `,
            [[
                criterionAPriceId,
                criterionASpeedId,
            ]],
        );

        await db.query(
            `
            delete from flow_ship_test_b.decision_criteria
            where id = $1
            `,
            [
                criterionBPriceId,
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

    function createDeliveryOptions():
        ShipmentPlanDeliveryOption[] {

        return [
            {
                id:
                    randomUUID(),

                planId:
                    randomUUID(),

                selectedGroupQuotes: [
                    {
                        groupId:
                            randomUUID(),

                        pickupCities: [
                            'Tel Aviv',
                        ],

                        destinationCity:
                            'Jerusalem',

                        weightKg:
                            5,

                        quote: {
                            providerId:
                                randomUUID(),

                            providerCode:
                                'cheap-provider',

                            adapterKey:
                                'cheap-adapter',

                            carrierName:
                                'Cheap Carrier',

                            serviceName:
                                'Standard',

                            price:
                                20,

                            currency:
                                'ILS',

                            estimatedDays:
                                3,

                            providerPriority:
                                0.5,
                        },
                    },
                ],

                metrics: {
                    totalShippingPrice:
                        20,

                    estimatedDeliveryDays:
                        3,

                    averageProviderPriority:
                        0.5,

                    shipmentCount:
                        1,
                },
            },

            {
                id:
                    randomUUID(),

                planId:
                    randomUUID(),

                selectedGroupQuotes: [
                    {
                        groupId:
                            randomUUID(),

                        pickupCities: [
                            'Tel Aviv',
                        ],

                        destinationCity:
                            'Jerusalem',

                        weightKg:
                            5,

                        quote: {
                            providerId:
                                randomUUID(),

                            providerCode:
                                'fast-provider',

                            adapterKey:
                                'fast-adapter',

                            carrierName:
                                'Fast Carrier',

                            serviceName:
                                'Express',

                            price:
                                50,

                            currency:
                                'ILS',

                            estimatedDays:
                                1,

                            providerPriority:
                                0.5,
                        },
                    },
                ],

                metrics: {
                    totalShippingPrice:
                        50,

                    estimatedDeliveryDays:
                        1,

                    averageProviderPriority:
                        0.5,

                    shipmentCount:
                        1,
                },
            },
        ];
    }

    it(
        'should load active Tenant A criteria from the real database',
        async () => {
            const criteria =
                await decisionService
                    .getCriteriaForTenant(
                        tenantA,
                    );

            expect(
                criteria,
            ).toEqual([
                {
                    key:
                        'price',

                    label:
                        'Integration Price A',

                    weight:
                        0.7,

                    isActive:
                        true,
                },

                {
                    key:
                        'speed',

                    label:
                        'Integration Speed A',

                    weight:
                        0.3,

                    isActive:
                        true,
                },
            ]);
        },
    );

    it(
        'should keep decision criteria isolated between tenants',
        async () => {
            const criteria =
                await decisionService
                    .getCriteriaForTenant(
                        tenantB,
                    );

            expect(
                criteria,
            ).toEqual([
                {
                    key:
                        'price',

                    label:
                        'Integration Price B',

                    weight:
                        0.9,

                    isActive:
                        true,
                },
            ]);

            expect(
                criteria.some(
                    (criterion) =>
                        criterion.label ===
                        'Integration Price A',
                ),
            ).toBe(false);
        },
    );

    it(
        'should load Tenant A decision settings from the database',
        async () => {
            const settings =
                await decisionService
                    .getDecisionSettings(
                        tenantA,
                    );

            expect(
                settings,
            ).toEqual({
                priceWeight:
                    0.7,

                speedWeight:
                    0.2,

                providerPriorityWeight:
                    0.1,
            });
        },
    );

    it(
        'should load different Tenant B decision settings',
        async () => {
            const settings =
                await decisionService
                    .getDecisionSettings(
                        tenantB,
                    );

            expect(
                settings,
            ).toEqual({
                priceWeight:
                    0.2,

                speedWeight:
                    0.7,

                providerPriorityWeight:
                    0.1,
            });
        },
    );

    it(
        'should load active priority cards ordered by priority rank',
        async () => {
            const cards =
                await decisionService
                    .getActivePriorityCards(
                        tenantA,
                    );

            expect(
                cards,
            ).toHaveLength(
                2,
            );

            expect(
                cards.map(
                    (card) =>
                        card.id,
                ),
            ).toEqual([
                cardAPriceId,
                cardASpeedId,
            ]);

            expect(
                cards.map(
                    (card) =>
                        card.criterionKey,
                ),
            ).toEqual([
                'price',
                'speed',
            ]);
        },
    );

    it(
        'should calculate priority-card weights based on ranking',
        async () => {
            const cards =
                await decisionService
                    .getActivePriorityCards(
                        tenantA,
                    );

            /*
             * 2 cards:
             *
             * rank 1 => 2 / 3
             * rank 2 => 1 / 3
             */
            expect(
                cards[0].weight,
            ).toBe(
                0.6667,
            );

            expect(
                cards[1].weight,
            ).toBe(
                0.3333,
            );
        },
    );

    it(
        'should use DB priority cards when selecting the best delivery option',
        async () => {
            const cards =
                await decisionService
                    .getActivePriorityCards(
                        tenantA,
                    );

            const options =
                createDeliveryOptions();

            const winner =
                decisionService
                    .selectBestDeliveryOption(
                        options,
                        cards,
                    );

            expect(
                winner,
            ).not.toBeNull();

            /*
             * Price הוא rank 1 ולכן מקבל
             * משקל כפול מ-Speed.
             *
             * option 1:
             * price = 1
             * speed = 0
             * score ~= 0.6667
             *
             * option 2:
             * price = 0
             * speed = 1
             * score ~= 0.3333
             *
             * לכן הזול צריך לנצח.
             */
            expect(
                winner?.id,
            ).toBe(
                options[0].id,
            );

            expect(
                winner?.metrics
                    .totalShippingPrice,
            ).toBe(
                20,
            );
        },
    );

    it(
        'should persist a real shipment decision',
        async () => {
            const cards =
                await decisionService
                    .getActivePriorityCards(
                        tenantA,
                    );

            const options =
                createDeliveryOptions();

            const winner =
                decisionService
                    .selectBestDeliveryOption(
                        options,
                        cards,
                    );

            expect(
                winner,
            ).not.toBeNull();

            await decisionService
                .saveShipmentDecision(
                    tenantA,
                    checkoutAId,
                    'INTEGRATION-ORDER',
                    winner as ScoredShipmentPlanDeliveryOption,
                    cards,
                    options.length,
                );

            const rows =
                await db.query<{
                    checkout_id: string;
                    order_id: string;
                    selected_plan_id: string;
                    selected_delivery_option_id: string;
                    score: string;
                    evaluated_options_count: number;
                    winner_snapshot:
                    Record<string, unknown>;
                    priority_cards_snapshot:
                    unknown[];
                }>(
                    `
                    select
                        checkout_id,
                        order_id,
                        selected_plan_id,
                        selected_delivery_option_id,
                        score,
                        evaluated_options_count,
                        winner_snapshot,
                        priority_cards_snapshot
                    from flow_ship_test_a.shipment_decisions
                    where checkout_id = $1
                    `,
                    [
                        checkoutAId,
                    ],
                );

            expect(
                rows,
            ).toHaveLength(
                1,
            );

            expect(
                rows[0],
            ).toMatchObject({
                checkout_id:
                    checkoutAId,

                order_id:
                    'INTEGRATION-ORDER',

                selected_plan_id:
                    winner!.planId,

                selected_delivery_option_id:
                    winner!.id,

                evaluated_options_count:
                    2,
            });

            expect(
                Number(
                    rows[0].score,
                ),
            ).toBeCloseTo(
                winner!.score,
                4,
            );

            expect(
                rows[0]
                    .winner_snapshot,
            ).toMatchObject({
                id:
                    winner!.id,

                planId:
                    winner!.planId,
            });

            expect(
                rows[0]
                    .priority_cards_snapshot,
            ).toHaveLength(
                2,
            );
        },
    );

    it(
        'should update the existing shipment decision instead of creating a duplicate',
        async () => {
            const cards =
                await decisionService
                    .getActivePriorityCards(
                        tenantA,
                    );

            const options =
                createDeliveryOptions();

            const winner =
                decisionService
                    .selectBestDeliveryOption(
                        options,
                        cards,
                    );

            expect(
                winner,
            ).not.toBeNull();

            await decisionService
                .saveShipmentDecision(
                    tenantA,
                    checkoutAId,
                    'INTEGRATION-ORDER',
                    winner as ScoredShipmentPlanDeliveryOption,
                    cards,
                    99,
                );

            const rows =
                await db.query<{
                    count: string;
                    max_evaluated_options_count:
                    number;
                }>(
                    `
                    select
                        count(*)::text as count,
                        max(evaluated_options_count)
                            as max_evaluated_options_count
                    from flow_ship_test_a.shipment_decisions
                    where checkout_id = $1
                    `,
                    [
                        checkoutAId,
                    ],
                );

            expect(
                rows[0].count,
            ).toBe(
                '1',
            );

            expect(
                rows[0]
                    .max_evaluated_options_count,
            ).toBe(
                99,
            );
        },
    );
});