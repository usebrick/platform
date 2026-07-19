import { describe, expect, it } from 'vitest';
import type { Rule } from '../../src/types';
import type { CAL001DecisionRow } from '../../src/calibration/corpus-v1/calibration-decisions';
import { buildCAL002Catalog } from '../../src/calibration/cal-002/catalog';
import {
  CAL002_CONTEXTUAL_RULE_IDS,
  CAL002_DETERMINISTIC_RULE_IDS,
  CAL002_LOCKED_RULE_IDS,
  CAL002_OWNER_REVIEW_RULE_IDS,
  CAL002_STATISTICAL_RULE_IDS,
  canonicalArtifact,
} from '../../src/calibration/cal-002/contracts';
import {
  assertCAL002AIAssociationV2,
  validateCAL002AIAssociationV2,
} from '../../src/calibration/cal-002/contracts-v2';
import {
  CAL002_ASSOCIATION_SNAPSHOT_EVIDENCE_SHA256,
  CAL002_ASSOCIATION_SNAPSHOT_PROTOCOL,
  CAL002_ASSOCIATION_SNAPSHOT_VERSION,
  CAL002_OWNER_AUTHORITY_ROWS,
  CAL002_STARTING_QUALITY_METADATA,
  authorityDecisionRowsV2,
  authorityMetadataForRuleId,
  authorityProposalSha256V2,
  authorityRowsSha256V2,
  buildCAL002AuthorityProposalV2,
} from '../../src/calibration/cal-002/authority';
import { RuleRegistry } from '../../src/rules/registry';
import { getDefaultOffRules } from '../../src/rules/signal-strength';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function buildCatalogFixture() {
  const registry = new RuleRegistry();
  registry.loadBuiltins();
  const rules = registry.getRules() as readonly Pick<Rule, 'id' | 'category' | 'aiSpecific' | 'defaultOff'>[];
  const effectiveDefaultOffRuleIds = getDefaultOffRules();
  const cal001Rows: CAL001DecisionRow[] = rules.map((rule) => {
    const existingDefaultOff = rule.defaultOff === true || effectiveDefaultOffRuleIds.has(rule.id);
    const decision = rule.aiSpecific ? 'default-off' as const : 'quality-only' as const;
    return {
      ruleId: rule.id,
      aiSpecific: rule.aiSpecific,
      existingDefaultOff,
      decision,
      policyAction: decision === 'quality-only' || existingDefaultOff ? 'preserve' : 'owner-review-required',
      evidence: {
        holdoutReceiptSha256: HASH_B,
        metricsSha256: HASH_C,
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
      rationale: 'Frozen CAL-001 fixture row.',
    };
  });
  return buildCAL002Catalog({ rules, effectiveDefaultOffRuleIds, cal001Rows, cal001MatrixSha256: HASH_A }).catalog;
}

function mutateCatalogMetadata(
  catalog: ReturnType<typeof buildCatalogFixture>,
  ruleId: string,
  changes: Partial<{ category: string; aiSpecific: boolean }>,
) {
  return {
    ...catalog,
    rows: catalog.rows.map((row) => row.ruleId === ruleId ? { ...row, ...changes } : row),
  };
}

describe('CAL-002 v2 authority', () => {
  it('locks the approved 26/4/3/7 batch and complete 119 projection', () => {
    const proposal = buildCAL002AuthorityProposalV2(
      buildCatalogFixture(),
      '07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd',
    ).proposal;
    expect(CAL002_OWNER_AUTHORITY_ROWS).toHaveLength(40);
    expect(proposal.counts).toEqual({
      total: 119,
      startingQuality: 47,
      transferred: 26,
      blocked: 4,
      superseded: 3,
      retired: 7,
      researchOrigin: 32,
    });
    expect(proposal.rows.map((row) => row.ruleId)).toEqual(CAL002_LOCKED_RULE_IDS);
    expect(new Set(proposal.rows.map((row) => row.ruleId)).size).toBe(119);
    expect(proposal.rows.filter((row) => row.assignmentEligible).every(
      (row) => row.readiness === 'evidence-ready',
    )).toBe(true);
    expect(proposal.admitted).toBe(false);
    expect(proposal.applied).toBe(false);
  });

  it('proves exact starting, owner, and generated research set identity', () => {
    const startingIds = Object.keys(CAL002_STARTING_QUALITY_METADATA).sort();
    expect(startingIds).toEqual([
      ...CAL002_DETERMINISTIC_RULE_IDS,
      ...CAL002_CONTEXTUAL_RULE_IDS,
      ...CAL002_STATISTICAL_RULE_IDS,
    ].sort());
    expect(CAL002_OWNER_AUTHORITY_ROWS.map(([ruleId]) => ruleId).sort()).toEqual(
      [...CAL002_OWNER_REVIEW_RULE_IDS].sort(),
    );

    const proposal = buildCAL002AuthorityProposalV2(buildCatalogFixture(), HASH_A).proposal;
    const explicitIds = new Set([...startingIds, ...CAL002_OWNER_REVIEW_RULE_IDS]);
    const expectedResearchIds = CAL002_LOCKED_RULE_IDS.filter((ruleId) => !explicitIds.has(ruleId));
    expect(expectedResearchIds).toHaveLength(32);
    expect(proposal.rows.filter((row) => row.sourceClass === 'research-origin').map((row) => row.ruleId))
      .toEqual(expectedResearchIds);
  });

  it('keeps AI association orthogonal to quality authority', () => {
    const proposal = buildCAL002AuthorityProposalV2(buildCatalogFixture(), HASH_A).proposal;
    const any = proposal.rows.find((row) => row.ruleId === 'ai/any-density')!;
    expect(any).toMatchObject({
      qualityDomain: 'type-safety',
      claimClass: 'contextual-heuristic',
      destination: 'quality',
      readiness: 'evidence-ready',
    });
    expect(any.aiAssociation.claimCeiling).toBe('association-only');
    expect(any.aiAssociation).not.toHaveProperty('qualityAuthority');
  });

  it('does not derive authority from category, path, aiSpecific, or legacy lift', () => {
    const mutatedCatalog = mutateCatalogMetadata(buildCatalogFixture(), 'ai/any-density', {
      category: 'security',
      aiSpecific: false,
    });
    expect(authorityMetadataForRuleId('ai/any-density')).toMatchObject({
      qualityDomain: 'type-safety',
      claimClass: 'contextual-heuristic',
    });
    expect(() => buildCAL002AuthorityProposalV2(mutatedCatalog, HASH_A)).toThrow(/catalog.*drift/i);
  });

  it('accepts only bounded association metadata and never promotes authority', () => {
    const proposal = buildCAL002AuthorityProposalV2(buildCatalogFixture(), HASH_A).proposal;
    const association = proposal.rows.find((row) => row.ruleId === 'ai/any-density')!.aiAssociation;
    expect(Number.isFinite(association.lift)).toBe(true);
    expect(association.lift).toBeGreaterThanOrEqual(0);
    expect(association.claimCeiling).toBe('association-only');
    expect(validateCAL002AIAssociationV2(association)).toEqual({ ok: true, errors: [] });
    expect(validateCAL002AIAssociationV2({ ...association, lift: Number.NaN }).ok).toBe(false);
    expect(validateCAL002AIAssociationV2({ ...association, lift: -0.01 }).ok).toBe(false);
    expect(() => assertCAL002AIAssociationV2({ ...association, lift: Number.NaN })).toThrow(/lift/i);
    expect(() => assertCAL002AIAssociationV2({ ...association, lift: -0.01 })).toThrow(/lift/i);
  });

  it('does not accept evidence metadata without a named association source', () => {
    expect(validateCAL002AIAssociationV2({
      source: 'none-recorded',
      claimCeiling: 'none',
      lift: 1,
    }).errors.join(' ')).toMatch(/source|none-recorded|lift/i);
  });

  it('pins the immutable legacy association snapshot with exact evidence identity', () => {
    const result = buildCAL002AuthorityProposalV2(buildCatalogFixture(), HASH_A);
    expect(CAL002_ASSOCIATION_SNAPSHOT_VERSION).toBe('cal-002-legacy-association-snapshot-v1');
    expect(CAL002_ASSOCIATION_SNAPSHOT_PROTOCOL).toBe('legacy-signal-strength-v1');
    expect(CAL002_ASSOCIATION_SNAPSHOT_EVIDENCE_SHA256)
      .toBe('740b1d2c91ea96ff0956104e0081e73b89995f0ece4a1e65db28ef9b395c99c2');
    expect(result.proposal.associationSnapshot).toEqual({
      version: CAL002_ASSOCIATION_SNAPSHOT_VERSION,
      protocol: CAL002_ASSOCIATION_SNAPSHOT_PROTOCOL,
      evidenceSha256: CAL002_ASSOCIATION_SNAPSHOT_EVIDENCE_SHA256,
    });
    expect(result.proposal.rows.every(
      (row) => row.aiAssociation.evidenceSha256 === CAL002_ASSOCIATION_SNAPSHOT_EVIDENCE_SHA256,
    )).toBe(true);
    expect(Object.isFrozen(result.proposal.associationSnapshot)).toBe(true);
    expect(result.proposal.rows.every((row) => Object.isFrozen(row.aiAssociation))).toBe(true);
  });

  it('keeps authority decisions and gate hashes stable across association-only changes', () => {
    const result = buildCAL002AuthorityProposalV2(buildCatalogFixture(), HASH_A);
    const changedRows = result.proposal.rows.map((row, index) => index === 0 ? {
      ...row,
      aiAssociation: {
        ...row.aiAssociation,
        lift: (row.aiAssociation.lift ?? 0) + 1,
        measuredAt: '2099-01-01T00:00:00Z',
      },
    } : row);
    const changedProposal = {
      ...result.proposal,
      rows: changedRows,
      associationRowsSha256: canonicalArtifact(changedRows).sha256,
    };

    expect(authorityDecisionRowsV2(changedRows)).toEqual(authorityDecisionRowsV2(result.proposal.rows));
    expect(authorityRowsSha256V2(changedRows)).toBe(result.proposal.authorityRowsSha256);
    expect(authorityProposalSha256V2(changedProposal)).toBe(result.proposalSha256);
    expect(canonicalArtifact(changedProposal).sha256).not.toBe(result.proposalArtifactSha256);
  });

  it('rejects unknown rule IDs instead of synthesizing authority', () => {
    expect(() => authorityMetadataForRuleId('ai/not-authorized')).toThrow(/authority metadata/i);
  });
});
