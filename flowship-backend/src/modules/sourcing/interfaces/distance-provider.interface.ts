import { SupplySourceLocation } from './supply-source.interface';

export interface DistanceDestination {
    country: string;
    city: string;
    street: string;
    houseNumber: string;
    postalCode?: string;
}

export interface DistanceResult {
    distanceKm: number;
    durationMinutes?: number;
}

export interface DistanceProvider {
    getDistance(
        origin: SupplySourceLocation,
        destination: DistanceDestination,
    ): Promise<DistanceResult>;
}