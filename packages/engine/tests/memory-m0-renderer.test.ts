import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MEMORY_M0_PROFILE,
  type MemoryM0Request,
} from '../../core/src/memory-m0';
import {
  canonicalizeMemoryM0Json,
  compileMemoryM0Request,
  type MemoryM0ClaimKey,
  type MemoryM0Projection,
} from '../src/memory-m0-compiler';
import {
  MEMORY_M0_SLICE_C_LIMITS,
  renderMemoryM0Projection,
  type MemoryM0RenderAllResult,
} from '../src/memory-m0-renderer';

type VectorSource = Readonly<{
  registration: Readonly<{
    kind: MemoryM0Request['sources'][number]['kind'];
    path: string;
  }>;
  bytesBase64url: string;
}>;

type VectorFixture = Readonly<{
  fixtureId: string;
  sources: readonly VectorSource[];
}>;

type ExpectedArtifact = Readonly<{
  fixtureId: string;
  projection: MemoryM0Projection;
  renderAll: MemoryM0RenderAllResult;
}>;

type MemoryM0Vector = Readonly<{
  suite: Readonly<{ fixtures: readonly VectorFixture[] }>;
  expectedArtifacts: readonly ExpectedArtifact[];
}>;

const vector = JSON.parse(readFileSync(
  new URL('../../../docs/decisions/memorybrick-m0-benchmark-vector-v2.json', import.meta.url),
  'utf8',
)) as MemoryM0Vector;

function fixtureRequest(fixtureId: string): MemoryM0Request {
  const fixture = vector.suite.fixtures.find((candidate) => candidate.fixtureId === fixtureId);
  if (!fixture) throw new Error(`missing fixture ${fixtureId}`);
  return {
    profile: MEMORY_M0_PROFILE,
    sources: fixture.sources.map((source) => ({
      kind: source.registration.kind,
      path: source.registration.path,
      bytes: new Uint8Array(Buffer.from(source.bytesBase64url, 'base64url')),
    })),
  };
}

function compileFixture(fixtureId: string): MemoryM0Projection {
  const compiled = compileMemoryM0Request(fixtureRequest(fixtureId));
  expect(compiled).toMatchObject({ ok: true });
  if (!compiled.ok) throw new Error(compiled.error);
  return compiled.projection;
}

function expectedArtifact(fixtureId: string): ExpectedArtifact {
  const artifact = vector.expectedArtifacts.find((candidate) => candidate.fixtureId === fixtureId);
  if (!artifact) throw new Error(`missing expected artifact ${fixtureId}`);
  return artifact;
}

function expectRecursivelyFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectRecursivelyFrozen(child);
}

function factRow(assertion: MemoryM0Projection['assertions'][number]): string {
  return `${canonicalizeMemoryM0Json(assertion)}\n`;
}

function keyId(key: MemoryM0ClaimKey): string {
  return canonicalizeMemoryM0Json(key);
}

function collectDigestFields(value: unknown, fields: Set<string>): void {
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/sha256|digest/i.test(key)) fields.add(key);
    collectDigestFields(child, fields);
  }
}

