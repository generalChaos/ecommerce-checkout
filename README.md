# Smart Order Fulfillment — Serverless Checkout Service

A serverless, idempotent checkout service built with TypeScript, AWS Lambda, API Gateway, and DynamoDB. Developed using a **Markdown-first** approach where the specification drives the implementation.

## Quick Start

**Prerequisites:** Node.js >= 20.0.0

```bash
# Install dependencies
npm install

# Run tests
npm test

# Type-check
npm run lint

# Build
npm run build
```

## Project Structure

```
docs/
  brief.md              Original assessment brief
  spec.md               Specification (source of truth)
src/
  handlers/
    checkout.ts          Lambda handler — POST /checkout
  services/
    validation.ts        Request & cart validation
    pricing.ts           Server-side price calculation
    order.ts             Order persistence + idempotency (DynamoDB)
    payment.ts           Mock payment service
  types/
    index.ts             Shared TypeScript interfaces
  utils/
    errors.ts            Custom error classes (ValidationError, PaymentError)
    logger.ts            Structured JSON logger
infra/
  lib/checkout-stack.ts  CDK stack (Lambda, API GW, DynamoDB)
  bin/app.ts             CDK app entry point
tests/
  unit/                  Jest unit tests (58 tests across 5 suites)
```

## Design Decisions & Trade-offs

### Idempotency via `cartId`

The `cartId` serves as both the DynamoDB partition key and the idempotency key. The service uses a two-phase approach:

1. **Pre-check**: `GetItem` on `cartId` — fast path for retries
2. **Conditional write**: `PutItem` with `attribute_not_exists(cartId)` — prevents duplicates even under concurrent requests

**Trade-off**: Using `cartId` as the partition key means one order per cart. If a cart needs to be re-ordered after failure, the client must generate a new `cartId`. This is intentional — the spec requires that the same `cartId` always returns the same result.

### Server-Side Pricing

The server ignores any client-supplied totals and recalculates everything from `item.price × item.quantity`. This prevents price-tampering attacks where a client sends manipulated totals.

**Trade-off**: In a production system, prices would be looked up from a product catalog rather than trusted from the request. The current design validates that `price > 0` but trusts the item price value — this is a deliberate simplification for the assessment scope.

### Payment After Order Creation

The order is persisted in DynamoDB *before* payment capture. If payment fails, the order is marked `PAYMENT_FAILED` rather than deleted.

**Trade-off**: This means failed orders remain in the table (cleaned up by TTL after 24 hours). The benefit is full auditability — we never lose track of an attempted checkout. It also means a retry with the same `cartId` after a payment failure will return the `PAYMENT_FAILED` order, requiring a new `cartId` for a fresh attempt.

### Error Model

Custom error classes (`ValidationError`, `PaymentError`) extend a base `AppError` that carries an HTTP status code and a machine-readable error code. The handler catches these and maps them to structured JSON responses. Unknown errors are caught as 500s with no internal details leaked.

### Structured Logging

All log output is JSON with a consistent shape: `level`, `message`, `timestamp`, and an optional `correlationId` (from the API Gateway request ID). No PII is logged. This makes logs easy to query in CloudWatch Logs Insights.

### CDK Infrastructure

The CDK stack defines the full infrastructure: DynamoDB table (PAY_PER_REQUEST), Lambda function (Node.js 20), and API Gateway REST API. TTL is enabled on the `ttl` attribute for automatic cleanup.

## API Usage

### POST /checkout

```bash
curl -X POST https://<api-url>/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "cartId": "cart-abc-123",
    "items": [
      {"productId": "prod-001", "name": "Widget", "price": 29.99, "quantity": 2}
    ],
    "paymentToken": "tok_valid_visa"
  }'
```

**Success (201)**:
```json
{
  "success": true,
  "order": {
    "orderId": "ord-...",
    "cartId": "cart-abc-123",
    "status": "PAYMENT_CAPTURED",
    "items": [{"productId": "prod-001", "name": "Widget", "price": 29.99, "quantity": 2, "lineTotal": 59.98}],
    "subtotal": 59.98,
    "tax": 6.00,
    "total": 65.98,
    "transactionId": "txn-...",
    "createdAt": "2026-02-20T12:00:00.000Z"
  }
}
```

**Idempotent Replay (200)**: Same response body, HTTP 200 instead of 201.

See [`docs/spec.md`](docs/spec.md) for full API contract, error responses, and edge cases.

## Test Coverage

Tests are organized to map directly to acceptance criteria:

| Test | Acceptance Criterion |
|---|---|
| Rejects empty cart with 400 | AC-1: Checkout fails if the cart is empty |
| Returns same order for same `cartId` | AC-2: Checkout is idempotent |
| Server recalculates total | AC-3: Final price is calculated on the server |
| Payment called after order exists in DB | AC-4: Payment happens after order creation |
| Duplicate `cartId` returns identical response | AC-5: Repeated requests return the same order |
| Items with invalid price/quantity rejected | AC-6: Invalid items rejected |
| Returns 402 on payment failure | AC-7: Payment failure handled |
| Conditional check handles race condition | AC-8: No duplicate orders |

For detailed testing instructions, see [TESTING.md](docs/TESTING.md).  
For manual API testing with curl examples, see [CURL_TESTING.md](docs/CURL_TESTING.md).

Run with coverage:

```bash
npm test
```
