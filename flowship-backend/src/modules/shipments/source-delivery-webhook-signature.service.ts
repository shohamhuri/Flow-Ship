
import {
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';

import {
    createHmac,
    timingSafeEqual,
} from 'node:crypto';

@Injectable()
export class SourceDeliveryWebhookSignatureService {
    verify(
        secret: string | null,
        rawBody: Buffer,
        signature: string | undefined,
        timestamp: string | undefined,
    ): void {
        if (!secret || !signature) {
            throw new UnauthorizedException(
                'Missing supplier signature or integration secret',
            );
        }

        if (!timestamp || !/^\d{10}$/.test(timestamp)) {
            throw new UnauthorizedException(
                'Invalid supplier webhook timestamp',
            );
        }

        const requestTime = Number(timestamp);
        const currentTime = Math.floor(Date.now() / 1000);

        if (Math.abs(currentTime - requestTime) > 300) {
            throw new UnauthorizedException(
                'Supplier webhook signature has expired',
            );
        }

        if (!/^[a-fA-F0-9]{64}$/.test(signature)) {
            throw new UnauthorizedException(
                'Invalid supplier webhook signature',
            );
        }

        const expected = createHmac('sha256', secret)
            .update(timestamp)
            .update('.')
            .update(rawBody)
            .digest();

        const received = Buffer.from(signature, 'hex');

        if (!timingSafeEqual(expected, received)) {
            throw new UnauthorizedException(
                'Invalid supplier webhook signature',
            );
        }
    }
}
