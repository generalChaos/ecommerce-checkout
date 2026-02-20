import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import {
  getExistingOrder,
  createOrder,
  updateOrderStatus,
  setDocClient,
  getDocClient,
  resetDocClient,
} from "../../src/services/order";
import { PricingResult } from "../../src/types";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  // Inject the mock client
  setDocClient(ddbMock as unknown as DynamoDBDocumentClient);
});

const samplePricing: PricingResult = {
  items: [
    {
      productId: "p1",
      name: "Widget",
      price: 29.99,
      quantity: 2,
      lineTotal: 59.98,
    },
  ],
  subtotal: 59.98,
  tax: 6.0,
  total: 65.98,
};

const sampleOrderRecord = {
  orderId: "ord-existing-123",
  cartId: "cart-123",
  status: "PAYMENT_CAPTURED",
  items: samplePricing.items,
  subtotal: 59.98,
  tax: 6.0,
  total: 65.98,
  paymentToken: "tok_valid",
  transactionId: "txn-abc",
  createdAt: "2026-02-20T12:00:00.000Z",
  ttl: 1740000000,
};

describe("getExistingOrder", () => {
  it("should return null when no order exists", async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const result = await getExistingOrder("cart-nonexistent");
    expect(result).toBeNull();
  });

  it("should return the order when it exists (AC-2)", async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleOrderRecord });

    const result = await getExistingOrder("cart-123");
    expect(result).not.toBeNull();
    expect(result!.orderId).toBe("ord-existing-123");
    expect(result!.cartId).toBe("cart-123");
    expect(result!.status).toBe("PAYMENT_CAPTURED");
    expect(result!.transactionId).toBe("txn-abc");
  });

  it("should strip internal fields from the order", async () => {
    ddbMock.on(GetCommand).resolves({ Item: sampleOrderRecord });

    const result = await getExistingOrder("cart-123");
    // paymentToken and ttl should not be in the returned Order
    expect(result).not.toHaveProperty("paymentToken");
    expect(result).not.toHaveProperty("ttl");
  });
});

describe("createOrder", () => {
  it("should create a new order successfully", async () => {
    ddbMock.on(PutCommand).resolves({});

    const { order, isExisting } = await createOrder(
      "cart-new",
      "tok_valid",
      samplePricing
    );

    expect(isExisting).toBe(false);
    expect(order.cartId).toBe("cart-new");
    expect(order.orderId).toMatch(/^ord-/);
    expect(order.status).toBe("CREATED");
    expect(order.subtotal).toBe(59.98);
    expect(order.tax).toBe(6.0);
    expect(order.total).toBe(65.98);
  });

  it("should use conditional put with attribute_not_exists (AC-8)", async () => {
    ddbMock.on(PutCommand).resolves({});

    await createOrder("cart-new", "tok_valid", samplePricing);

    const putCall = ddbMock.commandCalls(PutCommand)[0];
    expect(putCall.args[0].input.ConditionExpression).toBe(
      "attribute_not_exists(cartId)"
    );
  });

  it("should return existing order on ConditionalCheckFailedException (AC-8)", async () => {
    const error = new ConditionalCheckFailedException({
      message: "The conditional request failed",
      $metadata: {},
    });
    ddbMock.on(PutCommand).rejects(error);
    ddbMock.on(GetCommand).resolves({ Item: sampleOrderRecord });

    const { order, isExisting } = await createOrder(
      "cart-123",
      "tok_valid",
      samplePricing
    );

    expect(isExisting).toBe(true);
    expect(order.orderId).toBe("ord-existing-123");
  });

  it("should throw error when order disappears after conditional check (covers line 100)", async () => {
    const error = new ConditionalCheckFailedException({
      message: "The conditional request failed",
      $metadata: {},
    });
    ddbMock.on(PutCommand).rejects(error);
    // Order not found after conditional check fails (race condition edge case)
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    await expect(
      createOrder("cart-123", "tok_valid", samplePricing)
    ).rejects.toThrow("Race condition: order for cartId cart-123 disappeared");
  });

  it("should throw on other DynamoDB errors", async () => {
    ddbMock.on(PutCommand).rejects(new Error("DynamoDB down"));

    await expect(
      createOrder("cart-new", "tok_valid", samplePricing)
    ).rejects.toThrow("DynamoDB down");
  });
});

describe("updateOrderStatus", () => {
  it("should update status without transactionId", async () => {
    ddbMock.on(UpdateCommand).resolves({});

    await updateOrderStatus("cart-123", "PAYMENT_FAILED");

    const updateCall = ddbMock.commandCalls(UpdateCommand)[0];
    expect(updateCall.args[0].input.Key).toEqual({ cartId: "cart-123" });
    expect(updateCall.args[0].input.ExpressionAttributeValues).toHaveProperty(
      ":status",
      "PAYMENT_FAILED"
    );
  });

  it("should update status with transactionId", async () => {
    ddbMock.on(UpdateCommand).resolves({});

    await updateOrderStatus("cart-123", "PAYMENT_CAPTURED", "txn-abc");

    const updateCall = ddbMock.commandCalls(UpdateCommand)[0];
    expect(updateCall.args[0].input.ExpressionAttributeValues).toHaveProperty(
      ":txnId",
      "txn-abc"
    );
  });
});

describe("getDocClient initialization", () => {
  it("should initialize DynamoDB client when docClient is null (covers lines 23-24)", () => {
    // Reset docClient to test initialization path
    resetDocClient();
    
    // Call getDocClient - it should initialize a new client
    const client = getDocClient();
    expect(client).toBeDefined();
    
    // Call again - should return the same instance (singleton pattern)
    const client2 = getDocClient();
    expect(client).toBe(client2);
    
    // Restore mock for other tests
    setDocClient(ddbMock as unknown as DynamoDBDocumentClient);
  });
});
