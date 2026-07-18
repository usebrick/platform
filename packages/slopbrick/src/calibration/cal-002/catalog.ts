import type { Rule } from '../../types';
import type { CAL001DecisionRow } from '../corpus-v1/calibration-decisions';
import {
  CAL002_CATALOG_VERSION,
  CAL002_CONTEXTUAL_RULE_IDS,
  CAL002_DETERMINISTIC_RULE_IDS,
  CAL002_LOCKED_COUNTS,
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_LOCKED_RULE_IDS,
  CAL002_OWNER_REVIEW_RULE_IDS,
  CAL002_PROTOCOL_VERSION,
  CAL002_STATISTICAL_RULE_IDS,
  assertSha256,
  canonicalArtifact,
  type CAL002Catalog,
  type CAL002CatalogRow,
  type CAL002EvidenceClass,
} from './contracts';

export {
  CAL002_CONTEXTUAL_RULE_IDS,
  CAL002_DETERMINISTIC_RULE_IDS,
  CAL002_LOCKED_RULE_CATALOG_SHA256,
  CAL002_STATISTICAL_RULE_IDS,
} from './contracts';

const STATISTICAL_IDS = new Set<string>(CAL002_STATISTICAL_RULE_IDS);
const CONTEXTUAL_IDS = new Set<string>(CAL002_CONTEXTUAL_RULE_IDS);
const DETERMINISTIC_IDS = new Set<string>(CAL002_DETERMINISTIC_RULE_IDS);
const LOCKED_RULE_IDS = new Set<string>(CAL002_LOCKED_RULE_IDS);
const OWNER_REVIEW_IDS = new Set<string>(CAL002_OWNER_REVIEW_RULE_IDS);

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export interface BuildCAL002CatalogInput {
  readonly rules: readonly Pick<Rule, 'id' | 'category' | 'aiSpecific' | 'defaultOff'>[];
  readonly effectiveDefaultOffRuleIds: ReadonlySet<string>;
  readonly cal001Rows: readonly CAL001DecisionRow[];
  readonly cal001MatrixSha256: string;
}

export interface CAL002CatalogResult {
  readonly catalog: CAL002Catalog;
  readonly catalogJson: string;
  readonly catalogSha256: string;
}

function uniqueById<T extends { readonly id?: string; readonly ruleId?: string }>(rows: readonly T[], label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const row of rows) {
    const id = row.id ?? row.ruleId;
    if (typeof id !== 'string' || id.length === 0) throw new TypeError(`${label} contains an empty rule ID`);
    if (result.has(id)) throw new TypeError(`${label} contains duplicate rule ID ${id}`);
    result.set(id, row);
  }
  return result;
}

function evidenceClassFor(ruleId: string): CAL002EvidenceClass {
  if (DETERMINISTIC_IDS.has(ruleId)) return 'deterministic-or-standards';
  if (CONTEXTUAL_IDS.has(ruleId)) return 'contextual-quality';
  if (STATISTICAL_IDS.has(ruleId)) return 'statistical-review-utility';
  throw new TypeError(`CAL-002 quality catalog has no locked evidence class for ${ruleId}`);
}

export function buildCAL002Catalog(input: BuildCAL002CatalogInput): CAL002CatalogResult {
  assertSha256(input.cal001MatrixSha256, 'cal001MatrixSha256');
  const rules = uniqueById(input.rules, 'Rule registry catalog');
  const cal001 = uniqueById(input.cal001Rows, 'CAL-001 catalog');
  if (rules.size !== CAL002_LOCKED_COUNTS.total || [...rules.keys()].some((id) => !LOCKED_RULE_IDS.has(id))) {
    throw new TypeError(`Rule registry catalog does not match the locked ${CAL002_LOCKED_COUNTS.total}-rule CAL-002 catalog`);
  }
  if (rules.size !== cal001.size || [...rules.keys()].some((id) => !cal001.has(id))) {
    throw new TypeError('CAL-001 catalog does not exactly match the rule registry catalog');
  }

  const rows = [...rules.values()]
    .sort((left, right) => compareCodePoints(left.id, right.id))
    .map((rule): CAL002CatalogRow => {
      const prior = cal001.get(rule.id)!;
      if (prior.aiSpecific !== rule.aiSpecific) throw new TypeError(`CAL-001 aiSpecific metadata drift for ${rule.id}`);
      const existingDefaultOff = rule.defaultOff === true || input.effectiveDefaultOffRuleIds.has(rule.id);
      if (prior.existingDefaultOff !== existingDefaultOff) throw new TypeError(`CAL-001 existingDefaultOff metadata drift for ${rule.id}`);
      const ownerReviewRequired = prior.policyAction === 'owner-review-required';
      if (ownerReviewRequired !== OWNER_REVIEW_IDS.has(rule.id)) throw new TypeError(`CAL-001 owner-review catalog drift for ${rule.id}`);
      if (!rule.aiSpecific) {
        if (prior.decision !== 'quality-only') throw new TypeError(`CAL-001 decision drift for quality rule ${rule.id}`);
        return {
          ruleId: rule.id,
          category: rule.category,
          aiSpecific: false,
          existingDefaultOff,
          cal001Decision: prior.decision,
          ownerReviewRequired,
          lane: 'quality',
          evidenceClass: evidenceClassFor(rule.id),
        };
      }
      if (prior.decision === 'quality-only') throw new TypeError(`CAL-001 decision drift for origin rule ${rule.id}`);
      return {
        ruleId: rule.id,
        category: rule.category,
        aiSpecific: true,
        existingDefaultOff,
        cal001Decision: prior.decision,
        ownerReviewRequired,
        lane: 'origin',
      };
    });

  const ruleCatalogSha256 = canonicalArtifact(rows.map((row) => ({
    ruleId: row.ruleId,
    category: row.category,
    aiSpecific: row.aiSpecific,
    existingDefaultOff: row.existingDefaultOff,
  }))).sha256;
  if (ruleCatalogSha256 !== CAL002_LOCKED_RULE_CATALOG_SHA256) {
    throw new TypeError('Rule registry catalog identity does not match the canonical locked CAL-002 catalog');
  }
  const catalog: CAL002Catalog = {
    version: CAL002_CATALOG_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION,
    cal001MatrixSha256: input.cal001MatrixSha256,
    ruleCatalogSha256,
    rows,
    counts: {
      total: rows.length,
      startingQuality: rows.filter((row) => row.lane === 'quality').length,
      startingOrigin: rows.filter((row) => row.lane === 'origin').length,
      ownerReviewRequired: rows.filter((row) => row.ownerReviewRequired).length,
      deterministic: rows.filter((row) => row.lane === 'quality' && row.evidenceClass === 'deterministic-or-standards').length,
      contextual: rows.filter((row) => row.lane === 'quality' && row.evidenceClass === 'contextual-quality').length,
      statistical: rows.filter((row) => row.lane === 'quality' && row.evidenceClass === 'statistical-review-utility').length,
    },
    admitted: false,
    applied: false,
  };
  if (Object.entries(CAL002_LOCKED_COUNTS).some(([key, value]) => catalog.counts[key as keyof typeof catalog.counts] !== value)) {
    throw new TypeError('CAL-001 catalog projection does not match the locked CAL-002 counts');
  }
  const artifact = canonicalArtifact(catalog);
  return { catalog, catalogJson: artifact.json, catalogSha256: artifact.sha256 };
}
