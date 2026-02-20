import { CartItem, PricedItem, PricingResult } from "../types";

const TAX_RATE = 0.10;

/**
 * Rounds a number to 2 decimal places.
 */
function roundTo2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates the line total for a single item.
 */
function calculateLineTotal(item: CartItem): PricedItem {
  const lineTotal = roundTo2(item.price * item.quantity);
  return {
    ...item,
    lineTotal,
  };
}

/**
 * Recalculates pricing entirely on the server.
 * Any client-supplied totals are ignored — only item price × quantity is used.
 *
 * Pricing rules (from spec):
 *   1. lineTotal = price × quantity, rounded to 2 decimals
 *   2. subtotal  = sum of all lineTotals, rounded to 2 decimals
 *   3. tax       = subtotal × 10%, rounded to 2 decimals
 *   4. total     = subtotal + tax, rounded to 2 decimals
 */
export function calculatePricing(items: CartItem[]): PricingResult {
  const pricedItems = items.map(calculateLineTotal);

  const subtotal = roundTo2(
    pricedItems.reduce((sum, item) => sum + item.lineTotal, 0)
  );

  const tax = roundTo2(subtotal * TAX_RATE);
  const total = roundTo2(subtotal + tax);

  return {
    items: pricedItems,
    subtotal,
    tax,
    total,
  };
}
