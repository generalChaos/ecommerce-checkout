import { v4 as uuidv4 } from "uuid";
import { PaymentResult } from "../types";
import { PaymentError } from "../utils/errors";
import { logger } from "../utils/logger";

/**
 * Tokens that trigger specific behaviors in the mock payment service.
 * Useful for testing error scenarios without real payment integration.
 */
const FAILURE_TOKENS = new Set([
  "tok_fail",
  "tok_declined",
  "tok_insufficient_funds",
]);

/**
 * Mock payment service that simulates payment capture.
 *
 * Behavior:
 *   - If paymentToken is in the FAILURE_TOKENS set, throws PaymentError
 *   - Otherwise, returns a successful PaymentResult with a generated transactionId
 *
 * In production, this would be replaced with a real payment gateway integration.
 */
export async function capturePayment(
  orderId: string,
  amount: number,
  paymentToken: string
): Promise<PaymentResult> {
  logger.info("Attempting payment capture", {
    orderId,
    amount,
    tokenPrefix: paymentToken.substring(0, 8),
  });

  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 10));

  if (FAILURE_TOKENS.has(paymentToken)) {
    logger.warn("Payment capture failed", { orderId, reason: "token_declined" });
    throw new PaymentError("Payment capture failed", orderId);
  }

  const transactionId = `txn-${uuidv4()}`;

  logger.info("Payment captured successfully", { orderId, transactionId });

  return {
    transactionId,
    status: "captured",
  };
}
