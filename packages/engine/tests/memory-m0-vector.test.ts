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
  renderMemoryM0Projection,
  type MemoryM0RenderAllResult,
  type MemoryM0RenderTarget,
} from '../src/memory-m0-renderer';

type VectorTask = Readonly<{
  taskId: string;
  class: 'architecture' | 'build' | 'test';
  requiredKeys: readonly MemoryM0ClaimKey[];
  forbiddenKeys: readonly MemoryM0ClaimKey[];
}>;

type VectorNativeContext = Readonly<{
  target: MemoryM0RenderTarget;
  bytesBase64url: string;
  evidence: readonly Readonly<{ key: MemoryM0ClaimKey }>[];
}>;

type VectorFixture = Readonly<{
  fixtureId: string;
  sources: readonly Readonly<{
    registration: Readonly<{
      kind: MemoryM0Request['sources'][number]['kind'];
      path: string;
    }>;
    bytesBase64url: string;
  }>[];
  nativeContexts: readonly VectorNativeContext[];
  tasks: readonly VectorTask[];
}>;

type BenchmarkCell = Readonly<{
  fixtureId: string;
  taskId: string;
  class: VectorTask['class'];
  target: MemoryM0RenderTarget;
  required: number;
  nativeCovered: number;
  memoryCovered: number;
  nativeMissing: readonly MemoryM0ClaimKey[];
  memoryMissing: readonly MemoryM0ClaimKey[];
  forbiddenExposed: readonly MemoryM0ClaimKey[];
  improved: boolean;
}>;

type BenchmarkResult = Readonly<{
  profile: 'memory-m0-offline-benchmark-v2';
  registryProfile: 'memory-m0-registry-v2';
  fixtures: 3;
  tasks: 9;
  cells: readonly BenchmarkCell[];
  summary: Readonly<{
    cells: 27;
    improvedCells: number;
    improvedTargets: readonly MemoryM0RenderTarget[];
    nativeCovered: number;
    memoryCovered: number;
    forbiddenExposed: number;
  }>;
  result: 'pass' | 'fail';
  invalidReason: null;
}>;

type MemoryM0Vector = Readonly<{
  profile: 'memory-m0-benchmark-vector-v2';
  registrySha256: string;
  requirements: Readonly<{
    fixtureIds: readonly string[];
    taskClasses: readonly VectorTask['class'][];
    requiredPredicateIds: readonly string[];
    nonemptyForbiddenKeys: true;
    nonemptyNativeEvidence: true;
    requiresConflictOmission: true;
    requiresPayloadBudgetOmission: true;
    requiresExactArtifacts: true;
  }>;
  suite: Readonly<{
    profile: 'memory-m0-offline-suite-v2';
    fixtures: readonly VectorFixture[];
  }>;
  expectedArtifacts: readonly Readonly<{
    fixtureId: string;
    projection: MemoryM0Projection;
    renderAll: MemoryM0RenderAllResult;
  }>[];
  expectedResult: BenchmarkResult;
}>;

const vectorUrl = new URL(
  '../../../docs/decisions/memorybrick-m0-benchmark-vector-v2.json',
  import.meta.url,
);
const vectorBytes = readFileSync(vectorUrl);
const vector = JSON.parse(vectorBytes.toString('utf8')) as MemoryM0Vector;
const targets = ['codex', 'claude', 'copilot'] as const;
const fixtureIds = ['runtime-conflict', 'single-app', 'workspace-budget'] as const;
const taskClasses = ['architecture', 'build', 'test'] as const;
const predicateIds = [
  'repo.command',
  'repo.package-manager',
  'repo.package-manifest',
  'repo.runtime-node',
] as const;

function keyId(key: MemoryM0ClaimKey): string {
  return canonicalizeMemoryM0Json(key);
}

function missingKeys(
  expected: readonly MemoryM0ClaimKey[],
  present: ReadonlySet<string>,
): readonly MemoryM0ClaimKey[] {
  return expected.filter((key) => !present.has(keyId(key)));
}

function exposedKeys(
  forbidden: readonly MemoryM0ClaimKey[],
  present: ReadonlySet<string>,
): readonly MemoryM0ClaimKey[] {
  return forbidden.filter((key) => present.has(keyId(key)));
}

