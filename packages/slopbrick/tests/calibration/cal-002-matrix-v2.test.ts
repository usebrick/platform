import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
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
import { CAL001_FROZEN_INPUT_HASHES } from '../../src/calibration/corpus-v1/calibration-inputs';
import {
  CAL002_ORACLE_RECEIPT_VERSION_V2,
  type CAL002OracleReceiptV2,
} from '../../src/calibration/cal-002/oracles-v2';
import {
  CAL002_ORIGIN_FROZEN_GOVERNING_HASHES,
  buildCAL002OriginReceiptV2,
} from '../../src/calibration/cal-002/origin-v2';
import { buildCAL002QualityDispositionV2 } from '../../src/calibration/cal-002/quality-disposition';
import type { CAL002SupersessionReceiptV2 } from '../../src/calibration/cal-002/supersession';
import {
  buildCAL002FinalMatrixV2,
  validateCAL002FinalMatrixV2,
  type BuildCAL002FinalMatrixInputV2,
  type CAL002FinalMatrixV2,
} from '../../src/calibration/cal-002/matrix-v2';
import { CAL002_TRANSFER_CONTROL_FAMILIES } from './fixtures/cal-002-transfer-oracle-types';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(HERE, '../../src/calibration/cal-002/schemas');
const COMMIT_SHA = 'd'.repeat(40);

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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

function oracleReceipt(authority: CAL002AuthorityReceiptV2): CAL002OracleReceiptV2 {
  const rows = authority.rows
    .filter((row) => row.evidenceClass === 'deterministic-or-standards' && row.readiness === 'evidence-ready')
    .map((row, index) => ({
      ruleId: row.ruleId,
      transferred: row.sourceClass === 'owner-batch',
      declaration: {
        authority: 'repository-contract' as const,
        reference: `fixture-${row.ruleId}`,
        positiveCaseIds: ['positive'],
        negativeCaseIds: ['negative'],
      },
      caseResults: [
        { caseId: 'positive', expected: 'finding' as const, observed: 'finding' as const, sourceSha256: ((index % 9) + 1).toString().repeat(64) },
        { caseId: 'negative', expected: 'no-finding' as const, observed: 'no-finding' as const, sourceSha256: (((index + 1) % 9) + 1).toString().repeat(64) },
      ],
      fixtureControls: CAL002_TRANSFER_CONTROL_FAMILIES.map((familyId, controlIndex) => ({
        caseId: `fixture-${familyId}`,
        familyId,
        contentSha256: String(((index + controlIndex + 2) % 9) + 1).repeat(64),
        observed: 'no-finding' as const,
      })),
      realSourceControls: CAL002_TRANSFER_CONTROL_FAMILIES.map((familyId, controlIndex) => {
        const contentSha256 = String(((index + controlIndex + 1) % 9) + 1).repeat(64);
        return {
          controlId: sha256(`${row.ruleId}\0${familyId}\0${contentSha256}`),
          familyId,
          contentSha256,
          sourceBindingReceiptSha256: CAL001_FROZEN_INPUT_HASHES.sourceBindingReceiptSha256,
          observed: 'no-finding' as const,
        };
      }),
      status: 'passed' as const,
      outcome: 'default-on' as const,
      failures: [],
      admitted: false as const,
    }));
  expect(rows).toHaveLength(41);
  return {
    version: CAL002_ORACLE_RECEIPT_VERSION_V2,
    protocolVersion: CAL002_PROTOCOL_VERSION_V2,
    authorityReceiptSha256: canonicalArtifact(authority).sha256,
    sourceBindingReceiptSha256: CAL001_FROZEN_INPUT_HASHES.sourceBindingReceiptSha256,
    startingOracleReceiptSha256: 'c'.repeat(64),
    implementationCommitSha: COMMIT_SHA,
    rows,
    counts: {
      starting: 32,
      transferred: 9,
      passed: 41,
      failed: 0,
    },
    admitted: false,
  };
}

function supersessionReceipt(authority: CAL002AuthorityReceiptV2): CAL002SupersessionReceiptV2 {
  const rows = authority.rows
    .filter((row) => row.destination === 'superseded')
    .map((row, index) => ({
      ruleId: row.ruleId as CAL002SupersessionReceiptV2['rows'][number]['ruleId'],
      replacementRuleId: row.replacementRuleId as CAL002SupersessionReceiptV2['rows'][number]['replacementRuleId'],
      parityReceiptSha256: String(index + 1).repeat(64),
      migrationCommitSha: String(index + 1).repeat(40),
      uniqueCoverageDisposition: index === 1 ? 'rejected-as-false-positive' as const : 'ported' as const,
    }));
  return {
    version: 'cal-002-supersession-receipt-v2',
    protocolVersion: CAL002_PROTOCOL_VERSION_V2,
    authorityReceiptSha256: canonicalArtifact(authority).sha256,
    rows,
    admitted: false,
  };
}

