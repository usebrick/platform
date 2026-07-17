import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ReleaseArchiveMaterialization } from '../src/index';
import {
  calibrationAdmissionBindingSha256,
  calibrationCorpusSourceId,
  isCalibrationCorpusManifestV103,
} from '../src/corpus-manifest';

const root = fileURLToPath(new URL('..', import.meta.url));
const schemaPath = join(root, 'schemas', 'v1', 'calibration-corpus-manifest.schema.json');
const fixturePath = join(root, 'tests', 'fixtures', 'schema', 'valid', 'calibration-corpus-manifest.valid.json');
const releaseFixturePath = join(root, 'tests', 'fixtures', 'schema', 'valid', 'calibration-corpus-manifest.release-archive.valid.json');
const invalidFixturePath = join(root, 'tests', 'fixtures', 'schema', 'invalid', 'calibration-corpus-manifest.invalid.json');
const semanticInvalidFixturePath = join(root, 'tests', 'fixtures', 'schema', 'semantic-invalid', 'calibration-corpus-manifest.semantic-invalid.json');
const releaseSemanticInvalidFixturePath = join(root, 'tests', 'fixtures', 'schema', 'semantic-invalid', 'calibration-corpus-manifest.release-archive.semantic-invalid.json');
const RELEASE_ASSET_SHA256 = 'c'.repeat(64);
const MAX_REPOSITORY_ID = 'r'.repeat(128);
const MAX_COMMIT_SHA = 'c'.repeat(64);
const MAX_NORMALIZED_PATH = 'p'.repeat(4096);

function fixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<string, unknown>;
}

function releaseFixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(releaseFixturePath, 'utf8')) as Record<string, unknown>;
}