function compileFixture(fixture: VectorFixture): MemoryM0Projection {
  const result = compileMemoryM0Request({
    profile: MEMORY_M0_PROFILE,
    sources: fixture.sources.map((source) => ({
      kind: source.registration.kind,
      path: source.registration.path,
      bytes: new Uint8Array(Buffer.from(source.bytesBase64url, 'base64url')),
    })),
  });
  if (!result.ok) throw new Error(`fixture ${fixture.fixtureId}: ${result.error}`);
  return result.projection;
}

function evaluateCell(
  fixture: VectorFixture,
  task: VectorTask,
  target: MemoryM0RenderTarget,
  rendered: MemoryM0RenderAllResult,
): BenchmarkCell {
  const native = fixture.nativeContexts.find((context) => context.target === target);
  const context = rendered.contexts.find((candidate) => candidate.target === target);
  if (!native || !context) throw new Error(`missing ${target} context for ${fixture.fixtureId}`);
  const nativeKeys = new Set(native.evidence.map((item) => keyId(item.key)));
  const memoryKeys = new Set(context.selectedKeys.map(keyId));
  const nativeMissing = missingKeys(task.requiredKeys, nativeKeys);
  const memoryMissing = missingKeys(task.requiredKeys, memoryKeys);
  const forbiddenExposed = exposedKeys(task.forbiddenKeys, memoryKeys);
  const nativeCovered = task.requiredKeys.length - nativeMissing.length;
  const memoryCovered = task.requiredKeys.length - memoryMissing.length;
  return {
    fixtureId: fixture.fixtureId,
    taskId: task.taskId,
    class: task.class,
    target,
    required: task.requiredKeys.length,
    nativeCovered,
    memoryCovered,
    nativeMissing,
    memoryMissing,
    forbiddenExposed,
    improved: memoryCovered > nativeCovered
      && memoryMissing.length === 0
      && forbiddenExposed.length === 0,
  };
}

function runCommittedMemoryM0Vector(): Readonly<{
  result: BenchmarkResult;
  artifacts: readonly Readonly<{
    fixtureId: string;
    projection: MemoryM0Projection;
    renderAll: MemoryM0RenderAllResult;
  }>[];
}> {
  const artifacts = vector.suite.fixtures.map((fixture) => {
    const projection = compileFixture(fixture);
    return {
      fixtureId: fixture.fixtureId,
      projection,
      renderAll: renderMemoryM0Projection(projection),
    };
  });
  const cells = vector.suite.fixtures.flatMap((fixture, fixtureIndex) => (
    fixture.tasks.flatMap((task) => targets.map((target) => (
      evaluateCell(fixture, task, target, artifacts[fixtureIndex]!.renderAll)
    )))
  ));
  const improvedTargets = targets.filter((target) => (
    cells.filter((cell) => cell.target === target).every((cell) => cell.improved)
  ));
  const artifactsConform = canonicalizeMemoryM0Json(artifacts)
    === canonicalizeMemoryM0Json(vector.expectedArtifacts);
  const summary = {
    cells: 27 as const,
    improvedCells: cells.filter((cell) => cell.improved).length,
    improvedTargets,
    nativeCovered: cells.reduce((total, cell) => total + cell.nativeCovered, 0),
    memoryCovered: cells.reduce((total, cell) => total + cell.memoryCovered, 0),
    forbiddenExposed: cells.reduce((total, cell) => total + cell.forbiddenExposed.length, 0),
  };
  const result: BenchmarkResult = {
    profile: 'memory-m0-offline-benchmark-v2',
    registryProfile: 'memory-m0-registry-v2',
    fixtures: 3,
    tasks: 9,
    cells,
    summary,
    result: artifactsConform
      && summary.improvedCells === 27
      && summary.improvedTargets.length === 3
      && summary.forbiddenExposed === 0
      ? 'pass'
      : 'fail',
    invalidReason: null,
  };
  return Object.freeze({ artifacts: Object.freeze(artifacts), result: Object.freeze(result) });
}

