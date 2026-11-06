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
export type SelfDeliveryTrackingStatus =
    | 'preparing'
    | 'ready_for_pickup'
    | 'out_for_delivery'
    | 'delivered'
    | 'failed';

export interface SelfDeliveryTrackingUpdate {
    sourceId: string;
    sourceOrderId: string;
    status: SelfDeliveryTrackingStatus;

    externalEventId: string;
    occurredAt: string;

    reason?: string;
}

export interface SelfDeliveryStatusRequest {
    sourceId: string;
    sourceOrderId: string;
    signal?: AbortSignal;
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
* - Retry transient provider failures when appropriate.
* - If retries fail, mark self-delivery as unavailable.
* - Never fall back to carrier delivery for a source
*   that has already accepted self-delivery.
* - A business rejection (accepted: false) may allow
*   normal carrier delivery.     *
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
    /**
 * Optional polling capability.
 *
 * Providers supporting status polling implement this method.
 * Providers using webhooks only may omit it.
 */
    getDeliveryStatus?(
        request: SelfDeliveryStatusRequest,
    ): Promise<SelfDeliveryTrackingUpdate>;
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
