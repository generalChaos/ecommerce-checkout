import { ErrorCode, ErrorCodes } from "../types";

/**
 * Base application error with an error code for structured responses.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;

  constructor(message: string, code: ErrorCode, statusCode: number) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when request validation fails (400).
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, ErrorCodes.VALIDATION_ERROR, 400);
  }
}

/**
 * Thrown when payment capture fails (402).
 */
export class PaymentError extends AppError {
  public readonly orderId?: string;

  constructor(message: string, orderId?: string) {
    super(message, ErrorCodes.PAYMENT_FAILED, 402);
    this.orderId = orderId;
  }
}
