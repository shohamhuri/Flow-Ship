import { SupplySource } from '../../sourcing/interfaces/supply-source.interface';

export interface ShipmentGroupItem {
    sku: string;
    name: string;
    quantity: number;
    unitWeight: number;
    unitPrice: number;

    sourceId: string;

    supplierId?: string;
    category?: string;
}
export interface ShipmentGroup {
    groupId: string;

    sources: SupplySource[];

    categories: string[];
    items: ShipmentGroupItem[];

    totalItems: number;
    totalWeight: number;
    totalPrice: number;

    groupingReasons: string[];
    handlingGroup: string;
}