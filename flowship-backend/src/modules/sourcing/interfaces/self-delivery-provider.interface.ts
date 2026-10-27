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
