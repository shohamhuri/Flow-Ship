import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';

import { DbService } from '../src/infrastructure/database/db.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import { GroupingStrategySettingsRepository } from '../src/modules/grouping/grouping-strategy-settings.repository';

import { GroupingRulesService } from '../src/modules/grouping/grouping-rules.service';

import { GroupingService } from '../src/modules/grouping/grouping.service';

import { Checkout } from '../src/modules/checkout/interfaces/checkout.interface';

import { ItemSourceAssignment } from '../src/modules/planning/interfaces/shipment-plan.interface';

import { SupplySource } from '../src/modules/sourcing/interfaces/supply-source.interface';

import { RankedSupplySource } from '../src/modules/sourcing/interfaces/source-ranking.interface';

describe(
    'GroupingService + DB Rules Integration',
    () => {
        let db: DbService;

        let tenantsService: TenantsService;

        let groupingRulesService:
            GroupingRulesService;

        let groupingService:
            GroupingService;

        let config: ConfigService;

        let tenantA: CurrentTenant;
        let tenantB: CurrentTenant;

        let aWeightStrategyId: string;
        let aItemsStrategyId: string;

        let bWeightStrategyId: string;
        let bItemsStrategyId: string;

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
                        GroupingStrategySettingsRepository,
                        GroupingRulesService,
                        GroupingService,
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

            groupingRulesService =
                moduleRef.get(
                    GroupingRulesService,
                );

            groupingService =
                moduleRef.get(
                    GroupingService,
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

            aWeightStrategyId =
                randomUUID();

            aItemsStrategyId =
                randomUUID();

            bWeightStrategyId =
                randomUUID();

            bItemsStrategyId =
                randomUUID();

            /*
             * Tenant A:
             * משקל מקסימלי נמוך => נרצה לראות split.
             * maxItems כבוי בהתחלה.
             */
            await db.query(
                `
                insert into flow_ship_test_a.grouping_strategy_settings (
                    id,
                    strategy_key,
                    display_name,
                    is_enabled,
                    execution_order,
                    conflict_priority,
                    config
                )
                values
                    (
                        $1,
                        'split_by_max_weight',
                        'Integration A Max Weight',
                        true,
                        10,
                        100,
                        '{"maxWeightKg":5}'::jsonb
                    ),
                    (
                        $2,
                        'split_by_max_items',
                        'Integration A Max Items',
                        false,
                        20,
                        90,
                        '{"maxItems":10}'::jsonb
                    )
                `,
                [
                    aWeightStrategyId,
                    aItemsStrategyId,
                ],
            );

            /*
             * Tenant B:
             * משקל מקסימלי גבוה => אותו checkout
             * לא אמור להתפצל בגלל משקל.
             */
            await db.query(
                `
                insert into flow_ship_test_b.grouping_strategy_settings (
                    id,
                    strategy_key,
                    display_name,
                    is_enabled,
                    execution_order,
                    conflict_priority,
                    config
                )
                values
                    (
                        $1,
                        'split_by_max_weight',
                        'Integration B Max Weight',
                        true,
                        10,
                        100,
                        '{"maxWeightKg":100}'::jsonb
                    ),
                    (
                        $2,
                        'split_by_max_items',
                        'Integration B Max Items',
                        false,
                        20,
                        90,
                        '{"maxItems":10}'::jsonb
                    )
                `,
                [
                    bWeightStrategyId,
                    bItemsStrategyId,
                ],
            );
        }, 30000);

        afterAll(async () => {
            await db.query(
                `
                delete from flow_ship_test_a.grouping_strategy_settings
                where id = any($1::uuid[])
                `,
                [[
                    aWeightStrategyId,
                    aItemsStrategyId,
                ]],
            );

            await db.query(
                `
                delete from flow_ship_test_b.grouping_strategy_settings
                where id = any($1::uuid[])
                `,
                [[
                    bWeightStrategyId,
                    bItemsStrategyId,
                ]],
            );

            await db.onModuleDestroy();
        }, 30000);

        function createSource():
            SupplySource {

            return {
                id:
                    randomUUID(),

                name:
                    'Integration Warehouse',

                type:
                    'warehouse',

                isActive:
                    true,

                priority:
                    1,

                location: {
                    country:
                        'Israel',

                    city:
                        'Tel Aviv',

                    street:
                        'HaYarkon',

                    houseNumber:
                        '10',
                },
            };
        }

        function rankSource(
            source: SupplySource,
            requestedQuantity = 1,
        ): RankedSupplySource {

            return {
                source,

                availableQuantity:
                    100,

                requestedQuantity,

                hasEnoughStock:
                    true,

                priorityScore:
                    1,

                distanceScore:
                    1,

                scoreBreakdown: {
                    priority:
                        1,

                    distance:
                        1,
                },

                totalScore:
                    1,

                rejectionReasons:
                    [],
            };
        }

        function createCheckout():
            Checkout {

            return {
                orderId:
                    `GROUP-${Date.now()}-${randomUUID()}`,

                storeId:
                    'integration-store',

                destination: {
                    country:
                        'Israel',

                    city:
                        'Tel Aviv',

                    street:
                        'Dizengoff',

                    houseNumber:
                        '100',
                },

                items: [
                    {
                        sku:
                            'GROUP-SKU-1',

                        name:
                            'Product 1',

                        quantity:
                            1,

                        unitWeight:
                            3,

                        unitPrice:
                            100,

                        category:
                            'standard',
                    },
                    {
                        sku:
                            'GROUP-SKU-2',

                        name:
                            'Product 2',

                        quantity:
                            1,

                        unitWeight:
                            3,

                        unitPrice:
                            50,

                        category:
                            'standard',
                    },
                    {
                        sku:
                            'GROUP-SKU-3',

                        name:
                            'Product 3',

                        quantity:
                            1,

                        unitWeight:
                            1,

                        unitPrice:
                            25,

                        category:
                            'standard',
                    },
                ],

                totalItems:
                    3,

                totalPrice:
                    175,

                createdAt:
                    new Date(),
            };
        }

        function createAssignments(
            checkout: Checkout,
            source: SupplySource,
        ): ItemSourceAssignment[] {

            const ranked =
                rankSource(
                    source,
                );

            return checkout.items.map(
                (
                    item,
                    itemIndex,
                ) => ({
                    itemIndex,

                    sku:
                        item.sku,

                    requestedQuantity:
                        item.quantity,

                    selectedSource:
                        ranked,
                }),
            );
        }

        it(
            'should load Tenant A max-weight strategy from the real database',
            async () => {
                const strategies =
                    await groupingRulesService
                        .getActiveStrategies(
                            tenantA,
                        );

                const weightStrategy =
                    strategies.find(
                        (strategy) =>
                            strategy.id ===
                            aWeightStrategyId,
                    );

                expect(
                    weightStrategy,
                ).toBeDefined();

                expect(
                    weightStrategy,
                ).toMatchObject({
                    strategyKey:
                        'split_by_max_weight',

                    isEnabled:
                        true,

                    config: {
                        maxWeightKg:
                            5,
                    },
                });
            },
        );

        it(
            'should apply Tenant A max-weight DB rule to real grouping logic',
            async () => {
                const checkout =
                    createCheckout();

                const source =
                    createSource();

                const assignments =
                    createAssignments(
                        checkout,
                        source,
                    );

                const strategies =
                    await groupingRulesService
                        .getActiveStrategies(
                            tenantA,
                        );

                const result =
                    groupingService
                        .groupShipmentPlan(
                            checkout,
                            assignments,
                            strategies,
                        );

                /*
                 * משקלים:
                 * 3 + 3 + 1
                 *
                 * maxWeightKg = 5
                 *
                 * לכן:
                 * group 1 => 3
                 * group 2 => 3 + 1 = 4
                 */
                expect(
                    result.totalGroups,
                ).toBe(
                    2,
                );

                expect(
                    result.shipmentGroups
                        .map(
                            (group) =>
                                group.totalWeight,
                        ),
                ).toEqual([
                    3,
                    4,
                ]);

                expect(
                    result.shipmentGroups
                        .every(
                            (group) =>
                                group.groupingReasons
                                    .includes(
                                        'MAX_WEIGHT_EXCEEDED',
                                    ),
                        ),
                ).toBe(
                    true,
                );
            },
        );

        it(
            'should not split the same checkout for Tenant B when its max weight is 100kg',
            async () => {
                const checkout =
                    createCheckout();

                const source =
                    createSource();

                const assignments =
                    createAssignments(
                        checkout,
                        source,
                    );

                const strategies =
                    await groupingRulesService
                        .getActiveStrategies(
                            tenantB,
                        );

                const result =
                    groupingService
                        .groupShipmentPlan(
                            checkout,
                            assignments,
                            strategies,
                        );

                expect(
                    result.totalGroups,
                ).toBe(
                    1,
                );

                expect(
                    result.shipmentGroups[0]
                        .totalWeight,
                ).toBe(
                    7,
                );

                expect(
                    result.shipmentGroups[0]
                        .groupingReasons,
                ).not.toContain(
                    'MAX_WEIGHT_EXCEEDED',
                );
            },
        );

        it(
            'should produce different grouping results for the same checkout based on tenant DB rules',
            async () => {
                const checkout =
                    createCheckout();

                const source =
                    createSource();

                const assignments =
                    createAssignments(
                        checkout,
                        source,
                    );

                const strategiesA =
                    await groupingRulesService
                        .getActiveStrategies(
                            tenantA,
                        );

                const strategiesB =
                    await groupingRulesService
                        .getActiveStrategies(
                            tenantB,
                        );

                const resultA =
                    groupingService
                        .groupShipmentPlan(
                            checkout,
                            assignments,
                            strategiesA,
                        );

                const resultB =
                    groupingService
                        .groupShipmentPlan(
                            checkout,
                            assignments,
                            strategiesB,
                        );

                expect(
                    resultA.totalGroups,
                ).toBe(
                    2,
                );

                expect(
                    resultB.totalGroups,
                ).toBe(
                    1,
                );
            },
        );

        it(
            'should apply max-items rule loaded from the database',
            async () => {
                /*
                 * נכבה לרגע את max-weight של B
                 * ונפעיל maxItems = 2.
                 */

                await db.query(
                    `
                    update flow_ship_test_b.grouping_strategy_settings
                    set is_enabled = false
                    where id = $1
                    `,
                    [
                        bWeightStrategyId,
                    ],
                );

                await db.query(
                    `
                    update flow_ship_test_b.grouping_strategy_settings
                    set
                        is_enabled = true,
                        config = '{"maxItems":2}'::jsonb
                    where id = $1
                    `,
                    [
                        bItemsStrategyId,
                    ],
                );

                const checkout =
                    createCheckout();

                const source =
                    createSource();

                const assignments =
                    createAssignments(
                        checkout,
                        source,
                    );

                const strategies =
                    await groupingRulesService
                        .getActiveStrategies(
                            tenantB,
                        );

                const result =
                    groupingService
                        .groupShipmentPlan(
                            checkout,
                            assignments,
                            strategies,
                        );

                expect(
                    result.totalGroups,
                ).toBe(
                    2,
                );

                expect(
                    result.shipmentGroups
                        .map(
                            (group) =>
                                group.totalItems,
                        ),
                ).toEqual([
                    2,
                    1,
                ]);

                expect(
                    result.shipmentGroups
                        .every(
                            (group) =>
                                group.groupingReasons
                                    .includes(
                                        'MAX_ITEMS_EXCEEDED',
                                    ),
                        ),
                ).toBe(
                    true,
                );

                /*
                 * Restore Tenant B.
                 */
                await db.query(
                    `
                    update flow_ship_test_b.grouping_strategy_settings
                    set is_enabled = true
                    where id = $1
                    `,
                    [
                        bWeightStrategyId,
                    ],
                );

                await db.query(
                    `
                    update flow_ship_test_b.grouping_strategy_settings
                    set
                        is_enabled = false,
                        config = '{"maxItems":10}'::jsonb
                    where id = $1
                    `,
                    [
                        bItemsStrategyId,
                    ],
                );
            },
        );

        it(
            'should still separate incompatible handling groups',
            async () => {
                const checkout =
                    createCheckout();

                /*
                 * משקל נמוך מספיק כדי שה-maxWeight
                 * לא יהיה הגורם לפיצול.
                 */
                checkout.items = [
                    {
                        sku:
                            'STANDARD-1',

                        name:
                            'Standard Product',

                        quantity:
                            1,

                        unitWeight:
                            1,

                        unitPrice:
                            10,

                        category:
                            'standard',
                    },
                    {
                        sku:
                            'COLD-1',

                        name:
                            'Cold Product',

                        quantity:
                            1,

                        unitWeight:
                            1,

                        unitPrice:
                            20,

                        category:
                            'cold',
                    },
                ];

                checkout.totalItems =
                    2;

                checkout.totalPrice =
                    30;

                const source =
                    createSource();

                const assignments =
                    createAssignments(
                        checkout,
                        source,
                    );

                const strategies =
                    await groupingRulesService
                        .getActiveStrategies(
                            tenantA,
                        );

                const result =
                    groupingService
                        .groupShipmentPlan(
                            checkout,
                            assignments,
                            strategies,
                        );

                expect(
                    result.totalGroups,
                ).toBe(
                    2,
                );

                expect(
                    result.shipmentGroups
                        .map(
                            (group) =>
                                group.handlingGroup,
                        )
                        .sort(),
                ).toEqual([
                    'cold-chain',
                    'standard',
                ]);

                expect(
                    result.splitReasons,
                ).toContain(
                    'INCOMPATIBLE_HANDLING_GROUPS',
                );
            },
        );

        it(
            'should move an item with no assignment to ungroupedItems',
            async () => {
                const checkout =
                    createCheckout();

                const source =
                    createSource();

                /*
                 * בכוונה חסר assignment
                 * לפריט האחרון.
                 */
                const assignments =
                    createAssignments(
                        checkout,
                        source,
                    ).slice(
                        0,
                        2,
                    );

                const strategies =
                    await groupingRulesService
                        .getActiveStrategies(
                            tenantB,
                        );

                const result =
                    groupingService
                        .groupShipmentPlan(
                            checkout,
                            assignments,
                            strategies,
                        );

                expect(
                    result.hasUngroupedItems,
                ).toBe(
                    true,
                );

                expect(
                    result.ungroupedItems,
                ).toHaveLength(
                    1,
                );

                expect(
                    result.ungroupedItems[0],
                ).toMatchObject({
                    sku:
                        'GROUP-SKU-3',

                    reasons: [
                        'SOURCE_ASSIGNMENT_NOT_FOUND',
                    ],
                });

                expect(
                    result.totalGroupedItems,
                ).toBe(
                    2,
                );
            },
        );

        it(
            'should reject invalid DB strategy config before grouping is executed',
            async () => {
                await db.query(
                    `
                    update flow_ship_test_a.grouping_strategy_settings
                    set config = '{"maxWeightKg":0}'::jsonb
                    where id = $1
                    `,
                    [
                        aWeightStrategyId,
                    ],
                );

                await expect(
                    groupingRulesService
                        .getActiveStrategies(
                            tenantA,
                        ),
                ).rejects.toThrow(
                    'Invalid maxWeightKg configuration',
                );

                /*
                 * Restore.
                 */
                await db.query(
                    `
                    update flow_ship_test_a.grouping_strategy_settings
                    set config = '{"maxWeightKg":5}'::jsonb
                    where id = $1
                    `,
                    [
                        aWeightStrategyId,
                    ],
                );
            },
        );
    },
);