import { calculatePricing } from "../../src/services/pricing";

describe("calculatePricing", () => {
  it("should calculate line totals correctly (AC-3)", () => {
    const result = calculatePricing([
      { productId: "p1", name: "Widget", price: 29.99, quantity: 2 },
    ]);

    expect(result.items[0].lineTotal).toBe(59.98);
  });

  it("should calculate subtotal as sum of line totals", () => {
    const result = calculatePricing([
      { productId: "p1", name: "A", price: 29.99, quantity: 2 },
      { productId: "p2", name: "B", price: 9.99, quantity: 1 },
    ]);

    expect(result.subtotal).toBe(69.97);
  });

  it("should calculate 10% tax", () => {
    const result = calculatePricing([
      { productId: "p1", name: "A", price: 100.0, quantity: 1 },
    ]);

    expect(result.tax).toBe(10.0);
  });

  it("should calculate total as subtotal + tax", () => {
    const result = calculatePricing([
      { productId: "p1", name: "A", price: 29.99, quantity: 2 },
      { productId: "p2", name: "B", price: 9.99, quantity: 1 },
    ]);

    // subtotal = 69.97, tax = 7.00, total = 76.97
    expect(result.subtotal).toBe(69.97);
    expect(result.tax).toBe(7.0);
    expect(result.total).toBe(76.97);
  });

  it("should round line totals to 2 decimal places", () => {
    // 3.33 * 3 = 9.99 exactly, but let's test a case that requires rounding
    const result = calculatePricing([
      { productId: "p1", name: "A", price: 1.11, quantity: 3 },
    ]);

    expect(result.items[0].lineTotal).toBe(3.33);
  });

  it("should round tax to 2 decimal places", () => {
    // subtotal = 33.33, tax = 3.333 -> 3.33
    const result = calculatePricing([
      { productId: "p1", name: "A", price: 33.33, quantity: 1 },
    ]);

    expect(result.tax).toBe(3.33);
  });

  it("should handle a single item", () => {
    const result = calculatePricing([
      { productId: "p1", name: "Solo", price: 50.0, quantity: 1 },
    ]);

    expect(result.items).toHaveLength(1);
    expect(result.subtotal).toBe(50.0);
    expect(result.tax).toBe(5.0);
    expect(result.total).toBe(55.0);
  });

  it("should handle many items", () => {
    const items = Array.from({ length: 100 }, (_, i) => ({
      productId: `p${i}`,
      name: `Item ${i}`,
      price: 1.0,
      quantity: 1,
    }));

    const result = calculatePricing(items);
    expect(result.items).toHaveLength(100);
    expect(result.subtotal).toBe(100.0);
    expect(result.tax).toBe(10.0);
    expect(result.total).toBe(110.0);
  });

  it("should ignore any client-supplied totals and recalculate (AC-3)", () => {
    // Even if items had extra fields, pricing only uses price and quantity
    const items = [
      { productId: "p1", name: "A", price: 25.0, quantity: 2 },
    ];

    const result = calculatePricing(items);
    expect(result.subtotal).toBe(50.0);
    expect(result.total).toBe(55.0);
  });

  it("should preserve item metadata in priced items", () => {
    const result = calculatePricing([
      { productId: "prod-xyz", name: "Fancy Widget", price: 19.99, quantity: 1 },
    ]);

    expect(result.items[0].productId).toBe("prod-xyz");
    expect(result.items[0].name).toBe("Fancy Widget");
    expect(result.items[0].price).toBe(19.99);
    expect(result.items[0].quantity).toBe(1);
    expect(result.items[0].lineTotal).toBe(19.99);
  });
});
