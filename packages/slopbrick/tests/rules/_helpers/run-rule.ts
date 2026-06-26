import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../../src/engine/parser';
import { extractFacts } from '../../../src/engine/visitor';
import type { Issue, ResolvedConfig, Rule, RuleContext, Severity, Category } from '../../../src/types';

/**
 * Shared test helpers for rule unit tests.
 *
 * Goals:
 *   - One source of truth for `makeConfig` and `runRule`.
 *   - Reusable assertion helpers that lock in Issue metadata
 *     (severity, category, aiSpecific, line/column).
 *   - Framework-agnostic so the same suite can run a rule against
 *     .tsx / .vue / .svelte / .astro source strings.
 */

export function makeConfig(): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
  };
}

export interface RunRuleOptions {
  /** file extension determines how the visitor parses the source. Default .tsx */
  extension?: 'tsx' | 'vue' | 'svelte' | 'astro' | 'ts';
  /** filename inside the temp dir. Default matches extension. */
  filename?: string;
}

export async function runRule(
  rule: Rule<unknown>,
  source: string,
  options: RunRuleOptions = {},
): Promise<{ issues: Issue[]; filePath: string }> {
  const extension = options.extension ?? 'tsx';
  const filename = options.filename ?? `Component.${extension}`;
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-rule-test-'));
  try {
    const filePath = join(dir, filename);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: dir };
    const ruleContext = rule.create(context);
    const issues = rule.analyze(ruleContext, facts);
    for (const issue of issues) {
      if (!issue.filePath) issue.filePath = filePath;
    }
    return { issues, filePath };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- Assertion helpers -----------------------------------------------------

export function expectFiresOnce(issues: Issue[], ruleId: string): void {
  const matching = issues.filter((i) => i.ruleId === ruleId);
  if (matching.length !== 1) {
    throw new Error(
      `Expected exactly 1 issue from ${ruleId}, got ${matching.length}.\n` +
        `All issues: ${JSON.stringify(issues.map((i) => i.ruleId), null, 2)}`,
    );
  }
}

export function expectFiresN(issues: Issue[], ruleId: string, n: number): void {
  const matching = issues.filter((i) => i.ruleId === ruleId);
  if (matching.length !== n) {
    throw new Error(
      `Expected ${n} issues from ${ruleId}, got ${matching.length}.\n` +
        `All issues: ${JSON.stringify(issues.map((i) => i.ruleId), null, 2)}`,
    );
  }
}

export function expectNoFire(issues: Issue[], ruleId: string): void {
  const matching = issues.filter((i) => i.ruleId === ruleId);
  if (matching.length !== 0) {
    throw new Error(
      `Expected 0 issues from ${ruleId}, got ${matching.length}:\n` +
        JSON.stringify(matching, null, 2),
    );
  }
}

export interface MetadataExpectation {
  severity?: Severity;
  category?: Category;
  aiSpecific?: boolean;
}

export function expectMetadata(
  issues: Issue[],
  ruleId: string,
  expectation: MetadataExpectation,
): void {
  for (const issue of issues) {
    if (issue.ruleId !== ruleId) continue;
    if (expectation.severity !== undefined && issue.severity !== expectation.severity) {
      throw new Error(
        `${ruleId} severity: expected ${expectation.severity}, got ${issue.severity}`,
      );
    }
    if (expectation.category !== undefined && issue.category !== expectation.category) {
      throw new Error(
        `${ruleId} category: expected ${expectation.category}, got ${issue.category}`,
      );
    }
    if (
      expectation.aiSpecific !== undefined &&
      issue.aiSpecific !== expectation.aiSpecific
    ) {
      throw new Error(
        `${ruleId} aiSpecific: expected ${expectation.aiSpecific}, got ${issue.aiSpecific}`,
      );
    }
    if (!Number.isInteger(issue.line) || issue.line < 1) {
      throw new Error(`${ruleId} line: expected positive integer, got ${issue.line}`);
    }
    if (!Number.isInteger(issue.column) || issue.column < 1) {
      throw new Error(`${ruleId} column: expected positive integer, got ${issue.column}`);
    }
  }
}