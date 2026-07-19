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
import { aiConsoleDebugStormRule } from '../../src/rules/ai/console-debug-storm';
import type { ResolvedConfig, RuleContext } from '../../src/types';
import { CAL002_CONSOLE_PARITY_CASES } from './fixtures/cal-002-parity-console';

const MIGRATION_COMMIT_SHA = 'c'.repeat(40);

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

function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

async function observeReplacement(
  fixture: (typeof CAL002_CONSOLE_PARITY_CASES)[number],
): Promise<CAL002ParityCaseResultV2> {
  const root = mkdtempSync(join(tmpdir(), 'slopbrick-cal-002-console-parity-'));
  try {
    const filePath = join(root, fixture.virtualPath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, fixture.source);
    const { ast, source } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, source);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: root };
    const ruleContext = aiConsoleDebugStormRule.create(context);
    const issues = aiConsoleDebugStormRule.analyze(ruleContext, facts);
    return {
      caseId: fixture.caseId,
      sourceSha256: sha256(fixture.source),
      expectedReplacementObservation: fixture.expectedReplacementObservation,
      observedReplacementObservation: issues.some(
        (issue) => issue.ruleId === 'ai/console-debug-storm',
      ) ? 'finding' : 'no-finding',
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('CAL-002 console parity', () => {
  it('accounts for the exact five-case debug-clustering replacement set', async () => {
    expect(CAL002_CONSOLE_PARITY_CASES.map((fixture) => ({
      caseId: fixture.caseId,
      virtualPath: fixture.virtualPath,
      expectedReplacementObservation: fixture.expectedReplacementObservation,
    }))).toEqual([
      {
        caseId: 'console-five-in-thirty-ported',
        virtualPath: 'src/service.ts',
        expectedReplacementObservation: 'finding',
      },
      {
        caseId: 'console-window-spread-guard',
        virtualPath: 'src/service.ts',
        expectedReplacementObservation: 'no-finding',
      },
      {
        caseId: 'console-test-file-guard',
        virtualPath: 'src/service.test.ts',
        expectedReplacementObservation: 'no-finding',
      },
      {
        caseId: 'console-logger-file-guard',
        virtualPath: 'src/logger.ts',
        expectedReplacementObservation: 'no-finding',
      },
      {
        caseId: 'console-structured-logger-guard',
        virtualPath: 'src/service.ts',
        expectedReplacementObservation: 'no-finding',
      },
    ]);

    const caseResults = await Promise.all(CAL002_CONSOLE_PARITY_CASES.map(observeReplacement));
    expect(caseResults.map(({ caseId, observedReplacementObservation }) => ({
      caseId,
      observedReplacementObservation,
    }))).toEqual([
      { caseId: 'console-five-in-thirty-ported', observedReplacementObservation: 'finding' },
      { caseId: 'console-window-spread-guard', observedReplacementObservation: 'no-finding' },
      { caseId: 'console-test-file-guard', observedReplacementObservation: 'no-finding' },
      { caseId: 'console-logger-file-guard', observedReplacementObservation: 'no-finding' },
      { caseId: 'console-structured-logger-guard', observedReplacementObservation: 'no-finding' },
    ]);

    const result = buildCAL002ParityReceiptV2({
      authorityReceipt: approvedAuthorityReceipt(),
      ruleId: 'logic/math-console-log-storm',
      replacementRuleId: 'ai/console-debug-storm',
      migrationCommitSha: MIGRATION_COMMIT_SHA,
      uniqueCoverageDisposition: 'ported',
      reasonCode: 'window-clustering-ported-with-guards',
      caseResults,
    });
    expect(result.receipt).toMatchObject({
      ruleId: 'logic/math-console-log-storm',
      replacementRuleId: 'ai/console-debug-storm',
      migrationCommitSha: MIGRATION_COMMIT_SHA,
      uniqueCoverageDisposition: 'ported',
      reasonCode: 'window-clustering-ported-with-guards',
      caseResults,
      status: 'passed',
      admitted: false,
    });
    expect(result.receiptJson).not.toContain('virtualPath');
    for (const fixture of CAL002_CONSOLE_PARITY_CASES) {
      expect(result.receiptJson).not.toContain(fixture.source);
    }
  });
});
