import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv/dist/2020.js';

import {
  calibrationAdmissionAuthorityCurrentSha256,
  calibrationAdmissionInputGenerationProposalSha256,
  calibrationAdmissionInputGenerationSha256,
  calibrationAdmissionStaticAuthorityGenerationSha256,
  isCalibrationAdmissionAuthorityCurrentV1,
  isCalibrationAdmissionInputGenerationProposalV1,
  isCalibrationAdmissionInputGenerationV1,
  isCalibrationAdmissionStaticAuthorityGenerationV1,
  validateCalibrationAdmissionAuthorityCurrentV1,
  validateCalibrationAdmissionStaticAuthorityGraphV1,
  validateCalibrationAdmissionInputGenerationProposalV1,
  validateCalibrationAdmissionInputGenerationV1,
  validateCalibrationAdmissionStaticAuthorityGenerationV1,
} from '../src/index';

const root = fileURLToPath(new URL('..', import.meta.url));
const schemaDir = join(root, 'schemas', 'v1');
const fixtureDir = join(root, 'tests', 'fixtures', 'schema');
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);

function artifact(kind: string, relativePath: string, sha256 = A) {
  return { pathBase: 'generation_local', relativePath, kind, bytes: 1, sha256 };
}

function proposal(overrides: Record<string, unknown> = {}) {
  const base = {
    version: 'v10.3-admission-input-generation-proposal-v1',
    proposalId: 'genesis-input',
    operation: 'create',
    expectedCurrentState: { kind: 'absent' },
    evidenceBundleSha256: A,
    sourceGenerationProposals: [
      {
        sourceId: 'source-a',
        proposalId: 'source-a-proposal',
        proposalRelativePath: 'review/admission/sources/source-a/proposals/source-a-proposal.json',
        proposalSha256: A,
      },
      {
        sourceId: 'source-b',
        proposalId: 'source-b-proposal',
        proposalRelativePath: 'review/admission/sources/source-b/proposals/source-b-proposal.json',
        proposalSha256: B,
      },
    ],
    admissionRecordStream: artifact('record_stream', 'admission-records.jsonl'),
    overlapUniverse: artifact('overlap_universe', 'overlap-universe.json', B),
    overlapUniverseRecords: artifact('overlap_universe_stream', 'overlap-universe-records.jsonl', C),
    ...overrides,
  };
  return { ...base, proposalSha256: calibrationAdmissionInputGenerationProposalSha256(base) };
}

function inputGeneration(overrides: Record<string, unknown> = {}) {
  const base = {
    version: 'v10.3-admission-input-generation-v1',
    generation: 0,
    evidenceBundleSha256: A,
    sourceGenerations: [
      {
        sourceId: 'source-a',
        generationSha256: A,
        relativePath: `review/admission/sources/source-a/generations/${A}`,
        artifactSetSha256: B,
      },
      {
        sourceId: 'source-b',
        generationSha256: B,
        relativePath: `review/admission/sources/source-b/generations/${B}`,
        artifactSetSha256: C,
      },
    ],
    admissionRecordStreamSha256: A,
    overlapUniverseSha256: B,
    overlapUniverseRecordsSha256: C,
    artifacts: [
      artifact('record_stream', 'admission-records.jsonl', A),
      artifact('overlap_universe_stream', 'overlap-universe-records.jsonl', C),
      artifact('overlap_universe', 'overlap-universe.json', B),
    ],
    ...overrides,
  };
  return { ...base, generationSha256: calibrationAdmissionInputGenerationSha256(base) };
}

function staticGeneration(overrides: Record<string, unknown> = {}) {
  const toolAuthoritySnapshot = JSON.parse(readFileSync(
    join(fixtureDir, 'valid', 'calibration-admission-tool-authority-snapshot.valid.json'),
    'utf8',
  )) as unknown;
  const base = {
    version: 'v10.3-admission-static-authority-generation-v1',
    generation: 0,
    inputGenerationSha256: A,
    overlapGenerationSha256: B,
    privacyLedgerSha256: C,
    qualityLedgerSha256: A,
    lineageLedgerSha256: B,
    preWitnessBundleSha256: C,
    toolAuthoritySnapshot,
    artifacts: [
      artifact('ledger', 'lineage-ledger.json', B),
      artifact('bundle', 'pre-witness-bundle.json', C),
      artifact('ledger', 'privacy-ledger.json', C),
      artifact('ledger', 'quality-ledger.json', A),
    ],
    ...overrides,
  };
  return { ...base, generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(base) };
}

