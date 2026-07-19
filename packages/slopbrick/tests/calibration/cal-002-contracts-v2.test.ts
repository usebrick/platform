import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import type { Rule } from '../../src/types';
import type { CAL001DecisionRow } from '../../src/calibration/corpus-v1/calibration-decisions';
import { buildCAL002Catalog } from '../../src/calibration/cal-002/catalog';
import {
  CAL002_AUTHORITY_PROPOSAL_VERSION,
  CAL002_AUTHORITY_RECEIPT_VERSION,
  CAL002_AUTHORITY_STATE_VERSION,
  CAL002_PROTOCOL_VERSION_V2,
  assertCAL002AuthorityProposalV2,
  assertCAL002AuthorityReceiptV2,
  assertCAL002AuthorityStateV2,
  validateCAL002AuthorityProposalV2,
  validateCAL002AuthorityReceiptV2,
  validateCAL002AuthorityStateV2,
} from '../../src/calibration/cal-002/contracts-v2';
import { buildCAL002AuthorityProposalV2 } from '../../src/calibration/cal-002/authority';
import { RuleRegistry } from '../../src/rules/registry';
import { getDefaultOffRules } from '../../src/rules/signal-strength';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(HERE, '../../src/calibration/cal-002/schemas');
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

function fullCatalogFixture() {
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

const proposalResult = buildCAL002AuthorityProposalV2(fullCatalogFixture(), HASH_A);
const state = {
  version: CAL002_AUTHORITY_STATE_VERSION,
  protocolVersion: CAL002_PROTOCOL_VERSION_V2,
  catalogSha256: proposalResult.proposal.catalogSha256,
  proposalSha256: proposalResult.proposalSha256,
  priorStateSha256: HASH_A,
  revision: 2,
  reviewerAuthority: 'repository-owner',
  decision: 'pending',
  admitted: false,
  applied: false,
} as const;
const receipt = {
  version: CAL002_AUTHORITY_RECEIPT_VERSION,
  protocolVersion: CAL002_PROTOCOL_VERSION_V2,
  catalogSha256: proposalResult.proposal.catalogSha256,
  proposalSha256: proposalResult.proposalSha256,
  priorStateSha256: HASH_A,
  revision: 2,
  reviewerAuthority: 'repository-owner',
  decision: 'approved',
  associationSnapshot: proposalResult.proposal.associationSnapshot,
  rows: proposalResult.proposal.rows,
  authorityRowsSha256: proposalResult.proposal.authorityRowsSha256,
  associationRowsSha256: proposalResult.proposal.associationRowsSha256,
  admitted: false,
  applied: false,
} as const;

const fixtures = {
  'cal-002-authority-proposal-v2.schema.json': proposalResult.proposal,
  'cal-002-authority-state-v2.schema.json': state,
  'cal-002-authority-receipt-v2.schema.json': receipt,
} as const;

const validators = {
  'cal-002-authority-proposal-v2.schema.json': validateCAL002AuthorityProposalV2,
  'cal-002-authority-state-v2.schema.json': validateCAL002AuthorityStateV2,
  'cal-002-authority-receipt-v2.schema.json': validateCAL002AuthorityReceiptV2,
} as const;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function schemaValidator(file: keyof typeof fixtures) {
  const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema);
}

function expectRejectedByBoth(file: keyof typeof fixtures, value: unknown, pattern: RegExp): void {
  const custom = validators[file](value);
  expect(custom.errors.join(' ')).toMatch(pattern);
  const validateSchema = schemaValidator(file);
  expect(validateSchema(value), JSON.stringify(validateSchema.errors)).toBe(false);
}

