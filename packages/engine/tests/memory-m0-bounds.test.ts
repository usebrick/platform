import { describe, expect, it } from 'vitest';
import {
  MEMORY_M0_PROFILE,
  MEMORY_M0_REGISTRY,
  type MemoryM0Request,
} from '../../core/src/memory-m0';
import {
  canonicalizeMemoryM0Json,
  compileMemoryM0Request,
  MEMORY_M0_SLICE_B_BOUNDS,
} from '../src/memory-m0-compiler';

const encoder = new TextEncoder();

function source(
  kind: MemoryM0Request['sources'][number]['kind'],
  path: string,
  value: Record<string, unknown>,
): MemoryM0Request['sources'][number] {
  return { kind, path, bytes: encoder.encode(JSON.stringify(value)) };
}

describe('MemoryBrick M0 Slice B static bounds', () => {
  it('pins the mechanical candidate and projection proof to registry caps', () => {
    expect(MEMORY_M0_SLICE_B_BOUNDS).toEqual({
      maxRootCandidates: 7,
      maxPackageCandidates: 2,
      maxPackageManifests: 64,
      maxCandidates: 135,
      emptyProjectionEnvelopeBytes: 282,
      emptyArrayBytes: 6,
      maxSourceRowsBytes: 44_201,
      maxCandidateRowsBytes: 190_891,
      projectionArraySeparators: 2,
      conservativeProjectionBytes: 235_370,
      maxProjectionBytes: 262_144,
    });
    expect(MEMORY_M0_SLICE_B_BOUNDS.maxCandidates).toBe(
      MEMORY_M0_SLICE_B_BOUNDS.maxRootCandidates
        + (MEMORY_M0_SLICE_B_BOUNDS.maxPackageManifests
          * MEMORY_M0_SLICE_B_BOUNDS.maxPackageCandidates),
    );
    expect(MEMORY_M0_SLICE_B_BOUNDS.conservativeProjectionBytes).toBe(
      MEMORY_M0_SLICE_B_BOUNDS.emptyProjectionEnvelopeBytes
        - MEMORY_M0_SLICE_B_BOUNDS.emptyArrayBytes
        + MEMORY_M0_SLICE_B_BOUNDS.maxSourceRowsBytes
        + MEMORY_M0_SLICE_B_BOUNDS.maxCandidateRowsBytes
        + MEMORY_M0_SLICE_B_BOUNDS.projectionArraySeparators,
    );
    expect(MEMORY_M0_SLICE_B_BOUNDS.conservativeProjectionBytes).toBeLessThan(
      MEMORY_M0_SLICE_B_BOUNDS.maxProjectionBytes,
    );
    expect(MEMORY_M0_SLICE_B_BOUNDS.maxProjectionBytes).toBe(
      MEMORY_M0_REGISTRY.caps.maxProjectionBytes,
    );
    expect(Object.isFrozen(MEMORY_M0_SLICE_B_BOUNDS)).toBe(true);
  });

  it('constructs the exact 135-candidate admitted semantic maximum', () => {
    const root = source('root-package-json', 'package.json', {
      name: 'workspace-root',
      packageManager: 'pnpm@10.13.1',
      engines: { node: '>=22 <25' },
      scripts: {
        build: 'build',
        test: 'test',
        lint: 'lint',
        typecheck: 'typecheck',
      },
    });
    const packages = Array.from({ length: 64 }, (_, index) => source(
      'package-manifest',
      `packages/p${index}/package.json`,
      { name: `package-${index}`, engines: { node: '>=22 <25' } },
    ));
    const result = compileMemoryM0Request({
      profile: MEMORY_M0_PROFILE,
      sources: [root, ...packages],
    });

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    const assertionEvidence = result.projection.assertions.reduce(
      (total, assertion) => total + assertion.evidence.length,
      0,
    );
    const conflictEvidence = result.projection.conflicts.reduce(
      (total, conflict) => total + conflict.variants.reduce(
        (variantTotal, variant) => variantTotal + variant.evidence.length,
        0,
      ),
      0,
    );
    const projectionBytes = encoder.encode(canonicalizeMemoryM0Json(result.projection)).byteLength;

    expect(assertionEvidence + conflictEvidence).toBe(135);
    expect(result.projection.assertions).toHaveLength(71);
    expect(result.projection.conflicts).toEqual([]);
    expect(projectionBytes).toBeLessThan(MEMORY_M0_SLICE_B_BOUNDS.maxProjectionBytes);
  });
});
