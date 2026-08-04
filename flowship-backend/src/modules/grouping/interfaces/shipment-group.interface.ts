import { SupplySource } from '../../sourcing/interfaces/supply-source.interface';

export interface ShipmentGroupItem {
    sku: string;
    name: string;
    quantity: number;
    unitWeight: number;
    unitPrice: number;
    supplierId?: string;
    category?: string;
}

export interface ShipmentGroup {
    groupId: string;

    source: SupplySource;

    supplierId?: string;
    categories: string[];
    items: ShipmentGroupItem[];

    totalItems: number;
    totalWeight: number;
    totalPrice: number;

    groupingReasons: string[];
    handlingGroup: string;
}