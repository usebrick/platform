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
import { sqlConstructionRule } from '../../src/rules/security/sql-construction';
import type { ResolvedConfig, RuleContext } from '../../src/types';
import { CAL002_SQL_PARITY_CASES } from './fixtures/cal-002-parity-sql';

const MIGRATION_COMMIT_SHA = '6'.repeat(40);

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

async function observeReplacement(source: string, virtualPath: string): Promise<'finding' | 'no-finding'> {
  const root = mkdtempSync(join(tmpdir(), 'cal-002-sql-parity-'));
  try {
    const filePath = join(root, virtualPath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, source);
    const parsed = await parseFile(filePath);
    const facts = extractFacts(filePath, parsed.ast, parsed.source);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: root };
    const issues = sqlConstructionRule.analyze(sqlConstructionRule.create(context), facts);
    return issues.some((issue) => issue.ruleId === 'security/sql-construction') ? 'finding' : 'no-finding';
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function executeSqlParityCases(): Promise<readonly CAL002ParityCaseResultV2[]> {
  return Promise.all(CAL002_SQL_PARITY_CASES.map(async (testCase) => ({
    caseId: testCase.caseId,
    sourceSha256: createHash('sha256').update(testCase.source).digest('hex'),
    expectedReplacementObservation: testCase.expectedReplacementObservation,
    observedReplacementObservation: await observeReplacement(testCase.source, testCase.virtualPath),
  })));
}

describe('CAL-002 SQL supersession parity', () => {
  it('accounts for db/sql-concat unique WITH coverage', async () => {
    const caseResults = await executeSqlParityCases();
    expect(caseResults.map(({ caseId, observedReplacementObservation }) => ({
      caseId,
      observedReplacementObservation,
    }))).toEqual([
      { caseId: 'sql-with-template-ported', observedReplacementObservation: 'finding' },
      { caseId: 'sql-with-parameterized-guard', observedReplacementObservation: 'no-finding' },
      { caseId: 'sql-with-comment-guard', observedReplacementObservation: 'no-finding' },
    ]);

    const result = buildCAL002ParityReceiptV2({
      authorityReceipt: approvedAuthorityReceipt(),
      ruleId: 'db/sql-concat',
      replacementRuleId: 'security/sql-construction',
      migrationCommitSha: MIGRATION_COMMIT_SHA,
      uniqueCoverageDisposition: 'ported',
      reasonCode: 'with-query-coverage-ported',
      caseResults,
    });

    expect(result.receipt).toMatchObject({ status: 'passed', admitted: false });
    expect(result.receipt.caseResults).toEqual(caseResults);
    expect(result.receiptJson).not.toContain('virtualPath');
    for (const testCase of CAL002_SQL_PARITY_CASES) {
      expect(result.receiptJson).not.toContain(testCase.source);
    }
  });
});