function completeInputs(): BuildCAL002FinalMatrixInputV2 {
  const authorityReceipt = approvedAuthorityReceipt();
  return {
    authorityReceipt,
    oracleReceipt: oracleReceipt(authorityReceipt),
    qualityDisposition: buildCAL002QualityDispositionV2({
      authorityReceipt,
      selectedMetrics: [],
      implementationCommitSha: COMMIT_SHA,
    }).disposition,
    originReceipt: buildCAL002OriginReceiptV2({
      authorityReceipt,
      governingHashes: CAL002_ORIGIN_FROZEN_GOVERNING_HASHES,
      originImplementationCommitSha: COMMIT_SHA,
    }).receipt,
    supersessionReceipt: supersessionReceipt(authorityReceipt),
    reducerImplementationCommitSha: COMMIT_SHA,
  };
}

function row(result: ReturnType<typeof buildCAL002FinalMatrixV2>, ruleId: string) {
  return result.matrix.rows.find((candidate) => candidate.ruleId === ruleId);
}

function compileSchema() {
  const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, 'cal-002-final-matrix-v2.schema.json'), 'utf8'));
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema);
}

describe('CAL-002 final matrix v2', () => {
  it('reduces every authority class exactly once', () => {
    const result = buildCAL002FinalMatrixV2(completeInputs());
    expect(result.matrix.rows).toHaveLength(119);
    expect(new Set(result.matrix.rows.map((candidate) => candidate.ruleId)).size).toBe(119);
    expect(result.matrix.projectionCounts).toEqual({
      startingQuality: 47,
      transferred: 26,
      blocked: 4,
      superseded: 3,
      retired: 7,
      researchOrigin: 32,
    });
    expect(row(result, 'logic/ghost-defensive')).toMatchObject({
      readiness: 'repair-required',
      runtimeOutcome: 'default-off',
      runnableByExplicitOptIn: false,
      scoreEligible: false,
      gateEligible: false,
      provenance: 'blocked-quality-candidate',
    });
    expect(row(result, 'ai/any-density')).toMatchObject({
      measurementStatus: 'not-requested-owner-capacity',
      runtimeOutcome: 'quality-candidate-default-off',
      enabledByDefault: false,
      runnableByExplicitOptIn: true,
      scoreEligible: false,
      gateEligible: false,
    });
    expect(row(result, 'logic/math-any-density')).toMatchObject({
      runtimeOutcome: 'superseded',
      replacementRuleId: 'ai/any-density',
      runnableByExplicitOptIn: false,
    });
    expect(row(result, 'ai/comment-ratio')).toMatchObject({
      runtimeOutcome: 'default-off',
      provenance: 'internal-origin-association',
      enabledByDefault: false,
      runnableByExplicitOptIn: true,
      scoreEligible: false,
      gateEligible: false,
    });
    expect(result.matrix.outcomeCounts['default-on']).toBe(41);
    expect(result.matrix.outcomeCounts['quality-candidate-default-off']).toBe(32);
    expect(result.matrix.outcomeCounts['default-off']).toBe(36);
    expect(result.matrix.outcomeCounts.superseded).toBe(3);
    expect(result.matrix.outcomeCounts.retired).toBe(7);
    expect(result.matrix).toMatchObject({ admitted: false, applied: false });
    expect(result.matrixJson).toBe(canonicalArtifact(result.matrix).json);
    expect(result.matrixSha256).toBe(canonicalArtifact(result.matrix).sha256);
    expect(validateCAL002FinalMatrixV2(result.matrix)).toEqual({ ok: true, errors: [] });
    const validateSchema = compileSchema();
    expect(validateSchema(result.matrix), JSON.stringify(validateSchema.errors)).toBe(true);
  });

  it.each([
    ['missing authority row', (input: BuildCAL002FinalMatrixInputV2) => {
      const rows = input.authorityReceipt.rows.slice(1);
      return { ...input, authorityReceipt: { ...input.authorityReceipt, rows } };
    }],
    ['duplicate oracle row', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      oracleReceipt: { ...input.oracleReceipt, rows: [...input.oracleReceipt.rows.slice(0, -1), input.oracleReceipt.rows[0]!] },
    })],
    ['oracle pass with an unexpected observation', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      oracleReceipt: {
        ...input.oracleReceipt,
        rows: input.oracleReceipt.rows.map((candidate, index) => index === 0 ? {
          ...candidate,
          caseResults: candidate.caseResults.map((caseResult, caseIndex) => caseIndex === 0
            ? { ...caseResult, observed: 'no-finding' as const }
            : caseResult),
        } : candidate),
      },
    })],
    ['oracle receipt with non-frozen source binding', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      oracleReceipt: { ...input.oracleReceipt, sourceBindingReceiptSha256: '9'.repeat(64) },
    })],
    ['oracle pass with incomplete fixture controls', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      oracleReceipt: {
        ...input.oracleReceipt,
        rows: input.oracleReceipt.rows.map((candidate, index) => index === 0 ? {
          ...candidate,
          fixtureControls: candidate.fixtureControls.slice(0, 4),
        } : candidate),
      },
    })],
    ['oracle pass with duplicate fixture-control families', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      oracleReceipt: {
        ...input.oracleReceipt,
        rows: input.oracleReceipt.rows.map((candidate, index) => index === 0 ? {
          ...candidate,
          fixtureControls: candidate.fixtureControls.map((control, controlIndex) => controlIndex === 1
            ? { ...control, familyId: candidate.fixtureControls[0]!.familyId }
            : control),
        } : candidate),
      },
    })],
    ['oracle pass with shuffled fixture-control order', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      oracleReceipt: {
        ...input.oracleReceipt,
        rows: input.oracleReceipt.rows.map((candidate, index) => index === 0 ? {
          ...candidate,
          fixtureControls: [
            candidate.fixtureControls[1]!,
            candidate.fixtureControls[0]!,
            ...candidate.fixtureControls.slice(2),
          ],
        } : candidate),
      },
    })],
    ['oracle control with non-derived identity', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      oracleReceipt: {
        ...input.oracleReceipt,
        rows: input.oracleReceipt.rows.map((candidate, index) => index === 0 ? {
          ...candidate,
          realSourceControls: candidate.realSourceControls.map((control, controlIndex) => controlIndex === 0
            ? { ...control, controlId: '9'.repeat(64) }
            : control),
        } : candidate),
      },
    })],
    ['oracle pass with duplicate real-source families', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      oracleReceipt: {
        ...input.oracleReceipt,
        rows: input.oracleReceipt.rows.map((candidate, index) => index === 0 ? {
          ...candidate,
          realSourceControls: candidate.realSourceControls.map((control, controlIndex) => controlIndex === 1
            ? { ...control, familyId: candidate.realSourceControls[0]!.familyId }
            : control),
        } : candidate),
      },
    })],
    ['oracle pass with duplicate real-source content hashes', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      oracleReceipt: {
        ...input.oracleReceipt,
        rows: input.oracleReceipt.rows.map((candidate, index) => index === 0 ? {
          ...candidate,
          realSourceControls: candidate.realSourceControls.map((control, controlIndex) => controlIndex === 1
            ? {
                ...control,
                contentSha256: candidate.realSourceControls[0]!.contentSha256,
                controlId: sha256(`${candidate.ruleId}\0${control.familyId}\0${candidate.realSourceControls[0]!.contentSha256}`),
              }
            : control),
        } : candidate),
      },
    })],
    ['oracle pass with shuffled real-source family order', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      oracleReceipt: {
        ...input.oracleReceipt,
        rows: input.oracleReceipt.rows.map((candidate, index) => index === 0 ? {
          ...candidate,
          realSourceControls: [
            candidate.realSourceControls[1]!,
            candidate.realSourceControls[0]!,
            ...candidate.realSourceControls.slice(2),
          ],
        } : candidate),
      },
    })],
    ['quality authority with none domain', (input: BuildCAL002FinalMatrixInputV2) => {
      const rows = input.authorityReceipt.rows.map((candidate) => candidate.ruleId === 'ai/any-density'
        ? { ...candidate, qualityDomain: 'none' as const }
        : candidate);
      return { ...input, authorityReceipt: { ...input.authorityReceipt, rows } };
    }],
    ['oracle evidence for a non-ready row', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      oracleReceipt: {
        ...input.oracleReceipt,
        rows: [...input.oracleReceipt.rows, { ...input.oracleReceipt.rows[0]!, ruleId: 'logic/ghost-defensive' }],
      },
    })],
    ['unmeasured row with labels and Wilson fields', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      qualityDisposition: {
        ...input.qualityDisposition,
        rows: input.qualityDisposition.rows.map((candidate, index) => index === 0 ? {
          ...candidate,
          sampleCounts: { findings: 1, controls: 1, cannotDetermine: 0 },
          uncertainty: {
            findingUseful: { lower: 0.1, upper: 0.9 },
            controlUseful: { lower: 0.1, upper: 0.9 },
          },
        } : candidate),
      },
    })],
    ['statistical default-on', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      qualityDisposition: {
        ...input.qualityDisposition,
        rows: input.qualityDisposition.rows.map((candidate) => candidate.evidenceClass === 'statistical-review-utility' ? {
          ...candidate,
          measurementStatus: 'measured' as const,
          sampleCounts: { findings: 30, controls: 30, cannotDetermine: 0 },
          uncertainty: {
            findingUseful: { lower: 0.7, upper: 0.9 },
            controlUseful: { lower: 0.1, upper: 0.2 },
          },
          metricsRowSha256: 'a'.repeat(64),
          runtimeOutcome: 'default-on' as const,
          enabledByDefault: true,
          scoreEligible: true,
          gateEligible: true,
        } : candidate),
      },
    })],
    ['AI association elevation', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      originReceipt: {
        ...input.originReceipt,
        rows: input.originReceipt.rows.map((candidate, index) => index === 0
          ? { ...candidate, enabledByDefault: true as const }
          : candidate),
      },
    })],
    ['incomplete supersession', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      supersessionReceipt: { ...input.supersessionReceipt, rows: input.supersessionReceipt.rows.slice(1) },
    })],
    ['origin scoring', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      originReceipt: {
        ...input.originReceipt,
        rows: input.originReceipt.rows.map((candidate, index) => index === 0
          ? { ...candidate, scoreEligible: true as const }
          : candidate),
      },
    })],
    ['projection disagreement', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      qualityDisposition: {
        ...input.qualityDisposition,
        rows: input.qualityDisposition.rows.map((candidate, index) => index === 0
          ? { ...candidate, gateEligible: true as const }
          : candidate),
      },
    })],
    ['stale authority hash', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      qualityDisposition: { ...input.qualityDisposition, authorityReceiptSha256: '9'.repeat(64) },
    })],
    ['stale catalog hash', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      authorityReceipt: { ...input.authorityReceipt, catalogSha256: '9'.repeat(64) as typeof CAL002_LOCKED_RULE_CATALOG_SHA256 },
    })],
    ['stale row evidence hash', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      originReceipt: {
        ...input.originReceipt,
        rows: input.originReceipt.rows.map((candidate, index) => index === 0
          ? { ...candidate, evidenceSha256: '9'.repeat(64) }
          : candidate),
      },
    })],
    ['admitted input', (input: BuildCAL002FinalMatrixInputV2) => ({
      ...input,
      qualityDisposition: { ...input.qualityDisposition, admitted: true as false },
    })],
  ] as const)('fails closed for %s', (_label, mutate) => {
    expect(() => buildCAL002FinalMatrixV2(mutate(completeInputs()) as BuildCAL002FinalMatrixInputV2)).toThrow();
  });

  it('rejects runtime projection drift in a completed matrix', () => {
    const matrix = buildCAL002FinalMatrixV2(completeInputs()).matrix;
    const mutations: readonly [string, (value: CAL002FinalMatrixV2) => CAL002FinalMatrixV2][] = [
      ['retired runnable', (value) => ({
        ...value,
        rows: value.rows.map((candidate) => candidate.runtimeOutcome === 'retired'
          ? { ...candidate, runnableByExplicitOptIn: true }
          : candidate),
      })],
      ['superseded runnable', (value) => ({
        ...value,
        rows: value.rows.map((candidate) => candidate.runtimeOutcome === 'superseded'
          ? { ...candidate, runnableByExplicitOptIn: true }
          : candidate),
      })],
      ['origin scores', (value) => ({
        ...value,
        rows: value.rows.map((candidate) => candidate.provenance === 'internal-origin-association'
          ? { ...candidate, scoreEligible: true }
          : candidate),
      })],
      ['row admission', (value) => ({
        ...value,
        rows: value.rows.map((candidate, index) => index === 0 ? { ...candidate, admitted: true as false } : candidate),
      })],
    ];
    const validateSchema = compileSchema();
    for (const [label, mutate] of mutations) {
      const candidate = mutate(structuredClone(matrix));
      expect(validateCAL002FinalMatrixV2(candidate).ok, label).toBe(false);
      expect(validateSchema(candidate), label).toBe(false);
    }
  });
});
