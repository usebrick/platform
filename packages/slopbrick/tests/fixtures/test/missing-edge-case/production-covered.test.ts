// @ts-nocheck
// Companion test file that DOES reference the production functions.
// Rule should NOT fire.

import { calculateDiscount } from './production';

describe('calculateDiscount', () => {
  it('returns a discount for gold users', () => {
    expect(calculateDiscount(100, { tier: 'gold' }).label).toBe('discounted');
  });

  it('returns full-price for null users', () => {
    expect(calculateDiscount(100, null).label).toBe('full-price');
  });
});