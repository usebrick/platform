import { describe, expect, it } from 'vitest';

import type { Rule } from '../../src/types';
import type { CAL001DecisionRow } from '../../src/calibration/corpus-v1/calibration-decisions';
import {
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  buildCAL002Catalog,
  type CAL002Catalog,
} from '../../src/calibration/cal-002/catalog';
import {
  CAL002_CAL001_RERUN_COMMAND,
  assessCAL002CAL001Reuse,
  buildCAL002OriginReceipt,
  resolveCAL002OriginDecisions,
  type CAL002OriginDecisionRow,
  type CAL002OriginGoverningHashes,
} from '../../src/calibration/cal-002/origin';
import {
  canonicalArtifact,
  validateCAL002OriginReceipt,
} from '../../src/calibration/cal-002/contracts';
import { RuleRegistry } from '../../src/rules/registry';
import { getDefaultOffRules } from '../../src/rules/signal-strength';

const MATRIX_HASH = 'a'.repeat(64);
const IMPLEMENTATION_SHA = 'b'.repeat(40);
const HASH_KEYS = [
  'protocolSha256',
  'sourceBindingReceiptSha256',
  'splitPlanSha256',
  'scannerCommitSha',
  'configSha256',
  'catalogSha256',
  'holdoutReceiptSha256',
  'metricsSha256',
  'cal001MatrixSha256',
  'reducerSha256',
] as const;

function catalogFixture(): CAL002Catalog {
  const registry = new RuleRegistry();
  registry.loadBuiltins();
  const rules = registry.getRules() as readonly Pick<Rule, 'id' | 'category' | 'aiSpecific' | 'defaultOff'>[];
  const defaultOff = getDefaultOffRules();
  const rows: CAL001DecisionRow[] = rules.map((rule) => {
    const existingDefaultOff = rule.defaultOff === true || defaultOff.has(rule.id);
    const decision = rule.aiSpecific ? 'default-off' as const : 'quality-only' as const;
    return {
      ruleId: rule.id,
      aiSpecific: rule.aiSpecific,
      existingDefaultOff,
      decision,
      policyAction: decision === 'quality-only' || existingDefaultOff ? 'preserve' : 'owner-review-required',
      evidence: {
        holdoutReceiptSha256: 'c'.repeat(64),
        metricsSha256: 'd'.repeat(64),
        report: 'CAL-001-v1-origin-discrimination-diagnostic',
      },
      originResult: {
        status: rule.aiSpecific ? 'diagnostic-only' : 'not-evaluated',
        splitStatus: { train: 'available', validation: 'available', test: 'available' },
        ruleStatus: { train: 'ok', validation: 'ok', test: 'ok' },
      },
      usefulnessResult: 'not-evaluated',
      confounds: {
        leakage: 'clear',
        sourceLabels: 'publisher-attested-polarity-not-authorship',
        frameworkBuckets: 'not-available',
        semanticBuckets: 'not-available',
      },
      owner: 'calibration-maintainers',
      rationale: 'CAL-002 origin fixture',
    };
  });
  return buildCAL002Catalog({
    rules,
    effectiveDefaultOffRuleIds: defaultOff,
    cal001Rows: rows,
    cal001MatrixSha256: MATRIX_HASH,
  }).catalog;
}

function hashes(): CAL002OriginGoverningHashes {
  return {
    protocolSha256: 'e'.repeat(64),
    sourceBindingReceiptSha256: 'f'.repeat(64),
    splitPlanSha256: '1'.repeat(64),
    scannerCommitSha: '2'.repeat(40),
    configSha256: '3'.repeat(64),
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    holdoutReceiptSha256: '4'.repeat(64),
    metricsSha256: '5'.repeat(64),
    cal001MatrixSha256: MATRIX_HASH,
    reducerSha256: '6'.repeat(64),
  };
}

function ownerDecisionRows(
  catalog: CAL002Catalog,
  overrides: Readonly<Record<string, CAL002OriginDecisionRow>> = {},
): readonly CAL002OriginDecisionRow[] {
  return catalog.rows
    .filter((row) => row.lane === 'origin' && row.ownerReviewRequired)
    .map((row) => overrides[row.ruleId] ?? ({
      ruleId: row.ruleId,
      disposition: 'hold-origin-default-off',
    }));
}

