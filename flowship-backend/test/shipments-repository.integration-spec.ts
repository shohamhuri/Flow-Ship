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

import { ShipmentsRepository } from '../src/modules/shipments/shipments.repository';

import { Checkout } from '../src/modules/checkout/interfaces/checkout.interface';

import { GroupingResult } from '../src/modules/grouping/interfaces/grouping-result.interface';

describe('ShipmentsRepository Integration', () => {
    let db: DbService;

    let tenantsService: TenantsService;

    let checkoutRepository: CheckoutRepository;

    let shipmentGroupsRepository: ShipmentGroupsRepository;

    let shipmentsRepository: ShipmentsRepository;

    let config: ConfigService;

    let tenantA: CurrentTenant;
    let tenantB: CurrentTenant;

    let checkoutAId: string;
    let checkoutBId: string;

    let groupAId: string;
    let groupBId: string;

    let sourceAId: string;
    let sourceBId: string;

    let shipmentAId: string;
    let shipmentBId: string;

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
                    ShipmentsRepository,
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

        shipmentsRepository =
            moduleRef.get(
                ShipmentsRepository,
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

        const checkoutA: Checkout = {
            orderId:
                `SHIPMENT-A-${Date.now()}`,

            storeId:
                'integration-store-a',

            destination: {
                country:
                    'IL',

                city:
                    'Tel Aviv',

                street:
                    'Destination A',

                houseNumber:
                    '1',
            },

            items: [
                {
                    sku:
                        'SHIPMENT-A-SKU',

                    name:
                        'Shipment A Item',

                    quantity:
                        1,

                    unitWeight:
                        1,

                    unitPrice:
                        100,
                },
            ],

            totalItems:
                1,

            totalPrice:
                100,

            createdAt:
                new Date(),
        };

        const checkoutB: Checkout = {
            orderId:
                `SHIPMENT-B-${Date.now()}`,

            storeId:
                'integration-store-b',

            destination: {
                country:
                    'IL',

                city:
                    'Jerusalem',

                street:
                    'Destination B',

                houseNumber:
                    '2',
            },

            items: [
                {
                    sku:
                        'SHIPMENT-B-SKU',

                    name:
                        'Shipment B Item',

                    quantity:
                        1,

                    unitWeight:
                        2,

                    unitPrice:
                        150,
                },
            ],

            totalItems:
                1,

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

        const checkoutItemsA =
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

        const checkoutItemsB =
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
                                'Warehouse A',

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
                                    'Warehouse A Street',

                                houseNumber:
                                    '10',
                            },
                        },
                    ],

                    categories:
                        [],

                    items: [
                        {
                            sku:
                                'SHIPMENT-A-SKU',

                            name:
                                'Shipment A Item',

                            quantity:
                                1,

                            unitWeight:
                                1,

                            unitPrice:
                                100,

                            sourceId:
                                sourceAId,
                        },
                    ],

                    totalItems:
                        1,

                    totalWeight:
                        1,

                    totalPrice:
                        100,

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
                                'Warehouse B',

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
                                    'Warehouse B Street',

                                houseNumber:
                                    '20',
                            },
                        },
                    ],

                    categories:
                        [],

                    items: [
                        {
                            sku:
                                'SHIPMENT-B-SKU',

                            name:
                                'Shipment B Item',

                            quantity:
                                1,

                            unitWeight:
                                2,

                            unitPrice:
                                150,

                            sourceId:
                                sourceBId,
                        },
                    ],

                    totalItems:
                        1,

                    totalWeight:
                        2,

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
                1,

            hasUngroupedItems:
                false,

            splitReasons:
                [],
        };

        await shipmentGroupsRepository.saveGroupingResult(
            tenantA,
            checkoutAId,
            groupingA,
            checkoutItemsA,
        );

        await shipmentGroupsRepository.saveGroupingResult(
            tenantB,
            checkoutBId,
            groupingB,
            checkoutItemsB,
        );

        shipmentAId =
            await shipmentsRepository.createShipment(
                tenantA,
                {
                    checkoutId:
                        checkoutAId,

                    orderId:
                        checkoutA.orderId,

                    shipmentGroupId:
                        groupAId,

                    selectedPlanId:
                        'integration-plan-a',

                    selectedDeliveryOptionKey:
                        'integration-option-a',

                    carrierName:
                        'Integration Carrier A',

                    serviceName:
                        'Standard',

                    providerCode:
                        'integration-provider-a',

                    adapterKey:
                        'integration-adapter',

                    price:
                        25,

                    currency:
                        'ILS',

                    estimatedDeliveryDays:
                        2,

                    status:
                        'created',
                },
            );

        shipmentBId =
            await shipmentsRepository.createShipment(
                tenantB,
                {
                    checkoutId:
                        checkoutBId,

                    orderId:
                        checkoutB.orderId,

                    shipmentGroupId:
                        groupBId,

                    selectedPlanId:
                        'integration-plan-b',

                    selectedDeliveryOptionKey:
                        'integration-option-b',

                    carrierName:
                        'Integration Carrier B',

                    serviceName:
                        'Express',

                    providerCode:
                        'integration-provider-b',

                    adapterKey:
                        'integration-adapter',

                    price:
                        45,

                    currency:
                        'ILS',

                    estimatedDeliveryDays:
                        1,

                    status:
                        'created',
                },
            );

        await shipmentsRepository.createShipmentStops(
            tenantA,
            shipmentAId,
            [
                {
                    country:
                        'IL',

                    city:
                        'Tel Aviv',

                    street:
                        'Pickup One',

                    houseNumber:
                        '10',
                },
                {
                    country:
                        'IL',

                    city:
                        'Ramat Gan',

                    street:
                        'Pickup Two',

                    houseNumber:
                        '20',
                },
            ],
            {
                country:
                    'IL',

                city:
                    'Herzliya',

                street:
                    'Dropoff A',

                houseNumber:
                    '30',
            },
        );

        await shipmentsRepository.createShipmentStops(
            tenantB,
            shipmentBId,
            [
                {
                    country:
                        'IL',

                    city:
                        'Jerusalem',

                    street:
                        'Pickup B',

                    houseNumber:
                        '40',
                },
            ],
            {
                country:
                    'IL',

                city:
                    'Jerusalem',

                street:
                    'Dropoff B',

                houseNumber:
                    '50',
            },
        );
    }, 30000);

    afterAll(async () => {
        await db.query(
            `
            delete from flow_ship_test_a.shipment_stops
            where shipment_id = $1
            `,
            [shipmentAId],
        );

        await db.query(
            `
            delete from flow_ship_test_b.shipment_stops
            where shipment_id = $1
            `,
            [shipmentBId],
        );

        await db.query(
            `
            delete from flow_ship_test_a.shipments
            where id = $1
            `,
            [shipmentAId],
        );

        await db.query(
            `
            delete from flow_ship_test_b.shipments
            where id = $1
            `,
            [shipmentBId],
        );

        await db.query(
            `
            delete from flow_ship_test_a.shipment_group_items
            where shipment_group_id = $1
            `,
            [groupAId],
        );

        await db.query(
            `
            delete from flow_ship_test_a.shipment_group_sources
            where shipment_group_id = $1
            `,
            [groupAId],
        );

        await db.query(
            `
            delete from flow_ship_test_a.shipment_groups
            where id = $1
            `,
            [groupAId],
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

        await db.query(
            `
            delete from flow_ship_test_a.checkout_items
            where checkout_id = $1
            `,
            [checkoutAId],
        );

        await db.query(
            `
            delete from flow_ship_test_b.checkout_items
            where checkout_id = $1
            `,
            [checkoutBId],
        );

        await db.query(
            `
            delete from flow_ship_test_a.checkouts
            where id = $1
            `,
            [checkoutAId],
        );

        await db.query(
            `
            delete from flow_ship_test_b.checkouts
            where id = $1
            `,
            [checkoutBId],
        );

        await db.onModuleDestroy();
    }, 30000);

    it('should create Tenant A shipment', async () => {
        const rows =
            await db.query<{
                id: string;
                checkout_id: string;
                shipment_group_id: string;
                carrier_name: string;
                service_name: string;
                status: string;
            }>(
                `
                select
                    id,
                    checkout_id,
                    shipment_group_id,
                    carrier_name,
                    service_name,
                    status
                from flow_ship_test_a.shipments
                where id = $1
                `,
                [shipmentAId],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0]).toMatchObject({
            id:
                shipmentAId,

            checkout_id:
                checkoutAId,

            shipment_group_id:
                groupAId,

            carrier_name:
                'Integration Carrier A',

            service_name:
                'Standard',

            status:
                'created',
        });
    });

    it('should keep Tenant A shipment out of Tenant B schema', async () => {
        const rows =
            await db.query(
                `
                select id
                from flow_ship_test_b.shipments
                where id = $1
                `,
                [shipmentAId],
            );

        expect(rows).toHaveLength(0);
    });

    it('should create pickup and dropoff stops in the correct order', async () => {
        const rows =
            await db.query<{
                stop_order: number;
                stop_type: string;
            }>(
                `
                select
                    stop_order,
                    stop_type
                from flow_ship_test_a.shipment_stops
                where shipment_id = $1
                order by stop_order
                `,
                [shipmentAId],
            );

        expect(rows).toHaveLength(3);

        expect(rows).toEqual([
            {
                stop_order:
                    1,

                stop_type:
                    'pickup',
            },
            {
                stop_order:
                    2,

                stop_type:
                    'pickup',
            },
            {
                stop_order:
                    3,

                stop_type:
                    'dropoff',
            },
        ]);
    });

    it('should report that not all pickups are completed initially', async () => {
        const completed =
            await shipmentsRepository.areAllPickupsCompleted(
                tenantA,
                shipmentAId,
            );

        expect(completed).toBe(false);
    });

    it('should mark pickups as completed and detect when all are completed', async () => {
        await shipmentsRepository.markPickupCompleted(
            tenantA,
            shipmentAId,
            1,
        );

        const afterFirst =
            await shipmentsRepository.areAllPickupsCompleted(
                tenantA,
                shipmentAId,
            );

        expect(afterFirst).toBe(false);

        await shipmentsRepository.markPickupCompleted(
            tenantA,
            shipmentAId,
            2,
        );

        const afterSecond =
            await shipmentsRepository.areAllPickupsCompleted(
                tenantA,
                shipmentAId,
            );

        expect(afterSecond).toBe(true);
    });

    it('should mark dropoff as completed', async () => {
        await shipmentsRepository.markDropoffCompleted(
            tenantA,
            shipmentAId,
        );

        const rows =
            await db.query<{
                status: string;
                arrived_at: Date | null;
                completed_at: Date | null;
            }>(
                `
                select
                    status,
                    arrived_at,
                    completed_at
                from flow_ship_test_a.shipment_stops
                where shipment_id = $1
                  and stop_type = 'dropoff'
                `,
                [shipmentAId],
            );

        expect(rows).toHaveLength(1);

        expect(rows[0].status).toBe(
            'completed',
        );

        expect(
            rows[0].arrived_at,
        ).not.toBeNull();

        expect(
            rows[0].completed_at,
        ).not.toBeNull();
    });

    it('should find checkout id by shipment id only in the correct tenant', async () => {
        const checkoutId =
            await shipmentsRepository.findCheckoutIdByShipmentId(
                tenantA,
                shipmentAId,
            );

        expect(checkoutId).toBe(
            checkoutAId,
        );

        const wrongTenantCheckoutId =
            await shipmentsRepository.findCheckoutIdByShipmentId(
                tenantB,
                shipmentAId,
            );

        expect(
            wrongTenantCheckoutId,
        ).toBeNull();
    });

    it('should update shipment status without affecting the other tenant', async () => {
        await shipmentsRepository.updateStatus(
            tenantA,
            shipmentAId,
            'in_transit',
        );

        const aRows =
            await db.query<{
                status: string;
            }>(
                `
                select status
                from flow_ship_test_a.shipments
                where id = $1
                `,
                [shipmentAId],
            );

        const bRows =
            await db.query<{
                status: string;
            }>(
                `
                select status
                from flow_ship_test_b.shipments
                where id = $1
                `,
                [shipmentBId],
            );

        expect(
            aRows[0].status,
        ).toBe(
            'in_transit',
        );

        expect(
            bRows[0].status,
        ).toBe(
            'created',
        );
    });

    it('should mark Tenant A shipment as delivered', async () => {
        const deliveredAt =
            new Date();

        await shipmentsRepository.markDelivered(
            tenantA,
            shipmentAId,
            deliveredAt,
        );

        const rows =
            await db.query<{
                status: string;
                delivered_at: Date | null;
                failed_at: Date | null;
                failure_reason: string | null;
            }>(
                `
                select
                    status,
                    delivered_at,
                    failed_at,
                    failure_reason
                from flow_ship_test_a.shipments
                where id = $1
                `,
                [shipmentAId],
            );

        expect(
            rows[0].status,
        ).toBe(
            'delivered',
        );

        expect(
            rows[0].delivered_at,
        ).not.toBeNull();

        expect(
            rows[0].failed_at,
        ).toBeNull();

        expect(
            rows[0].failure_reason,
        ).toBeNull();
    });

    it('should mark Tenant B shipment as failed', async () => {
        await shipmentsRepository.markFailed(
            tenantB,
            shipmentBId,
            'Integration failure',
        );

        const rows =
            await db.query<{
                status: string;
                failed_at: Date | null;
                delivered_at: Date | null;
                failure_reason: string | null;
            }>(
                `
                select
                    status,
                    failed_at,
                    delivered_at,
                    failure_reason
                from flow_ship_test_b.shipments
                where id = $1
                `,
                [shipmentBId],
            );

        expect(
            rows[0].status,
        ).toBe(
            'failed',
        );

        expect(
            rows[0].failed_at,
        ).not.toBeNull();

        expect(
            rows[0].delivered_at,
        ).toBeNull();

        expect(
            rows[0].failure_reason,
        ).toBe(
            'Integration failure',
        );
    });

    it('should return correct shipment status summary per tenant', async () => {
        const summaryA =
            await shipmentsRepository.getShipmentStatusSummary(
                tenantA,
                checkoutAId,
            );

        const summaryB =
            await shipmentsRepository.getShipmentStatusSummary(
                tenantB,
                checkoutBId,
            );

        expect(summaryA).toEqual({
            checkoutId:
                checkoutAId,

            totalShipments:
                1,

            deliveredShipments:
                1,

            failedShipments:
                0,

            activeShipments:
                0,
        });

        expect(summaryB).toEqual({
            checkoutId:
                checkoutBId,

            totalShipments:
                1,

            deliveredShipments:
                0,

            failedShipments:
                1,

            activeShipments:
                0,
        });
    });
});