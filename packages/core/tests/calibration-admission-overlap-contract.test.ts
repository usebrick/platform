import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv/dist/2020.js';

import {
  admissionOverlapJaccard,
  calibrationAdmissionNormalizerRegistrySha256,
  calibrationAdmissionOverlapPolicySha256,
  calibrationAdmissionOverlapPolarityBindingSha256,
  calibrationAdmissionOverlapUniverseRecordSha256,
  calibrationAdmissionOverlapUniverseSha256,
  isAdmissionOverlapJaccardAtLeast80,
  isAdmissionOverlapSizeCompatible,
  isCalibrationAdmissionNormalizerRegistryV1,
  isCalibrationAdmissionOverlapPolicyV1,
  isCalibrationAdmissionOverlapUniverseRecordV1,
  isCalibrationAdmissionOverlapUniverseV1,
  validateCalibrationAdmissionOverlapUniverseRecords,
  validateCalibrationAdmissionOverlapUniverseStream,
} from '../src/calibration-admission-overlap';
import { calibrationAdmissionCanonicalJson } from '../src/calibration-admission-evidence';

const root = fileURLToPath(new URL('..', import.meta.url));
const schemaDir = join(root, 'schemas', 'v1');
const fixtureDir = join(root, 'tests', 'fixtures', 'schema');
const sha = (character: string) => character.repeat(64);
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixtureDir, 'valid', `${name}.valid.json`), 'utf8')) as T;
}

