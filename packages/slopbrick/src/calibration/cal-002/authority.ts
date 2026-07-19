import { getSignalStrength } from '../../rules/signal-strength';
import {
  CAL002_CONTEXTUAL_RULE_IDS,
  CAL002_DETERMINISTIC_RULE_IDS,
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_LOCKED_RULE_IDS,
  CAL002_STATISTICAL_RULE_IDS,
  assertSha256,
  canonicalArtifact,
  validateCAL002Catalog,
  type CAL002Catalog,
  type CAL002EvidenceClass,
} from './contracts';
import type {
  CAL002AIAssociationV2,
  CAL002AuthorityProposalResultV2,
  CAL002AuthorityProposalV2,
  CAL002AuthorityRowV2,
  CAL002ClaimClass,
  CAL002QualityDomain,
  CAL002Readiness,
} from './contracts-v2';

export const CAL002_STARTING_QUALITY_METADATA = {
  'context/import-path-mismatch': ['architecture-consistency', 'repository-contract'],
  'cs/async-without-await': ['correctness', 'language-or-security-contract'],
  'cs/empty-catch-block': ['reliability', 'deterministic-syntax-or-dataflow'],
  'cs/sql-string-interpolation': ['security', 'language-or-security-contract'],
  'docs/broken-link': ['documentation-quality', 'repository-contract'],
  'docs/stale-function-reference': ['documentation-quality', 'repository-contract'],
  'docs/stale-package-reference': ['documentation-quality', 'repository-contract'],
  'dup/identical-block': ['maintainability', 'deterministic-syntax-or-dataflow'],
  'java/lost-stack-trace': ['reliability', 'language-or-security-contract'],
  'java/sql-string-concat': ['security', 'language-or-security-contract'],
  'java/thread-sleep-in-loop': ['performance', 'deterministic-syntax-or-dataflow'],
  'kt/coroutine-cancellation-missing': ['reliability', 'language-or-security-contract'],
  'kt/force-unwrap': ['type-safety', 'language-or-security-contract'],
  'kt/global-coroutine-scope': ['reliability', 'language-or-security-contract'],
  'kt/string-template-injection': ['security', 'language-or-security-contract'],
  'logic/key-prop-missing': ['correctness', 'repository-contract'],
  'perf/cls-image': ['performance', 'repository-contract'],
  'php/empty-catch': ['reliability', 'deterministic-syntax-or-dataflow'],
  'php/sql-injection': ['security', 'language-or-security-contract'],
  'rb/exception-swallowing': ['reliability', 'deterministic-syntax-or-dataflow'],
  'rb/sql-string-concat': ['security', 'language-or-security-contract'],
  'security/eval': ['security', 'language-or-security-contract'],
  'security/exposed-env-var': ['security', 'repository-contract'],
  'security/localstorage-token': ['security', 'language-or-security-contract'],
  'security/missing-auth-check': ['security', 'repository-contract'],
  'security/public-admin-route': ['security', 'repository-contract'],
  'security/target-blank-no-noopener': ['security', 'language-or-security-contract'],
  'security/unsafe-html-render': ['security', 'language-or-security-contract'],
  'typo/placeholder-text': ['documentation-quality', 'repository-contract'],
  'wcag/focus-appearance': ['accessibility', 'accessibility-standard'],
  'wcag/focus-obscured': ['accessibility', 'accessibility-standard'],
  'wcag/missing-alt': ['accessibility', 'accessibility-standard'],
  'component/multiple-components-per-file': ['maintainability', 'contextual-heuristic'],
  'java/suspicious-implementation': ['correctness', 'contextual-heuristic'],
  'layout/gap-monopoly': ['design-system-coherence', 'contextual-heuristic'],
  'layout/spacing-grid': ['design-system-coherence', 'contextual-heuristic'],
  'logic/boundary-violation': ['architecture-consistency', 'contextual-heuristic'],
  'perf/css-bloat': ['performance', 'contextual-heuristic'],
  'product/terminology-drift': ['architecture-consistency', 'contextual-heuristic'],
  'rb/n-plus-one-query': ['performance', 'contextual-heuristic'],
  'visual/inline-style-dominance': ['design-system-coherence', 'contextual-heuristic'],
  'visual/radius-scale-violation': ['design-system-coherence', 'contextual-heuristic'],
  'visual/spacing-scale-violation': ['design-system-coherence', 'contextual-heuristic'],
  'logic/heaps-deviation': ['maintainability', 'statistical-review-signal'],
  'logic/math-variable-name-entropy': ['maintainability', 'statistical-review-signal'],
  'logic/zipf-slope-anomaly': ['maintainability', 'statistical-review-signal'],
  'typo/math-button-label-uniformity': ['design-system-coherence', 'statistical-review-signal'],
} as const satisfies Record<string, readonly [CAL002QualityDomain, CAL002ClaimClass]>;

