import { createHash } from 'node:crypto';

import { canonicalArtifact } from './contracts';
import { CAL002_PROTOCOL_VERSION_V2 } from './contracts-v2';

export const CAL002_EVIDENCE_MANIFEST_VERSION = 'cal-002-evidence-manifest-v1' as const;

export const CAL002_EVIDENCE_ARTIFACT_NAMES = Object.freeze([
  'authority-proposal-v2.json',
  'authority-receipt-v2.json',
  'catalog.json',
  'final-matrix-v2.json',
  'matrix-approval-v2.json',
  'oracle-receipt-v1.json',
  'oracle-receipt-v2.json',
  'origin-receipt-v2.json',
  'parity-db-sql-concat-v2.json',
  'parity-logic-math-any-density-v2.json',
  'parity-logic-math-console-log-storm-v2.json',
  'quality-disposition-v2.json',
  'supersession-receipt-v2.json',
] as const);

export type CAL002EvidenceArtifactName = typeof CAL002_EVIDENCE_ARTIFACT_NAMES[number];

export interface CAL002EvidenceArtifactInputV1 {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface CAL002EvidenceArtifactV1 {
  readonly name: CAL002EvidenceArtifactName;
  readonly bytes: number;
  readonly sha256: string;
}

export interface CAL002EvidenceManifestV1 {
  readonly version: typeof CAL002_EVIDENCE_MANIFEST_VERSION;
  readonly protocolVersion: typeof CAL002_PROTOCOL_VERSION_V2;
  readonly artifacts: readonly CAL002EvidenceArtifactV1[];
  readonly evidenceRootSha256: string;
  readonly admitted: false;
  readonly applied: false;
}

export interface CAL002EvidenceManifestValidation {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

const SHA256 = /^[a-f0-9]{64}$/u;
const TOP_LEVEL_KEYS = [
  'version',
  'protocolVersion',
  'artifacts',
  'evidenceRootSha256',
  'admitted',
  'applied',
] as const;
const ARTIFACT_KEYS = ['name', 'bytes', 'sha256'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && [...expected].sort().every((key, index) => actual[index] === key);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function manifestBody(value: Pick<CAL002EvidenceManifestV1,
  'version' | 'protocolVersion' | 'artifacts' | 'admitted' | 'applied'>) {
  return {
    version: value.version,
    protocolVersion: value.protocolVersion,
    artifacts: value.artifacts,
    admitted: value.admitted,
    applied: value.applied,
  };
}

export function cal002EvidenceRootSha256(
  value: Pick<CAL002EvidenceManifestV1,
    'version' | 'protocolVersion' | 'artifacts' | 'admitted' | 'applied'>,
): string {
  return canonicalArtifact(manifestBody(value)).sha256;
}

export function buildCAL002EvidenceManifestV1(
  inputs: readonly CAL002EvidenceArtifactInputV1[],
): CAL002EvidenceManifestV1 {
  const byName = new Map<string, Uint8Array>();
  for (const input of inputs) {
    if (!(input.bytes instanceof Uint8Array)) throw new TypeError(`CAL-002 evidence artifact ${input.name} bytes are invalid`);
    if (byName.has(input.name)) throw new TypeError(`CAL-002 evidence manifest has duplicate artifact ${input.name}`);
    byName.set(input.name, input.bytes);
  }
  const expected = new Set<string>(CAL002_EVIDENCE_ARTIFACT_NAMES);
  const unknown = [...byName.keys()].filter((name) => !expected.has(name));
  const missing = CAL002_EVIDENCE_ARTIFACT_NAMES.filter((name) => !byName.has(name));
  if (inputs.length !== CAL002_EVIDENCE_ARTIFACT_NAMES.length || unknown.length > 0 || missing.length > 0) {
    throw new TypeError(
      `CAL-002 evidence manifest requires the exact 13-artifact set; missing=${missing.join(',') || 'none'}; unknown=${unknown.join(',') || 'none'}`,
    );
  }
  const artifacts = CAL002_EVIDENCE_ARTIFACT_NAMES.map((name) => {
    const bytes = byName.get(name)!;
    return { name, bytes: bytes.byteLength, sha256: sha256(bytes) };
  });
  const body = {
    version: CAL002_EVIDENCE_MANIFEST_VERSION,
    protocolVersion: CAL002_PROTOCOL_VERSION_V2,
    artifacts,
    admitted: false,
    applied: false,
  } as const;
  return { ...body, evidenceRootSha256: cal002EvidenceRootSha256(body) };
}

export function validateCAL002EvidenceManifestV1(value: unknown): CAL002EvidenceManifestValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['manifest must be an object'] };
  if (!hasExactKeys(value, TOP_LEVEL_KEYS)) errors.push('manifest has missing or unknown fields');
  if (value.version !== CAL002_EVIDENCE_MANIFEST_VERSION) errors.push('version must be cal-002-evidence-manifest-v1');
  if (value.protocolVersion !== CAL002_PROTOCOL_VERSION_V2) errors.push('protocolVersion must be CAL-002-v2');
  if (value.admitted !== false) errors.push('admitted must be false');
  if (value.applied !== false) errors.push('applied must be false');
  if (typeof value.evidenceRootSha256 !== 'string' || !SHA256.test(value.evidenceRootSha256)) {
    errors.push('evidenceRootSha256 must be a lowercase SHA-256');
  }

  if (!Array.isArray(value.artifacts) || value.artifacts.length !== CAL002_EVIDENCE_ARTIFACT_NAMES.length) {
    errors.push('artifacts must contain the exact 13-artifact set');
  } else {
    value.artifacts.forEach((entry, index) => {
      const expectedName = CAL002_EVIDENCE_ARTIFACT_NAMES[index]!;
      if (!isRecord(entry)) {
        errors.push(`artifacts[${index}] must be an object`);
        return;
      }
      if (!hasExactKeys(entry, ARTIFACT_KEYS)) errors.push(`artifacts[${index}] has missing or unknown fields`);
      if (entry.name !== expectedName) errors.push(`artifacts[${index}].name must be ${expectedName}`);
      if (!Number.isSafeInteger(entry.bytes) || Number(entry.bytes) < 1) {
        errors.push(`artifacts[${index}].bytes must be a positive safe integer`);
      }
      if (typeof entry.sha256 !== 'string' || !SHA256.test(entry.sha256)) {
        errors.push(`artifacts[${index}].sha256 must be a lowercase SHA-256`);
      }
    });
  }

  if (errors.length === 0) {
    try {
      const recomputed = canonicalArtifact({
        version: value.version,
        protocolVersion: value.protocolVersion,
        artifacts: value.artifacts,
        admitted: value.admitted,
        applied: value.applied,
      }).sha256;
      if (recomputed !== value.evidenceRootSha256) {
        errors.push('evidenceRootSha256 does not match the canonical manifest body');
      }
    } catch {
      errors.push('evidenceRootSha256 cannot be recomputed');
    }
  }
  return { ok: errors.length === 0, errors };
}

export function assertCAL002EvidenceManifestV1(value: unknown): asserts value is CAL002EvidenceManifestV1 {
  const result = validateCAL002EvidenceManifestV1(value);
  if (!result.ok) throw new TypeError(`Invalid CAL-002 evidence manifest v1: ${result.errors.join('; ')}`);
}
