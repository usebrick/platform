// Positive fixture for `test/fake-placeholder` — every property below
// should fire as a textbook placeholder.

describe('user', () => {
  it('has a name', () => {
    const user = {
      name: 'John Doe',
      email: 'test@test.com',
      id: 1,
      password: 'password',
      createdAt: new Date('2020-01-01'),
    };
    expect(user).toBeDefined();
  });
});