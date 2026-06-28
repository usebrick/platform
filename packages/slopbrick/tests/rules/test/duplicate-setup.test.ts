import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../../src/engine/visitor';
import { duplicateSetupRule } from '../../../src/rules/test/duplicate-setup';
import type { Issue, ResolvedConfig, RuleContext } from '../../../src/types';

function makeConfig(): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
    spacingScale: [],
    radiusScale: [],
  };
}

async function runFromFixture(fixturePath: string): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-dup-setup-'));
  try {
    const filePath = join(dir, 'Component.test.tsx');
    const fixtureSource = readFileSync(fixturePath, 'utf-8');
    writeFileSync(filePath, fixtureSource);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = duplicateSetupRule.create(context);
    return duplicateSetupRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function runInline(source: string, fileName = 'Component.test.tsx'): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-dup-setup-'));
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

const POSITIVE_FIXTURE = 'tests/fixtures/test/duplicate-setup-positive.tsx';
const NEGATIVE_FIXTURE = 'tests/fixtures/test/duplicate-setup-negative.tsx';

describe('test/duplicate-setup', () => {
  it('fires on the positive fixture (3 identical beforeEach blocks)', async () => {
    const issues = await runFromFixture(POSITIVE_FIXTURE);
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues.every((i) => i.ruleId === 'test/duplicate-setup')).toBe(true);
  });

  it('does NOT fire on the negative fixture (each setup is unique)', async () => {
    const issues = await runFromFixture(NEGATIVE_FIXTURE);
    expect(issues).toHaveLength(0);
  });

  it('does NOT fire on non-test files', async () => {
    const issues = await runInline(`
      beforeEach(() => {
        const utils = setup();
        const view = render(<App />);
      });
    `, 'Component.tsx');
    expect(issues).toHaveLength(0);
  });

  it('does NOT fire when only 2 identical blocks exist (threshold = 3)', async () => {
    const issues = await runInline(`
      describe('a', () => {
        beforeEach(() => {
          const utils = setup();
          const view = render(<App />);
          return view;
        });
      });
      describe('b', () => {
        beforeEach(() => {
          const utils = setup();
          const view = render(<App />);
          return view;
        });
      });
    `);
    expect(issues).toHaveLength(0);
  });

  it('fires when 3+ trivial-looking blocks contain a non-trivial setup line', async () => {
    const issues = await runInline(`
      describe('a', () => {
        beforeEach(() => {
          const x = setup();
          const v = render(<App />);
          return v;
        });
      });
      describe('b', () => {
        beforeEach(() => {
          const x = setup();
          const v = render(<App />);
          return v;
        });
      });
      describe('c', () => {
        beforeEach(() => {
          const x = setup();
          const v = render(<App />);
          return v;
        });
      });
    `);
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  it('mentions the duplicate line numbers in the message', async () => {
    const issues = await runFromFixture(POSITIVE_FIXTURE);
    const messages = issues.map((i) => i.message).join(' ');
    expect(messages).toContain('also at lines');
  });

  it('severity is medium and aiSpecific is true', async () => {
    const issues = await runFromFixture(POSITIVE_FIXTURE);
    expect(issues[0]?.severity).toBe('medium');
    expect(issues[0]?.aiSpecific).toBe(true);
  });
});