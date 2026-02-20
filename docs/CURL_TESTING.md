# Manual Testing with cURL

This guide shows how to manually test the checkout API using `curl` commands.

## Prerequisites

1. **Build the project:**
   ```bash
   npm install
   npm run build
   ```

2. **Set up AWS credentials** (for real DynamoDB) or use LocalStack:
   ```bash
   export AWS_REGION=us-east-1
   export AWS_ACCESS_KEY_ID=your-key
   export AWS_SECRET_ACCESS_KEY=your-secret
   ```

   **OR use LocalStack** (see [TESTING.md](./TESTING.md) for LocalStack setup)

3. **Ensure DynamoDB table exists:**
   - If using AWS: Deploy the CDK stack or create the table manually
   - If using LocalStack: Create the table as shown in TESTING.md

## Starting the Local Server

```bash
npm run dev
```

The server will start on `http://localhost:3000` by default (or set `PORT` environment variable).

## Basic cURL Examples

### 1. Successful Checkout

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{
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
  }'
```

**Expected Response (201 Created):**
```json
{
  "success": true,
  "order": {
    "orderId": "ord-...",
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
    "transactionId": "txn-...",
    "createdAt": "2026-02-20T12:00:00.000Z"
  }
}
```

### 2. Test Idempotency (Same cartId)

Run the same request again with the same `cartId`:

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "cartId": "cart-abc-123",
    "items": [
      {
        "productId": "prod-001",
        "name": "Wireless Mouse",
        "price": 29.99,
        "quantity": 2
      }
    ],
    "paymentToken": "tok_valid_visa"
  }'
```

**Expected Response (200 OK):** Same order as before, but with HTTP 200 instead of 201.

### 3. Test Empty Cart (Validation Error)

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "cartId": "cart-empty",
    "items": [],
    "paymentToken": "tok_valid_visa"
  }'
```

**Expected Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Cart must contain at least one item"
  }
}
```

### 4. Test Invalid Item Price

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "cartId": "cart-invalid",
    "items": [
      {
        "productId": "prod-001",
        "name": "Test Item",
        "price": -10.00,
        "quantity": 1
      }
    ],
    "paymentToken": "tok_valid_visa"
  }'
```

**Expected Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Item price must be greater than 0"
  }
}
```

### 5. Test Payment Failure

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "cartId": "cart-payment-fail",
    "items": [
      {
        "productId": "prod-001",
        "name": "Test Item",
        "price": 10.00,
        "quantity": 1
      }
    ],
    "paymentToken": "tok_fail"
  }'
```

**Expected Response (402 Payment Required):**
```json
{
  "success": false,
  "error": {
    "code": "PAYMENT_FAILED",
    "message": "Payment capture failed",
    "orderId": "ord-..."
  }
}
```

**Other failure tokens:**
- `tok_declined` - Card declined
- `tok_insufficient_funds` - Insufficient funds

### 6. Test Invalid Quantity

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "cartId": "cart-invalid-qty",
    "items": [
      {
        "productId": "prod-001",
        "name": "Test Item",
        "price": 10.00,
        "quantity": 0
      }
    ],
    "paymentToken": "tok_valid_visa"
  }'
```

**Expected Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Item quantity must be at least 1"
  }
}
```

### 7. Test Missing Required Fields

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "cartId": "cart-missing",
    "items": [
      {
        "productId": "prod-001",
        "name": "Test Item"
      }
    ]
  }'
```

**Expected Response (400 Bad Request):** Validation error about missing fields.

### 8. Test Server-Side Price Calculation

Send a request with manipulated totals (the server should ignore them):

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "cartId": "cart-price-test",
    "items": [
      {
        "productId": "prod-001",
        "name": "Expensive Item",
        "price": 10.00,
        "quantity": 2
      }
    ],
    "paymentToken": "tok_valid_visa"
  }'
```

**Expected:** Server calculates `10.00 × 2 = 20.00` subtotal, `2.00` tax, `22.00` total (regardless of any client-side manipulation).

## Pretty-Printing JSON Responses

For better readability, pipe through `jq`:

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{...}' | jq
```

Or use Python:

```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -d '{...}' | python -m json.tool
```

## Testing with Different Ports

Set a custom port:

```bash
PORT=8080 npm run dev
```

Then use:
```bash
curl -X POST http://localhost:8080/checkout ...
```

## Testing Scenarios Checklist

- [ ] Successful checkout (201 Created)
- [ ] Idempotent replay (200 OK, same order)
- [ ] Empty cart rejection (400)
- [ ] Invalid price rejection (400)
- [ ] Invalid quantity rejection (400)
- [ ] Missing fields rejection (400)
- [ ] Payment failure (402)
- [ ] Server-side price calculation (ignores client totals)
- [ ] Multiple items in cart
- [ ] Large quantities (test rounding)

## Troubleshooting

### "Cannot find module" error
- Run `npm run build` first to compile TypeScript

### DynamoDB connection errors
- Verify AWS credentials are set
- Check that the table exists: `aws dynamodb describe-table --table-name CheckoutOrders`
- If using LocalStack, ensure it's running and endpoint is configured

### Port already in use
- Change the port: `PORT=8080 npm run dev`
- Or kill the process using port 3000

### CORS errors (if testing from browser)
- The local server includes CORS headers, but if testing from a browser, ensure the request origin matches

## Next Steps

For automated testing, see [TESTING.md](./TESTING.md) for unit tests and integration testing with LocalStack.
