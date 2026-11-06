# Self-Delivery Provider Contract

## Purpose

Defines the communication contract between FlowShip and a supply source that can perform its own deliveries.

Current scope: pre-checkout delivery feasibility and quote retrieval only.

## TypeScript interface

Location: `src/modules/sourcing/interfaces/self-delivery-provider.interface.ts`

Method:

`getQuote(request: SelfDeliveryQuoteRequest): Promise<SelfDeliveryQuoteResponse>`

## Request

- `storeId`: Store identifier.
- `sourceId`: Supply source identifier.
- `destination`: Delivery address containing city, street and houseNumber.
- `items`: Array of SKU and quantity.
- `signal?`: Optional AbortSignal for cancellation.

## Response

- `sourceId`: Responding source identifier.
- `accepted`: Whether the source can perform the delivery.
- `price`: Quoted price or null.
- `currency`: ILS.
- `estimatedDeliveryAt`: ISO 8601 delivery timestamp or null.

### Accepted response

```json
{
  "sourceId": "WAREHOUSE-SOUTH",
  "accepted": true,
  "price": 25,
  "currency": "ILS",
  "estimatedDeliveryAt": "2026-10-28T12:00:00.000Z"
}
```

The example values are illustrative.

FlowShip may override the provider's quoted price with the store-configured self-delivery price.

### Business rejection

```json
{
  "sourceId": "WAREHOUSE-SOUTH",
  "accepted": false,
  "price": null,
  "currency": "ILS",
  "estimatedDeliveryAt": null
}
```

Business rejection is a valid response, not a technical failure.

## Technical errors

Defined error codes:

- `INVALID_REQUEST`
- `PROVIDER_UNAVAILABLE`
- `TIMEOUT`
- `INTERNAL_ERROR`

`SelfDeliveryProviderError` supports a code, message and retryable flag.

Providers may reject the Promise on technical failure. The existing quote service catches provider errors and does not allow them to block regular carrier quotes.

These codes are internal TypeScript contract definitions, not an implemented external HTTP error protocol.

## Timeout and cancellation

FlowShip applies a 5-second timeout to self-delivery quote requests.

An AbortSignal is passed to the provider. Actual cancellation of external work depends on the provider implementation respecting the signal.

On timeout or provider failure, FlowShip discards the self-delivery quote and continues processing regular carrier quotes.

## Eligibility

A self-delivery quote is requested only when the source supports self-delivery, the store permits it and the required configured price is available.

A configured price of zero is valid.

## Side effects and boundaries

`getQuote()` is a feasibility and quote operation only.

It must not:
- Create or book a shipment.
- Reserve inventory.
- Change order state.

Shipment booking, cancellation and delivery status updates are outside the currently implemented self-delivery provider contract.

## Current implementation

`MockSelfDeliveryProvider` returns a fixed accepted quote with a price of 25 ILS and an ETA two hours in the future. It does not validate real delivery coverage or item availability.

## Tests

`src/modules/planning/shipment-plan-quote.service.spec.ts`

The existing tests cover eligibility, configured pricing, rejection, provider failure, timeout and preservation of regular carrier quotes.