function manifestSchemaValidator() {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

function releaseRepository(manifest: Record<string, unknown>): Record<string, unknown> {
  return (manifest.repositories as Array<Record<string, unknown>>)[0]!;
}

function releaseMaterialization(manifest: Record<string, unknown>): Record<string, unknown> {
  return releaseRepository(manifest).materialization as Record<string, unknown>;
}

function maximumGitManifest(): Record<string, unknown> {
  const manifest = fixture();
  const repository = (manifest.repositories as Array<Record<string, unknown>>)[0]!;
  const file = (manifest.files as Array<Record<string, unknown>>)[0]!;
  repository.repositoryId = MAX_REPOSITORY_ID;
  repository.commitSha = MAX_COMMIT_SHA;
  file.repositoryId = MAX_REPOSITORY_ID;
  file.normalizedPath = MAX_NORMALIZED_PATH;
  file.sourceId = calibrationCorpusSourceId(MAX_REPOSITORY_ID, MAX_COMMIT_SHA, MAX_NORMALIZED_PATH);
  return manifest;
}

function maximumReleaseManifest(): Record<string, unknown> {
  const manifest = releaseFixture();
  const repository = releaseRepository(manifest);
  const file = (manifest.files as Array<Record<string, unknown>>)[0]!;
  repository.repositoryId = MAX_REPOSITORY_ID;
  repository.commitSha = MAX_COMMIT_SHA;
  file.repositoryId = MAX_REPOSITORY_ID;
  file.normalizedPath = MAX_NORMALIZED_PATH;
  file.sourceId = calibrationCorpusSourceId(
    MAX_REPOSITORY_ID,
    MAX_COMMIT_SHA,
    MAX_NORMALIZED_PATH,
    repository.materialization as ReleaseArchiveMaterialization,
  );
  return manifest;
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

  it('preserves the canonical source identity of the existing Git-tree fixture', () => {
    const manifest = fixture();
    const repository = (manifest.repositories as Array<Record<string, unknown>>)[0]!;
    const file = (manifest.files as Array<Record<string, unknown>>)[0]!;

    expect(calibrationCorpusSourceId(
      repository.repositoryId as string,
      repository.commitSha as string,
      file.normalizedPath as string,
    )).toBe('paired-task-ai@0123456789abcdef0123456789abcdef01234567:src/app.ts');
    expect(file.sourceId).toBe('paired-task-ai@0123456789abcdef0123456789abcdef01234567:src/app.ts');
  });

  it.each(['v10.3.1', 'v10.3.2'])('accepts a complete release archive at method %s and derives its asset-backed source ID', (methodVersion) => {
    const manifest = releaseFixture();
    manifest.methodVersion = methodVersion;
    if (methodVersion === 'v10.3.2') {
      const binding: Record<string, unknown> = {
        version: 'v10.3-admission-manifest-binding-v1',
        verifiedContextSha256: 'a'.repeat(64),
        eligibilitySnapshotSha256: 'a'.repeat(64),
        censusSha256: 'a'.repeat(64),
        admissionRecordsSha256: 'a'.repeat(64),
        sourceReviewSetSha256: 'a'.repeat(64),
        witnessSha256: 'a'.repeat(64),
        searchResultBundleSha256: 'a'.repeat(64),
        searchResultPublicationCompletionSha256: 'a'.repeat(64),
        witnessReviewBundleSha256: 'a'.repeat(64),
        witnessReviewPublicationCompletionSha256: 'a'.repeat(64),
        witnessReviewReceiptSetSha256: 'a'.repeat(64),
        evidenceIndexSha256: 'a'.repeat(64),
        evidencePayloadSetSha256: 'a'.repeat(64),
        evidenceReceiptSetSha256: 'a'.repeat(64),
        toolProfileSetSha256: 'a'.repeat(64),
        toolReceiptSetSha256: 'a'.repeat(64),
        blindReviewReceiptSetSha256: 'a'.repeat(64),
        temporalAttestationSetSha256: 'a'.repeat(64),
        materializationReceiptSetSha256: 'a'.repeat(64),
        prerequisiteBundleSha256: 'a'.repeat(64),
        manifestBuilderBehaviorSha256: 'a'.repeat(64),
        packedRuntimeReceiptSetSha256: 'a'.repeat(64),
        bindingSha256: '',
      };
      binding.bindingSha256 = calibrationAdmissionBindingSha256(binding);
      manifest.admissionBinding = binding;
      for (const file of manifest.files as Array<Record<string, unknown>>) {
        file.admissionRecordId = 'admission-record-1';
        file.materializationId = 'materialization-1';
      }
    }
    const repository = releaseRepository(manifest);
    const file = (manifest.files as Array<Record<string, unknown>>)[0]!;
    const validate = manifestSchemaValidator();

    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(isCalibrationCorpusManifestV103(manifest)).toBe(true);
    expect(calibrationCorpusSourceId(
      repository.repositoryId as string,
      repository.commitSha as string,
      file.normalizedPath as string,
      repository.materialization as ReleaseArchiveMaterialization,
    )).toBe(`evalplus-release@${'d'.repeat(40)}+asset-${RELEASE_ASSET_SHA256}:data/humaneval/0.py`);
    expect(file.sourceId).toBe(`evalplus-release@${'d'.repeat(40)}+asset-${RELEASE_ASSET_SHA256}:data/humaneval/0.py`);
  });

  it('requires method v10.3.1 or later for a release archive after schema validation', () => {
    const manifest = JSON.parse(readFileSync(releaseSemanticInvalidFixturePath, 'utf8')) as unknown;
    const validate = manifestSchemaValidator();

    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(isCalibrationCorpusManifestV103(manifest)).toBe(false);
  });

  it('requires a self-hashed admission binding and per-file identities for v10.3.2', () => {
    const manifest = releaseFixture();
    manifest.methodVersion = 'v10.3.2';
    const validate = manifestSchemaValidator();

    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(isCalibrationCorpusManifestV103(manifest)).toBe(false);

    const binding: Record<string, unknown> = {
      version: 'v10.3-admission-manifest-binding-v1',
      verifiedContextSha256: 'a'.repeat(64), eligibilitySnapshotSha256: 'a'.repeat(64), censusSha256: 'a'.repeat(64),
      admissionRecordsSha256: 'a'.repeat(64), sourceReviewSetSha256: 'a'.repeat(64), witnessSha256: 'a'.repeat(64),
      searchResultBundleSha256: 'a'.repeat(64), searchResultPublicationCompletionSha256: 'a'.repeat(64),
      witnessReviewBundleSha256: 'a'.repeat(64), witnessReviewPublicationCompletionSha256: 'a'.repeat(64), witnessReviewReceiptSetSha256: 'a'.repeat(64),
      evidenceIndexSha256: 'a'.repeat(64), evidencePayloadSetSha256: 'a'.repeat(64), evidenceReceiptSetSha256: 'a'.repeat(64),
      toolProfileSetSha256: 'a'.repeat(64), toolReceiptSetSha256: 'a'.repeat(64), blindReviewReceiptSetSha256: 'a'.repeat(64),
      temporalAttestationSetSha256: 'a'.repeat(64), materializationReceiptSetSha256: 'a'.repeat(64), prerequisiteBundleSha256: 'a'.repeat(64),
      manifestBuilderBehaviorSha256: 'a'.repeat(64), packedRuntimeReceiptSetSha256: 'a'.repeat(64), bindingSha256: '',
    };
    binding.bindingSha256 = calibrationAdmissionBindingSha256(binding);
    manifest.admissionBinding = binding;
    for (const file of manifest.files as Array<Record<string, unknown>>) {
      file.admissionRecordId = 'admission-record-1';
      file.materializationId = 'materialization-1';
    }
    expect(isCalibrationCorpusManifestV103(manifest)).toBe(true);

    (manifest.admissionBinding as Record<string, unknown>).bindingSha256 = 'b'.repeat(64);
    expect(isCalibrationCorpusManifestV103(manifest)).toBe(false);
  });

  it('rejects a non-null admission binding on a legacy method', () => {
    const manifest = fixture();
    manifest.admissionBinding = null;
    expect(isCalibrationCorpusManifestV103(manifest)).toBe(true);
    manifest.admissionBinding = { version: 'v10.3-admission-manifest-binding-v1' };
    expect(isCalibrationCorpusManifestV103(manifest)).toBe(false);
  });

  it('rejects a JSON array that string-coerces to a valid method version', () => {
    const manifest = releaseFixture();
    manifest.methodVersion = ['v10.3.1'];
    const validate = manifestSchemaValidator();

    expect([
      validate(manifest),
      isCalibrationCorpusManifestV103(manifest),
    ]).toEqual([false, false]);
  });

  it.each([
    ['missing kind', (materialization: Record<string, unknown>) => { delete materialization.kind; }],
    ['missing asset URL', (materialization: Record<string, unknown>) => { delete materialization.assetUrl; }],
    ['missing asset digest', (materialization: Record<string, unknown>) => { delete materialization.assetSha256; }],
    ['missing byte size', (materialization: Record<string, unknown>) => { delete materialization.assetBytes; }],
    ['missing archive format', (materialization: Record<string, unknown>) => { delete materialization.archiveFormat; }],
    ['missing root prefix', (materialization: Record<string, unknown>) => { delete materialization.rootPrefix; }],
    ['missing extraction policy', (materialization: Record<string, unknown>) => { delete materialization.extractionPolicy; }],
    ['HTTP asset URL', (materialization: Record<string, unknown>) => { materialization.assetUrl = 'http://example.test/evalplus.zip'; }],
    ['local file URL', (materialization: Record<string, unknown>) => { materialization.assetUrl = 'file:///tmp/evalplus.zip'; }],
    ['local path', (materialization: Record<string, unknown>) => { materialization.assetUrl = '/tmp/evalplus.zip'; }],
    ['zero byte size', (materialization: Record<string, unknown>) => { materialization.assetBytes = 0; }],
    ['unsafe byte size', (materialization: Record<string, unknown>) => { materialization.assetBytes = Number.MAX_SAFE_INTEGER + 1; }],
    ['fractional byte size', (materialization: Record<string, unknown>) => { materialization.assetBytes = 1.5; }],
    ['empty root prefix', (materialization: Record<string, unknown>) => { materialization.rootPrefix = ''; }],
    ['current-directory root prefix', (materialization: Record<string, unknown>) => { materialization.rootPrefix = '.'; }],
    ['traversing root prefix', (materialization: Record<string, unknown>) => { materialization.rootPrefix = '../evalplus'; }],
    ['absolute root prefix', (materialization: Record<string, unknown>) => { materialization.rootPrefix = '/evalplus'; }],
    ['backslash root prefix', (materialization: Record<string, unknown>) => { materialization.rootPrefix = 'evalplus\\src'; }],
    ['overlong root prefix', (materialization: Record<string, unknown>) => { materialization.rootPrefix = 'a'.repeat(4097); }],
    ['unknown archive format', (materialization: Record<string, unknown>) => { materialization.archiveFormat = 'tar'; }],
    ['unknown extraction policy', (materialization: Record<string, unknown>) => { materialization.extractionPolicy = 'safe-zip-v2'; }],
    ['uppercase asset digest', (materialization: Record<string, unknown>) => { materialization.assetSha256 = 'C'.repeat(64); }],
    ['array-wrapped asset digest', (materialization: Record<string, unknown>) => { materialization.assetSha256 = [RELEASE_ASSET_SHA256]; }],
    ['leading current-directory root segment', (materialization: Record<string, unknown>) => { materialization.rootPrefix = './evalplus'; }],
    ['interior current-directory root segment', (materialization: Record<string, unknown>) => { materialization.rootPrefix = 'evalplus/./src'; }],
    ['unknown key', (materialization: Record<string, unknown>) => { materialization.unreviewedShortcut = true; }],
  ])('rejects a release archive with %s through schema and semantic validation', (_name, mutate) => {
    const manifest = releaseFixture();
    mutate(releaseMaterialization(manifest));
    const validate = manifestSchemaValidator();

    expect([
      validate(manifest),
      isCalibrationCorpusManifestV103(manifest),
    ]).toEqual([false, false]);
  });

  it.each([
    ['Git tree', maximumGitManifest, 4290],
    ['release archive', maximumReleaseManifest, 4361],
  ])('accepts the maximum canonical %s source identity', (_kind, buildManifest, expectedSourceIdLength) => {
    const manifest = buildManifest();
    const file = (manifest.files as Array<Record<string, unknown>>)[0]!;
    const validate = manifestSchemaValidator();

    expect(file.sourceId).toHaveLength(expectedSourceIdLength);
    expect([
      validate(manifest),
      isCalibrationCorpusManifestV103(manifest),
    ]).toEqual([true, true]);
  });

  it('rejects a 4362-character source ID specifically at the schema maximum', () => {
    const manifest = maximumReleaseManifest();
    const file = (manifest.files as Array<Record<string, unknown>>)[0]!;
    file.sourceId = `${file.sourceId as string}x`;
    const validate = manifestSchemaValidator();

    expect(file.sourceId).toHaveLength(4362);
    expect(validate(manifest)).toBe(false);
    expect(validate.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        instancePath: '/files/0/sourceId',
        keyword: 'maxLength',
        params: { limit: 4361 },
      }),
    ]));
    expect(isCalibrationCorpusManifestV103(manifest)).toBe(false);
  });

  it('allows repositories to share an immutable commit only when repository IDs remain distinct', () => {
    const manifest = releaseFixture();
    const repositories = manifest.repositories as Array<Record<string, unknown>>;
    const files = manifest.files as Array<Record<string, unknown>>;
    const originalRepository = repositories[0]!;
    const originalFile = files[0]!;
    const siblingRepository = {
      ...originalRepository,
      repositoryId: 'evalplus-release-2',
      materialization: { ...releaseMaterialization(manifest) },
    };
    const siblingMaterialization = siblingRepository.materialization as unknown as ReleaseArchiveMaterialization;
    const siblingFile = {
      ...originalFile,
      repositoryId: siblingRepository.repositoryId,
      sourceId: calibrationCorpusSourceId(
        siblingRepository.repositoryId,
        originalRepository.commitSha as string,
        originalFile.normalizedPath as string,
        siblingMaterialization,
      ),
    };
    const originalRepositoryAuthority = { ...originalRepository };
    const siblingRepositoryAuthority = { ...siblingRepository } as Record<string, unknown>;
    delete originalRepositoryAuthority.repositoryId;
    delete siblingRepositoryAuthority.repositoryId;
    expect(siblingRepositoryAuthority).toEqual(originalRepositoryAuthority);
    const originalFileAuthority = { ...originalFile };
    const siblingFileAuthority = { ...siblingFile } as Record<string, unknown>;
    delete originalFileAuthority.repositoryId;
    delete originalFileAuthority.sourceId;
    delete siblingFileAuthority.repositoryId;
    delete siblingFileAuthority.sourceId;
    expect(siblingFileAuthority).toEqual(originalFileAuthority);
    repositories.push(siblingRepository);
    files.push(siblingFile);

    expect(isCalibrationCorpusManifestV103(manifest)).toBe(true);
  });

  it('rejects a repeated repository ID even when another repository field differs', () => {
    const manifest = releaseFixture();
    const repositories = manifest.repositories as Array<Record<string, unknown>>;
    repositories.unshift({
      ...repositories[0]!,
      familyId: 'different-family',
      materialization: { ...releaseMaterialization(manifest) },
    });

    expect(isCalibrationCorpusManifestV103(manifest)).toBe(false);
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

  it('allows a verified human/AI pair group when every eligible record stays in one split', () => {
    const manifest = fixture();
    const files = manifest.files as Array<Record<string, unknown>>;
    files[0]!.pairGroupId = 'task-42';
    files[1]!.pairGroupId = 'task-42';

    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(isCalibrationCorpusManifestV103(manifest)).toBe(true);
  });

  it('rejects a pair group when eligible records cross splits', () => {
    const manifest = fixture();
    const files = manifest.files as Array<Record<string, unknown>>;
    files[0]!.pairGroupId = 'task-42';
    files[1]!.pairGroupId = 'task-42';
    files[1]!.split = 'validation';

    expect(isCalibrationCorpusManifestV103(manifest)).toBe(false);
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
