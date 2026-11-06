import './integration-safety';
import {
    INestApplication,
    ValidationPipe,
} from '@nestjs/common';
import { createHmac, randomUUID } from 'crypto'; import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { SelfDeliveryProviderError } from '../src/modules/sourcing/interfaces/self-delivery-provider.interface';

import { AppModule } from '../src/app.module';
import { CheckoutRepository } from
    '../src/modules/checkout/checkout.repository';
import { DbService } from '../src/infrastructure/database/db.service';
import {
    CurrentTenant,
    TenantsService,
} from '../src/modules/tenants/tenants.service';
import type { InventoryProvider } from '../src/modules/sourcing/interfaces/inventory-provider.interface';
import { INVENTORY_PROVIDER, SELF_DELIVERY_PROVIDER, DISTANCE_PROVIDER } from '../src/modules/sourcing/sourcing.tokens';

describe('Checkout Self Delivery E2E', () => {
    let app: INestApplication;
    let moduleRef: TestingModule;
    let db: DbService;
    let tenantA: CurrentTenant;
    let tenantAApiKey: string;
    let tenantB: CurrentTenant;
    let tenantBApiKey: string;

    const storeId = `e2e-self-delivery-${randomUUID()}`;
    const orderId = `E2E-SELF-DELIVERY-${randomUUID()}`;
    const nullPriceOrderId = `E2E-SELF-DELIVERY-NULL-${randomUUID()}`;
    const freeDeliveryOrderId = `E2E-FREE-${randomUUID()}`;
    let checkoutId: string | undefined;

    const providerMockId = randomUUID();
    const providerYangoId = randomUUID();
    const priceCardId = randomUUID();
    const speedCardId = randomUUID();
    const groupingStrategyId = randomUUID();
    const failedDeliveryOrderId = `E2E-FAILED-DELIVERY-${randomUUID()}`;
    const invalidSignatureOrderId =
        `E2E-INVALID-SIGNATURE-${randomUUID()}`;

    const selfDeliveryProviderMock = {
        getQuote: jest.fn().mockImplementation(async (quoteRequest) => ({
            sourceId: quoteRequest.sourceId,
            accepted: true,
            price: 40,
            currency: 'ILS',
            estimatedDeliveryAt: new Date(
                Date.now() + 24 * 60 * 60 * 1000,
            ).toISOString(),
        })),

        createDelivery: jest.fn().mockImplementation(async (deliveryRequest) => ({
            requestId: deliveryRequest.requestId,
            sourceId: deliveryRequest.sourceId,
            sourceOrderId: `e2e-supplier-${deliveryRequest.requestId}`,
            status: 'confirmed',
        })),
    };
    let originalConfigurationSaved = false;
    let configurationModified = false;
    let previouslyActiveProviderIds: string[] = [];
    let previouslyActiveDecisionCardIds: string[] = [];
    let previouslyEnabledGroupingStrategyIds: string[] = [];

    async function findCheckoutIdByOrderId(targetOrderId = orderId): Promise<string | undefined> {
        const rows = await db.query<{ id: string }>(
            `
            SELECT id
            FROM flow_ship_test_a.checkouts
            WHERE external_order_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [targetOrderId],
        );

        return rows[0]?.id;
    }
    function createSelfDeliveryCheckoutDto() {
        return {
            orderId,
            storeId,
            destination: {
                country: 'Israel',
                city: 'Netivot',
                street: 'HaShalom',
                houseNumber: '10',
                postalCode: '8770000',
            },
            items: [
                {
                    sku: 'SHIRT-BLACK-M',
                    name: 'E2E Black Shirt',
                    quantity: 2,
                    weight: 1,
                    price: 100,
                    category: 'standard',
                },
            ],
        };
    }
    beforeAll(async () => {
        moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(SELF_DELIVERY_PROVIDER)
            .useValue(selfDeliveryProviderMock)
            .overrideProvider(DISTANCE_PROVIDER)
            .useValue({
                getDistance: jest.fn().mockResolvedValue({
                    distanceKm: 10,
                    durationMinutes: 20,
                }),
            })
            .compile();

        app = moduleRef.createNestApplication({
            rawBody: true,
        });
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                transform: true,
                forbidNonWhitelisted: true,
            }),
        );

        await app.init();

        db = moduleRef.get(DbService);

        const inventoryProvider = moduleRef.get<InventoryProvider>(
            INVENTORY_PROVIDER,
        );

        const originalGetSources =
            inventoryProvider.getSources.bind(inventoryProvider);

        jest.spyOn(inventoryProvider, 'getSources')
            .mockImplementation(async (requestedStoreId: string) => {
                if (requestedStoreId === storeId) {
                    return originalGetSources('store-1');
                }

                return originalGetSources(requestedStoreId);
            });

        const config = moduleRef.get(ConfigService);
        const tenantsService = moduleRef.get(TenantsService);

        tenantAApiKey = config.get<string>(
            'TEST_FLOW_SHIP_A_API_KEY',
        ) ?? '';

        if (!tenantAApiKey) {
            throw new Error('Missing E2E tenant A API key');
        }

        tenantA = await tenantsService.findByApiKey(
            tenantAApiKey,
        );

        expect(tenantA.schemaName).toBe('flow_ship_test_a');
        tenantBApiKey = config.get<string>(
            'TEST_FLOW_SHIP_B_API_KEY',
        ) ?? '';

        if (!tenantBApiKey) {
            throw new Error('Missing E2E tenant B API key');
        }

        tenantB = await tenantsService.findByApiKey(
            tenantBApiKey,
        );

        expect(tenantB.schemaName).toBe('flow_ship_test_b');
        expect(tenantB.schemaName).not.toBe(tenantA.schemaName);
        const activeProviders = await db.query<{ id: string }>(
            `SELECT id FROM flow_ship_test_a.providers WHERE is_active = true`,
        );
        previouslyActiveProviderIds = activeProviders.map(row => row.id);

        const activeCards = await db.query<{ id: string }>(
            `SELECT id FROM flow_ship_test_a.decision_priority_cards WHERE is_active = true`,
        );
        previouslyActiveDecisionCardIds = activeCards.map(row => row.id);

        const enabledStrategies = await db.query<{ id: string }>(
            `SELECT id FROM flow_ship_test_a.grouping_strategy_settings WHERE is_enabled = true`,
        );
        previouslyEnabledGroupingStrategyIds = enabledStrategies.map(row => row.id);
        originalConfigurationSaved = true;
        configurationModified = true;

        await db.query(
            `UPDATE flow_ship_test_a.providers SET is_active = false`,
        );
        await db.query(
            `UPDATE flow_ship_test_a.decision_priority_cards SET is_active = false`,
        );
        await db.query(
            `UPDATE flow_ship_test_a.grouping_strategy_settings SET is_enabled = false`,
        );

        await db.query(
            `INSERT INTO flow_ship_test_a.providers
             (id, code, name, adapter_key, is_mock, is_active, priority_score)
             VALUES
             ($1, 'e2e-mock', 'E2E Mock', 'mock', true, true, 0.70),
             ($2, 'e2e-yango', 'E2E Yango', 'mock-yango', true, true, 0.70)`,
            [providerMockId, providerYangoId],
        );

        await db.query(
            `INSERT INTO flow_ship_test_a.decision_priority_cards
             (id, provider_id, criterion_key, title, priority_rank, is_active, config)
             VALUES
             ($1, null, 'price', 'E2E Price', 1, true, '{}'::jsonb),
             ($2, null, 'speed', 'E2E Speed', 2, true, '{}'::jsonb)`,
            [priceCardId, speedCardId],
        );

        await db.query(
            `INSERT INTO flow_ship_test_a.grouping_strategy_settings
             (id, strategy_key, display_name, is_enabled, execution_order, conflict_priority, config)
             VALUES
             ($1, 'group_by_source', 'E2E Group By Source', true, 1, 100, '{}'::jsonb)`,
            [groupingStrategyId],
        );

        await db.query(
            `
    INSERT INTO flow_ship_test_a.stores (
        name,
        platform,
        external_store_id,
        is_active,
        payment_webhook_secret
    )
    VALUES ($1, $2, $3, $4, $5)
    `,
            [
                'E2E Self Delivery Store',
                'manual',
                storeId,
                true,
                'e2e-self-delivery-payment-secret',
            ],
        );


        await db.query(
            `
            INSERT INTO flow_ship_test_a.source_delivery_permissions (
                store_id,
                source_id,
                self_delivery_allowed,
                self_delivery_price
            )
            VALUES ($1, $2, $3, $4)
            `,
            [
                storeId,
                'WAREHOUSE-SOUTH',
                true,
                40,
            ],
        );
    }, 60000);

    it('should generate delivery options for self-delivery checkout', async () => {
        const response = await request(app.getHttpServer())
            .post('/checkout')
            .set('x-api-key', tenantAApiKey)
            .send(createSelfDeliveryCheckoutDto())
            .expect(201);

        const result = response.body;

        checkoutId = await findCheckoutIdByOrderId();

        expect(checkoutId).toBeDefined();
        expect(result.checkout.orderId).toBe(orderId);

        const deliveryOptions = result.planning.deliveryOptions.flatMap(
            (planResult) => planResult.options ?? planResult.deliveryOptions ?? [],
        );

        expect(deliveryOptions.length).toBeGreaterThan(0);
        // Verify the configured self-delivery price reaches checkout options.
        const selfDeliveryOptions = deliveryOptions.filter(
            (option) =>
                option.selectedGroupQuotes.some(
                    (group) =>
                        group.shipments.some(
                            (shipment) =>
                                shipment.sourceId === 'WAREHOUSE-SOUTH' &&
                                shipment.deliveryMethod === 'self_delivery' &&
                                shipment.quote.price === 40,
                        ),
                ),
        );

        expect(selfDeliveryOptions).toHaveLength(1);
        expect(selfDeliveryOptions[0].metrics.totalShippingPrice).toBe(40);
        const savedCheckout = await moduleRef
            .get(CheckoutRepository)
            .getCheckoutById(tenantA, checkoutId!);

        expect(savedCheckout?.decision).not.toBeNull();

        expect(savedCheckout?.decision?.selectedDeliveryOptionId)
            .toBe(selfDeliveryOptions[0].id);
        expect(result.planning.decision.winner).not.toBeNull();
        expect(selfDeliveryProviderMock.createDelivery).not.toHaveBeenCalled();

        const fulfillmentsBeforePayment = await db.query(
            `
    SELECT f.id
    FROM flow_ship_test_a.self_delivery_fulfillments f
    JOIN flow_ship_test_a.shipments s
        ON s.id = f.shipment_id
    WHERE s.checkout_id = $1
    `,
            [checkoutId],
        );

        expect(fulfillmentsBeforePayment).toHaveLength(0);
        const shipments = await db.query<{
            id: string;
            provider_id: string | null;
            provider_code: string | null;
            adapter_key: string | null;
            metadata: { deliveryMethod?: string };
        }>(
            `SELECT id, provider_id, provider_code, adapter_key, metadata
             FROM flow_ship_test_a.shipments
             WHERE checkout_id = $1`,
            [checkoutId],
        );

        expect(shipments.length).toBeGreaterThan(0);

        const selfDeliveryShipments = shipments.filter(
            (shipment) => shipment.metadata?.deliveryMethod === 'self_delivery',
        );

        expect(selfDeliveryShipments.length).toBeGreaterThan(0);

        for (const shipment of selfDeliveryShipments) {
            expect(shipment.provider_id).toBeNull();
            expect(shipment.provider_code).toBeNull();
            expect(shipment.adapter_key).toBeNull();
        }

        for (const shipment of shipments) {
            const stops = await db.query<{
                stop_order: number;
                stop_type: string;
            }>(
                `SELECT stop_order, stop_type
                 FROM flow_ship_test_a.shipment_stops
                 WHERE shipment_id = $1
                 ORDER BY stop_order`,
                [shipment.id],
            );

            expect(stops).toHaveLength(2);
            expect(stops[0].stop_type).toBe('pickup');
            expect(stops[1].stop_type).toBe('dropoff');
            expect(stops[0].stop_order).toBe(1);
            expect(stops[1].stop_order).toBe(2);
        }
    }, 60000);
    it('should create supplier delivery only after signed payment and prevent duplicates', async () => {
        expect(checkoutId).toBeDefined();

        const savedCheckout = await moduleRef
            .get(CheckoutRepository)
            .getCheckoutById(tenantA, checkoutId!);

        const selectedDeliveryOptionId =
            savedCheckout?.decision?.selectedDeliveryOptionId;

        expect(selectedDeliveryOptionId).toBeTruthy();

        const payload = {
            orderId,
            storeId,
            paymentReference: `e2e-payment-${randomUUID()}`,
            selectedDeliveryOptionId,
            recipient: {
                name: 'E2E Customer',
                phone: '0501234567',
                email: 'e2e@example.com',
            },
        };

        const rawBody = JSON.stringify(payload);
        const timestamp = Math.floor(Date.now() / 1000).toString();

        const signature = createHmac(
            'sha256',
            'e2e-self-delivery-payment-secret',
        )
            .update(timestamp)
            .update('.')
            .update(rawBody)
            .digest('hex');

        const sendConfirmation = () =>
            request(app.getHttpServer())
                .post(`/checkout/${checkoutId}/confirm`)
                .set('x-api-key', tenantAApiKey)
                .set('x-payment-signature', signature)
                .set('x-payment-timestamp', timestamp)
                .set('Content-Type', 'application/json')
                .send(rawBody);

        expect(selfDeliveryProviderMock.createDelivery)
            .not.toHaveBeenCalled();

        const firstResponse = await sendConfirmation().expect(201);

        expect(firstResponse.body).toEqual({
            status: 'validated',
        });

        expect(selfDeliveryProviderMock.createDelivery)
            .toHaveBeenCalledTimes(1);

        const supplierRequest =
            selfDeliveryProviderMock.createDelivery.mock.calls[0][0];

        expect(supplierRequest.requestId).toBeTruthy();
        expect(supplierRequest.sourceId).toBe('WAREHOUSE-SOUTH');

        const fulfillments = await db.query<{
            shipment_id: string;
            request_id: string;
            source_order_id: string | null;
            status: string;
        }>(
            `SELECT
            f.shipment_id,
            f.request_id,
            f.source_order_id,
            f.status
         FROM flow_ship_test_a.self_delivery_fulfillments f
         JOIN flow_ship_test_a.shipments s
           ON s.id = f.shipment_id
         WHERE s.checkout_id = $1`,
            [checkoutId],
        );

        expect(fulfillments).toHaveLength(1);
        expect(fulfillments[0].status).toBe('confirmed');
        expect(fulfillments[0].request_id)
            .toBe(supplierRequest.requestId);
        expect(fulfillments[0].source_order_id)
            .toBe(`e2e-supplier-${supplierRequest.requestId}`);

        const replayResponse = await sendConfirmation().expect(201);
        expect(replayResponse.body).toEqual({
            status: 'validated',
        });

        expect(selfDeliveryProviderMock.createDelivery)
            .toHaveBeenCalledTimes(1);

        const fulfillmentsAfterReplay = await db.query<{
            id: string;
        }>(
            `SELECT f.id
         FROM flow_ship_test_a.self_delivery_fulfillments f
         JOIN flow_ship_test_a.shipments s
           ON s.id = f.shipment_id
         WHERE s.checkout_id = $1`,
            [checkoutId],
        );

        expect(fulfillmentsAfterReplay).toHaveLength(1);
    }, 60000);
    it('should reject invalid payment signature without creating supplier delivery', async () => {


        const checkoutResponse = await request(app.getHttpServer())
            .post('/checkout')
            .set('x-api-key', tenantAApiKey)
            .send({
                ...createSelfDeliveryCheckoutDto(),
                orderId: invalidSignatureOrderId,
            })
            .expect(201);

        const invalidCheckoutId =
            checkoutResponse.body.checkoutId ??
            await findCheckoutIdByOrderId(invalidSignatureOrderId);

        expect(invalidCheckoutId).toBeTruthy();

        const savedCheckout = await moduleRef
            .get(CheckoutRepository)
            .getCheckoutById(tenantA, invalidCheckoutId);

        expect(savedCheckout?.decision?.selectedDeliveryOptionId)
            .toBeTruthy();
        const payload = {
            orderId: invalidSignatureOrderId,
            storeId,
            paymentReference: `e2e-invalid-payment-${randomUUID()}`,
            selectedDeliveryOptionId:
                savedCheckout!.decision!.selectedDeliveryOptionId,
            recipient: {
                name: 'E2E Customer',
                phone: '0501234567',
                email: 'e2e@example.com',
            },
        };

        const createDeliveryCallsBefore =
            selfDeliveryProviderMock.createDelivery.mock.calls.length;

        const response = await request(app.getHttpServer())
            .post(`/checkout/${invalidCheckoutId}/confirm`)
            .set('x-api-key', tenantAApiKey)
            .set('x-payment-signature', '0'.repeat(64))
            .set('x-payment-timestamp',
                Math.floor(Date.now() / 1000).toString())
            .send(payload)
            .expect(401);

        expect(response.body.message)
            .toBe('Invalid payment signature');

        expect(selfDeliveryProviderMock.createDelivery)
            .toHaveBeenCalledTimes(createDeliveryCallsBefore);

        const fulfillments = await db.query<{ id: string }>(
            `SELECT f.id
         FROM flow_ship_test_a.self_delivery_fulfillments f
         JOIN flow_ship_test_a.shipments s
           ON s.id = f.shipment_id
         WHERE s.checkout_id = $1`,
            [invalidCheckoutId],
        );

        expect(fulfillments).toHaveLength(0);

        const webhookEvents = await db.query<{ id: string }>(
            `SELECT id
         FROM flow_ship_test_a.webhook_logs
         WHERE source = $1
           AND event_type = 'payment_confirmed'
           AND idempotency_key = $2`,
            [`checkout_payment:${storeId}`, invalidCheckoutId],
        );

        expect(webhookEvents).toHaveLength(0);
    }, 60000);
    it('should not offer self-delivery when price is null', async () => {
        await db.query(
            `UPDATE flow_ship_test_a.source_delivery_permissions
             SET self_delivery_price = NULL
             WHERE store_id = $1 AND source_id = $2`,
            [storeId, 'WAREHOUSE-SOUTH'],
        );

        const response = await request(app.getHttpServer())
            .post('/checkout')
            .set('x-api-key', tenantAApiKey)
            .send({
                ...createSelfDeliveryCheckoutDto(),
                orderId: nullPriceOrderId,
            })
            .expect(201);

        const result = response.body;

        const deliveryOptions = result.planning.deliveryOptions.flatMap(
            (planResult) => planResult.options ?? planResult.deliveryOptions ?? [],
        );

        expect(deliveryOptions.length).toBeGreaterThan(0);

        const shipments = deliveryOptions.flatMap((option) =>
            option.selectedGroupQuotes.flatMap((group) => group.shipments),
        );

        expect(
            shipments.some(
                (shipment) => shipment.deliveryMethod === 'self_delivery',
            ),
        ).toBe(false);

        expect(
            shipments.some(
                (shipment) => shipment.deliveryMethod !== 'self_delivery',
            ),
        ).toBe(true);
    }, 60000);
    it('should offer free self-delivery when price is zero', async () => {
        await db.query(
            `UPDATE flow_ship_test_a.source_delivery_permissions
             SET self_delivery_price = 0
             WHERE store_id = $1 AND source_id = $2`,
            [storeId, 'WAREHOUSE-SOUTH'],
        );

        const response = await request(app.getHttpServer())
            .post('/checkout')
            .set('x-api-key', tenantAApiKey)
            .send({
                ...createSelfDeliveryCheckoutDto(),
                orderId: freeDeliveryOrderId,
            })
            .expect(201);

        const deliveryOptions = response.body.planning.deliveryOptions.flatMap(
            (planResult) => planResult.options ?? planResult.deliveryOptions ?? [],
        );

        const freeOptions = deliveryOptions.filter((option) =>
            option.selectedGroupQuotes.some((group) =>
                group.shipments.some(
                    (shipment) =>
                        shipment.sourceId === 'WAREHOUSE-SOUTH' &&
                        shipment.deliveryMethod === 'self_delivery' &&
                        shipment.quote.price === 0,
                ),
            ),
        );

        expect(freeOptions.length).toBeGreaterThan(0);
        expect(freeOptions[0].metrics.totalShippingPrice).toBe(0);
    }, 60000);

    it('should persist supplier rejection as failed', async () => {
        await db.query(
            `UPDATE flow_ship_test_a.source_delivery_permissions
             SET self_delivery_price = 40
             WHERE store_id = $1 AND source_id = $2`,
            [storeId, 'WAREHOUSE-SOUTH'],
        );

        const checkoutResponse = await request(app.getHttpServer())
            .post('/checkout')
            .set('x-api-key', tenantAApiKey)
            .send({
                ...createSelfDeliveryCheckoutDto(),
                orderId: failedDeliveryOrderId,
            })
            .expect(201);

        const failedCheckoutId =
            checkoutResponse.body.checkoutId ??
            await findCheckoutIdByOrderId(failedDeliveryOrderId);

        expect(failedCheckoutId).toBeTruthy();

        const savedCheckout = await moduleRef.get(CheckoutRepository)
            .getCheckoutById(tenantA, failedCheckoutId);

        const selectedDeliveryOptionId =
            savedCheckout?.decision?.selectedDeliveryOptionId;

        expect(selectedDeliveryOptionId).toBeTruthy();

        const payload = {
            orderId: failedDeliveryOrderId,
            storeId,
            paymentReference: `e2e-failed-payment-${randomUUID()}`,
            selectedDeliveryOptionId,
            recipient: {
                name: 'E2E Customer',
                phone: '0501234567',
                email: 'e2e@example.com',
            },
        };

        const rawBody = JSON.stringify(payload);
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signature = createHmac(
            'sha256',
            'e2e-self-delivery-payment-secret',
        ).update(timestamp).update('.').update(rawBody).digest('hex');

        const callsBefore =
            selfDeliveryProviderMock.createDelivery.mock.calls.length;


        selfDeliveryProviderMock.createDelivery.mockRejectedValueOnce(
            new SelfDeliveryProviderError(
                'INVALID_REQUEST',
                'E2E supplier rejected delivery',
            ),
        );

        const response = await request(app.getHttpServer())
            .post(`/checkout/${failedCheckoutId}/confirm`)
            .set('x-api-key', tenantAApiKey)
            .set('x-payment-signature', signature)
            .set('x-payment-timestamp', timestamp)
            .set('Content-Type', 'application/json')
            .send(rawBody);

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(selfDeliveryProviderMock.createDelivery)
            .toHaveBeenCalledTimes(callsBefore + 1);

        const rows = await db.query<{ status: string }>(
            `SELECT f.status
             FROM flow_ship_test_a.self_delivery_fulfillments f
             JOIN flow_ship_test_a.shipments s ON s.id = f.shipment_id
             WHERE s.checkout_id = $1`,
            [failedCheckoutId],
        );

        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe('failed');
    }, 60000);

    afterAll(async () => {
        try {
            if (db) {
                try {
                    checkoutId = await findCheckoutIdByOrderId();
                    const nullPriceCheckoutId =
                        await findCheckoutIdByOrderId(nullPriceOrderId);

                    const freeDeliveryCheckoutId =
                        await findCheckoutIdByOrderId(freeDeliveryOrderId);
                    const failedDeliveryCheckoutId =
                        await findCheckoutIdByOrderId(failedDeliveryOrderId);
                    const invalidSignatureCheckoutId =
                        await findCheckoutIdByOrderId(invalidSignatureOrderId);
                    const checkoutIds = [
                        freeDeliveryCheckoutId,
                        checkoutId,
                        nullPriceCheckoutId,
                        invalidSignatureCheckoutId,
                        failedDeliveryCheckoutId,
                    ].filter((id): id is string => Boolean(id));

                    if (checkoutIds.length > 0) {

                        const cleanupQueries = [
                            `DELETE FROM flow_ship_test_a.webhook_logs
 WHERE source = 'checkout_payment:' || $1
   AND event_type = 'payment_confirmed'
   AND idempotency_key = ANY($2::text[])`,
                            `DELETE FROM flow_ship_test_a.self_delivery_fulfillments
 WHERE shipment_id IN (
     SELECT id
     FROM flow_ship_test_a.shipments
     WHERE checkout_id = ANY($1::uuid[])
 )`,
                            `DELETE FROM flow_ship_test_a.shipment_stops
                         WHERE shipment_id IN (
                             SELECT id FROM flow_ship_test_a.shipments
                             WHERE checkout_id = ANY($1::uuid[])
                         )`,
                            `DELETE FROM flow_ship_test_a.shipments
                         WHERE checkout_id = ANY($1::uuid[])`,
                            `DELETE FROM flow_ship_test_a.shipment_group_items
                         WHERE shipment_group_id IN (
                             SELECT id FROM flow_ship_test_a.shipment_groups
                             WHERE checkout_id = ANY($1::uuid[])
                         )`,
                            `DELETE FROM flow_ship_test_a.shipment_group_sources
                         WHERE shipment_group_id IN (
                             SELECT id FROM flow_ship_test_a.shipment_groups
                             WHERE checkout_id = ANY($1::uuid[])
                         )`,
                            `DELETE FROM flow_ship_test_a.shipment_groups
                         WHERE checkout_id = ANY($1::uuid[])`,
                            `DELETE FROM flow_ship_test_a.shipment_decisions
                         WHERE checkout_id = ANY($1::uuid[])`,
                            `DELETE FROM flow_ship_test_a.checkout_processing
                         WHERE checkout_id = ANY($1::uuid[])`,
                            `DELETE FROM flow_ship_test_a.checkout_sourcing_results
                         WHERE checkout_id = ANY($1::uuid[])`,
                            `DELETE FROM flow_ship_test_a.checkout_items
                         WHERE checkout_id = ANY($1::uuid[])`,
                            `DELETE FROM flow_ship_test_a.checkouts
                         WHERE id = ANY($1::uuid[])`,
                        ];

                        const cleanupErrors: unknown[] = [];

                        for (const query of cleanupQueries) {
                            try {
                                await db.query(
                                    query,
                                    query.includes('flow_ship_test_a.webhook_logs')
                                        ? [storeId, checkoutIds]
                                        : [checkoutIds],
                                );
                            } catch (error) {
                                console.error('E2E CLEANUP FAILED:', {
                                    query,
                                    error,
                                });

                                cleanupErrors.push(error);
                            }
                        }

                        if (cleanupErrors.length > 0) {
                            throw new AggregateError(
                                cleanupErrors,
                                'Checkout cleanup failed',
                            );
                        }
                    }
                } finally {
                    const storeCleanupQueries = [
                        {
                            sql: `DELETE FROM flow_ship_test_a.audit_logs
                                  WHERE entity_id = ANY($1::text[])`,
                            params: [[orderId, nullPriceOrderId, freeDeliveryOrderId, invalidSignatureOrderId, failedDeliveryOrderId,
                            ]],
                        },
                        {
                            sql: `DELETE FROM flow_ship_test_a.source_delivery_permissions
                                  WHERE store_id = $1`,
                            params: [storeId],
                        },
                        {
                            sql: `DELETE FROM flow_ship_test_a.stores
                                  WHERE external_store_id = $1
                                  AND platform = 'manual'`,
                            params: [storeId],
                        },
                    ];

                    const storeCleanupErrors: unknown[] = [];

                    for (const { sql, params } of storeCleanupQueries) {
                        try {
                            await db.query(sql, params);
                        } catch (error) {
                            storeCleanupErrors.push(error);
                        }
                    }

                    if (storeCleanupErrors.length > 0) {
                        throw new AggregateError(
                            storeCleanupErrors,
                            'Store cleanup failed',
                        );
                    }
                }
            }
        } finally {
            const restoreErrors: unknown[] = [];

            try {
                if (db && originalConfigurationSaved && configurationModified) {
                    const restoreQueries: Array<{
                        sql: string;
                        params?: unknown[];
                    }> = [
                            {
                                sql: `DELETE FROM flow_ship_test_a.provider_call_logs
                                  WHERE provider_id = ANY($1::uuid[])`,
                                params: [[providerMockId, providerYangoId]],
                            },
                            {
                                sql: `DELETE FROM flow_ship_test_a.decision_priority_cards
                                  WHERE id = ANY($1::uuid[])`,
                                params: [[priceCardId, speedCardId]],
                            },
                            {
                                sql: `DELETE FROM flow_ship_test_a.grouping_strategy_settings
                                  WHERE id = $1`,
                                params: [groupingStrategyId],
                            },
                            {
                                sql: `DELETE FROM flow_ship_test_a.providers
                                  WHERE id = ANY($1::uuid[])`,
                                params: [[providerMockId, providerYangoId]],
                            },
                            {
                                sql: `UPDATE flow_ship_test_a.providers
                                  SET is_active = false`,
                            },
                            {
                                sql: `UPDATE flow_ship_test_a.decision_priority_cards
                                  SET is_active = false`,
                            },
                            {
                                sql: `UPDATE flow_ship_test_a.grouping_strategy_settings
                                  SET is_enabled = false`,
                            },
                            {
                                sql: `UPDATE flow_ship_test_a.providers
                                  SET is_active = true
                                  WHERE id = ANY($1::uuid[])`,
                                params: [previouslyActiveProviderIds],
                            },
                            {
                                sql: `UPDATE flow_ship_test_a.decision_priority_cards
                                  SET is_active = true
                                  WHERE id = ANY($1::uuid[])`,
                                params: [previouslyActiveDecisionCardIds],
                            },
                            {
                                sql: `UPDATE flow_ship_test_a.grouping_strategy_settings
                                  SET is_enabled = true
                                  WHERE id = ANY($1::uuid[])`,
                                params: [previouslyEnabledGroupingStrategyIds],
                            },
                        ];

                    for (const { sql, params } of restoreQueries) {
                        try {
                            await db.query(sql, params ?? []);
                        } catch (error) {
                            restoreErrors.push(error);
                        }
                    }
                }
            } finally {
                jest.restoreAllMocks();

                if (app) {
                    await app.close();
                }
            }

            if (restoreErrors.length > 0) {
                throw new AggregateError(
                    restoreErrors,
                    'E2E configuration restore failed',
                );
            }
        }
    });
    it('should prevent tenant B from confirming tenant A checkout', async () => {
        expect(checkoutId).toBeDefined();

        const savedCheckout = await moduleRef
            .get(CheckoutRepository)
            .getCheckoutById(tenantA, checkoutId!);

        expect(savedCheckout?.decision?.selectedDeliveryOptionId)
            .toBeTruthy();

        const payload = {
            orderId,
            storeId,
            paymentReference: `e2e-cross-tenant-${randomUUID()}`,
            selectedDeliveryOptionId:
                savedCheckout!.decision!.selectedDeliveryOptionId,
            recipient: {
                name: 'E2E Customer',
                phone: '0501234567',
                email: 'e2e@example.com',
            },
        };

        const rawBody = JSON.stringify(payload);
        const timestamp = Math.floor(Date.now() / 1000).toString();

        const signature = createHmac(
            'sha256',
            'e2e-self-delivery-payment-secret',
        )
            .update(timestamp)
            .update('.')
            .update(rawBody)
            .digest('hex');

        const callsBefore =
            selfDeliveryProviderMock.createDelivery.mock.calls.length;

        const response = await request(app.getHttpServer())
            .post(`/checkout/${checkoutId}/confirm`)
            .set('x-api-key', tenantBApiKey)
            .set('x-payment-signature', signature)
            .set('x-payment-timestamp', timestamp)
            .set('Content-Type', 'application/json')
            .send(rawBody);

        expect([401, 404]).toContain(response.status);

        expect(selfDeliveryProviderMock.createDelivery)
            .toHaveBeenCalledTimes(callsBefore);

        const tenantBCheckout = await moduleRef
            .get(CheckoutRepository)
            .getCheckoutById(tenantB, checkoutId!);

        expect(tenantBCheckout).toBeNull();
    }, 60000);
});








































