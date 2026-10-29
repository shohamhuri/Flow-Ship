export interface SelfDeliveryQuoteRequest {
    storeId: string;
    sourceId: string;

    destination: {
        city: string;
        street: string;
        houseNumber: string;
    };

    items: {
        sku: string;
        quantity: number;
    }[];
    signal?: AbortSignal;
}

export interface SelfDeliveryQuoteResponse {
    sourceId: string;
    accepted: boolean;
    price: number | null;
    currency: 'ILS';
    estimatedDeliveryAt: string | null;
}
export interface SelfDeliveryCreateRequest {
    requestId: string;
    orderId: string;
    storeId: string;
    sourceId: string;

    recipient: {
        name: string;
        phone: string;
        email?: string;
    };

    destination: {
        country: string;
        city: string;
        street: string;
        houseNumber: string;
        postalCode?: string;
    };

    items: {
        sku: string;
        quantity: number;
    }[];
}

export interface SelfDeliveryCreateResponse {
    sourceId: string;
    requestId: string;
    sourceOrderId: string;
    status: 'confirmed';
}
export interface SelfDeliveryProvider {
    /**
     * Requests a self-delivery feasibility quote from a supply source.
     *
     * This is a pre-checkout operation:
     * - Does not create or reserve an actual shipment.
     * - Does not modify inventory or order state.
     *
     * Business rejection:
     * - Return accepted: false.
     * - Return price: null and estimatedDeliveryAt: null.
     *
     * Technical failure:
     * - Reject the Promise with an error.
     * - The caller handles provider failures and timeouts.
     * - Carrier quotes must remain available.
     *
     * The optional AbortSignal allows cancellation.
     */
    getQuote(
        request: SelfDeliveryQuoteRequest,
    ): Promise<SelfDeliveryQuoteResponse>;
    /**
 * Creates an actual delivery order at the source.
 *
 * Must only be called after final order approval.
 * The source must treat requestId as an idempotency key:
 * repeated requests must return the same source order,
 * never create another one.
 */
    createDelivery(
        request: SelfDeliveryCreateRequest,
    ): Promise<SelfDeliveryCreateResponse>;
}
export type SelfDeliveryErrorCode =
    'INVALID_REQUEST' | 'PROVIDER_UNAVAILABLE' | 'TIMEOUT' | 'INTERNAL_ERROR';

export interface SelfDeliveryError {
    code: SelfDeliveryErrorCode;
    message: string;
    retryable: boolean;
}
export class SelfDeliveryProviderError extends Error {
    constructor(
        public readonly code: SelfDeliveryErrorCode,
        message: string,
        public readonly retryable: boolean = false,
    ) {
        super(message);
        this.name = 'SelfDeliveryProviderError';
    }
}
