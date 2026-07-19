import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { parseFile } from '@usebrick/engine';
import { describe, expect, it } from 'vitest';

import { extractFacts } from '../../src/engine/visitor';
import { unreachableRule } from '../../src/rules/dead/unreachable';
import { unusedImportRule } from '../../src/rules/dead/unused-import';
import { unusedLocalRule } from '../../src/rules/dead/unused-local';
import { unusedParameterRule } from '../../src/rules/dead/unused-parameter';
import type { ResolvedConfig, RuleContext, ScanFacts } from '../../src/types';
import { CAL002_DEAD_TRANSFER_ORACLES } from './fixtures/cal-002-transfer-oracle-dead';
import {
  assertCAL002TransferredOracleFixture,
  type CAL002TransferOracleCase,
  type CAL002TransferredOracleRuleId,
} from './fixtures/cal-002-transfer-oracle-types';

const DEAD_TRANSFER_RULE_IDS = [
  'dead/unreachable',
  'dead/unused-import',
  'dead/unused-local',
  'dead/unused-parameter',
] as const;

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
  const root = mkdtempSync(join(tmpdir(), 'cal-002-transfer-dead-'));
  try {
    const filePath = join(root, testCase.virtualPath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, testCase.source);
    const parsed = await parseFile(filePath);
    const facts: ScanFacts = extractFacts(filePath, parsed.ast, parsed.source);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: root };
    const issues = (() => {
      switch (ruleId) {
        case 'dead/unreachable':
          return unreachableRule.analyze(unreachableRule.create(context), facts);
        case 'dead/unused-import':
          return unusedImportRule.analyze(unusedImportRule.create(context), facts);
        case 'dead/unused-local':
          return unusedLocalRule.analyze(unusedLocalRule.create(context), facts);
        case 'dead/unused-parameter':
          return unusedParameterRule.analyze(unusedParameterRule.create(context), facts);
        default:
          throw new TypeError(`Unsupported dead-code transfer rule: ${ruleId}`);
      }
    })();
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

describe('CAL-002 dead-code transfer oracles', () => {
  it('contains exactly four unique approved rule IDs', () => {
    const ids = CAL002_DEAD_TRANSFER_ORACLES.map((fixture) => fixture.ruleId);
    expect(ids).toEqual(DEAD_TRANSFER_RULE_IDS);
    expect(new Set(ids).size).toBe(4);
  });

  it.each(CAL002_DEAD_TRANSFER_ORACLES)(
    '$ruleId agrees with its declared oracle',
    async (fixture) => {
      expect(() => assertCAL002TransferredOracleFixture(fixture)).not.toThrow();
      const negativeCases = [
        ...fixture.negativeCases,
        ...fixture.adversarialCases,
        ...fixture.controls,
      ];
      expect(await observeAll(fixture.ruleId, fixture.positiveCases)).toEqual(
        fixture.positiveCases.map(() => 'finding'),
      );
      expect(await observeAll(fixture.ruleId, negativeCases)).toEqual(
        negativeCases.map(() => 'no-finding'),
      );
    },
  );

  it('does not claim a module-top-level const as an unused-local positive', () => {
    const fixture = CAL002_DEAD_TRANSFER_ORACLES.find(
      (candidate) => candidate.ruleId === 'dead/unused-local',
    );
    expect(fixture).toBeDefined();
    expect(
      fixture!.positiveCases.some((testCase) => /^\s*(?:export\s+)?const\b/.test(testCase.source)),
    ).toBe(false);
  });
});
