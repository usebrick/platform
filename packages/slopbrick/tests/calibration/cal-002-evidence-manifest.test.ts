import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import { canonicalArtifact } from '../../src/calibration/cal-002/contracts';
import {
  CAL002_EVIDENCE_ARTIFACT_NAMES,
  CAL002_EVIDENCE_MANIFEST_VERSION,
  buildCAL002EvidenceManifestV1,
  validateCAL002EvidenceManifestV1,
} from '../../src/calibration/cal-002/evidence-manifest';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, '../..');
const SCRIPT = join(PACKAGE_ROOT, 'scripts/cal/cal-002.ts');
const SCHEMA = join(PACKAGE_ROOT, 'src/calibration/cal-002/schemas/cal-002-evidence-manifest-v1.schema.json');
const SCHEMA_INDEX = join(PACKAGE_ROOT, 'src/calibration/cal-002/schemas/index.json');

function bytesFor(name: string): Buffer {
  return Buffer.from(canonicalArtifact({ artifact: name }).json, 'utf8');
}

function inputs() {
  return [...CAL002_EVIDENCE_ARTIFACT_NAMES]
    .reverse()
    .map((name) => ({ name, bytes: bytesFor(name) }));
}

function schemaValidator() {
  const schema = JSON.parse(readFileSync(SCHEMA, 'utf8'));
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema);
}

function run(root: string) {
  return spawnSync(process.execPath, [
    '--import', 'tsx', SCRIPT, 'manifest-v2',
    '--root', root,
    '--artifact-dir', 'artifacts',
    '--out', 'evidence-manifest-v1.json',
  ], { cwd: PACKAGE_ROOT, encoding: 'utf8' });
}

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'cal-002-evidence-manifest-'));
  mkdirSync(join(root, 'artifacts'));
  for (const name of CAL002_EVIDENCE_ARTIFACT_NAMES) {
    const path = join(root, 'artifacts', name);
    writeFileSync(path, bytesFor(name), { mode: 0o600 });
    chmodSync(path, 0o600);
  }
  return root;
}

describe('CAL-002 evidence manifest v1', () => {
  it('reduces the exact sorted 13-artifact set to one self-validating root', () => {
    const manifest = buildCAL002EvidenceManifestV1(inputs());
    expect(manifest.version).toBe(CAL002_EVIDENCE_MANIFEST_VERSION);
    expect(manifest.artifacts.map((entry) => entry.name)).toEqual(CAL002_EVIDENCE_ARTIFACT_NAMES);
    expect(manifest.artifacts).toHaveLength(13);
    expect(manifest.admitted).toBe(false);
    expect(manifest.applied).toBe(false);
    expect(manifest.evidenceRootSha256).toBe(canonicalArtifact({
      version: manifest.version,
      protocolVersion: manifest.protocolVersion,
      artifacts: manifest.artifacts,
      admitted: false,
      applied: false,
    }).sha256);
    expect(validateCAL002EvidenceManifestV1(manifest)).toEqual({ ok: true, errors: [] });
    const validateSchema = schemaValidator();
    expect(validateSchema(manifest), JSON.stringify(validateSchema.errors)).toBe(true);
    const index = JSON.parse(readFileSync(SCHEMA_INDEX, 'utf8')) as {
      schemas: readonly { readonly file: string; readonly version: string }[];
    };
    expect(index.schemas).toContainEqual({
      file: 'cal-002-evidence-manifest-v1.schema.json',
      version: CAL002_EVIDENCE_MANIFEST_VERSION,
    });
  });

  it('rejects missing, duplicate, reordered, drifted, open, admitted, or applied manifests', () => {
    expect(() => buildCAL002EvidenceManifestV1(inputs().slice(1))).toThrow(/exact.*artifact|13|missing/i);
    expect(() => buildCAL002EvidenceManifestV1([...inputs(), inputs()[0]!])).toThrow(/exact.*artifact|13|duplicate/i);

    const manifest = buildCAL002EvidenceManifestV1(inputs());
    const shapeMutations = [
      { ...structuredClone(manifest), artifacts: [...manifest.artifacts].reverse() },
      { ...structuredClone(manifest), evidenceRootSha256: 'A'.repeat(64) },
      { ...structuredClone(manifest), unexpected: true },
      { ...structuredClone(manifest), admitted: true },
      { ...structuredClone(manifest), applied: true },
    ];
    const validateSchema = schemaValidator();
    for (const mutation of shapeMutations) {
      expect(validateCAL002EvidenceManifestV1(mutation).ok).toBe(false);
      expect(validateSchema(mutation), JSON.stringify(validateSchema.errors)).toBe(false);
    }

    const semanticDrift = {
      ...structuredClone(manifest),
      artifacts: manifest.artifacts.map((entry, index) => (
        index === 0 ? { ...entry, sha256: 'a'.repeat(64) } : entry
      )),
    };
    expect(validateSchema(semanticDrift), JSON.stringify(validateSchema.errors)).toBe(true);
    expect(validateCAL002EvidenceManifestV1(semanticDrift).errors.join(' ')).toMatch(/evidenceRootSha256.*canonical/i);
  });

  it('writes and idempotently replays one private canonical manifest from exact leaf bytes', () => {
    const root = fixtureRoot();
    for (const name of CAL002_EVIDENCE_ARTIFACT_NAMES) chmodSync(join(root, 'artifacts', name), 0o644);
    const first = run(root);
    expect(first.status, first.stderr).toBe(0);
    const output = JSON.parse(first.stdout);
    expect(output).toMatchObject({
      ok: true,
      command: 'manifest-v2',
      status: 'completed',
      artifacts: 13,
      admitted: false,
      applied: false,
    });
    const manifestPath = join(root, 'evidence-manifest-v1.json');
    const firstBytes = readFileSync(manifestPath, 'utf8');
    expect(JSON.parse(firstBytes).evidenceRootSha256).toBe(output.evidenceRootSha256);

    const replay = run(root);
    expect(replay.status, replay.stderr).toBe(0);
    expect(readFileSync(manifestPath, 'utf8')).toBe(firstBytes);
  });

  it('fails closed when a leaf drifts after the immutable manifest is written', () => {
    const root = fixtureRoot();
    expect(run(root).status).toBe(0);
    const leaf = join(root, 'artifacts', CAL002_EVIDENCE_ARTIFACT_NAMES[0]!);
    writeFileSync(leaf, canonicalArtifact({ artifact: 'drifted' }).json, { mode: 0o600 });
    chmodSync(leaf, 0o600);
    const replay = run(root);
    expect(replay.status).toBe(2);
    expect(replay.stderr).toMatch(/different immutable|does not match|already exists/i);
  });
});