export const CAL002_OWNER_AUTHORITY_ROWS = [
  ['cpp/c-style-cast', 'transfer', 'quality', 'maintainability', 'language-or-security-contract', 'evidence-ready', 'deterministic-or-standards'],
  ['cpp/raw-new-delete', 'transfer', 'quality', 'resource-safety', 'language-or-security-contract', 'evidence-ready', 'deterministic-or-standards'],
  ['dead/unreachable', 'transfer', 'quality', 'correctness', 'deterministic-syntax-or-dataflow', 'evidence-ready', 'deterministic-or-standards'],
  ['dead/unused-import', 'transfer', 'quality', 'maintainability', 'deterministic-syntax-or-dataflow', 'evidence-ready', 'deterministic-or-standards'],
  ['dead/unused-local', 'transfer', 'quality', 'maintainability', 'deterministic-syntax-or-dataflow', 'evidence-ready', 'deterministic-or-standards'],
  ['dead/unused-parameter', 'transfer', 'quality', 'maintainability', 'deterministic-syntax-or-dataflow', 'evidence-ready', 'deterministic-or-standards'],
  ['rust/todo-macro', 'transfer', 'quality', 'completeness', 'language-or-security-contract', 'evidence-ready', 'deterministic-or-standards'],
  ['security/hardcoded-secret', 'transfer', 'quality', 'security', 'language-or-security-contract', 'evidence-ready', 'deterministic-or-standards'],
  ['security/sql-construction', 'transfer', 'quality', 'security', 'language-or-security-contract', 'evidence-ready', 'deterministic-or-standards'],
  ['ai/any-density', 'transfer', 'quality', 'type-safety', 'contextual-heuristic', 'evidence-ready', 'contextual-quality'],
  ['ai/console-debug-storm', 'transfer', 'quality', 'observability', 'contextual-heuristic', 'evidence-ready', 'contextual-quality'],
  ['ai/fetch-default-overuse', 'transfer', 'quality', 'architecture-consistency', 'contextual-heuristic', 'evidence-ready', 'contextual-quality'],
  ['ai/state-default-overuse', 'transfer', 'quality', 'maintainability', 'contextual-heuristic', 'evidence-ready', 'contextual-quality'],
  ['ai/tailwind-color-overuse', 'transfer', 'quality', 'design-system-coherence', 'contextual-heuristic', 'evidence-ready', 'contextual-quality'],
  ['component/giant-component', 'transfer', 'quality', 'maintainability', 'contextual-heuristic', 'evidence-ready', 'contextual-quality'],
  ['cpp/magic-numbers', 'transfer', 'quality', 'maintainability', 'contextual-heuristic', 'evidence-ready', 'contextual-quality'],
  ['cpp/printf-debug', 'transfer', 'quality', 'observability', 'contextual-heuristic', 'evidence-ready', 'contextual-quality'],
  ['dead/dead-branch', 'transfer', 'quality', 'correctness', 'contextual-heuristic', 'evidence-ready', 'contextual-quality'],
  ['logic/reactive-hook-soup', 'transfer', 'quality', 'maintainability', 'contextual-heuristic', 'evidence-ready', 'contextual-quality'],
  ['logic/zombie-state', 'transfer', 'quality', 'maintainability', 'contextual-heuristic', 'evidence-ready', 'contextual-quality'],
  ['rust/stringly-typed', 'transfer', 'quality', 'type-safety', 'contextual-heuristic', 'evidence-ready', 'contextual-quality'],
  ['rust/unwrap-in-production', 'transfer', 'quality', 'reliability', 'contextual-heuristic', 'evidence-ready', 'contextual-quality'],
  ['security/dangerous-cors', 'transfer', 'quality', 'security', 'contextual-heuristic', 'evidence-ready', 'contextual-quality'],
  ['security/fail-open-auth', 'transfer', 'quality', 'security', 'contextual-heuristic', 'evidence-ready', 'contextual-quality'],
  ['test/duplicate-setup', 'transfer', 'quality', 'test-confidence', 'contextual-heuristic', 'evidence-ready', 'contextual-quality'],
  ['visual/arbitrary-escape', 'transfer', 'quality', 'design-system-coherence', 'contextual-heuristic', 'evidence-ready', 'contextual-quality'],
  ['logic/ghost-defensive', 'block', 'quality', 'maintainability', 'contextual-heuristic', 'repair-required', undefined],
  ['logic/optimistic-no-rollback', 'block', 'quality', 'correctness', 'contextual-heuristic', 'repair-required', undefined],
  ['product/ux-pattern-fragmentation', 'block', 'quality', 'architecture-consistency', 'contextual-heuristic', 'project-contract-required', undefined],
  ['test/weak-assertion', 'block', 'quality', 'test-confidence', 'deterministic-syntax-or-dataflow', 'repair-required', undefined],
  ['logic/math-any-density', 'supersede', 'superseded', 'type-safety', 'contextual-heuristic', 'parity-required', undefined],
  ['logic/math-console-log-storm', 'supersede', 'superseded', 'observability', 'contextual-heuristic', 'parity-required', undefined],
  ['db/sql-concat', 'supersede', 'superseded', 'security', 'language-or-security-contract', 'parity-required', undefined],
  ['ai/renyi-profile', 'retire', 'retired', 'none', 'no-valid-quality-claim', 'obsolete', undefined],
  ['component/shadcn-prop-mismatch', 'retire', 'retired', 'none', 'no-valid-quality-claim', 'obsolete', undefined],
  ['layout/math-element-uniformity', 'retire', 'retired', 'none', 'no-valid-quality-claim', 'obsolete', undefined],
  ['logic/math-gini-class-usage', 'retire', 'retired', 'none', 'no-valid-quality-claim', 'obsolete', undefined],
  ['rust/unused-pub-fn', 'retire', 'retired', 'none', 'no-valid-quality-claim', 'obsolete', undefined],
  ['test/fake-placeholder', 'retire', 'retired', 'none', 'no-valid-quality-claim', 'obsolete', undefined],
  ['visual/naturalness-anomaly', 'retire', 'retired', 'none', 'no-valid-quality-claim', 'obsolete', undefined],
] as const;

