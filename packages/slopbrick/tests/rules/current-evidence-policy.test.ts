import { describe, expect, it } from 'vitest';

import { canonicalArtifact } from '../../src/calibration/cal-002/contracts';
import { validateSlopbrickRuleEvidencePolicyV2 } from '../../src/calibration/cal-002/application-v2';
import {
  createCurrentEvidencePolicyAccessors,
} from '../../src/rules/current-evidence-policy';
import { getCurrentEvidencePolicyAccessors } from '../../src/rules/current-evidence-policy-runtime';
import {
  approvedCurrentPolicyArtifactFixture,
  approvedCurrentPolicyFixture,
} from '../helpers/current-evidence-policy-v2';

describe('current evidence policy accessors', () => {
  it('indexes the exact approved 119-row projection and its default-off set', () => {
    const accessors = approvedCurrentPolicyFixture();
    const defaultOffRules = accessors.getCurrentDefaultOffRules();

    expect(accessors.policy.rows).toHaveLength(119);
    expect(defaultOffRules.size).toBe(78);
    expect(defaultOffRules.has('ai/any-density')).toBe(true);
    expect(defaultOffRules.has('context/import-path-mismatch')).toBe(false);
    expect(accessors.getCurrentRulePolicy('ai/any-density')).toMatchObject({
      enabledByDefault: false,
      runnableByExplicitOptIn: true,
      scoreEligible: false,
      provenance: 'quality-candidate-unmeasured',
    });
    expect(accessors.getCurrentRulePolicy('unknown/rule')).toBeUndefined();
  });

  it('separates explicit visibility from score authority', () => {
    const accessors = approvedCurrentPolicyFixture();

    expect(accessors.isRuleRunnable('ai/any-density', { 'ai/any-density': 'low' })).toBe(true);
    expect(accessors.isRuleScoreEligible('ai/any-density')).toBe(false);
    expect(accessors.getRuleEvidenceProvenance('ai/any-density')).toBe('quality-candidate-unmeasured');

    expect(accessors.isRuleRunnable('ai/comment-ratio', { 'ai/comment-ratio': 'low' })).toBe(true);
    expect(accessors.isRuleScoreEligible('ai/comment-ratio')).toBe(false);
    expect(accessors.getRuleEvidenceProvenance('ai/comment-ratio')).toBe('internal-origin-association');

    expect(accessors.isRuleRunnable('logic/ghost-defensive', { 'logic/ghost-defensive': 'high' })).toBe(false);
    expect(accessors.isRuleRunnable('logic/math-any-density', { 'logic/math-any-density': 'high' })).toBe(false);
    expect(accessors.isRuleRunnable('ai/renyi-profile', { 'ai/renyi-profile': 'high' })).toBe(false);
  });

  it('preserves explicit off, default-on, own-property opt-in, and unknown-rule fallback semantics', () => {
    const accessors = approvedCurrentPolicyFixture();
    const inheritedConfig = Object.create({ 'ai/any-density': 'high' }) as Readonly<Record<string, string>>;

    expect(accessors.isRuleRunnable('context/import-path-mismatch', {})).toBe(true);
    expect(accessors.isRuleRunnable('context/import-path-mismatch', {
      'context/import-path-mismatch': 'off',
    })).toBe(false);
    expect(accessors.isRuleScoreEligible('context/import-path-mismatch')).toBe(true);
    expect(accessors.isRuleRunnable('ai/any-density', {})).toBe(false);
    expect(accessors.isRuleRunnable('ai/any-density', inheritedConfig)).toBe(false);
    expect(accessors.isRuleRunnable('unknown/rule', {})).toBe(true);
    expect(accessors.isRuleScoreEligible('unknown/rule')).toBeUndefined();
    expect(accessors.getRuleEvidenceProvenance('unknown/rule')).toBeUndefined();
  });

  it('fails closed on malformed, partial, duplicate, admitted, unapplied, or stale-catalog policy', () => {
    const applied = approvedCurrentPolicyArtifactFixture();
    const partialRows = applied.rows.slice(0, -1);
    const duplicateRows = applied.rows.map((row, index) => index === 1 ? applied.rows[0]! : row);
    const {
      matrixApprovalSha256: _matrixApprovalSha256,
      applicationImplementationCommitSha: _applicationImplementationCommitSha,
      ...unappliedBase
    } = applied;
    const invalidArtifacts: readonly unknown[] = [
      {},
      {
        ...applied,
        rows: partialRows,
        policyRowsSha256: canonicalArtifact(partialRows).sha256,
      },
      {
        ...applied,
        rows: duplicateRows,
        policyRowsSha256: canonicalArtifact(duplicateRows).sha256,
      },
      { ...applied, admitted: true },
      { ...unappliedBase, applied: false },
      { ...applied, catalogSha256: '0'.repeat(64) },
    ];

    for (const artifact of invalidArtifacts) {
      expect(() => createCurrentEvidencePolicyAccessors(artifact)).toThrow(TypeError);
    }
  });

  it('rejects schema-valid policy identities and row promotions outside the owner-approved projection', () => {
    const applied = approvedCurrentPolicyArtifactFixture();
    const promotedRows = applied.rows.map((row) => row.ruleId === 'ai/any-density' ? {
      ...row,
      runtimeOutcome: 'default-on' as const,
      enabledByDefault: true,
      runnableByExplicitOptIn: true,
      scoreEligible: true,
      gateEligible: true,
      repairSafety: 'finding-bound-only' as const,
      provenance: 'current-quality-calibrated' as const,
    } : row);
    const forgedArtifacts = [{
      ...applied,
      rows: promotedRows,
      policyRowsSha256: canonicalArtifact(promotedRows).sha256,
    }, {
      ...applied,
      finalMatrixSha256: 'f'.repeat(64),
    }, {
      ...applied,
      matrixApprovalSha256: 'f'.repeat(64),
    }];

    for (const artifact of forgedArtifacts) {
      expect(validateSlopbrickRuleEvidencePolicyV2(artifact)).toEqual({ ok: true, errors: [] });
      expect(() => createCurrentEvidencePolicyAccessors(artifact)).toThrow(TypeError);
    }
  });

  it('detaches and freezes validated policy state before exposing accessors', () => {
    const callerPolicy = structuredClone(approvedCurrentPolicyArtifactFixture());
    const accessors = createCurrentEvidencePolicyAccessors(callerPolicy);
    const callerRow = callerPolicy.rows.find((row) => row.ruleId === 'logic/ghost-defensive')!;
    const exposedRow = accessors.getCurrentRulePolicy('logic/ghost-defensive')!;

    expect(Reflect.set(callerRow, 'runnableByExplicitOptIn', true)).toBe(true);
    expect(accessors.isRuleRunnable('logic/ghost-defensive', {
      'logic/ghost-defensive': 'high',
    })).toBe(false);
    expect(Object.isFrozen(accessors.policy)).toBe(true);
    expect(Object.isFrozen(accessors.policy.rows)).toBe(true);
    expect(Object.isFrozen(exposedRow)).toBe(true);
    expect(Object.isFrozen(exposedRow.aiAssociation)).toBe(true);
    expect(Reflect.set(exposedRow, 'runnableByExplicitOptIn', true)).toBe(false);
  });

  it('keeps the production provider inactive until the atomic activation task', () => {
    expect(getCurrentEvidencePolicyAccessors()).toBeUndefined();
  });
});
