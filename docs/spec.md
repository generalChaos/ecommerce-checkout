# Checkout Service Specification

## Overview

A serverless checkout service that processes e-commerce orders with guaranteed idempotency, server-side price calculation, and clear error reporting. This document is the **source of truth** for the implementation.

---

## Checkout Flow

The `POST /checkout` endpoint processes a checkout in the following strict order:

1. **Parse and validate** the request body
2. **Validate the cart** — must not be empty; each item must have valid fields
3. **Check idempotency** — look up `cartId` in DynamoDB
   - If an existing order is found, return it immediately (HTTP 200)
4. **Recalculate price** — compute subtotal, tax, and total on the server
5. **Create order** — write the order to DynamoDB with a conditional put on `cartId`
   - If a `ConditionalCheckFailedException` occurs (race condition), read and return the existing order
6. **Capture payment** — call the payment service with the order total
   - On success: update order status to `PAYMENT_CAPTURED`
   - On failure: update order status to `PAYMENT_FAILED` and return an error
7. **Return the order** — respond with the completed order

```
Client ──POST /checkout──> API Gateway ──> Lambda
                                            │
                                    1. Validate request body
                                    2. Validate cart
                                            │
                                    3. Check DynamoDB for cartId
                                       ├── Found → return existing order (200)
                                       └── Not found ↓
                                    4. Recalculate pricing
                                    5. Create order (conditional put)
                                       └── ConditionalCheckFailed → read & return existing
                                    6. Capture payment
                                       ├── Success → update status PAYMENT_CAPTURED
                                       └── Failure → update status PAYMENT_FAILED, return 402
                                    7. Return order (201)
```

---

## API Contract

### Request

**Endpoint:** `POST /checkout`

**Headers:**
| Header | Required | Description |
|---|---|---|
| `Content-Type` | Yes | Must be `application/json` |

**Body:**

```json
{
  "cartId": "cart-abc-123",
  "items": [
    {
      "productId": "prod-001",
      "name": "Wireless Mouse",
      "price": 29.99,
      "quantity": 2
    },
    {
      "productId": "prod-002",
      "name": "USB-C Cable",
      "price": 9.99,
      "quantity": 1
    }
  ],
  "paymentToken": "tok_valid_visa"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `cartId` | string | Yes | Unique identifier for the cart; used as the idempotency key |
| `items` | array | Yes | List of cart items (must contain at least one item) |
| `items[].productId` | string | Yes | Unique product identifier |
| `items[].name` | string | Yes | Product display name |
| `items[].price` | number | Yes | Unit price (must be > 0) |
| `items[].quantity` | number | Yes | Quantity (must be integer >= 1) |
| `paymentToken` | string | Yes | Token representing the payment method |

### Response — Success (201 Created)

Returned when a new order is successfully created and payment is captured.

```json
{
  "success": true,
  "order": {
    "orderId": "ord-550e8400-e29b-41d4-a716-446655440000",
    "cartId": "cart-abc-123",
    "status": "PAYMENT_CAPTURED",
    "items": [
      {
        "productId": "prod-001",
        "name": "Wireless Mouse",
        "price": 29.99,
        "quantity": 2,
        "lineTotal": 59.98
      },
      {
        "productId": "prod-002",
        "name": "USB-C Cable",
        "price": 9.99,
        "quantity": 1,
        "lineTotal": 9.99
      }
    ],
    "subtotal": 69.97,
    "tax": 7.00,
    "total": 76.97,
    "createdAt": "2026-02-20T12:00:00.000Z"
  }
}
```

### Response — Idempotent Replay (200 OK)

Returned when the same `cartId` is submitted again. The response body is identical to the original order.

```json
{
  "success": true,
  "order": { "...same as original order..." }
}
```

### Response — Validation Error (400 Bad Request)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cart must contain at least one item"
  }
}
```

### Response — Payment Failure (402 Payment Required)

```json
{
  "success": false,
  "error": {
    "code": "PAYMENT_FAILED",
    "message": "Payment capture failed",
    "orderId": "ord-550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### Response — Internal Error (500 Internal Server Error)

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred"
  }
}
```

---

## Pricing Rules

1. **Line total** = `item.price × item.quantity`, rounded to 2 decimal places
2. **Subtotal** = sum of all line totals, rounded to 2 decimal places
3. **Tax** = `subtotal × 0.10` (10% tax rate), rounded to 2 decimal places
4. **Total** = `subtotal + tax`, rounded to 2 decimal places
5. All monetary rounding uses **banker's rounding** (`Math.round` with 2-decimal precision)
6. The server **always recalculates** pricing — any totals sent by the client are ignored

