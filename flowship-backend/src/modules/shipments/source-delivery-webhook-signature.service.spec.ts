
import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';

import { SourceDeliveryWebhookSignatureService }
    from './source-delivery-webhook-signature.service';

describe('SourceDeliveryWebhookSignatureService', () => {
    let service: SourceDeliveryWebhookSignatureService;

    const secret = 'supplier-test-secret-at-least-32-characters';
    const rawBody = Buffer.from(
        JSON.stringify({
            sourceId: 'source-1',
            sourceOrderId: 'ORDER-123',
            status: 'out_for_delivery',
            externalEventId: 'EVENT-456',
        }),
    );

    const sign = (
        timestamp: string,
        signingSecret = secret,
        body = rawBody,
    ): string =>
        createHmac('sha256', signingSecret)
            .update(timestamp)
            .update('.')
            .update(body)
            .digest('hex');

    beforeEach(() => {
        service = new SourceDeliveryWebhookSignatureService();
    });

    it('accepts a valid signature', () => {
        const timestamp = String(Math.floor(Date.now() / 1000));

        expect(() =>
            service.verify(
                secret,
                rawBody,
                sign(timestamp),
                timestamp,
            ),
        ).not.toThrow();
    });

    it('rejects an incorrect signature', () => {
        const timestamp = String(Math.floor(Date.now() / 1000));

        expect(() =>
            service.verify(
                secret,
                rawBody,
                sign(timestamp, 'wrong-secret'),
                timestamp,
            ),
        ).toThrow(UnauthorizedException);
    });

    it('rejects a modified request body', () => {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const modifiedBody = Buffer.from(
            rawBody.toString().replace(
                'out_for_delivery',
                'delivered',
            ),
        );

        expect(() =>
            service.verify(
                secret,
                modifiedBody,
                sign(timestamp),
                timestamp,
            ),
        ).toThrow(UnauthorizedException);
    });

    it('rejects an expired timestamp', () => {
        const timestamp = String(
            Math.floor(Date.now() / 1000) - 600,
        );

        expect(() =>
            service.verify(
                secret,
                rawBody,
                sign(timestamp),
                timestamp,
            ),
        ).toThrow(UnauthorizedException);
    });

    it('rejects a missing signature', () => {
        const timestamp = String(Math.floor(Date.now() / 1000));

        expect(() =>
            service.verify(
                secret,
                rawBody,
                undefined,
                timestamp,
            ),
        ).toThrow(UnauthorizedException);
    });

    it('rejects an invalid signature format', () => {
        const timestamp = String(Math.floor(Date.now() / 1000));

        expect(() =>
            service.verify(
                secret,
                rawBody,
                'not-a-valid-signature',
                timestamp,
            ),
        ).toThrow(UnauthorizedException);
    });

    it('rejects a missing integration secret', () => {
        const timestamp = String(Math.floor(Date.now() / 1000));

        expect(() =>
            service.verify(
                null,
                rawBody,
                sign(timestamp),
                timestamp,
            ),
        ).toThrow(UnauthorizedException);
    });
});
