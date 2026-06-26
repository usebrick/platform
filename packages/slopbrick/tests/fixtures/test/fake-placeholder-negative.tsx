// Negative fixture for `test/fake-placeholder` — every property below
// uses realistic domain values. The rule should NOT fire.

describe('user', () => {
  it('has a name', () => {
    const user = {
      name: 'Alice',
      email: 'alice@acme-corp.com',
      id: 48231,
      password: 'redacted-bcrypt-hash-2y$12$abcdef...',
      createdAt: '2019-04-22T09:14:11Z',
    };
    expect(user).toEqual(user);
  });

  it('orders use realistic values', () => {
    const order = {
      orderId: 48231,
      customerId: 9942,
      // Numeric IDs > 100 are not textbook placeholders.
      total: 142.5,
    };
    expect(order).toEqual(order);
  });
});