describe('CAL-002 v2 authority contracts', () => {
  it('registers the three v2 schemas in the flat ordered registry and compiles them strictly', () => {
    const index = JSON.parse(readFileSync(join(SCHEMA_DIR, 'index.json'), 'utf8')) as {
      schemas: { file: string; version: string }[];
    };
    expect(index.schemas.slice(8, 11)).toEqual([
      { file: 'cal-002-authority-proposal-v2.schema.json', version: CAL002_AUTHORITY_PROPOSAL_VERSION },
      { file: 'cal-002-authority-state-v2.schema.json', version: CAL002_AUTHORITY_STATE_VERSION },
      { file: 'cal-002-authority-receipt-v2.schema.json', version: CAL002_AUTHORITY_RECEIPT_VERSION },
    ]);
    expect(index.schemas.every((entry) => Object.keys(entry).sort().join(',') === 'file,version')).toBe(true);

    for (const [file, fixture] of Object.entries(fixtures)) {
      const validateSchema = schemaValidator(file as keyof typeof fixtures);
      expect(validateSchema(fixture), `${file}: ${JSON.stringify(validateSchema.errors)}`).toBe(true);
    }
  });

  it('keeps every v2 schema object definition closed', () => {
    const visit = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        value.forEach((child, index) => visit(child, `${path}[${index}]`));
        return;
      }
      if (value === null || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      if (record.type === 'object') expect(record.additionalProperties, path).toBe(false);
      Object.entries(record).forEach(([key, child]) => visit(child, `${path}.${key}`));
    };
    for (const file of Object.keys(fixtures) as (keyof typeof fixtures)[]) {
      visit(JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8')), file);
    }
  });

  it('accepts complete artifacts without coercion and exposes throwing assertion wrappers', () => {
    for (const [file, validate] of Object.entries(validators)) {
      const fixture = clone(fixtures[file as keyof typeof fixtures]);
      expect(validate(fixture), file).toEqual({ ok: true, errors: [] });
      expect(fixture).toEqual(fixtures[file as keyof typeof fixtures]);
    }
    expect(() => assertCAL002AuthorityProposalV2(proposalResult.proposal)).not.toThrow();
    expect(() => assertCAL002AuthorityStateV2(state)).not.toThrow();
    expect(() => assertCAL002AuthorityReceiptV2(receipt)).not.toThrow();
  });

  it('rejects unknown and missing fields in top-level and nested objects with validator/schema agreement', () => {
    expectRejectedByBoth(
      'cal-002-authority-proposal-v2.schema.json',
      { ...clone(proposalResult.proposal), unexpected: true },
      /unexpected|unknown/i,
    );

    const missingState = clone(state) as Record<string, unknown>;
    delete missingState.reviewerAuthority;
    expectRejectedByBoth('cal-002-authority-state-v2.schema.json', missingState, /reviewerAuthority|required/i);

    const nestedUnknown = clone(receipt);
    (nestedUnknown.rows[0]!.aiAssociation as Record<string, unknown>).qualityAuthority = 'quality';
    expectRejectedByBoth('cal-002-authority-receipt-v2.schema.json', nestedUnknown, /qualityAuthority|unknown/i);
  });

  it('rejects malformed headers, hashes, decisions, revisions, and admission/application drift', () => {
    expectRejectedByBoth(
      'cal-002-authority-state-v2.schema.json',
      { ...clone(state), protocolVersion: 'CAL-002-v1' },
      /protocolVersion|CAL-002-v2/i,
    );
    expectRejectedByBoth(
      'cal-002-authority-state-v2.schema.json',
      { ...clone(state), proposalSha256: HASH_A.toUpperCase() },
      /proposalSha256|SHA-256|pattern/i,
    );
    expectRejectedByBoth(
      'cal-002-authority-state-v2.schema.json',
      { ...clone(state), decision: 'accepted' },
      /decision|pending|approved|rejected/i,
    );
    expectRejectedByBoth(
      'cal-002-authority-state-v2.schema.json',
      { ...clone(state), revision: 3 },
      /revision|2/i,
    );
    expectRejectedByBoth(
      'cal-002-authority-receipt-v2.schema.json',
      { ...clone(receipt), admitted: true, applied: true },
      /admitted|applied|false/i,
    );

    const wrongSnapshot = clone(proposalResult.proposal);
    wrongSnapshot.associationSnapshot.evidenceSha256 = HASH_A;
    expectRejectedByBoth(
      'cal-002-authority-proposal-v2.schema.json',
      wrongSnapshot,
      /associationSnapshot|evidenceSha256|snapshot/i,
    );
  });

  it('rejects non-canonical rows, count drift, and receipt row-hash drift', () => {
    const reordered = clone(proposalResult.proposal);
    [reordered.rows[0], reordered.rows[1]] = [reordered.rows[1]!, reordered.rows[0]!];
    expectRejectedByBoth('cal-002-authority-proposal-v2.schema.json', reordered, /order|ruleId|canonical/i);

    const countDrift = clone(proposalResult.proposal);
    countDrift.counts.transferred = 25;
    expectRejectedByBoth('cal-002-authority-proposal-v2.schema.json', countDrift, /transferred|26/i);

    expectRejectedByBoth(
      'cal-002-authority-receipt-v2.schema.json',
      { ...clone(receipt), authorityRowsSha256: HASH_A },
      /authorityRowsSha256|rows.*hash|canonical/i,
    );
  });

  it('rejects row metadata that attempts to promote association evidence into authority', () => {
    const promoted = clone(proposalResult.proposal);
    const researchIndex = promoted.rows.findIndex((row) => row.ruleId === 'ai/comment-ratio');
    promoted.rows[researchIndex] = {
      ...promoted.rows[researchIndex]!,
      destination: 'quality',
      readiness: 'evidence-ready',
      assignmentEligible: true,
    };
    expectRejectedByBoth('cal-002-authority-proposal-v2.schema.json', promoted, /authority|destination|readiness|canonical/i);
    expect(() => assertCAL002AuthorityProposalV2(promoted)).toThrow(/authority|destination|readiness|canonical/i);
  });

  it('returns validation errors instead of throwing for non-JSON row values', () => {
    const malformed = clone(proposalResult.proposal);
    (malformed.rows[0] as Record<string, unknown>).reasonCode = 1n;
    expect(() => validateCAL002AuthorityProposalV2(malformed)).not.toThrow();
    expect(validateCAL002AuthorityProposalV2(malformed).ok).toBe(false);

    const malformedReceipt = clone(receipt);
    (malformedReceipt.rows[0] as Record<string, unknown>).reasonCode = 1n;
    expect(() => validateCAL002AuthorityReceiptV2(malformedReceipt)).not.toThrow();
    expect(validateCAL002AuthorityReceiptV2(malformedReceipt).ok).toBe(false);
  });

  it('rejects sparse 119-slot proposal and receipt rows in both validators', () => {
    const sparseProposal = clone(proposalResult.proposal);
    delete (sparseProposal.rows as unknown[])[7];
    expectRejectedByBoth(
      'cal-002-authority-proposal-v2.schema.json',
      sparseProposal,
      /missing|sparse|index|identity|119/i,
    );

    const sparseReceipt = clone(receipt);
    delete (sparseReceipt.rows as unknown[])[7];
    expectRejectedByBoth(
      'cal-002-authority-receipt-v2.schema.json',
      sparseReceipt,
      /missing|sparse|index|identity|119/i,
    );
  });
});
