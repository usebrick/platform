// Negative fixture for `test/duplicate-setup` — three UNIQUE setups
// that don't share a hash. Rule should NOT fire.

describe('users', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    return render(<Users />);
  });

  it('renders the list', () => {
    // ...
  });
});

describe('orders', () => {
  beforeEach(() => {
    const utils = setupServer();
    return render(<Orders onServer={utils} />);
  });

  it('shows total', () => {
    // ...
  });
});

describe('invoices', () => {
  beforeEach(() => {
    const cleanup = mockInvoiceApi();
    return render(<Invoices />);
  });

  it('renders header', () => {
    // ...
  });
});