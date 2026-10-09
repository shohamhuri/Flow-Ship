export interface CheckoutDestination {
    country: string;
    city: string;
    street: string;
    houseNumber: string;
    postalCode?: string;
}
export interface CheckoutItem {
    sku: string;
    name: string;
    quantity: number;
    unitWeight?: number;
    weightSource?: 'actual' | 'estimated';
    weightEstimationRuleId?: string | null;
    supplierId?: string;
    category?: string;
    productType?: string;
    size?: string;
    unitPrice: number;
}

export interface Checkout {
    orderId: string;
    storeId: string;
    destination: CheckoutDestination;
    items: CheckoutItem[];
    totalItems: number;
    totalPrice: number;
    createdAt: Date;
}