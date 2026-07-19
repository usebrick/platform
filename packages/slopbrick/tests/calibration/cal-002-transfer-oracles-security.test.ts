import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { parseFile } from '@usebrick/engine';
import { describe, expect, it } from 'vitest';

import { canonicalAuthorityRowsV2 } from '../../src/calibration/cal-002/authority';
import { extractFacts } from '../../src/engine/visitor';
import { hardcodedSecretRule } from '../../src/rules/security/hardcoded-secret';
import { sqlConstructionRule } from '../../src/rules/security/sql-construction';
import type { ResolvedConfig, RuleContext, ScanFacts } from '../../src/types';
import { CAL002_TRANSFER_ORACLE_CASES } from './fixtures/cal-002-transfer-oracle-cases';
import { CAL002_SECURITY_TRANSFER_ORACLES } from './fixtures/cal-002-transfer-oracle-security';
import {
  assertCAL002TransferredOracleFixture,
  type CAL002TransferOracleCase,
  type CAL002TransferredOracleRuleId,
} from './fixtures/cal-002-transfer-oracle-types';

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

async function observeTransferOracle(
  ruleId: CAL002TransferredOracleRuleId,
  testCase: CAL002TransferOracleCase,
): Promise<'finding' | 'no-finding'> {
  const root = mkdtempSync(join(tmpdir(), 'cal-002-transfer-security-'));
  try {
    const filePath = join(root, testCase.virtualPath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, testCase.source);
    const parsed = await parseFile(filePath);
    const facts: ScanFacts = extractFacts(filePath, parsed.ast, parsed.source);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: root };
    const issues = ruleId === 'security/hardcoded-secret'
      ? hardcodedSecretRule.analyze(hardcodedSecretRule.create(context), facts)
      : ruleId === 'security/sql-construction'
        ? sqlConstructionRule.analyze(sqlConstructionRule.create(context), facts)
        : (() => { throw new TypeError(`Unsupported security transfer rule: ${ruleId}`); })();
    return issues.some((issue) => issue.ruleId === ruleId) ? 'finding' : 'no-finding';
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function observeAll(
  ruleId: CAL002TransferredOracleRuleId,
  cases: readonly CAL002TransferOracleCase[],
): Promise<Array<'finding' | 'no-finding'>> {
  return Promise.all(cases.map((testCase) => observeTransferOracle(ruleId, testCase)));
}

describe('CAL-002 security transfer oracles', () => {
  it('proves both transferred security contracts', async () => {
    expect(CAL002_SECURITY_TRANSFER_ORACLES.map(({ ruleId }) => ruleId)).toEqual([
      'security/hardcoded-secret',
      'security/sql-construction',
    ]);
    for (const fixture of CAL002_SECURITY_TRANSFER_ORACLES) {
      expect(() => assertCAL002TransferredOracleFixture(fixture)).not.toThrow();
      expect(await observeAll(fixture.ruleId, fixture.positiveCases)).toEqual(
        fixture.positiveCases.map(() => 'finding'),
      );
      const negativeCases = [
        ...fixture.negativeCases,
        ...fixture.adversarialCases,
        ...fixture.controls,
      ];
      expect(await observeAll(fixture.ruleId, negativeCases)).toEqual(
        negativeCases.map(() => 'no-finding'),
      );
    }
  });

  it('combines exactly the nine evidence-ready deterministic transfers from authority', () => {
    const authorityIds = canonicalAuthorityRowsV2()
      .filter((row) => row.action === 'transfer'
        && row.evidenceClass === 'deterministic-or-standards'
        && row.readiness === 'evidence-ready')
      .map(({ ruleId }) => ruleId)
      .sort();
    expect(CAL002_TRANSFER_ORACLE_CASES.map(({ ruleId }) => ruleId)).toEqual(authorityIds);
    expect(authorityIds).toHaveLength(9);
  });
});
