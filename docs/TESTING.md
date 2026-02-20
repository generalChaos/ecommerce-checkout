# Testing Guide

This document explains how to test the checkout service locally and verify all functionality.

## Prerequisites

- Node.js >= 20.0.0
- npm installed
- AWS CLI configured (optional, for CDK deployment)

## Quick Start

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Type-check the codebase
npm run lint

# Build the project
npm run build
```

## Unit Tests

The project includes 65+ unit tests covering all acceptance criteria and edge cases.

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npx jest tests/unit/checkout.test.ts
npx jest tests/unit/validation.test.ts
npx jest tests/unit/pricing.test.ts
npx jest tests/unit/order.test.ts
npx jest tests/unit/payment.test.ts

# Run in watch mode (for development)
npm run test:watch

# Run with coverage report
npm test -- --coverage
```

### Test Coverage

Tests are organized to map directly to acceptance criteria:

| Test Suite | Acceptance Criteria Covered |
|---|---|
| `checkout.test.ts` | AC-1, AC-2, AC-3, AC-4, AC-5, AC-7, AC-8 |
| `validation.test.ts` | AC-1, AC-6 (validation edge cases) |
| `pricing.test.ts` | AC-3 (server-side price calculation) |
| `order.test.ts` | AC-2, AC-8 (idempotency, race conditions) |
| `payment.test.ts` | AC-7 (payment failure handling) |

### Viewing Coverage

After running `npm test -- --coverage`, open `coverage/lcov-report/index.html` in your browser to see detailed coverage reports.

**Current Coverage:**
- Overall: 95%+ statement coverage
- All acceptance criteria: 100% covered
- Edge cases: Comprehensive coverage

## Manual Testing

### Testing Locally with Mocked Services

The unit tests use mocked DynamoDB and payment services, so they run without any AWS infrastructure. All tests should pass out of the box.

### Testing Validation

You can manually verify validation logic by examining the test cases in `tests/unit/validation.test.ts`:

- Empty cart rejection
- Invalid item prices/quantities
- Missing required fields
- Type validation (strings, numbers, arrays)
- Edge cases (Infinity, NaN, non-finite numbers)

### Testing Pricing Logic

Check `tests/unit/pricing.test.ts` for pricing verification:

- Line total calculation (price × quantity)
- Subtotal aggregation
- Tax calculation (10%)
- Rounding to 2 decimal places
- Handling of many items (100+)

### Testing Idempotency

The idempotency behavior is tested in:
- `tests/unit/checkout.test.ts` - Handler-level idempotency
- `tests/unit/order.test.ts` - DynamoDB conditional write logic

Key scenarios covered:
- Same `cartId` returns existing order (200 status)
- Race condition handling (concurrent requests)
- Conditional put prevents duplicates
- Order disappearing after conditional check (edge case)

### Testing Payment Scenarios

Payment service behavior is tested in `tests/unit/payment.test.ts`:

**Success tokens:**
- `tok_valid_visa` - Payment succeeds
- Any token not in the failure set

**Failure tokens:**
- `tok_fail` - Generic failure
- `tok_declined` - Card declined
- `tok_insufficient_funds` - Insufficient funds

### Testing Error Handling

Error scenarios are comprehensively tested:

- **Validation errors (400)**: Empty cart, invalid items, missing fields
- **Payment failures (402)**: PaymentError instances
- **Non-PaymentError exceptions**: Generic errors during payment (500)
- **Internal errors (500)**: Unexpected DynamoDB failures, unhandled exceptions

## Manual Testing with cURL

For comprehensive curl examples and manual API testing, see [CURL_TESTING.md](./CURL_TESTING.md).

## Integration Testing (Optional)

### Using LocalStack

For integration testing with a local DynamoDB instance:

1. **Install LocalStack:**
   ```bash
   pip install localstack
   # or
   docker run -d -p 4566:4566 localstack/localstack
   ```

2. **Set environment variables:**
   ```bash
   export AWS_ENDPOINT_URL=http://localhost:4566
   export AWS_ACCESS_KEY_ID=test
   export AWS_SECRET_ACCESS_KEY=test
   export AWS_DEFAULT_REGION=us-east-1
   ```

3. **Create the table:**
   ```bash
   aws dynamodb create-table \
     --endpoint-url http://localhost:4566 \
     --table-name CheckoutOrders \
     --attribute-definitions AttributeName=cartId,AttributeType=S \
     --key-schema AttributeName=cartId,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST
   ```

4. **Update `src/services/order.ts`** to use the LocalStack endpoint:
   ```typescript
   const client = new DynamoDBClient({
     endpoint: process.env.AWS_ENDPOINT_URL,
   });
   ```

### Testing with CDK (Synthesis Only)

You can verify the CDK infrastructure without deploying:

```bash
# Install CDK globally (if not already installed)
npm install -g aws-cdk

# Synthesize CloudFormation template
cd infra
cdk synth

# This creates cdk.out/ directory with the template
# Review the generated CloudFormation template
```

## Testing Checklist

Before submitting, verify:

- [ ] All tests pass (`npm test`)
- [ ] TypeScript compiles without errors (`npm run lint`)
- [ ] Code builds successfully (`npm run build`)
- [ ] Test coverage is acceptable (95%+ statements)
- [ ] All acceptance criteria have corresponding tests
- [ ] Edge cases are covered (empty cart, invalid prices, race conditions, etc.)
- [ ] Idempotency works correctly (same cartId returns same order)
- [ ] Payment failure scenarios are handled (402 status)
- [ ] Non-PaymentError exceptions are handled (500 status)
- [ ] Error messages are user-friendly and match the spec
- [ ] Logs are suppressed during test runs (no console noise)

## Common Issues

### Tests Fail with "Cannot find module"

**Solution:** Run `npm install` to ensure all dependencies are installed.

### TypeScript Errors

**Solution:** Run `npm run lint` to see specific errors. Ensure Node.js >= 20.0.0 is installed.

### DynamoDB Mock Issues

The tests use `aws-sdk-client-mock` which should work out of the box. If you see issues:
- Ensure `aws-sdk-client-mock` is in `devDependencies`
- Check that mocks are reset in `beforeEach` hooks
- Verify `setDocClient()` is called to inject the mock client

### Coverage Report Not Generated

**Solution:** Run `npm test -- --coverage` explicitly. The coverage directory should be created automatically.

### Logs Appearing in Test Output

**Solution:** The Jest config includes `silent: true` to suppress console output. If logs appear, check `jest.config.js` is properly configured.

## Test Structure

Tests follow a clear structure:

1. **Setup**: Mock dependencies, set up test data
2. **Execution**: Call the function under test
3. **Assertion**: Verify expected behavior
4. **Cleanup**: Restore mocks (handled by Jest's `restoreMocks: true`)

Example:
```typescript
it("should handle payment failure", async () => {
  // Setup
  mockedPayment.capturePayment.mockRejectedValue(
    new PaymentError("Payment failed")
  );

  // Execution
  const result = await handler(event);

  // Assertion
  expect(result.statusCode).toBe(402);
});
```

## Next Steps

- Review the [specification](spec.md) to understand the expected behavior
- Check the [README](../README.md) for design decisions and trade-offs
- Review [CLAUDE_USAGE.md](../CLAUDE_USAGE.md) to understand the development process
