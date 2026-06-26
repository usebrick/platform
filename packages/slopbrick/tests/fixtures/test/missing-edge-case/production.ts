// @ts-nocheck
// Production source fixture for `test/missing-edge-case` — multiple
// branches (if/else, ternary, ??, try/catch) inside an exported
// function. The companion test files cover / don't cover these.

export function calculateDiscount(price: number, user: { tier: string } | null) {
  let discount = 0;
  if (user && user.tier === 'gold') {
    discount = price * 0.2;
  } else if (user && user.tier === 'silver') {
    discount = price * 0.1;
  } else {
    discount = 0;
  }

  // nullish-coalesce fallback
  const finalPrice = price - discount ?? 0;

  // ternary
  const label = discount > 0 ? 'discounted' : 'full-price';

  // try / catch — catch handler is the alternate path AI usually skips
  try {
    return { total: finalPrice, label };
  } catch (err) {
    return { total: price, label };
  }
}

export function safeDivide(a: number, b: number): number {
  if (b === 0) {
    return 0;
  }
  return a / b;
}

export function pickFirst<T>(items: T[]): T | null {
  if (items.length === 0) {
    return null;
  }
  return items[0] ?? null;
}