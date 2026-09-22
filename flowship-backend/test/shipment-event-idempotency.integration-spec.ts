import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CheckoutRepository } from '../src/modules/checkout/checkout.repository';
import { Checkout } from '../src/modules/checkout/interfaces/checkout.interface';
import { DbService } from '../src/infrastructure/database/db.service';
import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';

import { ShipmentsRepository } from '../src/modules/shipments/shipments.repository';
import { ShipmentStatusService } from '../src/modules/shipments/shipment-status.service';

describe(
    'Shipment Event Idempotency / Out-of-Order Events Integration',
    () => {
        let moduleRef: TestingModule;
        let db: DbService;
        let tenantsService: TenantsService;
        let shipmentStatusService: ShipmentStatusService;
        let checkoutRepository: CheckoutRepository;
        let tenant: CurrentTenant;

        let checkoutId: string | null = null;
        const SHIPMENT_ID =
            '72222222-2222-4222-8222-222222222222';

        const GROUP_ID =
            '73333333-3333-4333-8333-333333333333';

        const FIRST_PICKUP_AT =
            new Date('2026-09-16T08:00:00.000Z');

        const SECOND_PICKUP_AT =
            new Date('2026-09-16T08:10:00.000Z');

        const FIRST_DELIVERED_AT =
            new Date('2026-09-16T12:00:00.000Z');

        const SECOND_DELIVERED_AT =
            new Date('2026-09-16T12:15:00.000Z');

        const FIRST_FAILED_AT =
            new Date('2026-09-16T10:00:00.000Z');

        const SECOND_FAILED_AT =
            new Date('2026-09-16T10:20:00.000Z');

        function qSchema(schemaName: string): string {
            if (!/^[a-zA-Z0-9_]+$/.test(schemaName)) {
                throw new Error(
                    `Invalid schema name: ${schemaName}`,
                );
            }

            return `"${schemaName}"`;
        }

        async function cleanup(): Promise<void> {
            const schema = qSchema(tenant.schemaName);

            await db.query(
                `
                delete from ${schema}.shipment_stops
                where shipment_id = $1
                `,
                [SHIPMENT_ID],
            );

            await db.query(
                `
                delete from ${schema}.shipments
                where id = $1
                `,
                [SHIPMENT_ID],
            );

            await db.query(
                `
                delete from ${schema}.shipment_groups
                where id = $1
                `,
                [GROUP_ID],
            );

            if (checkoutId) {
                await db.query(
                    `
        delete from ${schema}.checkouts
        where id = $1
        `,
                    [checkoutId],
                );

                checkoutId = null;
            }
        }

        async function seed(): Promise<void> {
            const schema = qSchema(tenant.schemaName);

            /*
             * אנחנו יוצרים Checkout מינימלי.
             * שדות נוספים שלא צוינו משתמשים ב-default/null
             * בהתאם לסכמה הקיימת.
             */
            const checkout: Checkout = {
                orderId: 'integration-idempotency-order',
                storeId: 'integration-test-store',

                destination: {
                    country: 'IL',
                    city: 'Tel Aviv',
                    street: 'Integration Test',
                    houseNumber: '1',
                    postalCode: '6100000',
                },

                items: [
                    {
                        sku: 'IDEMPOTENCY-TEST-SKU',
                        name: 'Idempotency Integration Item',
                        quantity: 1,
                        unitWeight: 1,
                        unitPrice: 100,
                        category: 'integration-test',
                    },
                ],

                totalItems: 1,
                totalPrice: 100,
                createdAt: new Date(),
            };

            checkoutId =
                await checkoutRepository.saveCheckout(
                    tenant,
                    checkout,
                    'integration-test',
                );
            /*
             * Shipment group נדרש בגלל FK של shipment.
             */
            await db.query(
                `
    insert into ${schema}.shipment_groups
    (
        id,
        checkout_id,
        source_id,
        source_name,
        source_type,
        handling_group,
        total_items,
        total_weight,
        total_price,
        grouping_reasons,
        status
    )
    values
    (
        $1,
        $2,
        'integration-test-source',
        'Integration Test Source',
        'integration_test',
        'standard',
        1,
        1,
        100,
        '[]'::jsonb,
        'created'
    )
    `,
                [
                    GROUP_ID,
                    checkoutId,
                ],
            );
            /*
             * Shipment התחלתי.
             */
            await db.query(
                `
                insert into ${schema}.shipments
                (
                    id,
                    checkout_id,
                    order_id,
                    shipment_group_id,

                    selected_plan_id,
                    selected_delivery_option_key,

                    carrier_name,
                    service_name,

                    price,
                    currency,
                    estimated_delivery_days,

                    status
                )
                values
                (
                    $1,
                    $2,
                    'integration-idempotency-order',
                    $3,

                    'integration-test-plan',
                    'integration-test-option',

                    'Integration Carrier',
                    'Integration Service',

                    100,
                    'ILS',
                    1,

                    'created'
                )
                `,
                [
                    SHIPMENT_ID,
                    checkoutId,
                    GROUP_ID,
                ],
            );

            /*
             * Pickup אחד + Dropoff אחד.
             */
            await db.query(
                `
                insert into ${schema}.shipment_stops
                (
                    shipment_id,
                    stop_order,
                    stop_type,
                    address,
                    status
                )
                values
                (
                    $1,
                    1,
                    'pickup',
                    '{"city":"Integration Pickup"}'::jsonb,
                    'pending'
                ),
                (
                    $1,
                    2,
                    'dropoff',
                    '{"city":"Integration Dropoff"}'::jsonb,
                    'pending'
                )
                `,
                [SHIPMENT_ID],
            );
        }

        async function resetFixture(): Promise<void> {
            await cleanup();
            await seed();
        }

        async function getShipment(): Promise<any> {
            const schema = qSchema(tenant.schemaName);

            const rows = await db.query<any>(
                `
                select
                    id,
                    status,
                    delivered_at,
                    failed_at,
                    failure_reason
                from ${schema}.shipments
                where id = $1
                `,
                [SHIPMENT_ID],
            );

            return rows[0];
        }

        async function getCheckout(): Promise<any> {
            const schema = qSchema(tenant.schemaName);

            const rows = await db.query<any>(
                `
                select
                    id,
                    status
                from ${schema}.checkouts
                where id = $1
                `,
                [checkoutId],
            );

            return rows[0];
        }

        async function getPickup(): Promise<any> {
            const schema = qSchema(tenant.schemaName);

            const rows = await db.query<any>(
                `
                select
                    status,
                    arrived_at,
                    completed_at
                from ${schema}.shipment_stops
                where shipment_id = $1
                  and stop_type = 'pickup'
                  and stop_order = 1
                `,
                [SHIPMENT_ID],
            );

            return rows[0];
        }

        async function getDropoff(): Promise<any> {
            const schema = qSchema(tenant.schemaName);

            const rows = await db.query<any>(
                `
                select
                    status,
                    arrived_at,
                    completed_at
                from ${schema}.shipment_stops
                where shipment_id = $1
                  and stop_type = 'dropoff'
                `,
                [SHIPMENT_ID],
            );

            return rows[0];
        }

        beforeAll(async () => {
            moduleRef =
                await Test.createTestingModule({
                    imports: [
                        ConfigModule.forRoot({
                            isGlobal: true,
                        }),
                    ],
                    providers: [
                        ConfigService,
                        DbService,
                        TenantsService,
                        CheckoutRepository,
                        ShipmentsRepository,
                        ShipmentStatusService,
                    ],
                }).compile();

            db = moduleRef.get(DbService);
            tenantsService =
                moduleRef.get(TenantsService);
            checkoutRepository =
                moduleRef.get(CheckoutRepository);

            shipmentStatusService =
                moduleRef.get(
                    ShipmentStatusService,
                );

            const apiKey =
                process.env.TEST_FLOW_SHIP_A_API_KEY;

            if (!apiKey) {
                throw new Error(
                    'TEST_FLOW_SHIP_A_API_KEY is missing',
                );
            }

            tenant =
                await tenantsService.findByApiKey(
                    apiKey,
                );
            await cleanup();
        });

        beforeEach(async () => {
            await resetFixture();
        });

        afterAll(async () => {
            if (tenant) {
                await cleanup();
            }

            await moduleRef?.close();
        });

        /*
         * 1
         *
         * אותו delivered מגיע פעמיים.
         *
         * האירוע השני לא אמור לשכתב את זמן
         * המסירה המקורי.
         */
        it(
            '1. duplicate delivered does not overwrite the original delivered_at',
            async () => {
                await shipmentStatusService.markDelivered(
                    tenant,
                    SHIPMENT_ID,
                    FIRST_DELIVERED_AT,
                );

                await shipmentStatusService.markDelivered(
                    tenant,
                    SHIPMENT_ID,
                    SECOND_DELIVERED_AT,
                );

                const shipment =
                    await getShipment();

                expect(shipment.status)
                    .toBe('delivered');

                expect(
                    new Date(
                        shipment.delivered_at,
                    ).toISOString(),
                ).toBe(
                    FIRST_DELIVERED_AT.toISOString(),
                );
            },
        );

        /*
         * 2
         *
         * Pickup שכבר הושלם לא אמור לקבל
         * completed_at חדש בגלל duplicate event.
         */
        it(
            '2. duplicate picked_up does not overwrite pickup completed_at',
            async () => {
                await shipmentStatusService.markPickedUp(
                    tenant,
                    SHIPMENT_ID,
                    1,
                    FIRST_PICKUP_AT,
                );

                await shipmentStatusService.markPickedUp(
                    tenant,
                    SHIPMENT_ID,
                    1,
                    SECOND_PICKUP_AT,
                );

                const pickup =
                    await getPickup();

                expect(pickup.status)
                    .toBe('completed');

                expect(
                    new Date(
                        pickup.completed_at,
                    ).toISOString(),
                ).toBe(
                    FIRST_PICKUP_AT.toISOString(),
                );
            },
        );

        /*
         * 3
         *
         * failure ראשון הוא האירוע שקבע את
         * מצב המשלוח.
         *
         * retry/duplicate מאוחר יותר לא אמור
         * לשכתב reason/time.
         */
        it(
            '3. duplicate failed does not overwrite the original failure data',
            async () => {
                await shipmentStatusService.markFailed(
                    tenant,
                    SHIPMENT_ID,
                    'Original carrier failure',
                    FIRST_FAILED_AT,
                );

                await shipmentStatusService.markFailed(
                    tenant,
                    SHIPMENT_ID,
                    'Duplicate carrier failure',
                    SECOND_FAILED_AT,
                );

                const shipment =
                    await getShipment();

                expect(shipment.status)
                    .toBe('failed');

                expect(
                    new Date(
                        shipment.failed_at,
                    ).toISOString(),
                ).toBe(
                    FIRST_FAILED_AT.toISOString(),
                );

                expect(
                    shipment.failure_reason,
                ).toBe(
                    'Original carrier failure',
                );
            },
        );

        /*
         * 4
         *
         * delivered הוא terminal state.
         *
         * in_transit שמגיע מאוחר יותר לא
         * אמור להחזיר Shipment או Checkout אחורה.
         */
        it(
            '4. late in_transit after delivered does not regress shipment or checkout',
            async () => {
                await shipmentStatusService.markDelivered(
                    tenant,
                    SHIPMENT_ID,
                    FIRST_DELIVERED_AT,
                );

                await shipmentStatusService.markInTransit(
                    tenant,
                    SHIPMENT_ID,
                );

                const shipment =
                    await getShipment();

                const checkout =
                    await getCheckout();

                expect(shipment.status)
                    .toBe('delivered');

                expect(checkout.status)
                    .toBe('delivered');
            },
        );

        /*
         * 5
         *
         * picked_up שמגיע אחרי delivered
         * יכול להשלים stop אם האירוע הגיע מאוחר,
         * אבל אסור לו להחזיר את סטטוס המשלוח
         * מ-delivered ל-picked_up.
         */
        it(
            '5. late picked_up after delivered does not regress shipment status',
            async () => {
                await shipmentStatusService.markDelivered(
                    tenant,
                    SHIPMENT_ID,
                    FIRST_DELIVERED_AT,
                );

                await shipmentStatusService.markPickedUp(
                    tenant,
                    SHIPMENT_ID,
                    1,
                    FIRST_PICKUP_AT,
                );

                const shipment =
                    await getShipment();

                const checkout =
                    await getCheckout();

                expect(shipment.status)
                    .toBe('delivered');

                expect(checkout.status)
                    .toBe('delivered');
            },
        );

        /*
         * 6
         *
         * Shipment שכבר delivered לא אמור
         * להפוך ל-failed בגלל event ישן/מאוחר.
         */
        it(
            '6. late failed after delivered does not replace delivered terminal state',
            async () => {
                await shipmentStatusService.markDelivered(
                    tenant,
                    SHIPMENT_ID,
                    FIRST_DELIVERED_AT,
                );

                await shipmentStatusService.markFailed(
                    tenant,
                    SHIPMENT_ID,
                    'Late failure event',
                    FIRST_FAILED_AT,
                );

                const shipment =
                    await getShipment();

                const checkout =
                    await getCheckout();

                expect(shipment.status)
                    .toBe('delivered');

                expect(
                    new Date(
                        shipment.delivered_at,
                    ).toISOString(),
                ).toBe(
                    FIRST_DELIVERED_AT.toISOString(),
                );

                expect(shipment.failed_at)
                    .toBeNull();

                expect(shipment.failure_reason)
                    .toBeNull();

                expect(checkout.status)
                    .toBe('delivered');
            },
        );

        /*
         * 7
         *
         * גם failed מוגדר כאן כ-terminal state.
         *
         * delivered מאוחר לא אמור להפוך failure
         * שכבר נקבע למסירה מוצלחת.
         */
        it(
            '7. late delivered after failed does not replace failed terminal state',
            async () => {
                await shipmentStatusService.markFailed(
                    tenant,
                    SHIPMENT_ID,
                    'Carrier rejected shipment',
                    FIRST_FAILED_AT,
                );

                await shipmentStatusService.markDelivered(
                    tenant,
                    SHIPMENT_ID,
                    FIRST_DELIVERED_AT,
                );

                const shipment =
                    await getShipment();

                const checkout =
                    await getCheckout();

                expect(shipment.status)
                    .toBe('failed');

                expect(
                    new Date(
                        shipment.failed_at,
                    ).toISOString(),
                ).toBe(
                    FIRST_FAILED_AT.toISOString(),
                );

                expect(
                    shipment.failure_reason,
                ).toBe(
                    'Carrier rejected shipment',
                );

                expect(shipment.delivered_at)
                    .toBeNull();

                expect(checkout.status)
                    .toBe('failed');
            },
        );

        /*
         * 8
         *
         * חשוב שלא נהפוך את המערכת ליותר מדי
         * restrictive.
         *
         * המסלול החוקי הרגיל עדיין חייב לעבוד.
         */
        it(
            '8. normal picked_up -> in_transit -> delivered flow still works',
            async () => {
                await shipmentStatusService.markPickedUp(
                    tenant,
                    SHIPMENT_ID,
                    1,
                    FIRST_PICKUP_AT,
                );

                let shipment =
                    await getShipment();

                expect(shipment.status)
                    .toBe('picked_up');

                await shipmentStatusService.markInTransit(
                    tenant,
                    SHIPMENT_ID,
                );

                shipment =
                    await getShipment();

                expect(shipment.status)
                    .toBe('in_transit');

                await shipmentStatusService.markDelivered(
                    tenant,
                    SHIPMENT_ID,
                    FIRST_DELIVERED_AT,
                );

                shipment =
                    await getShipment();

                const checkout =
                    await getCheckout();

                const pickup =
                    await getPickup();

                const dropoff =
                    await getDropoff();

                expect(shipment.status)
                    .toBe('delivered');

                expect(
                    new Date(
                        shipment.delivered_at,
                    ).toISOString(),
                ).toBe(
                    FIRST_DELIVERED_AT.toISOString(),
                );

                expect(pickup.status)
                    .toBe('completed');

                expect(dropoff.status)
                    .toBe('completed');

                expect(
                    new Date(
                        dropoff.completed_at,
                    ).toISOString(),
                ).toBe(
                    FIRST_DELIVERED_AT.toISOString(),
                );

                expect(checkout.status)
                    .toBe('delivered');
            },
        );
    },
);