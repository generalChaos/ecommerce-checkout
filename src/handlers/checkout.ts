import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { validateCheckoutRequest } from "../services/validation";
import { calculatePricing } from "../services/pricing";
import { getExistingOrder, createOrder, updateOrderStatus } from "../services/order";
import { capturePayment } from "../services/payment";
import { AppError, PaymentError } from "../utils/errors";
import { logger, setCorrelationId, clearCorrelationId } from "../utils/logger";
import { CheckoutResponse, ErrorCodes } from "../types";

/**
 * Lambda handler for POST /checkout.
 *
 * Processing order (per spec):
 *   1. Parse and validate the request body
 *   2. Validate the cart
 *   3. Check idempotency (existing order by cartId)
 *   4. Recalculate pricing on the server
 *   5. Create order in DynamoDB (conditional put)
 *   6. Capture payment
 *   7. Return the order
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const requestId =
    event.requestContext?.requestId || `local-${Date.now()}`;
  setCorrelationId(requestId);

  try {
    logger.info("Checkout request received", {
      httpMethod: event.httpMethod,
      path: event.path,
    });

    // 1–2. Parse and validate request body
    let body: unknown;
    try {
      body = event.body ? JSON.parse(event.body) : null;
    } catch {
      return respond(400, {
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: "Invalid JSON in request body",
        },
      });
    }

    const request = validateCheckoutRequest(body);

    // 3. Check idempotency — look up existing order
    const existingOrder = await getExistingOrder(request.cartId);
    if (existingOrder) {
      logger.info("Returning existing order (idempotent)", {
        cartId: request.cartId,
        orderId: existingOrder.orderId,
      });
      return respond(200, { success: true, order: existingOrder });
    }

    // 4. Recalculate pricing on the server
    const pricing = calculatePricing(request.items);

    // 5. Create order in DynamoDB (conditional put handles race conditions)
    const { order, isExisting } = await createOrder(
      request.cartId,
      request.paymentToken,
      pricing
    );

    if (isExisting) {
      logger.info("Returning existing order (race condition resolved)", {
        cartId: request.cartId,
        orderId: order.orderId,
      });
      return respond(200, { success: true, order });
    }

    // 6. Capture payment
    try {
      const paymentResult = await capturePayment(
        order.orderId,
        order.total,
        request.paymentToken
      );

      // Update order status to PAYMENT_CAPTURED
      await updateOrderStatus(
        request.cartId,
        "PAYMENT_CAPTURED",
        paymentResult.transactionId
      );

      const completedOrder = {
        ...order,
        status: "PAYMENT_CAPTURED" as const,
        transactionId: paymentResult.transactionId,
      };

      logger.info("Checkout completed successfully", {
        orderId: order.orderId,
        cartId: request.cartId,
        total: order.total,
      });

      // 7. Return the order
      return respond(201, { success: true, order: completedOrder });
    } catch (paymentError: unknown) {
      // Payment failed — mark order as PAYMENT_FAILED
      await updateOrderStatus(request.cartId, "PAYMENT_FAILED");

      if (paymentError instanceof PaymentError) {
        logger.warn("Payment failed for order", {
          orderId: order.orderId,
          cartId: request.cartId,
        });
        return respond(402, {
          success: false,
          error: {
            code: ErrorCodes.PAYMENT_FAILED,
            message: paymentError.message,
            orderId: order.orderId,
          },
        });
      }
      throw paymentError;
    }
  } catch (error: unknown) {
    if (error instanceof AppError) {
      logger.warn("Application error", {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
      });
      return respond(error.statusCode, {
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    logger.error("Unexpected error", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return respond(500, {
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: "An unexpected error occurred",
      },
    });
  } finally {
    clearCorrelationId();
  }
}

/**
 * Builds a standardized API Gateway proxy response.
 */
function respond(
  statusCode: number,
  body: CheckoutResponse
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}
