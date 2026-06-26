// Positive fixture for `test/weak-assertion` — every assertion below
// should fire. Kept in `.test.ts` so `isTestFile()` returns true and
// the rule actually analyzes the body.

describe('user', () => {
  it('looks up by id', () => {
    const user = lookup('1');
    expect(user).toBeDefined();
  });

  it('returns truthy', () => {
    const user = lookup('1');
    expect(user).toBeTruthy();
  });

  it('is null when missing', () => {
    const user = lookup('999');
    expect(user).toBe(null);
  });

  it('returns undefined on failure', () => {
    const user = lookup('broken');
    expect(user).toBeUndefined();
  });

  it('tautology', () => {
    const x = 5;
    expect(x).toBe(x);
  });
});