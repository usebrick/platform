import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { duplicateSetupRule } from '../../src/rules/test/duplicate-setup';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: {
      meanSlop: 0,
      p90Slop: 0,
      individualSlopThreshold: 0,
    },
    ...overrides,
  };
}

async function runRule(source: string, fileName = 'Component.test.tsx'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-duplicate-setup-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = duplicateSetupRule.create(context);
    return duplicateSetupRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('test/duplicate-setup', () => {
  it('flags 3+ identical beforeEach blocks (with render) within the same file', async () => {
    const source = `
describe('A', () => {
  beforeEach(() => {
    render(<Component />);
  });
  it('a', () => {});
});

describe('B', () => {
  beforeEach(() => {
    render(<Component />);
  });
  it('b', () => {});
});

describe('C', () => {
  beforeEach(() => {
    render(<Component />);
  });
  it('c', () => {});
});`;
    const issues = await runRule(source);
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues[0].ruleId).toBe('test/duplicate-setup');
  });

  it('does not flag when only 2 setup blocks exist (below threshold)', async () => {
    const source = `
describe('A', () => {
  beforeEach(() => {
    render(<Component />);
  });
  it('a', () => {});
});

describe('B', () => {
  beforeEach(() => {
    render(<Component />);
  });
  it('b', () => {});
});`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag when beforeEach bodies are all distinct', async () => {
    // Bodies are 3+ lines each AND differ by their non-trivial setup
    // line (cleanup vs jest.mock vs vi.mock), which the v1
    // normalization preserves as distinct identifiers.
    const source = `
describe('A', () => {
  beforeEach(() => {
    render(<X />);
    cleanup();
    act();
  });
  it('a', () => {});
});

describe('B', () => {
  beforeEach(() => {
    jest.mock('./api');
    vi.useFakeTimers();
    setupServer();
  });
  it('b', () => {});
});

describe('C', () => {
  beforeEach(() => {
    vi.mock('./db');
    fireEvent.click(getEl());
    mount(<X />);
  });
  it('c', () => {});
});`;
    const issues = await runRule(source);
    expect(issues).toHaveLength(0);
  });

  it('does not flag non-test files (short-circuits on isTestFile)', async () => {
    // Note: must use .test.tsx extension because the JSX in the body
    // won't parse as .ts (parser would reject <Component />).
    const source = `
describe('A', () => {
  beforeEach(() => {
    render(<Component />);
  });
});

describe('B', () => {
  beforeEach(() => {
    render(<Component />);
  });
});

describe('C', () => {
  beforeEach(() => {
    render(<Component />);
  });
});`;
    // Use .test.tsx so the JSX parses \u2014 but with non-test filename so
    // isTestFile returns false and short-circuits.
    const issues = await runRule(source, 'helpers.tsx');
    expect(issues).toHaveLength(0);
  });
});