export const CAL002_SUPERSESSION_REPLACEMENTS = {
  'logic/math-any-density': 'ai/any-density',
  'logic/math-console-log-storm': 'ai/console-debug-storm',
  'db/sql-concat': 'security/sql-construction',
} as const;

export const CAL002_SPECIAL_AUTHORITY_REASONS = {
  'logic/ghost-defensive': 'type-aware-proof-required',
  'logic/optimistic-no-rollback': 'reconciliation-path-required',
  'product/ux-pattern-fragmentation': 'project-wide-contract-required',
  'test/weak-assertion': 'deterministic-contextual-split-required',
  'logic/math-any-density': 'canonical-any-rule-parity-required',
  'logic/math-console-log-storm': 'canonical-console-rule-parity-required',
  'db/sql-concat': 'canonical-sql-rule-parity-required',
  'ai/renyi-profile': 'identifier-frequency-method-not-validated',
  'component/shadcn-prop-mismatch': 'library-contract-not-resolved',
  'layout/math-element-uniformity': 'element-count-not-quality-claim',
  'logic/math-gini-class-usage': 'concentration-not-quality-defect',
  'rust/unused-pub-fn': 'whole-crate-reach-not-observed',
  'test/fake-placeholder': 'fixture-values-not-quality-defect',
  'visual/naturalness-anomaly': 'identifier-diversity-threshold-not-validated',
} as const;