describe('CAL-002 origin ownership', () => {
  it('auto-holds 32 existing rows and resolves exactly 40 owner rows', () => {
    const catalog = catalogFixture();
    const decisions = ownerDecisionRows(catalog);
    const result = resolveCAL002OriginDecisions({ catalog, decisions });

    expect(decisions).toHaveLength(40);
    expect(result.rows).toHaveLength(72);
    expect(result.unresolvedRuleIds).toEqual([]);
    expect(result.rows.map((row) => row.ruleId)).toEqual(
      [...result.rows.map((row) => row.ruleId)].sort(),
    );
    expect(result.rows.filter((row) => row.disposition === 'hold-origin-default-off')).toHaveLength(72);
  });

  it('enforces the closed transfer and retirement reasons', () => {
    const catalog = catalogFixture();
    const owners = catalog.rows.filter((row) => row.lane === 'origin' && row.ownerReviewRequired);
    const decisions = ownerDecisionRows(catalog, {
      [owners[0]!.ruleId]: {
        ruleId: owners[0]!.ruleId,
        disposition: 'transfer-to-quality',
        reason: 'contextual-defect-quality-claim',
      },
      [owners[1]!.ruleId]: {
        ruleId: owners[1]!.ruleId,
        disposition: 'retire',
        reason: 'duplicate-or-obsolete',
      },
    });
    const result = resolveCAL002OriginDecisions({ catalog, decisions });

    expect(result.rows.find((row) => row.ruleId === owners[0]!.ruleId)).toEqual(decisions[0]);
    expect(result.rows.find((row) => row.ruleId === owners[1]!.ruleId)).toEqual(decisions[1]);
    expect(() => resolveCAL002OriginDecisions({
      catalog,
      decisions: [{ ...decisions[0]!, reason: 'duplicate-or-obsolete' }],
    })).toThrow(/unresolved|reason/i);
  });

  it('supports paused incomplete resolution but refuses an incomplete receipt', () => {
    const catalog = catalogFixture();
    const partial = resolveCAL002OriginDecisions({
      catalog,
      decisions: ownerDecisionRows(catalog).slice(0, 2),
      allowIncomplete: true,
    });
    expect(partial.rows).toHaveLength(34);
    expect(partial.unresolvedRuleIds).toHaveLength(38);
    expect(() => buildCAL002OriginReceipt({
      catalog,
      decisions: ownerDecisionRows(catalog).slice(0, 2),
      status: 'rerun-required',
      governingHashes: hashes(),
      originImplementationCommitSha: IMPLEMENTATION_SHA,
    })).toThrow(/unresolved/i);
  });

  it('rejects unknown, duplicate, auto-held, and malformed decisions', () => {
    const catalog = catalogFixture();
    const owners = ownerDecisionRows(catalog);
    expect(() => resolveCAL002OriginDecisions({ catalog, decisions: [
      ...owners,
      { ruleId: 'visual/inline-style-dominance', disposition: 'hold-origin-default-off' },
    ] })).toThrow(/unknown|quality|auto-held/i);
    expect(() => resolveCAL002OriginDecisions({ catalog, decisions: [
      ...owners,
      owners[0]!,
    ] })).toThrow(/duplicate/i);
    expect(() => resolveCAL002OriginDecisions({ catalog, decisions: [
      { ...owners[0]!, disposition: 'transfer-to-quality', reason: 'duplicate-or-obsolete' },
      ...owners.slice(1),
    ] })).toThrow(/reason|transfer/i);
    expect(() => resolveCAL002OriginDecisions({ catalog, decisions: [
      { ...owners[0]!, disposition: 'retire', reason: 'contextual-defect-quality-claim' },
      ...owners.slice(1),
    ] })).toThrow(/reason|retire/i);
    expect(() => resolveCAL002OriginDecisions({ catalog, decisions: [
      { ...owners[0]!, extra: true } as never,
      ...owners.slice(1),
    ] })).toThrow(/unknown|missing/i);
  });

  it('emits canonical schema-shaped, non-admitting origin evidence', () => {
    const catalog = catalogFixture();
    const result = buildCAL002OriginReceipt({
      catalog,
      decisions: ownerDecisionRows(catalog),
      status: 'reused',
      governingHashes: hashes(),
      originImplementationCommitSha: IMPLEMENTATION_SHA,
    });

    expect(validateCAL002OriginReceipt(result.receipt)).toEqual({ ok: true, errors: [] });
    expect(result.receiptJson).toBe(canonicalArtifact(result.receipt).json);
    expect(result.receiptSha256).toBe(canonicalArtifact(result.receipt).sha256);
    expect(result.receipt.admitted).toBe(false);
    expect(result.receipt.catalogSha256).toBe(CAL002_LOCKED_RULE_CATALOG_SHA256);
    expect(Object.keys(result.receipt).sort()).toEqual([
      'admitted', 'catalogSha256', 'governingHashes', 'originImplementationCommitSha',
      'protocolVersion', 'rows', 'status', 'version',
    ]);
    expect(result.receiptJson).not.toMatch(/Users|checkoutPath|sourcePath|generatedAt/);
  });
});

