import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { parseFile } from '@usebrick/engine';
import { describe, expect, it } from 'vitest';

import {
  CAL002_ASSOCIATION_SNAPSHOT,
  authorityRowsSha256V2,
  canonicalAuthorityRowsV2,
} from '../../src/calibration/cal-002/authority';
import {
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  canonicalArtifact,
} from '../../src/calibration/cal-002/contracts';
import {
  CAL002_AUTHORITY_RECEIPT_VERSION,
  CAL002_PROTOCOL_VERSION_V2,
  type CAL002AuthorityReceiptV2,
} from '../../src/calibration/cal-002/contracts-v2';
import {
  buildCAL002ParityReceiptV2,
  type CAL002ParityCaseResultV2,
} from '../../src/calibration/cal-002/supersession';
import { extractFacts } from '../../src/engine/visitor';
import { aiAnyDensityRule } from '../../src/rules/ai/any-density';
import { mathAnyDensityRule } from '../../src/rules/logic/math-any-density';
import type { Issue, ResolvedConfig, Rule, RuleContext } from '../../src/types';
import { CAL002_ANY_PARITY_CASES } from './fixtures/cal-002-parity-any';

const MIGRATION_COMMIT_SHA = '8'.repeat(40);

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
  };
}

function approvedAuthorityReceipt(): CAL002AuthorityReceiptV2 {
  const rows = canonicalAuthorityRowsV2();
  return {
    version: CAL002_AUTHORITY_RECEIPT_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION_V2,
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    proposalSha256: 'a'.repeat(64),
    priorStateSha256: 'b'.repeat(64),
    revision: 2,
    reviewerAuthority: 'repository-owner',
    decision: 'approved',
    associationSnapshot: CAL002_ASSOCIATION_SNAPSHOT,
    rows,
    authorityRowsSha256: authorityRowsSha256V2(rows),
    associationRowsSha256: canonicalArtifact(rows).sha256,
    admitted: false,
    applied: false,
  };
}

async function runRule(
  rule: Rule<RuleContext>,
  source: string,
  virtualPath: string,
): Promise<Issue[]> {
  const root = mkdtempSync(join(tmpdir(), 'cal-002-any-parity-'));
  try {
    const filePath = join(root, virtualPath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, source);
    const parsed = await parseFile(filePath);
    const facts = extractFacts(filePath, parsed.ast, parsed.source);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: root };
    return rule.analyze(rule.create(context), facts);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function executeAnyParityCases(): Promise<readonly CAL002ParityCaseResultV2[]> {
  return Promise.all(CAL002_ANY_PARITY_CASES.map(async (testCase) => {
    const issues = await runRule(aiAnyDensityRule, testCase.source, testCase.virtualPath);
    return {
      caseId: testCase.caseId,
      sourceSha256: createHash('sha256').update(testCase.source).digest('hex'),
      expectedReplacementObservation: testCase.expectedReplacementObservation,
      observedReplacementObservation: issues.some((issue) => issue.ruleId === 'ai/any-density')
        ? 'finding'
        : 'no-finding',
    };
  }));
}

describe('CAL-002 any-density supersession parity', () => {
  it('rejects line-denominator reach and retains declaration-ratio semantics', async () => {
    const rejectedLineCase = CAL002_ANY_PARITY_CASES[0];
    expect(await runRule(
      mathAnyDensityRule,
      rejectedLineCase.source,
      rejectedLineCase.virtualPath,
    )).toHaveLength(1);

    const caseResults = await executeAnyParityCases();
    expect(caseResults.map(({ caseId, observedReplacementObservation }) => ({
      caseId,
      observedReplacementObservation,
    }))).toEqual([
      { caseId: 'any-line-density-rejected', observedReplacementObservation: 'no-finding' },
      { caseId: 'any-declaration-ratio-retained', observedReplacementObservation: 'finding' },
      { caseId: 'any-non-typescript-guard', observedReplacementObservation: 'no-finding' },
    ]);

    const result = buildCAL002ParityReceiptV2({
      authorityReceipt: approvedAuthorityReceipt(),
      ruleId: 'logic/math-any-density',
      replacementRuleId: 'ai/any-density',
      migrationCommitSha: MIGRATION_COMMIT_SHA,
      uniqueCoverageDisposition: 'rejected-as-false-positive',
      reasonCode: 'line-denominator-not-type-bearing',
      caseResults,
    });

    expect(result.receipt).toMatchObject({
      uniqueCoverageDisposition: 'rejected-as-false-positive',
      reasonCode: 'line-denominator-not-type-bearing',
      status: 'passed',
      admitted: false,
    });
    expect(result.receiptJson).not.toContain('virtualPath');
    for (const testCase of CAL002_ANY_PARITY_CASES) {
      expect(result.receiptJson).not.toContain(testCase.source);
    }
  });
});
