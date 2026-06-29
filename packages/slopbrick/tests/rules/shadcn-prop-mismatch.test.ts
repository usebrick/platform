import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseFile } from '@usebrick/engine';
import { extractFacts } from '../../src/engine/visitor';
import { shadcnPropMismatchRule } from '../../src/rules/component/shadcn-prop-mismatch';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

/**
 * v0.10 Phase 4 — defensive coverage for `component/shadcn-prop-mismatch`.
 *
 * Calibration: 67% precision in v4; rule is `defaultOff` due to low recall
 * (0.02). Tests assert defensible fire conditions on synthetic shadcn-style
 * components without depending on the actual registry.
 *
 * Trigger conditions (from `src/rules/component/shadcn-prop-mismatch.ts`):
 *   1. element is `interactive: true` (button / a / input / select / textarea / role="button")
 *   2. tag matches /\b(?:Button|Card|Dialog|Sheet|Drawer|Popover|Tooltip|Alert|Badge|Input|Textarea|Select)\b/
 *   3. className attribute present (string)
 *   4. className.length >= 80
 *   5. className contains /\b(?:bg-|text-|border-|hover:)/
 */

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

async function runRule(
  source: string,
  config: ResolvedConfig,
  fileName = 'Component.tsx',
): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-shadcn-prop-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = shadcnPropMismatchRule.create(context);
    return shadcnPropMismatchRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Helper: build a className string of exactly `length` characters, padded
// with whitespace-safe utility classes that include the trigger token
// (`bg-`, `text-`, `border-`, or `hover:`). Used to exercise the 80-char
// threshold without relying on a specific shadcn registry version.
function longClassNameWithTrigger(length: number, trigger: 'bg-' | 'text-' | 'border-' | 'hover:'): string {
  // Start with the trigger utility (counts toward length) and pad with
  // benign spacing/layout utilities to reach exactly `length`.
  const head = `${trigger}red-500`;
  const tail = ' '.repeat(Math.max(0, length - head.length));
  return `${head}${tail}`;
}

describe('component/shadcn-prop-mismatch', () => {
  it('fires when a shadcn Button uses a long className with bg-/text- instead of variant', async () => {
    // 96-char className (>= 80) containing `bg-`, `text-`, `border-`, and
    // `hover:` — the canonical anti-pattern of overriding shadcn variants
    // via raw Tailwind classes. The onClick makes the element `interactive`
    // (PascalCase component tags are only flagged when they have handlers).
    const source = `<Button onClick={() => {}} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md border border-red-700">Click</Button>;`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('component/shadcn-prop-mismatch');
    expect(issues[0].severity).toBe('high');
    expect(issues[0].aiSpecific).toBe(true);
    // Advice should steer the user toward the `variant` prop.
    expect(issues[0].advice).toContain('variant');
  });

  it('does not fire when the className is short (length < 80)', async () => {
    // Common shape: `<Button onClick={...} className="bg-red-500">` — short
    // override is within the rule's tolerance band and is treated as
    // acceptable.
    const source = `<Button onClick={() => {}} className="bg-red-500">Click</Button>;`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not fire on a long className without bg-/text-/border-/hover:', async () => {
    // 100-char className that uses only spacing/layout utilities. The
    // rule's last filter requires one of the trigger tokens, so this
    // should not fire.
    const longLayoutOnly =
      'px-4 py-2 rounded-md shadow-md flex items-center justify-center gap-2 font-medium leading-6 select-none cursor-pointer';
    const source = `<Button onClick={() => {}} className="${longLayoutOnly}">Click</Button>;`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not fire on a non-shadcn interactive tag (HTML <button>)', async () => {
    // The SHADCN_COMPONENT_RE is case-sensitive and only matches PascalCase
    // component names. The lowercase HTML <button> must not trigger the
    // rule, even with a long utility-heavy className.
    const source = `<button onClick={() => {}} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md border border-red-700">Click</button>;`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('respects the 80-character className threshold boundary', async () => {
    // The rule uses `if (cls.length < 80) continue;` — exact equality at
    // 80 chars should fire, 79 chars should not. onClick is required to
    // mark the PascalCase element as `interactive` in the v2 facts.
    const cls79 = longClassNameWithTrigger(79, 'bg-');
    const cls80 = longClassNameWithTrigger(80, 'bg-');
    expect(cls79.length).toBe(79);
    expect(cls80.length).toBe(80);

    const source79 = `<Button onClick={() => {}} className="${cls79}">A</Button>;`;
    const source80 = `<Button onClick={() => {}} className="${cls80}">B</Button>;`;

    const issuesAt79 = await runRule(source79, makeConfig());
    const issuesAt80 = await runRule(source80, makeConfig());

    expect(issuesAt79).toHaveLength(0);
    expect(issuesAt80).toHaveLength(1);
    expect(issuesAt80[0]?.ruleId).toBe('component/shadcn-prop-mismatch');
  });
});