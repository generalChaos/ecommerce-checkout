import {
  DynamoDBClient,
  ConditionalCheckFailedException,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuidv4 } from "uuid";
import { Order, OrderRecord, OrderStatus, PricingResult } from "../types";
import { logger } from "../utils/logger";

const TABLE_NAME = process.env.ORDERS_TABLE_NAME || "CheckoutOrders";
const TTL_HOURS = 24;

// Allow DynamoDB client to be injected for testing
let docClient: DynamoDBDocumentClient;

export function getDocClient(): DynamoDBDocumentClient {
  if (!docClient) {
    const clientConfig: any = {
      region: process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || "us-east-1",
    };
    // Support LocalStack for local testing
    if (process.env.AWS_ENDPOINT_URL) {
      clientConfig.endpoint = process.env.AWS_ENDPOINT_URL;
      // LocalStack requires credentials - must be explicitly set
      if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
        throw new Error(
          "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set when using LocalStack (AWS_ENDPOINT_URL)"
        );
      }
      clientConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      };
    }
    const client = new DynamoDBClient(clientConfig);
    docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}

export function setDocClient(client: DynamoDBDocumentClient): void {
  docClient = client;
}

export function resetDocClient(): void {
  docClient = undefined as unknown as DynamoDBDocumentClient;
}

/**
 * Looks up an existing order by cartId.
 * Returns the order if found, or null if not.
 */
export async function getExistingOrder(
  cartId: string
): Promise<Order | null> {
  const result = await getDocClient().send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { cartId },
    })
  );

  if (!result.Item) {
    return null;
  }

  return mapRecordToOrder(result.Item as OrderRecord);
}

/**
 * Creates a new order in DynamoDB using a conditional put.
 * If the cartId already exists (race condition), reads and returns the existing order.
 */
export async function createOrder(
  cartId: string,
  paymentToken: string,
  pricing: PricingResult
): Promise<{ order: Order; isExisting: boolean }> {
  const now = new Date().toISOString();
  const orderId = `ord-${uuidv4()}`;
  const ttl = Math.floor(Date.now() / 1000) + TTL_HOURS * 3600;

  const record: OrderRecord = {
    orderId,
    cartId,
    status: "CREATED",
    items: pricing.items,
    subtotal: pricing.subtotal,
    tax: pricing.tax,
    total: pricing.total,
    paymentToken,
    createdAt: now,
    ttl,
  };

  try {
    await getDocClient().send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: record,
        ConditionExpression: "attribute_not_exists(cartId)",
      })
    );

    logger.info("Order created", { orderId, cartId });
    return { order: mapRecordToOrder(record), isExisting: false };
  } catch (error: unknown) {
    if (error instanceof ConditionalCheckFailedException) {
      logger.info("Duplicate cartId detected, returning existing order", {
        cartId,
      });
      const existing = await getExistingOrder(cartId);
      if (!existing) {
        throw new Error(
          `Race condition: order for cartId ${cartId} disappeared after conditional check`
        );
      }
      return { order: existing, isExisting: true };
    }
    throw error;
  }
}

/**
 * Updates the order status and optionally sets the transactionId.
 */
export async function updateOrderStatus(
  cartId: string,
  status: OrderStatus,
  transactionId?: string
): Promise<void> {
  const updateExpression = transactionId
    ? "SET #status = :status, #txnId = :txnId"
    : "SET #status = :status";

  const expressionAttributeNames: Record<string, string> = {
    "#status": "status",
    ...(transactionId && { "#txnId": "transactionId" }),
  };

  const expressionAttributeValues: Record<string, string> = {
    ":status": status,
    ...(transactionId && { ":txnId": transactionId }),
  };

  await getDocClient().send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { cartId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );

  logger.info("Order status updated", { cartId, status });
}

/**
 * Maps a DynamoDB record to the public Order shape (strips internal fields).
 */
function mapRecordToOrder(record: OrderRecord): Order {
  return {
    orderId: record.orderId,
    cartId: record.cartId,
    status: record.status,
    items: record.items,
    subtotal: record.subtotal,
    tax: record.tax,
    total: record.total,
    createdAt: record.createdAt,
    ...(record.transactionId && { transactionId: record.transactionId }),
  };
}
