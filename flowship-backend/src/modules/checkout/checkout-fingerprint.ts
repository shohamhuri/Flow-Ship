import { createHash } from 'node:crypto';
import type { CreateCheckoutDto } from './dto/create-checkout.dto';

function stableSerialize(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value) ?? 'null';
    }

    if (Array.isArray(value)) {
        return `[${value.map(stableSerialize).join(',')}]`;
    }

    const object = value as Record<string, unknown>;

    return `{${Object.keys(object)
        .filter((key) => object[key] !== undefined)
        .sort()
        .map(
            (key) =>
                `${JSON.stringify(key)}:${stableSerialize(object[key])}`,
        )
        .join(',')}}`;
}

export function createCheckoutFingerprint(
    dto: CreateCheckoutDto,
): string {
    const payload = {
        orderId: dto.orderId,
        storeId: dto.storeId,
        destination: dto.destination,
        items: dto.items,
    };

    return createHash('sha256')
        .update(stableSerialize(payload))
        .digest('hex');
}