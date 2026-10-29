import { BadRequestException } from '@nestjs/common';

import type {
    SelfDeliveryCreateRequest,
} from '../sourcing/interfaces/self-delivery-provider.interface';

export function validateSelfDeliveryDestination(
    destination: Record<string, unknown> | null,
): SelfDeliveryCreateRequest['destination'] {
    if (!destination) {
        throw new BadRequestException(
            'Self-delivery destination is missing',
        );
    }

    const requiredFields = [
        'country',
        'city',
        'street',
        'houseNumber',
    ] as const;

    for (const field of requiredFields) {
        if (
            typeof destination[field] !== 'string' ||
            !(destination[field] as string).trim()
        ) {
            throw new BadRequestException(
                `Invalid self-delivery destination: ${field}`,
            );
        }
    }

    if (
        destination.postalCode !== undefined &&
        destination.postalCode !== null &&
        typeof destination.postalCode !== 'string'
    ) {
        throw new BadRequestException(
            'Invalid self-delivery destination: postalCode',
        );
    }

    return {
        country: destination.country as string,
        city: destination.city as string,
        street: destination.street as string,
        houseNumber: destination.houseNumber as string,
        ...(typeof destination.postalCode === 'string'
            ? { postalCode: destination.postalCode }
            : {}),
    };
}