const DETERMINISTIC_IDS = new Set<string>(CAL002_DETERMINISTIC_RULE_IDS);
const CONTEXTUAL_IDS = new Set<string>(CAL002_CONTEXTUAL_RULE_IDS);
const STATISTICAL_IDS = new Set<string>(CAL002_STATISTICAL_RULE_IDS);
const LOCKED_IDS = new Set<string>(CAL002_LOCKED_RULE_IDS);

function evidenceClassForStartingRule(ruleId: string): CAL002EvidenceClass {
  if (DETERMINISTIC_IDS.has(ruleId)) return 'deterministic-or-standards';
  if (CONTEXTUAL_IDS.has(ruleId)) return 'contextual-quality';
  if (STATISTICAL_IDS.has(ruleId)) return 'statistical-review-utility';
  throw new TypeError(`CAL-002 starting quality rule ${ruleId} has no frozen evidence class`);
}

function reasonForEvidenceClass(evidenceClass: CAL002EvidenceClass): string {
  if (evidenceClass === 'deterministic-or-standards') return 'standards-or-contract-quality-claim';
  if (evidenceClass === 'contextual-quality') return 'contextual-defect-quality-claim';
  return 'statistical-review-utility-claim';
}

function aiAssociationForRuleId(ruleId: string): CAL002AIAssociationV2 {
  const evidence = getSignalStrength(ruleId);
  if (!evidence || !Number.isFinite(evidence.ratio) || evidence.ratio < 0) {
    return { source: 'none-recorded', claimCeiling: 'none' };
  }
  return {
    source: 'legacy-signal-strength',
    claimCeiling: 'association-only',
    lift: evidence.ratio,
    measuredAt: evidence.lastCalibratedAt,
    protocol: 'legacy-signal-strength-v1',
  };
}

function startingRows(): CAL002AuthorityRowV2[] {
  return Object.entries(CAL002_STARTING_QUALITY_METADATA).map(([ruleId, [qualityDomain, claimClass]]) => {
    const evidenceClass = evidenceClassForStartingRule(ruleId);
    return {
      ruleId,
      sourceClass: 'starting-quality',
      destination: 'quality',
      action: 'preserve',
      qualityDomain,
      claimClass,
      readiness: 'evidence-ready',
      evidenceClass,
      assignmentEligible: true,
      reasonCode: reasonForEvidenceClass(evidenceClass),
      aiAssociation: aiAssociationForRuleId(ruleId),
    };
  });
}

function ownerRows(): CAL002AuthorityRowV2[] {
  return CAL002_OWNER_AUTHORITY_ROWS.map(([
    ruleId,
    action,
    destination,
    qualityDomain,
    claimClass,
    readiness,
    evidenceClass,
  ]) => {
    const replacementRuleId = CAL002_SUPERSESSION_REPLACEMENTS[
      ruleId as keyof typeof CAL002_SUPERSESSION_REPLACEMENTS
    ];
    const reasonCode = action === 'transfer'
      ? reasonForEvidenceClass(evidenceClass as CAL002EvidenceClass)
      : CAL002_SPECIAL_AUTHORITY_REASONS[ruleId as keyof typeof CAL002_SPECIAL_AUTHORITY_REASONS];
    return {
      ruleId,
      sourceClass: 'owner-batch',
      destination,
      action,
      qualityDomain,
      claimClass,
      readiness,
      ...(evidenceClass ? { evidenceClass } : {}),
      assignmentEligible: action === 'transfer' && readiness === 'evidence-ready',
      ...(replacementRuleId ? { replacementRuleId } : {}),
      reasonCode,
      aiAssociation: aiAssociationForRuleId(ruleId),
    };
  });
}