describe('v10.3 Task 2A Core overlap contracts', () => {
  it('compiles all four schemas and accepts their strict fixtures', () => {
    const ajv = new Ajv({ allErrors: true, strict: true });
    const names = [
      'calibration-admission-normalizer-registry',
      'calibration-admission-overlap-universe-record',
      'calibration-admission-overlap-universe',
      'calibration-admission-overlap-policy',
    ];
    for (const name of names) {
      const schema = JSON.parse(readFileSync(join(schemaDir, `${name}.schema.json`), 'utf8')) as object;
      const validate = ajv.compile(schema);
      const value = fixture(name);
      expect(validate(value), `${name}: ${JSON.stringify(validate.errors)}`).toBe(true);
      expect(validate({})).toBe(false);
    }
  });

  it('enforces registry, row, summary, and policy self-hashes', () => {
    const registry = fixture<Record<string, unknown>>('calibration-admission-normalizer-registry');
    const record = fixture<Record<string, unknown>>('calibration-admission-overlap-universe-record');
    const universe = fixture<Record<string, unknown>>('calibration-admission-overlap-universe');
    const policy = fixture<Record<string, unknown>>('calibration-admission-overlap-policy');
    expect(isCalibrationAdmissionNormalizerRegistryV1(registry)).toBe(true);
    expect(isCalibrationAdmissionOverlapUniverseRecordV1(record)).toBe(true);
    expect(isCalibrationAdmissionOverlapUniverseV1(universe)).toBe(true);
    expect(isCalibrationAdmissionOverlapPolicyV1(policy)).toBe(true);
    expect(calibrationAdmissionNormalizerRegistrySha256(registry)).toBe(registry.registrySha256);
    expect(calibrationAdmissionOverlapUniverseRecordSha256(record)).toBe(record.recordSha256);
    expect(calibrationAdmissionOverlapUniverseSha256(universe)).toBe(universe.universeSha256);
    expect(calibrationAdmissionOverlapPolicySha256(policy)).toBe(policy.policySha256);
    const recordPolarity = record.polarity as Record<string, unknown>;
    const registryEntries = registry.entries as [Record<string, unknown>, ...Record<string, unknown>[]];
    expect(calibrationAdmissionOverlapPolarityBindingSha256(recordPolarity)).toBe(recordPolarity.bindingSha256);

    expect(isCalibrationAdmissionNormalizerRegistryV1({ ...registry, entries: [{ ...registryEntries[0], language: 'Zig' }] })).toBe(false);
    expect(isCalibrationAdmissionOverlapUniverseRecordV1({ ...record, polarity: { ...recordPolarity, overlapSide: 'human_side' } })).toBe(false);
    expect(isCalibrationAdmissionOverlapUniverseRecordV1({ ...record, normalizationStatus: 'unsupported' })).toBe(false);
    expect(isCalibrationAdmissionOverlapUniverseV1({ ...universe, covered: 0 })).toBe(false);
    expect(isCalibrationAdmissionOverlapPolicyV1({ ...policy, maxOpenFiles: 65 })).toBe(false);
    expect(isCalibrationAdmissionOverlapPolicyV1({ ...policy, maxHeapBytes: 4_294_967_295 })).toBe(false);
    expect(isCalibrationAdmissionOverlapPolicyV1({ ...policy, policySha256: sha('f') })).toBe(false);
  });

  it('rejects contradictory registered-unassigned labels and locator controls', () => {
    const record = fixture<Record<string, unknown>>('calibration-admission-overlap-universe-record');
    const basePolarity: Record<string, unknown> = {
      intake: 'unassigned',
      overlapSide: 'unassigned',
      bindingAuthority: 'registered-unassigned-candidate',
    };
    for (const proposedLabel of ['verified_ai', 'verified_human', 'mixed', 'quarantine']) {
      const polarity = {
        ...basePolarity,
        proposedLabel,
        bindingSha256: calibrationAdmissionOverlapPolarityBindingSha256({ ...basePolarity, proposedLabel }),
      };
      const candidate = {
        ...record,
        polarity,
        recordSha256: calibrationAdmissionOverlapUniverseRecordSha256({ ...record, polarity }),
      };
      expect(isCalibrationAdmissionOverlapUniverseRecordV1(candidate), proposedLabel).toBe(false);
    }

    for (const control of ['\u0000', '\t', '\u007f']) {
      const locator = { kind: 'local_inventory_file', localSourceId: 'source-a', normalizedPath: `src/a.ts${control}` };
      const candidate = {
        ...record,
        locator,
        recordSha256: calibrationAdmissionOverlapUniverseRecordSha256({ ...record, locator }),
      };
      expect(isCalibrationAdmissionOverlapUniverseRecordV1(candidate), `path control ${JSON.stringify(control)}`).toBe(false);
    }

    const containerLocator = {
      kind: 'record_container',
      materializationId: 'materialization-a',
      containerSha256: sha('a'),
      rowKey: 'row-1',
      field: 'content',
    };
    for (const key of ['rowKey', 'field'] as const) {
      for (const control of ['\u0000', '\t', '\u007f']) {
        const locator = { ...containerLocator, [key]: `${containerLocator[key]}${control}` };
        const candidate = {
          ...record,
          locator,
          recordSha256: calibrationAdmissionOverlapUniverseRecordSha256({ ...record, locator }),
        };
        expect(isCalibrationAdmissionOverlapUniverseRecordV1(candidate), `${key} control ${JSON.stringify(control)}`).toBe(false);
      }
    }
  });

  it('binds stream ordering, status counts, unresolved IDs, and registry identity', () => {
    const registry = fixture<Record<string, unknown>>('calibration-admission-normalizer-registry');
    const record = fixture<Record<string, unknown>>('calibration-admission-overlap-universe-record');
    const universe = fixture<Record<string, unknown>>('calibration-admission-overlap-universe');
    expect(validateCalibrationAdmissionOverlapUniverseStream(universe, [record], registry).ok).toBe(true);
    expect(validateCalibrationAdmissionOverlapUniverseRecords(universe, [record], registry).ok).toBe(true);
    expect(validateCalibrationAdmissionOverlapUniverseStream(universe, [record], undefined).ok).toBe(false);
    expect(validateCalibrationAdmissionOverlapUniverseRecords(universe, [record], undefined).ok).toBe(false);
    expect(validateCalibrationAdmissionOverlapUniverseStream({ ...universe, covered: 0 }, [record], registry).ok).toBe(false);
    expect(validateCalibrationAdmissionOverlapUniverseStream(universe, [], registry).ok).toBe(false);
    const substituted = { ...record, candidateUnitId: 'unit-b' };
    expect(validateCalibrationAdmissionOverlapUniverseStream(universe, [
      { ...substituted, recordSha256: calibrationAdmissionOverlapUniverseRecordSha256(substituted) },
    ], registry).ok).toBe(false);
    expect(validateCalibrationAdmissionOverlapUniverseStream(universe, [record], { ...registry, registrySha256: sha('f') }).ok).toBe(false);

    const mismatchedNormalizer = { ...record, normalizerId: 'normalizer-other-v1' };
    expect(validateCalibrationAdmissionOverlapUniverseStream(universe, [
      { ...mismatchedNormalizer, recordSha256: calibrationAdmissionOverlapUniverseRecordSha256(mismatchedNormalizer) },
    ], registry).ok).toBe(false);

    const substitutedRegistry: Record<string, unknown> = {
      ...registry,
      entries: (registry.entries as Array<Record<string, unknown>>).map((entry) => ({
        ...entry,
        normalizerId: 'normalizer-typescript-v2',
      })),
    };
    substitutedRegistry.registrySha256 = calibrationAdmissionNormalizerRegistrySha256(substitutedRegistry);
    expect(validateCalibrationAdmissionOverlapUniverseStream(universe, [record], substitutedRegistry).ok).toBe(false);
  });

  it('rejects an unsupported row that reuses a normalizer registered for another language', () => {
    const registry = fixture<Record<string, unknown>>('calibration-admission-normalizer-registry');
    const record = fixture<Record<string, unknown>>('calibration-admission-overlap-universe-record');
    const universe = fixture<Record<string, unknown>>('calibration-admission-overlap-universe');
    const unsupportedBase: Record<string, unknown> = {
      ...record,
      language: 'Unknown',
      normalizationStatus: 'unsupported',
    };
    delete unsupportedBase.shingleSetSha256;
    delete unsupportedBase.shingleCount;
    const unsupported = {
      ...unsupportedBase,
      recordSha256: calibrationAdmissionOverlapUniverseRecordSha256(unsupportedBase),
    };
    const canonicalJsonl = Buffer.from(`${calibrationAdmissionCanonicalJson(unsupported)}\n`, 'utf8');
    const unsupportedUniverseBase = {
      ...universe,
      recordsJsonlSha256: digest(canonicalJsonl),
      covered: 0,
      unsupported: 1,
      unresolvedCandidateUnitIds: ['unit-a'],
    };
    const unsupportedUniverse = {
      ...unsupportedUniverseBase,
      universeSha256: calibrationAdmissionOverlapUniverseSha256(unsupportedUniverseBase),
    };
    const validation = validateCalibrationAdmissionOverlapUniverseStream(
      unsupportedUniverse,
      [unsupported],
      registry,
    );
    expect(validation.ok).toBe(false);
    expect(validation.errors).toContain('record unit-a: unsupported row names a covered registry normalizer');
  });

  it('fails closed when malformed rows cannot be canonicalized', () => {
    const registry = fixture<Record<string, unknown>>('calibration-admission-normalizer-registry');
    const record = fixture<Record<string, unknown>>('calibration-admission-overlap-universe-record');
    const universe = fixture<Record<string, unknown>>('calibration-admission-overlap-universe');
    const malformedRows = [
      { ...record, contentBytes: Number.NaN },
      { ...record, unexpected: undefined },
    ];

    for (const malformed of malformedRows) {
      expect(() => validateCalibrationAdmissionOverlapUniverseStream(universe, [malformed], registry)).not.toThrow();
      const validation = validateCalibrationAdmissionOverlapUniverseStream(universe, [malformed], registry);
      expect(validation.ok).toBe(false);
      expect(validation.errors).toContain('records cannot be serialized as canonical JSONL');
    }
  });

  it('uses exact rational Jaccard boundaries and integer size filters', () => {
    expect(isAdmissionOverlapJaccardAtLeast80(4, 5)).toBe(true);
    expect(isAdmissionOverlapJaccardAtLeast80(3, 4)).toBe(false);
    expect(isAdmissionOverlapJaccardAtLeast80(1, 1)).toBe(true);
    expect(isAdmissionOverlapJaccardAtLeast80(0, 0)).toBe(false);
    expect(isAdmissionOverlapJaccardAtLeast80(6, 5)).toBe(false);
    expect(admissionOverlapJaccard(4, 5)).toBeCloseTo(0.8);
    expect(Number.isNaN(admissionOverlapJaccard(0, 0))).toBe(true);
    expect(isAdmissionOverlapSizeCompatible(5, 4)).toBe(true);
    expect(isAdmissionOverlapSizeCompatible(5, 3)).toBe(false);
    expect(isAdmissionOverlapSizeCompatible(10, 8)).toBe(true);
  });
});
