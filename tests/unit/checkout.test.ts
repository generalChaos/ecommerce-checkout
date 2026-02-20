import { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "../../src/handlers/checkout";
import * as orderService from "../../src/services/order";
import * as paymentService from "../../src/services/payment";

// Mock the DynamoDB-dependent order service and payment service
jest.mock("../../src/services/order");
jest.mock("../../src/services/payment");

const mockedOrder = jest.mocked(orderService);
const mockedPayment = jest.mocked(paymentService);

function makeEvent(body: unknown): APIGatewayProxyEvent {
  return {
    body: body === undefined ? null : JSON.stringify(body),
    httpMethod: "POST",
    path: "/checkout",
    headers: { "Content-Type": "application/json" },
    multiValueHeaders: {},
    isBase64Encoded: false,
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      requestId: "test-req-id",
      accountId: "",
      apiId: "",
      authorizer: null,
      protocol: "",
      httpMethod: "POST",
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: "",
        user: null,
        userAgent: null,
        userArn: null,
      },
      path: "/checkout",
      stage: "test",
      requestTimeEpoch: 0,
      resourceId: "",
      resourcePath: "/checkout",
    },
    resource: "/checkout",
  };
}

function makeRawEvent(rawBody: string | null): APIGatewayProxyEvent {
  const event = makeEvent({});
  event.body = rawBody;
  return event;
}

const validBody = {
  cartId: "cart-123",
  items: [
    { productId: "p1", name: "Widget", price: 29.99, quantity: 2 },
    { productId: "p2", name: "Cable", price: 9.99, quantity: 1 },
  ],
  paymentToken: "tok_valid",
};

const sampleOrder = {
  orderId: "ord-test-123",
  cartId: "cart-123",
  status: "CREATED" as const,
  items: [
    { productId: "p1", name: "Widget", price: 29.99, quantity: 2, lineTotal: 59.98 },
    { productId: "p2", name: "Cable", price: 9.99, quantity: 1, lineTotal: 9.99 },
  ],
  subtotal: 69.97,
  tax: 7.0,
  total: 76.97,
  createdAt: "2026-02-20T12:00:00.000Z",
};

