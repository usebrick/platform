import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { parseFile } from '@usebrick/engine';
import { describe, expect, it } from 'vitest';

import { extractFacts } from '../../src/engine/visitor';
import { cppCStyleCastRule } from '../../src/rules/cpp/c-style-cast';
import { cppRawNewDeleteRule } from '../../src/rules/cpp/raw-new-delete';
import { rustTodoMacroRule } from '../../src/rules/rust/todo-macro';
import type { ResolvedConfig, RuleContext, ScanFacts } from '../../src/types';
import { CAL002_CPP_RUST_TRANSFER_ORACLES } from './fixtures/cal-002-transfer-oracle-cpp-rust';
import {
  assertCAL002DurableTransferOracleCase,
  assertCAL002TransferredOracleFixture,
  durableTransferOracleCase,
  type CAL002TransferOracleCase,
  type CAL002TransferredOracleFixture,
  type CAL002TransferredOracleRuleId,
} from './fixtures/cal-002-transfer-oracle-types';

const CONTROL_FAMILIES = [
  'alternate-syntax',
  'baseline',
  'comment-adjacent',
  'near-miss',
  'regression-safe',
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
  const root = mkdtempSync(join(tmpdir(), 'cal-002-transfer-cpp-rust-'));
  try {
    const filePath = join(root, testCase.virtualPath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, testCase.source);
    const parsed = await parseFile(filePath);
    const facts: ScanFacts = extractFacts(filePath, parsed.ast, parsed.source);
    const context: RuleContext = { config: makeConfig(), filePath, cwd: root };
    const issues = ruleId === 'cpp/c-style-cast'
      ? cppCStyleCastRule.analyze(cppCStyleCastRule.create(context), facts)
      : ruleId === 'cpp/raw-new-delete'
        ? cppRawNewDeleteRule.analyze(cppRawNewDeleteRule.create(context), facts)
        : rustTodoMacroRule.analyze(rustTodoMacroRule.create(context), facts);
    return issues.some((issue) => issue.ruleId === ruleId) ? 'finding' : 'no-finding';
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

interface MutableTransferOracleCase {
  caseId: string;
  familyId?: string;
  source: string;
  virtualPath: string;
}

interface MutableTransferredOracleFixture {
  adversarialCases: MutableTransferOracleCase[];
  controls: MutableTransferOracleCase[];
  negativeCases: MutableTransferOracleCase[];
  positiveCases: MutableTransferOracleCase[];
}

function mutableFixture(
  fixture: CAL002TransferredOracleFixture,
): MutableTransferredOracleFixture {
  return structuredClone(fixture) as unknown as MutableTransferredOracleFixture;
}

describe('CAL-002 C++ and Rust transfer oracles', () => {
  it('contains exactly the three approved transferred rule IDs', () => {
    expect(CAL002_CPP_RUST_TRANSFER_ORACLES.map((fixture) => fixture.ruleId)).toEqual([
      'cpp/c-style-cast',
      'cpp/raw-new-delete',
      'rust/todo-macro',
    ]);
  });

  it.each(CAL002_CPP_RUST_TRANSFER_ORACLES)(
    '$ruleId has closed oracle coverage',
    async (fixture) => {
      expect(() => assertCAL002TransferredOracleFixture(fixture)).not.toThrow();
      expect(fixture.positiveCases.length).toBeGreaterThan(0);
      expect(fixture.negativeCases.length).toBeGreaterThan(0);
      expect(fixture.adversarialCases.length).toBeGreaterThan(0);
      expect(fixture.controls.map((row) => row.familyId)).toEqual(CONTROL_FAMILIES);

      for (const testCase of fixture.positiveCases) {
        const observed = await observeTransferOracle(fixture.ruleId, testCase);
        expect(observed).toBe('finding');
        const durable = durableTransferOracleCase(testCase, 'finding', observed);
        expect(() => assertCAL002DurableTransferOracleCase(durable)).not.toThrow();
        expect(Object.keys(durable).sort()).toEqual([
          'caseId',
          'expected',
          'observed',
          'sourceSha256',
        ]);
      }
      for (const testCase of [
        ...fixture.negativeCases,
        ...fixture.adversarialCases,
        ...fixture.controls,
      ]) {
        const observed = await observeTransferOracle(fixture.ruleId, testCase);
        expect(observed).toBe('no-finding');
        const durable = durableTransferOracleCase(testCase, 'no-finding', observed);
        expect(JSON.stringify(durable)).not.toContain(testCase.source);
        expect(JSON.stringify(durable)).not.toContain(testCase.virtualPath);
      }
    },
  );

  it('rejects source-bearing durable projections', () => {
    const fixture = CAL002_CPP_RUST_TRANSFER_ORACLES[0]!;
    const testCase = fixture.positiveCases[0]!;
    const durable = durableTransferOracleCase(testCase, 'finding', 'finding');
    expect(() => assertCAL002DurableTransferOracleCase({
      ...durable,
      source: testCase.source,
    })).toThrow(/source|unknown/i);
  });

  it('rejects absolute paths, duplicate IDs/families, short controls, and extension drift', () => {
    const fixture = CAL002_CPP_RUST_TRANSFER_ORACLES[0]!;

    const absolutePath = mutableFixture(fixture);
    absolutePath.positiveCases[0].virtualPath = '/tmp/oracle.cpp';
    expect(() => assertCAL002TransferredOracleFixture(absolutePath)).toThrow(/relative|absolute|path/i);

    const duplicateId = mutableFixture(fixture);
    duplicateId.negativeCases[0].caseId = duplicateId.positiveCases[0].caseId;
    expect(() => assertCAL002TransferredOracleFixture(duplicateId)).toThrow(/duplicate|case ID/i);

    const duplicateFamily = mutableFixture(fixture);
    duplicateFamily.controls[1].familyId = duplicateFamily.controls[0].familyId;
    expect(() => assertCAL002TransferredOracleFixture(duplicateFamily)).toThrow(/family|control/i);

    const shortControls = mutableFixture(fixture);
    shortControls.controls.pop();
    expect(() => assertCAL002TransferredOracleFixture(shortControls)).toThrow(/five|control/i);

    const extensionDrift = mutableFixture(fixture);
    extensionDrift.adversarialCases[0].virtualPath = 'src/oracle.rs';
    expect(() => assertCAL002TransferredOracleFixture(extensionDrift)).toThrow(/extension|language|path/i);
  });
});
