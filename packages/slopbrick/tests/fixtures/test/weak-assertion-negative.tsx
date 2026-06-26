// Negative fixture for `test/weak-assertion` — every assertion below
// asserts a value or shape. The rule should NOT fire.

describe('user', () => {
  it('looks up by id and returns a real value', () => {
    const user = lookup('1');
    expect(user).toEqual({ id: '1', name: 'Alice' });
  });

  it('has the expected length', () => {
    const list = fetchUsers();
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ id: '1', name: 'Alice' });
  });

  it('throws on missing input', () => {
    expect(() => lookup('')).toThrow(/invalid id/);
  });

  it('contains the right keys', () => {
    const user = lookup('1');
    expect(user).toHaveProperty('email');
    expect(user.email).toEqual('alice@acme-corp.com');
  });

  it('tautology-with-stronger-followup does not fire', () => {
    const user = lookup('1');
    expect(user).toBeDefined();
    expect(user).toEqual({ id: '1', name: 'Alice' });
  });
});