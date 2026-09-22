import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';

import { DbService } from '../src/infrastructure/database/db.service';

import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import { CheckoutRepository } from '../src/modules/checkout/checkout.repository';

import { ShipmentGroupsRepository } from '../src/modules/grouping/shipment-groups.repository';

import { Checkout } from '../src/modules/checkout/interfaces/checkout.interface';

import { GroupingResult } from '../src/modules/grouping/interfaces/grouping-result.interface';

describe('ShipmentGroupsRepository Integration', () => {
    let db: DbService;

    let tenantsService: TenantsService;

    let checkoutRepository: CheckoutRepository;

    let shipmentGroupsRepository: ShipmentGroupsRepository;

    let config: ConfigService;

    let tenantA: CurrentTenant;
    let tenantB: CurrentTenant;

    let checkoutAId: string;
    let checkoutBId: string;

    let checkoutItemIdsA: Map<string, string>;
    let checkoutItemIdsB: Map<string, string>;

    let groupAId: string;
    let groupBId: string;

    let sourceAId: string;
    let sourceBId: string;

    let failedGroupId: string;

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
                    CheckoutRepository,
                    ShipmentGroupsRepository,
                ],
            }).compile();

        db =
            moduleRef.get(DbService);

        tenantsService =
            moduleRef.get(TenantsService);

        checkoutRepository =
            moduleRef.get(CheckoutRepository);

        shipmentGroupsRepository =
            moduleRef.get(
                ShipmentGroupsRepository,
            );

        config =
            moduleRef.get(ConfigService);

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
            await tenantsService.findByApiKey(
                tenantAApiKey,
            );

        tenantB =
            await tenantsService.findByApiKey(
                tenantBApiKey,
            );

        groupAId =
            randomUUID();

        groupBId =
            randomUUID();

        sourceAId =
            randomUUID();

        sourceBId =
            randomUUID();

        failedGroupId =
            randomUUID();

        const checkoutA: Checkout = {
            orderId:
                `SHIPMENT-GROUP-A-${Date.now()}`,

            storeId:
                'integration-store-a',

            destination: {
                country:
                    'IL',

                city:
                    'Tel Aviv',

                street:
                    'Integration Street A',

                houseNumber:
                    '1',
            },

            items: [
                {
                    sku:
                        'GROUP-A-SKU-1',

                    name:
                        'Group A Item',

                    quantity:
                        2,

                    unitWeight:
                        1.5,

                    unitPrice:
                        100,

                    category:
                        'integration-test',
                },
            ],

            totalItems:
                2,

            totalPrice:
                200,

            createdAt:
                new Date(),
        };

        const checkoutB: Checkout = {
            orderId:
                `SHIPMENT-GROUP-B-${Date.now()}`,

            storeId:
                'integration-store-b',

            destination: {
                country:
                    'IL',

                city:
                    'Jerusalem',

                street:
                    'Integration Street B',

                houseNumber:
                    '2',
            },

            items: [
                {
                    sku:
                        'GROUP-B-SKU-1',

                    name:
                        'Group B Item',

                    quantity:
                        3,

                    unitWeight:
                        2,

                    unitPrice:
                        50,

                    category:
                        'integration-test',
                },
            ],

            totalItems:
                3,

            totalPrice:
                150,

            createdAt:
                new Date(),
        };

        checkoutAId =
            await checkoutRepository.saveCheckout(
                tenantA,
                checkoutA,
                'integration-test',
            );

        checkoutItemIdsA =
            await checkoutRepository.saveCheckoutItems(
                tenantA,
                checkoutAId,
                checkoutA,
            );

        checkoutBId =
            await checkoutRepository.saveCheckout(
                tenantB,
                checkoutB,
                'integration-test',
            );

        checkoutItemIdsB =
            await checkoutRepository.saveCheckoutItems(
                tenantB,
                checkoutBId,
                checkoutB,
            );

        const groupingA: GroupingResult = {
            orderId:
                checkoutA.orderId,

            shipmentGroups: [
                {
                    groupId:
                        groupAId,

                    sources: [
                        {
                            id:
                                sourceAId,

                            name:
                                'Integration Warehouse A',

                            type:
                                'warehouse',

                            isActive:
                                true,

                            priority:
                                1,

                            location: {
                                country:
                                    'IL',

                                city:
                                    'Tel Aviv',

                                street:
                                    'Warehouse Street',

                                houseNumber:
                                    '10',
                            },
                        },
                    ],

                    categories: [
                        'integration-test',
                    ],

                    items: [
                        {
                            sku:
                                'GROUP-A-SKU-1',

                            name:
                                'Group A Item',

                            quantity:
                                2,

                            unitWeight:
                                1.5,

                            unitPrice:
                                100,

                            sourceId:
                                sourceAId,

                            category:
                                'integration-test',
                        },
                    ],

                    totalItems:
                        2,

                    totalWeight:
                        3,

                    totalPrice:
                        200,

                    groupingReasons: [
                        'integration-test',
                    ],

                    handlingGroup:
                        'standard',
                },
            ],

            ungroupedItems:
                [],

            totalGroups:
                1,

            totalGroupedItems:
                2,

            hasUngroupedItems:
                false,

            splitReasons:
                [],
        };

        const groupingB: GroupingResult = {
            orderId:
                checkoutB.orderId,

            shipmentGroups: [
                {
                    groupId:
                        groupBId,

                    sources: [
                        {
                            id:
                                sourceBId,

                            name:
                                'Integration Warehouse B',

                            type:
                                'warehouse',

                            isActive:
                                true,

                            priority:
                                1,

                            location: {
                                country:
                                    'IL',

                                city:
                                    'Jerusalem',

                                street:
                                    'Warehouse Street',

                                houseNumber:
                                    '20',
                            },
                        },
                    ],

                    categories: [
                        'integration-test',
                    ],

                    items: [
                        {
                            sku:
                                'GROUP-B-SKU-1',

                            name:
                                'Group B Item',

                            quantity:
                                3,

                            unitWeight:
                                2,

                            unitPrice:
                                50,

                            sourceId:
                                sourceBId,

                            category:
                                'integration-test',
                        },
                    ],

                    totalItems:
                        3,

                    totalWeight:
                        6,

                    totalPrice:
                        150,

                    groupingReasons: [
                        'integration-test',
                    ],

                    handlingGroup:
                        'standard',
                },
            ],

            ungroupedItems:
                [],

            totalGroups:
                1,

            totalGroupedItems:
                3,

            hasUngroupedItems:
                false,

            splitReasons:
                [],
        };

        await shipmentGroupsRepository.saveGroupingResult(
            tenantA,
            checkoutAId,
            groupingA,
            checkoutItemIdsA,
        );

        await shipmentGroupsRepository.saveGroupingResult(
            tenantB,
            checkoutBId,
            groupingB,
            checkoutItemIdsB,
        );
    }, 30000);

    afterAll(async () => {
        /*
         * Cleanup לפי סדר יחסי התלות.
         */

        await db.query(
            `
            delete from flow_ship_test_a.shipment_group_items
            where shipment_group_id = any($1::uuid[])
            `,
            [[
                groupAId,
                failedGroupId,
            ]],
        );

        await db.query(
            `
            delete from flow_ship_test_a.shipment_group_sources
            where shipment_group_id = any($1::uuid[])
            `,
            [[
                groupAId,
                failedGroupId,
            ]],
        );

        await db.query(
            `
            delete from flow_ship_test_a.shipment_groups
            where id = any($1::uuid[])
            `,
            [[
                groupAId,
                failedGroupId,
            ]],
        );

        await db.query(
            `
            delete from flow_ship_test_b.shipment_group_items
            where shipment_group_id = $1
            `,
            [groupBId],
        );

        await db.query(
            `
            delete from flow_ship_test_b.shipment_group_sources
            where shipment_group_id = $1
            `,
            [groupBId],
        );

        await db.query(
            `
            delete from flow_ship_test_b.shipment_groups
            where id = $1
            `,
            [groupBId],
        );

        if (checkoutAId) {
            await db.query(
                `
                delete from flow_ship_test_a.checkout_items
                where checkout_id = $1
                `,
                [checkoutAId],
            );

            await db.query(
                `
                delete from flow_ship_test_a.checkouts
                where id = $1
                `,
                [checkoutAId],
            );
        }

        if (checkoutBId) {
            await db.query(
                `
                delete from flow_ship_test_b.checkout_items
                where checkout_id = $1
                `,
                [checkoutBId],
            );

            await db.query(
                `
                delete from flow_ship_test_b.checkouts
                where id = $1
                `,
                [checkoutBId],
            );
        }

        await db.onModuleDestroy();
    }, 30000);

    it('should save Tenant A shipment group', async () => {
        const rows =
            await db.query<{
                id: string;
                checkout_id: string;
                handling_group: string;
                total_items: number;
                status: string;
            }>(
                `
                select
                    id,
                    checkout_id,
                    handling_group,
                    total_items,
                    status
                from flow_ship_test_a.shipment_groups
                where id = $1
                `,
                [groupAId],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            id:
                groupAId,

            checkout_id:
                checkoutAId,

            handling_group:
                'standard',

            total_items:
                2,

            status:
                'planned',
        });
    });

    it('should save Tenant B shipment group', async () => {
        const rows =
            await db.query<{
                id: string;
                checkout_id: string;
                total_items: number;
                status: string;
            }>(
                `
                select
                    id,
                    checkout_id,
                    total_items,
                    status
                from flow_ship_test_b.shipment_groups
                where id = $1
                `,
                [groupBId],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            id:
                groupBId,

            checkout_id:
                checkoutBId,

            total_items:
                3,

            status:
                'planned',
        });
    });

    it('should save Tenant A shipment group source', async () => {
        const rows =
            await db.query<{
                shipment_group_id: string;
                source_id: string;
                source_name: string;
                source_type: string;
            }>(
                `
                select
                    shipment_group_id,
                    source_id,
                    source_name,
                    source_type
                from flow_ship_test_a.shipment_group_sources
                where shipment_group_id = $1
                `,
                [groupAId],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            shipment_group_id:
                groupAId,

            source_id:
                sourceAId,

            source_name:
                'Integration Warehouse A',

            source_type:
                'warehouse',
        });
    });

    it('should save Tenant A shipment group item with real checkout item relation', async () => {
        const checkoutItemId =
            checkoutItemIdsA.get(
                'GROUP-A-SKU-1',
            );

        expect(
            checkoutItemId,
        ).toBeDefined();

        const rows =
            await db.query<{
                shipment_group_id: string;
                checkout_item_id: string;
                sku: string;
                quantity: number;
                source_id: string;
            }>(
                `
                select
                    shipment_group_id,
                    checkout_item_id,
                    sku,
                    quantity,
                    source_id
                from flow_ship_test_a.shipment_group_items
                where shipment_group_id = $1
                `,
                [groupAId],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            shipment_group_id:
                groupAId,

            checkout_item_id:
                checkoutItemId,

            sku:
                'GROUP-A-SKU-1',

            quantity:
                2,

            source_id:
                sourceAId,
        });
    });

    it('should not store Tenant A shipment group in Tenant B schema', async () => {
        const rows =
            await db.query(
                `
                select id
                from flow_ship_test_b.shipment_groups
                where id = $1
                `,
                [groupAId],
            );

        expect(rows).toHaveLength(0);
    });

    it('should not store Tenant B shipment group in Tenant A schema', async () => {
        const rows =
            await db.query(
                `
                select id
                from flow_ship_test_a.shipment_groups
                where id = $1
                `,
                [groupBId],
            );

        expect(rows).toHaveLength(0);
    });

    it('should persist Tenant B group source and item correctly', async () => {
        const sourceRows =
            await db.query<{
                source_id: string;
                source_name: string;
            }>(
                `
                select
                    source_id,
                    source_name
                from flow_ship_test_b.shipment_group_sources
                where shipment_group_id = $1
                `,
                [groupBId],
            );

        const itemRows =
            await db.query<{
                sku: string;
                quantity: number;
                source_id: string;
            }>(
                `
                select
                    sku,
                    quantity,
                    source_id
                from flow_ship_test_b.shipment_group_items
                where shipment_group_id = $1
                `,
                [groupBId],
            );

        expect(sourceRows).toHaveLength(1);

        expect(sourceRows[0]).toMatchObject({
            source_id:
                sourceBId,

            source_name:
                'Integration Warehouse B',
        });

        expect(itemRows).toHaveLength(1);

        expect(itemRows[0]).toMatchObject({
            sku:
                'GROUP-B-SKU-1',

            quantity:
                3,

            source_id:
                sourceBId,
        });
    });

    it('should throw when checkout item id is missing for a SKU', async () => {
        const invalidGrouping: GroupingResult = {
            orderId:
                'INVALID-GROUPING',

            shipmentGroups: [
                {
                    groupId:
                        failedGroupId,

                    sources: [
                        {
                            id:
                                sourceAId,

                            name:
                                'Integration Warehouse A',

                            type:
                                'warehouse',

                            isActive:
                                true,

                            priority:
                                1,

                            location: {
                                country:
                                    'IL',

                                city:
                                    'Tel Aviv',

                                street:
                                    'Warehouse Street',

                                houseNumber:
                                    '10',
                            },
                        },
                    ],

                    categories: [
                        'integration-test',
                    ],

                    items: [
                        {
                            sku:
                                'SKU-WITHOUT-MAPPING',

                            name:
                                'Missing Mapping Item',

                            quantity:
                                1,

                            unitWeight:
                                1,

                            unitPrice:
                                25,

                            sourceId:
                                sourceAId,
                        },
                    ],

                    totalItems:
                        1,

                    totalWeight:
                        1,

                    totalPrice:
                        25,

                    groupingReasons: [
                        'integration-test',
                    ],

                    handlingGroup:
                        'standard',
                },
            ],

            ungroupedItems:
                [],

            totalGroups:
                1,

            totalGroupedItems:
                1,

            hasUngroupedItems:
                false,

            splitReasons:
                [],
        };

        await expect(
            shipmentGroupsRepository.saveGroupingResult(
                tenantA,
                checkoutAId,
                invalidGrouping,
                new Map<string, string>(),
            ),
        ).rejects.toThrow(
            'Checkout item id not found for SKU SKU-WITHOUT-MAPPING',
        );
    });
});