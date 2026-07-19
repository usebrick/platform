import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildCAL002QualityAssignment,
  scanCAL002QualitySourceCandidates,
  type CAL002QualityLaneDecision,
  type CAL002QualityObservation,
} from '../../src/calibration/cal-002/quality-sampling';
import {
  canonicalArtifact,
  validateCAL002Assignment,
} from '../../src/calibration/cal-002/contracts';
import {
  deriveCorpusV1SourceDisposition,
  type CorpusV1SourceDisposition,
} from '../../src/calibration/corpus-v1/source-policy';

const CATALOG_SHA256 = 'a'.repeat(64);
const IMPLEMENTATION_COMMIT_SHA = '1'.repeat(40);
const CONTEXTUAL_RULE = 'layout/spacing-grid';
const STATISTICAL_RULE = 'logic/heaps-deviation';

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function byteBucket(byteCount: number): number {
  return Math.floor(Math.log2(Math.max(1, byteCount)));
}

function laneDecision(
  ruleId: string,
  evidenceClass: CAL002QualityLaneDecision['evidenceClass'],
): CAL002QualityLaneDecision {
  return { ruleId, lane: 'quality', evidenceClass };
}

function observationsForRule(
  ruleId: string,
  count: number,
  language: string,
  prefix: string,
): CAL002QualityObservation[] {
  const rows: CAL002QualityObservation[] = [];
  for (let index = 0; index < count; index += 1) {
    const familyId = `${prefix}-family-${index % 6}`;
    const bucket = 8 + (index % 3);
    const byteCount = 2 ** bucket + index;
    const findingUnitId = `${prefix}-finding-${index}`;
    const controlUnitId = `${prefix}-control-${index}`;
    rows.push({
      unitId: findingUnitId,
      familyId,
      language,
      byteCount,
      contentSha256: sha256(`content:${findingUnitId}`),
      findings: [{
        ruleId,
        line: index + 2,
        column: (index % 7) + 1,
        messageSha256: sha256(`message:${ruleId}:${index}`),
      }],
    });
    rows.push({
      unitId: controlUnitId,
      familyId,
      language,
      byteCount,
      contentSha256: sha256(`content:${controlUnitId}`),
      findings: [],
    });
  }
  return rows;
}

function buildInput(
  observations: readonly CAL002QualityObservation[],
  laneDecisions: readonly CAL002QualityLaneDecision[],
) {
  return {
    catalogSha256: CATALOG_SHA256,
    assignmentImplementationCommitSha: IMPLEMENTATION_COMMIT_SHA,
    assignmentId: 'cal-002-quality-initial',
    round: 'initial' as const,
    laneDecisions,
    observations,
  };
}

function reverseObservationInput(observations: readonly CAL002QualityObservation[]): CAL002QualityObservation[] {
  return [...observations].reverse().map((observation) => ({
    ...observation,
    findings: [...observation.findings].reverse(),
  }));
}

