export type SupplySourceType = 'branch' | 'warehouse'; // סניף / מחסן 

export interface SupplySourceLocation {
    country: string;
    city: string;
    street: string;
    houseNumber: string;
    postalCode?: string;

    latitude?: number;
    longitude?: number;
}

export interface SupplySource {
    id: string;
    name: string;
    type: SupplySourceType;
    isActive: boolean;
    priority: number;
    location: SupplySourceLocation;
}