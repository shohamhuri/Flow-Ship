import { Injectable } from '@nestjs/common';

import {
    DistanceDestination,
    DistanceProvider,
    DistanceResult,
} from '../interfaces/distance-provider.interface';

import {
    SupplySourceLocation,
} from '../interfaces/supply-source.interface';

interface GoogleRoutesResponse {
    routes?: Array<{
        distanceMeters?: number;
        duration?: string;
    }>;
}

@Injectable()
export class GoogleRoutesDistanceProvider
    implements DistanceProvider {

    private readonly endpoint =
        'https://routes.googleapis.com/directions/v2:computeRoutes';

    async getDistance(
        origin: SupplySourceLocation,
        destination: DistanceDestination,
    ): Promise<DistanceResult> {
        const apiKey =
            process.env.GOOGLE_ROUTES_API_KEY;

        if (!apiKey) {
            throw new Error(
                'GOOGLE_ROUTES_API_KEY is not configured',
            );
        }
        console.log('GOOGLE ROUTES REQUEST', {
            origin: this.buildAddress(origin),
            destination: this.buildAddress(destination),
        });
        const response = await fetch(
            this.endpoint,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey,
                    'X-Goog-FieldMask':
                        'routes.distanceMeters,routes.duration',
                },

                body: JSON.stringify({
                    origin: {
                        address:
                            this.buildAddress(origin),
                    },

                    destination: {
                        address:
                            this.buildAddress(destination),
                    },

                    travelMode: 'DRIVE',
                    routingPreference:
                        'TRAFFIC_AWARE',
                }),
            },
        );

        if (!response.ok) {
            const responseBody =
                await response.text();

            throw new Error(
                `Google Routes API failed (${response.status}): ${responseBody}`,
            );
        }

        const data =
            (await response.json()) as GoogleRoutesResponse;
        console.log(
            'GOOGLE ROUTES RESPONSE',
            this.buildAddress(origin),
            JSON.stringify(data),
        );
        const route = data.routes?.[0];

        if (!route) {
            throw new Error(
                'Google Routes API returned no valid route',
            );
        }

        const distanceMeters =
            typeof route.distanceMeters === 'number'
                ? route.distanceMeters
                : route.duration === '0s'
                    ? 0
                    : undefined;

        if (distanceMeters === undefined) {
            throw new Error(
                'Google Routes API returned no valid distance',
            );
        }
        return {
            distanceKm:
                distanceMeters / 1000,

            durationMinutes:
                this.parseDurationMinutes(
                    route.duration,
                ),
        };
    }

    private buildAddress(
        location:
            | SupplySourceLocation
            | DistanceDestination,
    ): string {
        return [
            location.street,
            location.houseNumber,
            location.city,
            location.postalCode,
            location.country,
        ]
            .filter(Boolean)
            .join(', ');
    }

    private parseDurationMinutes(
        duration?: string,
    ): number | undefined {
        if (!duration) {
            return undefined;
        }

        const match =
            duration.match(/^([\d.]+)s$/);

        if (!match) {
            return undefined;
        }

        return Number(match[1]) / 60;
    }
}