describe('CAL-002 blinded quality sampling', () => {
  it('selects deterministic 30/30 initial batches with family reach and matched language/size strata', () => {
    const laneDecisions = [
      laneDecision(CONTEXTUAL_RULE, 'contextual-quality'),
      laneDecision(STATISTICAL_RULE, 'statistical-review-utility'),
    ];
    const observations = [
      ...observationsForRule(CONTEXTUAL_RULE, 30, 'typescript', 'contextual'),
      ...observationsForRule(STATISTICAL_RULE, 30, 'python', 'statistical'),
    ];

    const first = buildCAL002QualityAssignment(buildInput(observations, laneDecisions));
    const second = buildCAL002QualityAssignment(buildInput(
      reverseObservationInput(observations),
      [...laneDecisions].reverse(),
    ));

    expect(second).toEqual(first);
    expect(first.assignmentJson).toBe(canonicalArtifact(first.assignment).json);
    expect(validateCAL002Assignment(first.assignment)).toEqual({ ok: true, errors: [] });
    expect(first.shortages).toEqual([]);

    const observationByUnit = new Map(observations.map((observation) => [observation.unitId, observation]));
    for (const ruleId of [CONTEXTUAL_RULE, STATISTICAL_RULE]) {
      const findings = first.assignment.rows.filter((row) => row.ruleId === ruleId && row.role === 'finding');
      const controls = first.assignment.rows.filter((row) => row.ruleId === ruleId && row.role === 'control');
      expect(findings).toHaveLength(30);
      expect(controls).toHaveLength(30);
      expect(new Set(findings.map((row) => observationByUnit.get(row.unitId)!.familyId)).size).toBeGreaterThanOrEqual(5);
      expect(new Set(controls.map((row) => observationByUnit.get(row.unitId)!.familyId)).size).toBeGreaterThanOrEqual(5);
      const strata = (rows: typeof findings) => rows.map((row) => {
        const observation = observationByUnit.get(row.unitId)!;
        return `${observation.language}:${byteBucket(observation.byteCount)}`;
      }).sort();
      expect(strata(controls)).toEqual(strata(findings));
      expect(new Set([...findings, ...controls].map((row) => row.unitId)).size).toBe(60);
    }
    expect(new Set(first.assignment.rows.map((row) => row.unitId)).size).toBe(first.assignment.rows.length);
    expect(new Set(first.assignment.rows.map((row) => row.reviewId)).size).toBe(first.assignment.rows.length);
  });

  it('caps final expansion at 100/100 cumulatively without reusing prior units', () => {
    const decisions = [laneDecision(CONTEXTUAL_RULE, 'contextual-quality')];
    const observations = observationsForRule(CONTEXTUAL_RULE, 125, 'typescript', 'expansion');
    const initial = buildCAL002QualityAssignment(buildInput(observations, decisions));
    const final = buildCAL002QualityAssignment({
      ...buildInput(reverseObservationInput(observations), [...decisions].reverse()),
      assignmentId: 'cal-002-quality-final',
      round: 'final',
      expansionRuleIds: [CONTEXTUAL_RULE],
      priorAssignment: initial.assignment,
    });

    for (const role of ['finding', 'control'] as const) {
      const prior = initial.assignment.rows.filter((row) => row.ruleId === CONTEXTUAL_RULE && row.role === role);
      const expansion = final.assignment.rows.filter((row) => row.ruleId === CONTEXTUAL_RULE && row.role === role);
      expect(prior).toHaveLength(30);
      expect(expansion).toHaveLength(70);
      expect(new Set([...prior, ...expansion].map((row) => row.unitId)).size).toBe(100);
    }
    expect(final.assignment.targetPerArm).toBe(100);
    expect(final.shortages).toEqual([]);
  });

  it('rejects a malformed prior assignment before cumulative selection', () => {
    const decisions = [laneDecision(CONTEXTUAL_RULE, 'contextual-quality')];
    const observations = observationsForRule(CONTEXTUAL_RULE, 100, 'typescript', 'prior-contract');
    const initial = buildCAL002QualityAssignment(buildInput(observations, decisions));
    const duplicated = initial.assignment.rows[0]!;
    const duplicateReviewId = sha256('duplicate-prior-review');
    const malformedPrior = {
      ...initial.assignment,
      rows: [...initial.assignment.rows, { ...duplicated, reviewId: duplicateReviewId }],
      blindedRows: [
        ...initial.assignment.blindedRows,
        { ...initial.assignment.blindedRows.find((row) => row.reviewId === duplicated.reviewId)!, reviewId: duplicateReviewId },
      ],
    };

    expect(() => buildCAL002QualityAssignment({
      ...buildInput(observations, decisions),
      assignmentId: 'cal-002-quality-final-malformed-prior',
      round: 'final',
      expansionRuleIds: [CONTEXTUAL_RULE],
      priorAssignment: malformedPrior,
    })).toThrow(/prior assignment.*duplicate/i);
  });

  it('records deterministic shortages instead of duplicating units', () => {
    const observations = observationsForRule(CONTEXTUAL_RULE, 6, 'typescript', 'shortage')
      .filter((_, index) => index < 10);
    const result = buildCAL002QualityAssignment(buildInput(
      observations,
      [laneDecision(CONTEXTUAL_RULE, 'contextual-quality')],
    ));

    expect(result.assignment.rows.filter((row) => row.role === 'finding')).toHaveLength(5);
    expect(result.assignment.rows.filter((row) => row.role === 'control')).toHaveLength(5);
    expect(result.shortages).toEqual([
      { ruleId: CONTEXTUAL_RULE, role: 'control', requested: 30, selected: 5, missing: 25 },
      { ruleId: CONTEXTUAL_RULE, role: 'finding', requested: 30, selected: 5, missing: 25 },
    ]);
    expect(new Set(result.assignment.rows.map((row) => row.unitId)).size).toBe(result.assignment.rows.length);
  });

  it('hashes a review-id-free selection manifest and exposes a role-free presentation batch', () => {
    const observations = observationsForRule(CONTEXTUAL_RULE, 30, 'typescript', 'private');
    const result = buildCAL002QualityAssignment(buildInput(
      observations,
      [laneDecision(CONTEXTUAL_RULE, 'contextual-quality')],
    ));
    const selectedWithoutReviewIds = result.assignment.rows.map(({ reviewId: _reviewId, ...row }) => row);
    const expectedManifestSha256 = canonicalArtifact(selectedWithoutReviewIds).sha256;

    expect(result.assignment.selectionManifestSha256).toBe(expectedManifestSha256);
    for (const row of result.assignment.rows) {
      expect(row.reviewId).toBe(sha256(`CAL-002-v1\0${expectedManifestSha256}\0${row.ruleId}\0${row.unitId}`));
    }
    const presentationKeys = result.blindedBatch.map((row) =>
      sha256(`CAL-002-v1\0presentation\0${expectedManifestSha256}\0${row.reviewId}`));
    expect(presentationKeys).toEqual([...presentationKeys].sort());
    expect(result.blindedBatch).toEqual(result.assignment.blindedRows);
    expect(JSON.stringify(result.blindedBatch)).not.toMatch(/finding|control|role|sourceLabel|repository|rawSource|\/Users\//iu);
    expect(result.blindedBatchSha256).toBe(canonicalArtifact(result.blindedBatch).sha256);

    const withPath = [{ ...observations[0]!, path: '/Users/cheng/private.ts' }, ...observations.slice(1)];
    expect(() => buildCAL002QualityAssignment(buildInput(
      withPath as readonly CAL002QualityObservation[],
      [laneDecision(CONTEXTUAL_RULE, 'contextual-quality')],
    ))).toThrow(/observation.*path.*unknown/i);
  });

  it('fails source permission before reads or scans and emits only path-free source-bound observations', async () => {
    const bytes = Buffer.from('const value = 1;\n', 'utf8');
    const binding = {
      sourceRef: { path: '/Users/cheng/private/source.ts' },
      unitId: 'source-unit-1',
      familyId: 'source-family-1',
      language: 'typescript',
      contentSha256: sha256(bytes),
    };
    let reads = 0;
    let scans = 0;
    const callbacks = {
      readCandidate: async (sourceRef: typeof binding.sourceRef): Promise<Uint8Array> => {
        reads += 1;
        expect(sourceRef.path).toContain('/Users/cheng/');
        return bytes;
      },
      scanCandidate: async (): Promise<CAL002QualityObservation['findings']> => {
        scans += 1;
        return [{
          ruleId: CONTEXTUAL_RULE,
          line: 1,
          column: 1,
          messageSha256: sha256('spacing finding'),
        }];
      },
    };
    const denied = deriveCorpusV1SourceDisposition({
      sourceId: 'denied-source',
      authorityTier: 'unknown',
      integrityStatus: 'verified',
      rightsDisposition: 'internal_analysis',
    });

    await expect(scanCAL002QualitySourceCandidates({
      disposition: denied,
      candidates: [binding],
      ...callbacks,
    })).rejects.toThrow(/does not permit calibration_evaluation/i);
    expect({ reads, scans }).toEqual({ reads: 0, scans: 0 });

    const allowed = deriveCorpusV1SourceDisposition({
      sourceId: 'allowed-source',
      authorityTier: 'publisher_attested',
      integrityStatus: 'verified',
      rightsDisposition: 'internal_analysis',
    });
    const widened = {
      ...allowed,
      permittedUses: [...allowed.permittedUses, 'ecological_validation'],
    } as CorpusV1SourceDisposition;
    await expect(scanCAL002QualitySourceCandidates({
      disposition: widened,
      candidates: [binding],
      ...callbacks,
    })).rejects.toThrow(/disposition does not match derived policy/i);
    expect({ reads, scans }).toEqual({ reads: 0, scans: 0 });

    const observations = await scanCAL002QualitySourceCandidates({
      disposition: allowed,
      candidates: [binding],
      ...callbacks,
    });
    expect({ reads, scans }).toEqual({ reads: 1, scans: 1 });
    expect(observations).toEqual([{
      unitId: binding.unitId,
      familyId: binding.familyId,
      language: binding.language,
      byteCount: bytes.byteLength,
      contentSha256: binding.contentSha256,
      findings: [{
        ruleId: CONTEXTUAL_RULE,
        line: 1,
        column: 1,
        messageSha256: sha256('spacing finding'),
      }],
    }]);
    expect(JSON.stringify(observations)).not.toMatch(/sourceRef|path|\/Users\//iu);
  });
});