function current(staticGenerationSha256 = A, overrides: Record<string, unknown> = {}) {
  const base = {
    version: 'v10.3-admission-authority-current-v1',
    generation: 0,
    staticGenerationSha256,
    staticGenerationRelativePath: `review/admission/authority/static-generations/${staticGenerationSha256}`,
    ...overrides,
  };
  return { ...base, currentSha256: calibrationAdmissionAuthorityCurrentSha256(base) };
}

describe('v10.3 static-authority graph contracts', () => {
  it('accepts a self-hashed proposal, input generation, static generation, and current pointer', () => {
    expect(isCalibrationAdmissionInputGenerationProposalV1(proposal())).toBe(true);
    expect(isCalibrationAdmissionInputGenerationV1(inputGeneration())).toBe(true);
    expect(isCalibrationAdmissionStaticAuthorityGenerationV1(staticGeneration())).toBe(true);
    expect(isCalibrationAdmissionAuthorityCurrentV1(current())).toBe(true);
  });

  it('binds every self-hash and rejects mutations before any runtime authority exists', () => {
    const input = inputGeneration();
    expect(validateCalibrationAdmissionInputGenerationV1({ ...input, generationSha256: B }).ok).toBe(false);
    const staticValue = staticGeneration();
    expect(validateCalibrationAdmissionStaticAuthorityGenerationV1({ ...staticValue, preWitnessBundleSha256: A }).ok).toBe(false);
    const pointer = current(A);
    expect(validateCalibrationAdmissionAuthorityCurrentV1({ ...pointer, currentSha256: B }).ok).toBe(false);
    expect(validateCalibrationAdmissionAuthorityCurrentV1({
      ...pointer,
      staticGenerationRelativePath: 'review/admission/authority/static-generations/../other',
    }).ok).toBe(false);
  });

  it('rejects unsorted source references and artifact kind/path substitutions', () => {
    const base = proposal();
    const reversed = [...(base.sourceGenerationProposals as unknown[])].reverse();
    const reversedProposal = {
      ...base,
      sourceGenerationProposals: reversed,
      proposalSha256: calibrationAdmissionInputGenerationProposalSha256({ ...base, sourceGenerationProposals: reversed }),
    };
    expect(validateCalibrationAdmissionInputGenerationProposalV1(reversedProposal).ok).toBe(false);

    const substituted = {
      ...base,
      admissionRecordStream: artifact('ledger', 'admission-records.jsonl'),
    };
    const substitutedProposal = {
      ...substituted,
      proposalSha256: calibrationAdmissionInputGenerationProposalSha256(substituted),
    };
    expect(validateCalibrationAdmissionInputGenerationProposalV1(substitutedProposal).ok).toBe(false);

    const currentPointer = {
      ...inputGeneration(),
      artifacts: [artifact('current_pointer', 'current.json')],
    };
    const currentPointerWithHash = {
      ...currentPointer,
      generationSha256: calibrationAdmissionInputGenerationSha256(currentPointer),
    };
    expect(validateCalibrationAdmissionInputGenerationV1(currentPointerWithHash).ok).toBe(false);
  });

  it('compiles the four graph schemas and rejects their invalid fixtures under strict AJV', () => {
    const names = [
      'calibration-admission-input-generation-proposal',
      'calibration-admission-input-generation',
      'calibration-admission-static-authority-generation',
      'calibration-admission-authority-current',
    ] as const;
    const ajv = new Ajv({ allErrors: true, strict: true });
    for (const name of [
      ...names,
      'calibration-admission-artifact-receipt',
      'calibration-admission-tool-authority-snapshot',
    ]) ajv.addSchema(JSON.parse(readFileSync(join(schemaDir, `${name}.schema.json`), 'utf8')) as object);
    for (const name of names) {
      const validate = ajv.getSchema(`https://usebrick.dev/schemas/v1/${name}.schema.json`);
      expect(validate, name).toBeDefined();
      expect(validate!(JSON.parse(readFileSync(join(fixtureDir, 'valid', `${name}.valid.json`), 'utf8'))), name).toBe(true);
      expect(validate!(JSON.parse(readFileSync(join(fixtureDir, 'invalid', `${name}.invalid.json`), 'utf8'))), name).toBe(false);
    }
  });

  it('joins the proposal, input generation, static generation, and published current pointer', () => {
    const input = inputGeneration();
    const staticValue = staticGeneration({ inputGenerationSha256: input.generationSha256 });
    const publishedCurrent = current(staticValue.generationSha256, { generation: staticValue.generation });
    const createGraph = validateCalibrationAdmissionStaticAuthorityGraphV1({
      proposal: proposal(),
      inputGeneration: input,
      staticGeneration: staticValue,
      current: publishedCurrent,
    });
    expect(createGraph.ok).toBe(true);
  });

  it('binds replace CAS state and rejects cross-object hash or pointer substitutions', () => {
    const priorStatic = staticGeneration();
    const priorCurrent = current(priorStatic.generationSha256, { generation: priorStatic.generation });
    const inputBody = {
      ...inputGeneration(),
      generation: 1,
      parentInputGenerationSha256: D,
    };
    const input = { ...inputBody, generationSha256: calibrationAdmissionInputGenerationSha256(inputBody) };
    const proposalBody = {
      ...proposal(),
      operation: 'replace' as const,
      expectedCurrentState: { kind: 'existing' as const, staticGenerationSha256: priorStatic.generationSha256 },
    };
    const replacementProposal = {
      ...proposalBody,
      proposalSha256: calibrationAdmissionInputGenerationProposalSha256(proposalBody),
    };
    const staticBody = {
      ...staticGeneration({ inputGenerationSha256: input.generationSha256 }),
      generation: 1,
      parentStaticGenerationSha256: priorStatic.generationSha256,
    };
    const replacementStatic = {
      ...staticBody,
      generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(staticBody),
    };
    const publishedCurrent = current(replacementStatic.generationSha256, { generation: 1 });
    const replaceGraph = validateCalibrationAdmissionStaticAuthorityGraphV1({
      proposal: replacementProposal,
      inputGeneration: input,
      staticGeneration: replacementStatic,
      priorCurrent,
      current: publishedCurrent,
    });
    expect(replaceGraph.ok).toBe(true);

    expect(validateCalibrationAdmissionStaticAuthorityGraphV1({
      proposal: replacementProposal,
      inputGeneration: { ...input, evidenceBundleSha256: B, generationSha256: calibrationAdmissionInputGenerationSha256({ ...input, evidenceBundleSha256: B }) },
      staticGeneration: replacementStatic,
      priorCurrent,
      current: publishedCurrent,
    }).ok).toBe(false);
    expect(validateCalibrationAdmissionStaticAuthorityGraphV1({
      proposal: replacementProposal,
      inputGeneration: input,
      staticGeneration: replacementStatic,
      priorCurrent: current(C, { generation: 0 }),
      current: publishedCurrent,
    }).ok).toBe(false);
    expect(validateCalibrationAdmissionStaticAuthorityGraphV1({
      proposal: replacementProposal,
      inputGeneration: input,
      staticGeneration: replacementStatic,
      priorCurrent,
      current: current(A, { generation: 1 }),
    }).ok).toBe(false);
  });

  it('requires the exact static-ledger and pre-witness artifact anchors', () => {
    const input = inputGeneration();
    const staticValue = staticGeneration({ inputGenerationSha256: input.generationSha256 });
    const publishedCurrent = current(staticValue.generationSha256, { generation: staticValue.generation });
    const wrongArtifacts = staticValue.artifacts.map((entry) => entry.relativePath === 'privacy-ledger.json'
      ? { ...entry, relativePath: 'other-ledger.json' }
      : entry);
    const mutated = {
      ...staticValue,
      artifacts: wrongArtifacts,
      generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256({ ...staticValue, artifacts: wrongArtifacts }),
    };
    expect(validateCalibrationAdmissionStaticAuthorityGraphV1({
      proposal: proposal(),
      inputGeneration: input,
      staticGeneration: mutated,
      current: publishedCurrent,
    }).ok).toBe(false);
  });
});
