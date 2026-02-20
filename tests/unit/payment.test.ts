import { capturePayment } from "../../src/services/payment";
import { PaymentError } from "../../src/utils/errors";

describe("capturePayment", () => {
  it("should return a successful payment result for valid tokens", async () => {
    const result = await capturePayment("ord-1", 100.0, "tok_valid_visa");

    expect(result.status).toBe("captured");
    expect(result.transactionId).toMatch(/^txn-/);
  });

  it("should fail for tok_fail token (AC-7)", async () => {
    await expect(
      capturePayment("ord-1", 100.0, "tok_fail")
    ).rejects.toThrow(PaymentError);

    await expect(
      capturePayment("ord-1", 100.0, "tok_fail")
    ).rejects.toThrow("Payment capture failed");
  });

  it("should fail for tok_declined token", async () => {
    await expect(
      capturePayment("ord-1", 50.0, "tok_declined")
    ).rejects.toThrow(PaymentError);
  });

  it("should fail for tok_insufficient_funds token", async () => {
    await expect(
      capturePayment("ord-1", 50.0, "tok_insufficient_funds")
    ).rejects.toThrow(PaymentError);
  });

  it("should include orderId in PaymentError", async () => {
    try {
      await capturePayment("ord-abc-123", 100.0, "tok_fail");
      fail("Expected PaymentError");
    } catch (error) {
      expect(error).toBeInstanceOf(PaymentError);
      expect((error as PaymentError).orderId).toBe("ord-abc-123");
    }
  });

  it("should generate unique transaction IDs", async () => {
    const result1 = await capturePayment("ord-1", 100.0, "tok_visa");
    const result2 = await capturePayment("ord-2", 200.0, "tok_visa");

    expect(result1.transactionId).not.toBe(result2.transactionId);
  });
});