describe("POST /checkout handler", () => {
  beforeEach(() => {
    mockedOrder.getExistingOrder.mockResolvedValue(null);
    mockedOrder.createOrder.mockResolvedValue({
      order: sampleOrder,
      isExisting: false,
    });
    mockedOrder.updateOrderStatus.mockResolvedValue(undefined);
    mockedPayment.capturePayment.mockResolvedValue({
      transactionId: "txn-mock-123",
      status: "captured",
    });
  });

  // ── AC-1: Checkout fails if the cart is empty ──────────────────────────

  it("should return 400 for empty cart (AC-1)", async () => {
    const event = makeEvent({
      cartId: "cart-empty",
      items: [],
      paymentToken: "tok_valid",
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(400);

    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("at least one item");
  });

  // ── AC-2: Checkout is idempotent using cartId ──────────────────────────

  it("should return 200 with existing order for duplicate cartId (AC-2)", async () => {
    const existingOrder = {
      ...sampleOrder,
      status: "PAYMENT_CAPTURED" as const,
      transactionId: "txn-original",
    };
    mockedOrder.getExistingOrder.mockResolvedValue(existingOrder);

    const event = makeEvent(validBody);
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.order.orderId).toBe("ord-test-123");
    expect(body.order.transactionId).toBe("txn-original");
  });

  // ── AC-3: Final price is calculated on the server ──────────────────────

  it("should recalculate price on the server (AC-3)", async () => {
    const event = makeEvent(validBody);
    const result = await handler(event);

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    // The server calculates: 29.99*2 + 9.99*1 = 69.97
    // Tax: 69.97 * 0.10 = 7.00
    // Total: 76.97
    expect(body.order.total).toBe(76.97);
  });

  // ── AC-4: Payment happens after order creation ─────────────────────────

  it("should call payment only after order is created in DB (AC-4)", async () => {
    const callOrder: string[] = [];

    mockedOrder.createOrder.mockImplementation(async () => {
      callOrder.push("createOrder");
      return { order: sampleOrder, isExisting: false };
    });

    mockedPayment.capturePayment.mockImplementation(async () => {
      callOrder.push("capturePayment");
      return { transactionId: "txn-123", status: "captured" };
    });

    const event = makeEvent(validBody);
    await handler(event);

    expect(callOrder).toEqual(["createOrder", "capturePayment"]);
  });

  // ── AC-5: Repeated requests return the same order ──────────────────────

  it("should return identical response for repeated requests (AC-5)", async () => {
    const existingOrder = {
      ...sampleOrder,
      status: "PAYMENT_CAPTURED" as const,
      transactionId: "txn-original",
    };

    // First call: no existing order
    mockedOrder.getExistingOrder.mockResolvedValueOnce(null);
    mockedOrder.createOrder.mockResolvedValueOnce({
      order: sampleOrder,
      isExisting: false,
    });

    const event1 = makeEvent(validBody);
    await handler(event1);

    // Second call: existing order found
    mockedOrder.getExistingOrder.mockResolvedValueOnce(existingOrder);

    const event2 = makeEvent(validBody);
    const result2 = await handler(event2);

    expect(result2.statusCode).toBe(200);
    const body2 = JSON.parse(result2.body);
    expect(body2.order.orderId).toBe(sampleOrder.orderId);
  });

  // ── AC-7: Payment failure handled gracefully ──────────────────────────

  it("should return 402 when payment fails (AC-7)", async () => {
    const { PaymentError } = jest.requireActual("../../src/utils/errors") as {
      PaymentError: new (msg: string, orderId?: string) => Error;
    };
    mockedPayment.capturePayment.mockRejectedValue(
      new PaymentError("Payment capture failed", "ord-test-123")
    );

    const event = makeEvent(validBody);
    const result = await handler(event);

    expect(result.statusCode).toBe(402);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("PAYMENT_FAILED");
    expect(body.error.orderId).toBe("ord-test-123");
  });

  it("should mark order as PAYMENT_FAILED when payment fails (AC-7)", async () => {
    const { PaymentError } = jest.requireActual("../../src/utils/errors") as {
      PaymentError: new (msg: string, orderId?: string) => Error;
    };
    mockedPayment.capturePayment.mockRejectedValue(
      new PaymentError("Payment capture failed", "ord-test-123")
    );

    const event = makeEvent(validBody);
    await handler(event);

    expect(mockedOrder.updateOrderStatus).toHaveBeenCalledWith(
      "cart-123",
      "PAYMENT_FAILED"
    );
  });

  // ── AC-8: Race condition handling ──────────────────────────────────────

  it("should handle race condition via conditional check (AC-8)", async () => {
    const existingOrder = {
      ...sampleOrder,
      status: "PAYMENT_CAPTURED" as const,
    };

    mockedOrder.getExistingOrder.mockResolvedValueOnce(null);
    mockedOrder.createOrder.mockResolvedValueOnce({
      order: existingOrder,
      isExisting: true,
    });

    const event = makeEvent(validBody);
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.order.orderId).toBe("ord-test-123");
    // Payment should NOT be called when returning an existing order
    expect(mockedPayment.capturePayment).not.toHaveBeenCalled();
  });

  // ── Validation edge cases ──────────────────────────────────────────────

  it("should return 400 for malformed JSON", async () => {
    const event = makeRawEvent("{bad json");
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toContain("Invalid JSON");
  });

  it("should return 400 for empty body", async () => {
    const event = makeRawEvent(null);
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should return 400 for missing cartId", async () => {
    const { cartId: _, ...noCartId } = validBody;
    const event = makeEvent(noCartId);
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
  });

  // ── 500 error handling ─────────────────────────────────────────────────

  it("should return 500 for unexpected errors", async () => {
    mockedOrder.getExistingOrder.mockRejectedValue(
      new Error("Unexpected DynamoDB failure")
    );

    const event = makeEvent(validBody);
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("An unexpected error occurred");
  });

  // ── Success path ───────────────────────────────────────────────────────

  it("should return 201 for a successful new checkout", async () => {
    const event = makeEvent(validBody);
    const result = await handler(event);

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.order.status).toBe("PAYMENT_CAPTURED");
    expect(body.order.transactionId).toBe("txn-mock-123");
  });

  it("should include Content-Type header in response", async () => {
    const event = makeEvent(validBody);
    const result = await handler(event);

    expect(result.headers).toHaveProperty("Content-Type", "application/json");
  });

  it("should handle non-PaymentError payment exception (covers line 126)", async () => {
    // Payment throws a generic Error (not PaymentError)
    mockedPayment.capturePayment.mockRejectedValue(
      new Error("Network timeout")
    );

    const event = makeEvent(validBody);
    const result = await handler(event);

    // Should be caught by outer catch and return 500
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("should use fallback correlation ID when requestContext is missing (covers line 26)", async () => {
    const event = makeEvent(validBody);
    // Remove requestContext to trigger fallback
    delete (event as any).requestContext;

    const result = await handler(event);

    // Should still work, using fallback correlation ID
    expect(result.statusCode).toBe(201);
  });

  it("should use fallback correlation ID when requestId is undefined (covers line 26)", async () => {
    const event = makeEvent(validBody);
    // Set requestContext but without requestId
    event.requestContext = {
      ...event.requestContext!,
      requestId: undefined as any,
    };

    const result = await handler(event);

    // Should still work, using fallback correlation ID
    expect(result.statusCode).toBe(201);
  });

  it("should handle non-Error exception (covers lines 145-146)", async () => {
    // Mock order service to throw a non-Error (e.g., string)
    mockedOrder.getExistingOrder.mockRejectedValue("String error" as any);

    const event = makeEvent(validBody);
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("should handle non-Error exception with number (covers lines 145-146)", async () => {
    // Mock order service to throw a number
    mockedOrder.getExistingOrder.mockRejectedValue(123 as any);

    const event = makeEvent(validBody);
    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});
