import { validateCheckoutRequest } from "../../src/services/validation";
import { ValidationError } from "../../src/utils/errors";

describe("validateCheckoutRequest", () => {
  const validRequest = {
    cartId: "cart-123",
    items: [
      {
        productId: "prod-001",
        name: "Widget",
        price: 10.0,
        quantity: 2,
      },
    ],
    paymentToken: "tok_valid",
  };

  it("should accept a valid request", () => {
    const result = validateCheckoutRequest(validRequest);
    expect(result.cartId).toBe("cart-123");
    expect(result.items).toHaveLength(1);
    expect(result.paymentToken).toBe("tok_valid");
  });

  it("should accept a request with multiple items", () => {
    const request = {
      ...validRequest,
      items: [
        { productId: "p1", name: "A", price: 5.0, quantity: 1 },
        { productId: "p2", name: "B", price: 15.99, quantity: 3 },
      ],
    };
    const result = validateCheckoutRequest(request);
    expect(result.items).toHaveLength(2);
  });

  // ── Request body ──────────────────────────────────────────────────────

  it("should reject null body", () => {
    expect(() => validateCheckoutRequest(null)).toThrow(ValidationError);
    expect(() => validateCheckoutRequest(null)).toThrow(
      "Request body is required"
    );
  });

  it("should reject undefined body", () => {
    expect(() => validateCheckoutRequest(undefined)).toThrow(ValidationError);
    expect(() => validateCheckoutRequest(undefined)).toThrow(
      "Request body is required"
    );
  });

  it("should reject non-object body", () => {
    expect(() => validateCheckoutRequest("string")).toThrow(ValidationError);
  });

  // ── cartId ────────────────────────────────────────────────────────────

  it("should reject missing cartId", () => {
    const { cartId: _, ...noCartId } = validRequest;
    expect(() => validateCheckoutRequest(noCartId)).toThrow("cartId is required");
  });

  it("should reject empty string cartId", () => {
    expect(() =>
      validateCheckoutRequest({ ...validRequest, cartId: "" })
    ).toThrow("cartId must be a non-empty string");
  });

  it("should reject non-string cartId", () => {
    expect(() =>
      validateCheckoutRequest({ ...validRequest, cartId: 123 })
    ).toThrow("cartId must be a non-empty string");
  });

  // ── paymentToken ──────────────────────────────────────────────────────

  it("should reject missing paymentToken", () => {
    const { paymentToken: _, ...noToken } = validRequest;
    expect(() => validateCheckoutRequest(noToken)).toThrow(
      "paymentToken is required"
    );
  });

  it("should reject empty paymentToken", () => {
    expect(() =>
      validateCheckoutRequest({ ...validRequest, paymentToken: "" })
    ).toThrow("paymentToken must be a non-empty string");
  });

  // ── items ─────────────────────────────────────────────────────────────

  it("should reject missing items", () => {
    const { items: _, ...noItems } = validRequest;
    expect(() => validateCheckoutRequest(noItems)).toThrow("items is required");
  });

  it("should reject non-array items", () => {
    expect(() =>
      validateCheckoutRequest({ ...validRequest, items: "not-array" })
    ).toThrow("items must be an array");
  });

  it("should reject empty cart (AC-1)", () => {
    expect(() =>
      validateCheckoutRequest({ ...validRequest, items: [] })
    ).toThrow("Cart must contain at least one item");
  });

  // ── Item-level validation ─────────────────────────────────────────────

  it("should reject item with price <= 0 (AC-6)", () => {
    const request = {
      ...validRequest,
      items: [{ productId: "p1", name: "Free", price: 0, quantity: 1 }],
    };
    expect(() => validateCheckoutRequest(request)).toThrow(
      "Item price must be greater than 0"
    );
  });

  it("should reject item with negative price (AC-6)", () => {
    const request = {
      ...validRequest,
      items: [{ productId: "p1", name: "Neg", price: -5, quantity: 1 }],
    };
    expect(() => validateCheckoutRequest(request)).toThrow(
      "Item price must be greater than 0"
    );
  });

  it("should reject item with quantity < 1 (AC-6)", () => {
    const request = {
      ...validRequest,
      items: [{ productId: "p1", name: "Zero", price: 10, quantity: 0 }],
    };
    expect(() => validateCheckoutRequest(request)).toThrow(
      "Item quantity must be at least 1"
    );
  });

  it("should reject item with non-integer quantity", () => {
    const request = {
      ...validRequest,
      items: [{ productId: "p1", name: "Half", price: 10, quantity: 1.5 }],
    };
    expect(() => validateCheckoutRequest(request)).toThrow(
      "Item quantity must be a whole number"
    );
  });

  it("should reject item with missing productId", () => {
    const request = {
      ...validRequest,
      items: [{ name: "No ID", price: 10, quantity: 1 }],
    };
    expect(() => validateCheckoutRequest(request)).toThrow(
      "productId must be a non-empty string"
    );
  });

  it("should reject item with missing name", () => {
    const request = {
      ...validRequest,
      items: [{ productId: "p1", price: 10, quantity: 1 }],
    };
    expect(() => validateCheckoutRequest(request)).toThrow(
      "name must be a non-empty string"
    );
  });

  // ── Additional coverage tests for uncovered lines ────────────────────────

  it("should handle paymentToken as number (covers Expected string path)", () => {
    expect(() =>
      validateCheckoutRequest({ ...validRequest, paymentToken: 999 })
    ).toThrow("paymentToken must be a non-empty string");
  });

  it("should handle item productId as number (covers items.* Expected string path)", () => {
    const request = {
      ...validRequest,
      items: [{ productId: 123, name: "Test", price: 10, quantity: 1 }],
    };
    expect(() => validateCheckoutRequest(request)).toThrow(
      /Item at index 0.*productId.*must be a non-empty string/
    );
  });

  it("should handle item name as number (covers items.* Expected string path)", () => {
    const request = {
      ...validRequest,
      items: [{ productId: "p1", name: 456, price: 10, quantity: 1 }],
    };
    expect(() => validateCheckoutRequest(request)).toThrow(
      /Item at index 0.*name.*must be a non-empty string/
    );
  });

  it("should handle non-finite price (covers item-level custom message path)", () => {
    const request = {
      ...validRequest,
      items: [{ productId: "p1", name: "Test", price: Infinity, quantity: 1 }],
    };
    expect(() => validateCheckoutRequest(request)).toThrow(
      /Item at index 0/
    );
  });

  it("should handle NaN price (covers item-level custom message path)", () => {
    const request = {
      ...validRequest,
      items: [{ productId: "p1", name: "Test", price: NaN, quantity: 1 }],
    };
    expect(() => validateCheckoutRequest(request)).toThrow(
      /Item at index 0/
    );
  });

  it("should handle root-level error with unexpected message (covers line 54)", () => {
    // Test with a number (not object) to trigger root-level error
    // This will hit the else branch for root-level errors
    expect(() => validateCheckoutRequest(123)).toThrow(ValidationError);
  });

  it("should handle non-object body that triggers root-level error", () => {
    // Test with array to trigger "Expected object" but different path
    expect(() => validateCheckoutRequest([])).toThrow(ValidationError);
  });

  // Note: Lines 73, 84, and 101 are defensive code paths that are difficult to
  // trigger with the current schema structure:
  // - Line 73: Required error for unknown fieldPath (schema only has cartId, paymentToken, items)
  // - Line 84: Expected string error for unknown fieldPath (same limitation)
  // - Line 101: Non-ZodError fallback (Zod always throws ZodError in practice)
  // These are safety nets and are acceptable to leave uncovered.
});