function researchRows(explicitIds: ReadonlySet<string>): CAL002AuthorityRowV2[] {
  return CAL002_LOCKED_RULE_IDS
    .filter((ruleId) => !explicitIds.has(ruleId))
    .map((ruleId) => ({
      ruleId,
      sourceClass: 'research-origin',
      destination: 'research-origin',
      action: 'hold',
      qualityDomain: 'none',
      claimClass: 'no-valid-quality-claim',
      readiness: 'research-only',
      assignmentEligible: false,
      reasonCode: 'auto-held-research-origin',
      aiAssociation: aiAssociationForRuleId(ruleId),
    }));
}

export function canonicalAuthorityRowsV2(): readonly CAL002AuthorityRowV2[] {
  const starting = startingRows();
  const owner = ownerRows();
  const explicitIds = new Set([...starting.map((row) => row.ruleId), ...owner.map((row) => row.ruleId)]);
  if (starting.length !== 47 || owner.length !== 40 || explicitIds.size !== 87) {
    throw new TypeError('CAL-002 explicit authority metadata does not match the locked 47/40 identity');
  }
  const rowsById = new Map(
    [...starting, ...owner, ...researchRows(explicitIds)].map((row) => [row.ruleId, row] as const),
  );
  if (rowsById.size !== CAL002_LOCKED_RULE_IDS.length
    || [...rowsById.keys()].some((ruleId) => !LOCKED_IDS.has(ruleId))) {
    throw new TypeError('CAL-002 authority projection does not match the locked 119-rule identity');
  }
  return CAL002_LOCKED_RULE_IDS.map((ruleId) => rowsById.get(ruleId)!);
}

export function authorityMetadataForRuleId(ruleId: string): CAL002AuthorityRowV2 {
  const row = canonicalAuthorityRowsV2().find((candidate) => candidate.ruleId === ruleId);
  if (!row) throw new TypeError(`No CAL-002 authority metadata exists for rule ID ${ruleId}`);
  return row;
}

function assertCatalogIntegrity(catalog: CAL002Catalog): void {
  const result = validateCAL002Catalog(catalog);
  if (!result.ok) throw new TypeError(`CAL-002 catalog drift: ${result.errors.join('; ')}`);
  if (catalog.ruleCatalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256
    || catalog.rows.length !== CAL002_LOCKED_RULE_IDS.length
    || catalog.rows.some((row, index) => row.ruleId !== CAL002_LOCKED_RULE_IDS[index])) {
    throw new TypeError('CAL-002 catalog drift from the locked 119-rule identity');
  }
}

export function buildCAL002AuthorityProposalV2(
  catalog: CAL002Catalog,
  priorStateSha256: string,
): CAL002AuthorityProposalResultV2 {
  assertSha256(priorStateSha256, 'priorStateSha256');
  assertCatalogIntegrity(catalog);
  const rows = canonicalAuthorityRowsV2();
  const proposal: CAL002AuthorityProposalV2 = {
    version: 'cal-002-authority-proposal-v2',
    protocolVersion: 'CAL-002-v2',
    catalogSha256: CAL002_LOCKED_RULE_CATALOG_SHA256,
    priorStateSha256,
    rows,
    counts: {
      total: 119,
      startingQuality: 47,
      transferred: 26,
      blocked: 4,
      superseded: 3,
      retired: 7,
      researchOrigin: 32,
    },
    admitted: false,
    applied: false,
  };
  const artifact = canonicalArtifact(proposal);
  return { proposal, proposalJson: artifact.json, proposalSha256: artifact.sha256 };
}