---

## Idempotency Contract

- The `cartId` field serves as the **idempotency key**
- Before creating an order, the service checks DynamoDB for an existing order with the same `cartId`
- If found, the existing order is returned with HTTP 200 (not 201)
- If not found, a new order is created using a **conditional put** (`attribute_not_exists(cartId)`)
- If the conditional put fails due to a race condition (`ConditionalCheckFailedException`), the existing order is read and returned
- Orders are stored with an optional TTL for automatic cleanup (default: 24 hours)

---

## Acceptance Criteria

| ID | Criterion | Expected Behavior |
|---|---|---|
| AC-1 | Checkout fails if the cart is empty | Returns 400 with `VALIDATION_ERROR` |
| AC-2 | Checkout is idempotent using `cartId` | Second request with same `cartId` returns 200 with original order |
| AC-3 | Final price is calculated on the server | Server ignores client-supplied totals; recalculates from item price × quantity |
| AC-4 | Payment happens after order creation | Order record exists in DynamoDB before payment service is called |
| AC-5 | Repeated requests return the same order | Response body is identical for duplicate `cartId` requests |
| AC-6 | Checkout fails for invalid items | Items with quantity < 1 or price <= 0 are rejected with 400 |
| AC-7 | Payment failure is handled gracefully | Order status set to `PAYMENT_FAILED`; returns 402 |
| AC-8 | Race conditions are handled | Concurrent requests for the same `cartId` do not create duplicates |

---

## Edge Cases

| Case | Handling |
|---|---|
| Empty cart (`items: []`) | Return 400 — `Cart must contain at least one item` |
| Item with `quantity: 0` | Return 400 — `Item quantity must be at least 1` |
| Item with `price: -5` | Return 400 — `Item price must be greater than 0` |
| Item with `price: 0` | Return 400 — `Item price must be greater than 0` |
| Missing `cartId` | Return 400 — `cartId is required` |
| Missing `paymentToken` | Return 400 — `paymentToken is required` |
| Missing `items` | Return 400 — `items is required` |
| Non-string `cartId` | Return 400 — `cartId must be a string` |
| Non-array `items` | Return 400 — `items must be an array` |
| Non-integer `quantity` | Return 400 — `Item quantity must be a whole number` |
| Very large order (100+ items) | Processed normally; no artificial limit |
| Malformed JSON body | Return 400 — `Invalid JSON in request body` |
| Empty request body | Return 400 — `Request body is required` |

---

## Error Scenarios

| Scenario | HTTP Status | Error Code | Description |
|---|---|---|---|
| Invalid/missing request fields | 400 | `VALIDATION_ERROR` | Request fails validation |
| Empty or invalid cart | 400 | `VALIDATION_ERROR` | Cart has no items or invalid items |
| Payment capture fails | 402 | `PAYMENT_FAILED` | Payment service rejects the charge |
| DynamoDB write fails (non-conditional) | 500 | `INTERNAL_ERROR` | Unexpected database error |
| Unhandled exception | 500 | `INTERNAL_ERROR` | Catch-all for unexpected errors |

---

## Security Rules

1. **Server-side pricing only** — the server recalculates all monetary values; client-supplied totals are never trusted
2. **No secrets in code** — API keys, tokens, and credentials must come from environment variables or AWS Secrets Manager
3. **Input sanitization** — all request fields are validated for type and value before processing
4. **Structured logging** — logs are JSON-formatted with correlation IDs; no PII (personally identifiable information) is logged
5. **Minimal error exposure** — internal error details are never leaked to the client; only safe error codes and messages are returned

---

## DynamoDB Table Schema

**Table Name:** `CheckoutOrders` (configurable via environment variable `ORDERS_TABLE_NAME`)

| Attribute | Type | Key |
|---|---|---|
| `cartId` | `S` (String) | Partition Key |
| `orderId` | `S` (String) | — |
| `status` | `S` (String) | — |
| `items` | `L` (List) | — |
| `subtotal` | `N` (Number) | — |
| `tax` | `N` (Number) | — |
| `total` | `N` (Number) | — |
| `paymentToken` | `S` (String) | — |
| `transactionId` | `S` (String) | — |
| `createdAt` | `S` (String) | — |
| `ttl` | `N` (Number) | — |

**TTL:** Enabled on the `ttl` attribute. Default expiry: 24 hours from creation.
