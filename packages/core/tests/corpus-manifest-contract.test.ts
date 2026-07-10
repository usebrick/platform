import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { isCalibrationCorpusManifestV103 } from '../src/corpus-manifest';

const root = fileURLToPath(new URL('..', import.meta.url));
const schemaPath = join(root, 'schemas', 'v1', 'calibration-corpus-manifest.schema.json');
const fixturePath = join(root, 'tests', 'fixtures', 'schema', 'valid', 'calibration-corpus-manifest.valid.json');
const invalidFixturePath = join(root, 'tests', 'fixtures', 'schema', 'invalid', 'calibration-corpus-manifest.invalid.json');
const semanticInvalidFixturePath = join(root, 'tests', 'fixtures', 'schema', 'semantic-invalid', 'calibration-corpus-manifest.semantic-invalid.json');

function fixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<string, unknown>;
}

describe('v10.3 calibration corpus manifest contract', () => {
  it('accepts a fully traceable immutable manifest through schema and runtime validation', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const manifest = fixture();

    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(isCalibrationCorpusManifestV103(manifest)).toBe(true);
  });

  it('rejects mutable revisions and an AI label without a complete traceable evidence record', () => {
    const manifest = fixture();
    const repositories = manifest.repositories as Array<Record<string, unknown>>;
    repositories[0]!.commitSha = 'main';
    const files = manifest.files as Array<Record<string, unknown>>;
    files[0]!.evidence = { kind: 'manual_protocol', reference: 'https://example.test/protocol' };

    expect(isCalibrationCorpusManifestV103(manifest)).toBe(false);
  });

  it('rejects the invalid fixture through the authoritative JSON Schema', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const invalid = JSON.parse(readFileSync(invalidFixturePath, 'utf8')) as unknown;

    expect(validate(invalid)).toBe(false);
  });

  it('rejects schema-unknown fields in the pure runtime guard', () => {
    const manifest = fixture();
    manifest.unreviewedShortcut = true;

    expect(isCalibrationCorpusManifestV103(manifest)).toBe(false);
  });

  it('rejects silver evidence from validation or test splits through both schema and semantic verification', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    for (const split of ['validation', 'test']) {
      const manifest = fixture();
      const files = manifest.files as Array<Record<string, unknown>>;
      files[0]!.tier = 'silver';
      files[0]!.split = split;

      expect(validate(manifest)).toBe(false);
      expect(isCalibrationCorpusManifestV103(manifest)).toBe(false);
    }
  });

  it('accepts a gold mixed record only in its separate mixed-evaluation stratum', () => {
    const manifest = fixture();
    const files = manifest.files as Array<Record<string, unknown>>;
    files[1] = { ...files[1], label: 'mixed', tier: 'gold', split: 'mixed_evaluation' };

    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(isCalibrationCorpusManifestV103(manifest)).toBe(true);
  });

  it('requires the semantic verifier after JSON Schema validation for derived source identity', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const manifest = JSON.parse(readFileSync(semanticInvalidFixturePath, 'utf8')) as unknown;

    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(isCalibrationCorpusManifestV103(manifest)).toBe(false);
  });

  it('requires an exclusion reason only for retained excluded records', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    const manifest = fixture();
    const files = manifest.files as Array<Record<string, unknown>>;
    files[0]!.split = 'excluded';

    expect(validate(manifest)).toBe(false);
    expect(isCalibrationCorpusManifestV103(manifest)).toBe(false);

    files[0]!.exclusionReason = 'generated fixture retained for exclusion accounting';
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(isCalibrationCorpusManifestV103(manifest)).toBe(true);

    files[0]!.split = 'train';
    expect(validate(manifest)).toBe(false);
    expect(isCalibrationCorpusManifestV103(manifest)).toBe(false);
  });

  it('does not treat an excluded record as a leakage cohort', () => {
    const manifest = fixture();
    const repositories = manifest.repositories as Array<Record<string, unknown>>;
    const files = manifest.files as Array<Record<string, unknown>>;
    repositories[1]!.familyId = files[0]!.familyId;
    files[1] = {
      ...files[1],
      familyId: files[0]!.familyId,
      clusterId: files[0]!.clusterId,
      split: 'excluded',
      exclusionReason: 'paired baseline retained for exclusion accounting'
    };

    expect(isCalibrationCorpusManifestV103(manifest)).toBe(true);
  });

  it('still rejects eligible split crossings within a family or content cluster', () => {
    const manifest = fixture();
    const repositories = manifest.repositories as Array<Record<string, unknown>>;
    const files = manifest.files as Array<Record<string, unknown>>;
    repositories[1]!.familyId = files[0]!.familyId;
    files[1] = {
      ...files[1],
      familyId: files[0]!.familyId,
      clusterId: files[0]!.clusterId,
      label: 'verified_ai',
      split: 'validation'
    };

    expect(isCalibrationCorpusManifestV103(manifest)).toBe(false);
  });

  it('rejects a family or content cluster that crosses verified human/AI labels', () => {
    const manifest = fixture();
    const files = manifest.files as Array<Record<string, unknown>>;
    const repositories = manifest.repositories as Array<Record<string, unknown>>;
    repositories[1]!.familyId = files[0]!.familyId;
    files[1] = {
      ...files[1],
      familyId: files[0]!.familyId,
      clusterId: files[0]!.clusterId,
      label: 'verified_human',
      tier: 'gold',
      evidence: { kind: 'manual_protocol', reference: 'https://example.test/human-review', protocolId: 'human-v1' },
    };

    expect(isCalibrationCorpusManifestV103(manifest)).toBe(false);
  });
});