describe('CAL-002 exact CAL-001 reuse gate', () => {
  it('reuses only the exact ten-field governing identity', () => {
    const expected = hashes();
    const result = assessCAL002CAL001Reuse({
      governingHashes: expected,
      expectedGoverningHashes: expected,
    });

    expect(result).toMatchObject({
      status: 'reused',
      mismatches: [],
      requiredWorkerCount: 1,
      rerunCommand: CAL002_CAL001_RERUN_COMMAND,
    });
  });

  it.each(HASH_KEYS)('forces rerun-required for an independent %s mismatch', (key) => {
    const expected = hashes();
    const value = key === 'scannerCommitSha' ? '7'.repeat(40) : '7'.repeat(64);
    const actual = { ...expected, [key]: value };
    const result = assessCAL002CAL001Reuse({
      governingHashes: actual,
      expectedGoverningHashes: expected,
    });

    expect(result.status).toBe('rerun-required');
    expect(result.mismatches).toEqual([key]);
    expect(result.requiredWorkerCount).toBe(1);
  });

  it('treats missing evidence as a mismatch and accepts only a completed one-worker rerun', () => {
    const expected = hashes();
    const required = assessCAL002CAL001Reuse({
      governingHashes: {},
      expectedGoverningHashes: expected,
    });
    expect(required.status).toBe('rerun-required');
    expect(required.mismatches).toEqual([...HASH_KEYS]);

    const completed = assessCAL002CAL001Reuse({
      governingHashes: { ...expected, configSha256: '8'.repeat(64) },
      expectedGoverningHashes: expected,
      rerunEvidence: { workerCount: 1, governingHashes: expected },
    });
    expect(completed.status).toBe('rerun-completed');
    expect(completed.mismatches).toEqual(['configSha256']);

    expect(() => assessCAL002CAL001Reuse({
      governingHashes: {},
      expectedGoverningHashes: expected,
      rerunEvidence: { workerCount: 2 as 1, governingHashes: expected },
    })).toThrow(/one worker/i);
  });

  it('fails closed on unknown or malformed governing fields', () => {
    const expected = hashes();
    expect(() => assessCAL002CAL001Reuse({
      governingHashes: { ...expected, unknown: 'x' } as never,
      expectedGoverningHashes: expected,
    })).toThrow(/unknown/i);
    expect(() => assessCAL002CAL001Reuse({
      governingHashes: { ...expected, scannerCommitSha: 'not-a-commit' },
      expectedGoverningHashes: expected,
    })).toThrow(/commit/i);
    expect(() => assessCAL002CAL001Reuse({
      governingHashes: expected,
      expectedGoverningHashes: { ...expected, catalogSha256: undefined } as never,
    })).toThrow(/SHA-256/i);
  });
});
