import { ShipmentGroup } from './shipment-group.interface';

export interface UngroupedItem {
    sku: string;
    name: string;
    quantity: number;
    reasons: string[];
} //אי אפשר ליצור עבורו משלוח 

export interface GroupingResult {
    orderId: string;

    shipmentGroups: ShipmentGroup[];
    ungroupedItems: UngroupedItem[];

    totalGroups: number;
    totalGroupedItems: number;
    hasUngroupedItems: boolean;

    splitReasons: string[];
}