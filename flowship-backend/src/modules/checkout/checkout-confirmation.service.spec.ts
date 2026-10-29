
import { CheckoutConfirmationService } from './checkout-confirmation.service';

describe('CheckoutConfirmationService', () => {
    it('does not create another shipment for a processed payment event', async () => {
        const checkoutRepository = {
            getStorePaymentWebhookSecret: jest.fn().mockResolvedValue('secret'),
            getCheckoutById: jest.fn().mockResolvedValue({
                orderId: 'order-1',
                storeId: 'store-1',
                platform: 'manual',
                status: 'grouped',
                decision: {
                    selectedDeliveryOptionId: 'option-1',
                    evaluatedOptions: [
                        {
                            id: 'option-1',
                            planId: 'plan-1',
                            selectedGroupQuotes: [],
                        },
                    ],
                },
            }),
        };

        const signatureService = {
            verify: jest.fn(),
        };

        const paymentWebhookRepository = {
            registerEvent: jest.fn().mockResolvedValue(true),
            findEvent: jest.fn().mockResolvedValue({
                id: 'event-1',
                status: 'processed',
            }),
            claimEvent: jest.fn(),
        };

        const fulfillmentService = {
            prepare: jest.fn(),
            getStatus: jest.fn(),
            executePending: jest.fn(),
        };

        const shipmentsRepository = {
            findSelfDeliveryShipmentsByCheckoutId: jest.fn(),
        };

        const service = new CheckoutConfirmationService(
            checkoutRepository as any,
            signatureService as any,
            paymentWebhookRepository as any,
            fulfillmentService as any,
            shipmentsRepository as any,
        );

        const dto = {
            orderId: 'order-1',
            storeId: 'store-1',
            paymentReference: 'payment-1',
            selectedDeliveryOptionId: 'option-1',
            recipient: {
                name: 'Test Customer',
                phone: '0501234567',
            },
        };

        await service.confirm(
            {} as any,
            'checkout-1',
            dto,
            Buffer.from('{}'),
            'signature',
            '1234567890',
        );

        expect(paymentWebhookRepository.claimEvent).not.toHaveBeenCalled();
        expect(fulfillmentService.prepare).not.toHaveBeenCalled();
        expect(fulfillmentService.executePending).not.toHaveBeenCalled();
        expect(
            shipmentsRepository.findSelfDeliveryShipmentsByCheckoutId,
        ).not.toHaveBeenCalled();
    });

    it('prepares and executes self-delivery after payment confirmation', async () => {
        const tenant = {} as any;

        const dto = {
            orderId: 'order-1',
            storeId: 'store-1',
            paymentReference: 'payment-1',
            selectedDeliveryOptionId: 'option-1',
            recipient: {
                name: 'Test Customer',
                phone: '0501234567',
            },
        };

        const checkoutRepository = {
            getStorePaymentWebhookSecret: jest.fn().mockResolvedValue('secret'),
            getCheckoutById: jest.fn().mockResolvedValue({
                orderId: 'order-1',
                storeId: 'store-1',
                platform: 'manual',
                status: 'grouped',
                destination: {
                    country: 'IL',
                    city: 'Tel Aviv',
                    street: 'Herzl',
                    houseNumber: '10',
                },
                decision: {
                    selectedDeliveryOptionId: 'option-1',
                    evaluatedOptions: [{
                        id: 'option-1',
                        planId: 'plan-1',
                        selectedGroupQuotes: [],
                    }],
                },
            }),
        };

        const signatureService = {
            verify: jest.fn(),
        };

        const paymentWebhookRepository = {
            registerEvent: jest.fn().mockResolvedValue(true),
            findEvent: jest.fn().mockResolvedValue({
                id: 'event-1',
                status: 'received',
            }),
            claimEvent: jest.fn().mockResolvedValue(true),
            markProcessed: jest.fn().mockResolvedValue(true),
            markFailed: jest.fn(),
        };

        const fulfillmentService = {
            prepare: jest.fn().mockResolvedValue(undefined),
            getStatus: jest.fn().mockResolvedValue('pending'),
            executePending: jest.fn().mockResolvedValue(undefined),
        };

        const shipmentsRepository = {
            findSelfDeliveryShipmentsByCheckoutId: jest.fn().mockResolvedValue([{
                id: 'shipment-1',
                order_id: 'order-1',
                metadata: {
                    sourceId: 'source-1',
                    items: [{ sku: 'SKU-1', quantity: 2 }],
                },
            }]),
        };

        const service = new CheckoutConfirmationService(
            checkoutRepository as any,
            signatureService as any,
            paymentWebhookRepository as any,
            fulfillmentService as any,
            shipmentsRepository as any,
        );

        await service.confirm(
            tenant,
            'checkout-1',
            dto,
            Buffer.from('{}'),
            'signature',
            '1234567890',
        );

        expect(fulfillmentService.prepare).toHaveBeenCalledTimes(1);
        expect(fulfillmentService.prepare).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
            expect.objectContaining({
                orderId: 'order-1',
                storeId: 'store-1',
                sourceId: 'source-1',
                recipient: dto.recipient,
                items: [{ sku: 'SKU-1', quantity: 2 }],
            }),
        );

        expect(fulfillmentService.executePending).toHaveBeenCalledTimes(1);
        expect(fulfillmentService.executePending).toHaveBeenCalledWith(
            tenant,
            'shipment-1',
        );

        expect(paymentWebhookRepository.markProcessed).toHaveBeenCalledWith(
            tenant,
            'event-1',
        );

        expect(paymentWebhookRepository.markFailed).not.toHaveBeenCalled();
    });
    it('marks payment event as failed when self-delivery execution fails', async () => {
        const tenant = {} as any;

        const dto = {
            orderId: 'order-1',
            storeId: 'store-1',
            paymentReference: 'payment-1',
            selectedDeliveryOptionId: 'option-1',
            recipient: {
                name: 'Test Customer',
                phone: '0501234567',
            },
        };

        const checkoutRepository = {
            getStorePaymentWebhookSecret: jest.fn().mockResolvedValue('secret'),
            getCheckoutById: jest.fn().mockResolvedValue({
                orderId: 'order-1',
                storeId: 'store-1',
                platform: 'manual',
                status: 'grouped',
                destination: {
                    country: 'IL',
                    city: 'Tel Aviv',
                    street: 'Herzl',
                    houseNumber: '10',
                },
                decision: {
                    selectedDeliveryOptionId: 'option-1',
                    evaluatedOptions: [{
                        id: 'option-1',
                        planId: 'plan-1',
                        selectedGroupQuotes: [],
                    }],
                },
            }),
        };

        const signatureService = {
            verify: jest.fn(),
        };

        const paymentWebhookRepository = {
            registerEvent: jest.fn().mockResolvedValue(true),
            findEvent: jest.fn().mockResolvedValue({
                id: 'event-1',
                status: 'received',
            }),
            claimEvent: jest.fn().mockResolvedValue(true),
            markProcessed: jest.fn().mockResolvedValue(true),
            markFailed: jest.fn(),
        };

        const fulfillmentService = {
            prepare: jest.fn().mockResolvedValue(undefined),
            getStatus: jest.fn().mockResolvedValue('pending'),
            executePending: jest.fn().mockRejectedValue(
                new Error('Supplier request failed'),
            ),
        };

        const shipmentsRepository = {
            findSelfDeliveryShipmentsByCheckoutId: jest.fn().mockResolvedValue([{
                id: 'shipment-1',
                order_id: 'order-1',
                metadata: {
                    sourceId: 'source-1',
                    items: [{ sku: 'SKU-1', quantity: 2 }],
                },
            }]),
        };

        const service = new CheckoutConfirmationService(
            checkoutRepository as any,
            signatureService as any,
            paymentWebhookRepository as any,
            fulfillmentService as any,
            shipmentsRepository as any,
        );

        await expect(
            service.confirm(
                tenant,
                'checkout-1',
                dto,
                Buffer.from('{}'),
                'signature',
                '1234567890',
            ),
        ).rejects.toThrow('Supplier request failed');

        expect(fulfillmentService.executePending).toHaveBeenCalledTimes(1);

        expect(paymentWebhookRepository.markProcessed).not.toHaveBeenCalled();

        expect(paymentWebhookRepository.markFailed).toHaveBeenCalledWith(
            tenant,
            'event-1',
            'Supplier request failed',
        );
    });

});