describe('MemoryBrick M0 Slice C exact committed-vector harness', () => {
  it('admits exactly the committed 3-fixture, 9-task, 27-cell inventory', () => {
    const fixtures = vector.suite.fixtures;
    const tasks = fixtures.flatMap((fixture) => fixture.tasks);
    const cells = fixtures.flatMap((fixture) => (
      fixture.tasks.flatMap(() => fixture.nativeContexts)
    ));
    const requiredPredicates = new Set(tasks.flatMap((task) => (
      task.requiredKeys.map((key) => key[0])
    )));

    expect(vector.profile).toBe('memory-m0-benchmark-vector-v2');
    expect(vectorBytes.byteLength).toBeLessThanOrEqual(131_072);
    expect(vector.requirements).toEqual({
      fixtureIds,
      taskClasses,
      requiredPredicateIds: predicateIds,
      nonemptyForbiddenKeys: true,
      nonemptyNativeEvidence: true,
      requiresConflictOmission: true,
      requiresPayloadBudgetOmission: true,
      requiresExactArtifacts: true,
    });
    expect(fixtures.map((fixture) => fixture.fixtureId)).toEqual(fixtureIds);
    expect(fixtures.every((fixture) => (
      fixture.tasks.map((task) => task.class).every((value, index) => value === taskClasses[index])
      && fixture.tasks.every((task) => task.taskId === `${fixture.fixtureId}.${task.class}`)
      && fixture.nativeContexts.every((context, index) => context.target === targets[index])
    ))).toBe(true);
    expect(fixtures).toHaveLength(3);
    expect(tasks).toHaveLength(9);
    expect(cells).toHaveLength(27);
    expect(new Set(tasks.map((task) => task.taskId))).toHaveProperty('size', 9);
    expect(requiredPredicates).toEqual(new Set(predicateIds));
    expect(tasks.every(
      (task) => task.requiredKeys.length > 0 && task.forbiddenKeys.length > 0,
    )).toBe(true);
    expect(fixtures.every((fixture) => fixture.nativeContexts.every(
      (context) => context.evidence.length > 0 && context.bytesBase64url.length > 0,
    ))).toBe(true);
    expect(vector.expectedArtifacts).toHaveLength(3);
    expect(vector.expectedArtifacts.some((artifact) => artifact.renderAll.selection.omitted.some(
      (item) => item.reason === 'conflict',
    ))).toBe(true);
    expect(vector.expectedArtifacts.some((artifact) => artifact.renderAll.selection.omitted.some(
      (item) => item.reason === 'payload-budget',
    ))).toBe(true);
  });

  it('independently reconstructs every expected projection, preview, and reducer cell', () => {
    const evaluated = runCommittedMemoryM0Vector();

    expect(evaluated.artifacts).toEqual(vector.expectedArtifacts);
    expect(evaluated.result).toEqual(vector.expectedResult);
    expect(evaluated.result.cells).toHaveLength(27);
    expect(Buffer.byteLength(canonicalizeMemoryM0Json(evaluated.result))).toBeLessThan(131_072);
  });

  it('keeps the green-result claim at deterministic local fixture conformance only', () => {
    const evidence = readFileSync(
      new URL('../../../docs/execution/evidence/MEM-001-local-m0-slice-c.md', import.meta.url),
      'utf8',
    );
    const classification = evidence.split('\n').find((line) => (
      line.startsWith('Result classification:')
    ));
    const normalizedEvidence = evidence.replace(/\s+/g, ' ');

    expect(classification).toBe(
      'Result classification: `deterministic local fixture conformance`.',
    );
    expect(normalizedEvidence).toContain(
      'It is not evidence of coding-agent efficacy, real-repository improvement, inferred policy authority, market demand, release qualification, public availability, or a shipped MemoryBrick product.',
    );
    expect(evidence).not.toMatch(
      /\b(?:proves?|establishes?|validates?|demonstrates?)\s+(?:coding-agent efficacy|agent efficacy|real-repository improvement|market demand|release qualification)/i,
    );
    expect(evidence).not.toMatch(
      /\b(?:is|marks?)\s+(?:release-qualified|publicly available|a shipped MemoryBrick product)/i,
    );
  });

  it('does not expose a production or caller-authored benchmark evaluator', () => {
    const productionSurface = [
      readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../src/pure.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ].join('\n');

    expect(productionSurface).not.toMatch(/memory-m0-vector|evaluateMemoryM0|runMemoryM0/);
  });
});
