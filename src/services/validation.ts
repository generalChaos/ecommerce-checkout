import { z } from "zod";
import type { CheckoutRequest } from "../types";
import { ValidationError } from "../utils/errors";

/**
 * Zod schema for a cart item.
 */
export const CartItemSchema = z.object({
  productId: z.string().min(1, "productId must be a non-empty string"),
  name: z.string().min(1, "name must be a non-empty string"),
  price: z
    .number()
    .positive("Item price must be greater than 0")
    .finite("Item price must be a finite number"),
  quantity: z
    .number()
    .int("Item quantity must be a whole number")
    .min(1, "Item quantity must be at least 1"),
});

/**
 * Zod schema for the checkout request.
 */
export const CheckoutRequestSchema = z.object({
  cartId: z.string().min(1, "cartId must be a non-empty string"),
  items: z
    .array(CartItemSchema)
    .min(1, "Cart must contain at least one item"),
  paymentToken: z.string().min(1, "paymentToken must be a non-empty string"),
});

/**
 * Validates the checkout request body using Zod.
 * Throws ValidationError with a descriptive message on any failure.
 */
export function validateCheckoutRequest(body: unknown): CheckoutRequest {
  try {
    return CheckoutRequestSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Format Zod errors into user-friendly messages
      const firstError = error.errors[0];
      let message: string;

      // Handle root-level errors (null, undefined, wrong type)
      if (firstError.path.length === 0) {
        if (
          firstError.message.includes("Expected object") ||
          firstError.message.includes("Expected array") ||
          firstError.message === "Required"
        ) {
          message = "Request body is required";
        } else {
          message = firstError.message;
        }
      } else {
        // Field-specific error
        const fieldPath = firstError.path.join(".");
        const fieldName = firstError.path[firstError.path.length - 1] as string;

        // Map Zod messages to our expected format
        if (firstError.message === "Required") {
          if (fieldPath === "cartId") {
            message = "cartId is required";
          } else if (fieldPath === "paymentToken") {
            message = "paymentToken is required";
          } else if (fieldPath === "items") {
            message = "items is required";
          } else if (fieldPath.startsWith("items.")) {
            const index = firstError.path[1];
            message = `Item at index ${index}: ${fieldName} must be a non-empty string`;
          } else {
            message = `${fieldPath} is required`;
          }
        } else if (firstError.message.includes("Expected string")) {
          if (fieldPath === "cartId") {
            message = "cartId must be a non-empty string";
          } else if (fieldPath === "paymentToken") {
            message = "paymentToken must be a non-empty string";
          } else if (fieldPath.startsWith("items.")) {
            const index = firstError.path[1];
            message = `Item at index ${index}: ${fieldName} must be a non-empty string`;
          } else {
            message = `${fieldPath} must be a string`;
          }
        } else if (firstError.message.includes("Expected array")) {
          message = "items must be an array";
        } else if (fieldPath.startsWith("items.")) {
          // Item-level errors
          const index = firstError.path[1];
          message = `Item at index ${index}: ${firstError.message}`;
        } else {
          // Use Zod's message as-is for other cases
          message = firstError.message;
        }
      }

      throw new ValidationError(message);
    }
    // Fallback for unexpected errors
    throw new ValidationError("Request body is required");
  }
}
