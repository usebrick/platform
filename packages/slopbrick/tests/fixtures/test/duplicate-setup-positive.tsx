// Positive fixture for `test/duplicate-setup` — three near-identical
// `beforeEach` blocks with non-trivial `render(...)` bodies. The rule
// should fire on all three.

describe('users', () => {
  beforeEach(() => {
    const utils = setup();
    const view = render(<Users />);
    view.attach(utils);
  });

  it('renders the list', () => {
    // ...
  });

  it('filters by role', () => {
    // ...
  });
});

describe('orders', () => {
  beforeEach(() => {
    const utils = setup();
    const view = render(<Users />);
    view.attach(utils);
  });

  it('shows total', () => {
    // ...
  });

  it('shows tax', () => {
    // ...
  });
});

describe('invoices', () => {
  beforeEach(() => {
    const utils = setup();
    const view = render(<Users />);
    view.attach(utils);
  });

  it('renders header', () => {
    // ...
  });
});