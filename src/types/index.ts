import { z } from "zod";
import { CartItemSchema, CheckoutRequestSchema } from "../services/validation";

// ─── Request Types (inferred from Zod schemas) ────────────────────────────────

export type CartItem = z.infer<typeof CartItemSchema>;
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

// ─── Order / Response Types ──────────────────────────────────────────────────

export interface PricedItem extends CartItem {
  lineTotal: number;
}

export type OrderStatus = "CREATED" | "PAYMENT_CAPTURED" | "PAYMENT_FAILED";

export interface Order {
  orderId: string;
  cartId: string;
  status: OrderStatus;
  items: PricedItem[];
  subtotal: number;
  tax: number;
  total: number;
  createdAt: string;
  transactionId?: string;
}

export interface OrderRecord extends Order {
  paymentToken: string;
  ttl: number;
}

export interface SuccessResponse {
  success: true;
  order: Order;
}

export interface ErrorDetail {
  code: string;
  message: string;
  orderId?: string;
}

export interface ErrorResponse {
  success: false;
  error: ErrorDetail;
}

export type CheckoutResponse = SuccessResponse | ErrorResponse;

// ─── Payment Types ───────────────────────────────────────────────────────────

export interface PaymentResult {
  transactionId: string;
  status: "captured" | "failed";
}

// ─── Pricing Types ───────────────────────────────────────────────────────────

export interface PricingResult {
  items: PricedItem[];
  subtotal: number;
  tax: number;
  total: number;
}

// ─── Error Codes ─────────────────────────────────────────────────────────────

export const ErrorCodes = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