describe('MemoryBrick M0 Slice C renderer', () => {
  it('matches all three exact single-app descriptive previews from one selection', () => {
    const rendered = renderMemoryM0Projection(compileFixture('single-app'));

    expect(rendered).toEqual(expectedArtifact('single-app').renderAll);
    expect(rendered.contexts.map((context) => context.target)).toEqual([
      'codex',
      'claude',
      'copilot',
    ]);
    expect(rendered.contexts.every(
      (context) => context.selectedKeys === rendered.contexts[0]?.selectedKeys,
    )).toBe(true);
    expect(rendered.contexts.every(
      (context) => context.omitted === rendered.selection.omitted,
    )).toBe(true);
    expectRecursivelyFrozen(rendered);
  });

  it('does not freeze or otherwise mutate caller-owned projection values', () => {
    const projection = structuredClone(expectedArtifact('single-app').projection);
    const firstAssertion = projection.assertions[0]!;
    const before = canonicalizeMemoryM0Json(projection);

    expect(Object.isFrozen(firstAssertion)).toBe(false);
    renderMemoryM0Projection(projection);

    expect(canonicalizeMemoryM0Json(projection)).toBe(before);
    expect(Object.isFrozen(firstAssertion)).toBe(false);
    expect(Object.isFrozen(firstAssertion.key)).toBe(false);
    expect(Object.isFrozen(firstAssertion.evidence[0])).toBe(false);
  });

  it('keeps complete rows within the shared 2048-byte payload and 4096-byte previews', () => {
    const projection = compileFixture('workspace-budget');
    const rendered = renderMemoryM0Projection(projection);
    const selectedRows = rendered.selection.selected.map(factRow);
    const payload = selectedRows.join('');

    expect(Buffer.byteLength(payload)).toBeLessThanOrEqual(
      MEMORY_M0_SLICE_C_LIMITS.maxFactRowBytes,
    );
    expect(rendered.selection.omitted.some(
      (omission) => omission.reason === 'payload-budget',
    )).toBe(true);
    for (const omission of rendered.selection.omitted) {
      if (omission.reason !== 'payload-budget') continue;
      const assertion = projection.assertions.find(
        (candidate) => keyId(candidate.key) === keyId(omission.key),
      );
      expect(assertion).toBeDefined();
      expect(Buffer.byteLength(payload + factRow(assertion!))).toBeGreaterThan(
        MEMORY_M0_SLICE_C_LIMITS.maxFactRowBytes,
      );
    }
    for (const context of rendered.contexts) {
      const fencedPayload = context.text.split('```json\n')[1]?.split('```\n')[0];
      expect(fencedPayload).toBe(payload);
      expect(context.bytes).toBe(Buffer.byteLength(context.text));
      expect(context.bytes).toBeLessThanOrEqual(MEMORY_M0_SLICE_C_LIMITS.maxPreviewBytes);
      expect(context.text.endsWith('\n')).toBe(true);
    }
    expect(rendered).toEqual(expectedArtifact('workspace-budget').renderAll);
  });

  it('omits conflicts without leaking either conflicting value', () => {
    const rendered = renderMemoryM0Projection(compileFixture('runtime-conflict'));
    const runtimeKey = canonicalizeMemoryM0Json([
      'repo.runtime-node',
      'repository',
      'repository',
      'singleton',
    ]);

    expect(rendered.selection.omitted.map((item) => [keyId(item.key), item.reason])).toContainEqual([
      runtimeKey,
      'conflict',
    ]);
    expect(rendered.selection.selected.some((item) => keyId(item.key) === runtimeKey)).toBe(false);
    for (const context of rendered.contexts) {
      expect(context.text).not.toContain('>=22 <25');
      expect(context.text).not.toContain('"<22"');
      expect(context.text).toContain('Facts may be omitted for conflict or payload budget.');
      expect(context.text).toContain('Native instructions remain authoritative.');
      expect(context.text).toContain('untrusted repository-controlled data');
    }
    expect(rendered).toEqual(expectedArtifact('runtime-conflict').renderAll);
  });

  it('reconstructs every rendered-text SHA-256 from its exact UTF-8 preimage', () => {
    const projection = compileFixture('single-app');
    const rendered = renderMemoryM0Projection(projection);
    const digestFields = new Set<string>();

    for (const context of rendered.contexts) {
      expect(context.textSha256).toBe(
        createHash('sha256').update(Buffer.from(context.text, 'utf8')).digest('hex'),
      );
    }
    collectDigestFields({ projection, rendered }, digestFields);
    expect([...digestFields].sort()).toEqual([
      'contentSha256',
      'projectionSha256',
      'registrySha256',
      'textSha256',
    ]);
  });

  it('returns values only and adds no filesystem, provider, process, or public surface', () => {
    const rendererSource = readFileSync(
      new URL('../src/memory-m0-renderer.ts', import.meta.url),
      'utf8',
    );
    const publicSurface = [
      readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../src/pure.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ].join('\n');

    expect(rendererSource).not.toMatch(
      /['"]node:(?:fs|net|http|https|child_process|worker_threads|process)['"]|\bfetch\s*\(|\bprocess\.|\bconsole\.|Math\.random|Date\s*\(/,
    );
    expect(rendererSource).not.toMatch(/AGENTS\.md|CLAUDE\.md|copilot-instructions/);
    expect(publicSurface).not.toContain('memory-m0-renderer');
  });
});
