
export interface SourceConfirmationItem {
    sku: string;
    quantity: number;
}

export interface SourceConfirmationRequest {
    storeId: string;
    sourceId: string;
    items: SourceConfirmationItem[];
}

export interface SourceConfirmationResponse {
    sourceId: string;

    available: boolean;

    preparationMinutes: number | null;

    items: {
        sku: string;
        requestedQuantity: number;
        availableQuantity: number;
    }[];
}

export interface SourceConfirmationProvider {
    confirmSource(
        request: SourceConfirmationRequest,
    ): Promise<SourceConfirmationResponse>;
}
