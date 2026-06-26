// @ts-nocheck
// Companion test file that does NOT reference any of the production
// functions in production.ts. Rule should fire for `calculateDiscount`,
// `safeDivide`, `pickFirst`.

describe('some unrelated test', () => {
  it('does its own thing', () => {
    expect(1 + 1).toBe(2);
  });
});