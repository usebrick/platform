import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  calibrationAdmissionAuthorityCurrentSha256,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionInputGenerationSha256,
  calibrationAdmissionSourceGenerationArtifactSetSha256,
  calibrationAdmissionSourceGenerationSha256,
  calibrationAdmissionSourceCurrentSha256,
  calibrationAdmissionStaticAuthorityGenerationSha256,
} from '@usebrick/core';

import { loadPrebuiltAdmissionAuthorityGraph } from '../../src/calibration/v103/admission-authority-rebuild-loader';
import {
  makeIndependentApprovalAuthorityFixture,
  makePrebuiltAuthorityFixture,
  type PrebuiltAuthorityGraphFixture,
} from './v103-admission-authority-rebuild-fixture';

const roots: string[] = [];

type Materialized = {
  readonly root: string;
  readonly request: {
    readonly projectRoot: string;
    readonly proposalPath: string;
    readonly inputGenerationPath: string;
    readonly priorCurrentPath?: string;
  };
  readonly unknownFile: string;
};

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(calibrationAdmissionCanonicalJson(value), 'utf8');
}

function casSourceFixture(): PrebuiltAuthorityGraphFixture {
  const fixture = makePrebuiltAuthorityFixture();
  const source = fixture.sources[0]!;
  const casBytes = Buffer.from('content-addressed bundle\n', 'utf8');
  const casSha256 = sha256(casBytes);
  const casPath = `evidence-cas/sha256/${casSha256.slice(0, 2)}/${casSha256}`;
  const sourceReviewArtifact = source.sourceGeneration.artifacts.find((artifact) => artifact.kind === 'source_review')!;
  const casArtifact = {
    pathBase: 'admission_root_content_addressed' as const,
    relativePath: casPath,
    kind: 'bundle' as const,
    bytes: casBytes.byteLength,
    sha256: casSha256,
  };
  const sourceArtifacts = [casArtifact, sourceReviewArtifact] as const;
  const sourceGenerationBody = {
    ...source.sourceGeneration,
    artifacts: sourceArtifacts,
    artifactSetSha256: calibrationAdmissionSourceGenerationArtifactSetSha256(sourceArtifacts),
  };
  const sourceGeneration = {
    ...sourceGenerationBody,
    generationSha256: calibrationAdmissionSourceGenerationSha256(sourceGenerationBody),
  };
  const sourceCurrentBody = {
    ...source.current,
    generationSha256: sourceGeneration.generationSha256,
    generationRelativePath: `sources/${source.sourceGeneration.sourceId}/generations/${sourceGeneration.generationSha256}`,
  };
  const sourceCurrent = {
    ...sourceCurrentBody,
    currentSha256: calibrationAdmissionSourceCurrentSha256(sourceCurrentBody),
  };
  const inputGenerationBody = {
    ...fixture.inputGeneration,
    sourceGenerations: fixture.inputGeneration.sourceGenerations.map((reference) => ({
      ...reference,
      generationSha256: sourceGeneration.generationSha256,
      artifactSetSha256: sourceGeneration.artifactSetSha256,
      relativePath: `review/admission/${sourceCurrent.generationRelativePath}`,
    })),
  };
  const inputGeneration = {
    ...inputGenerationBody,
    generationSha256: calibrationAdmissionInputGenerationSha256(inputGenerationBody),
  };
  const staticGenerationBody = {
    ...fixture.staticGeneration,
    inputGenerationSha256: inputGeneration.generationSha256,
  };
  const staticGeneration = {
    ...staticGenerationBody,
    generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(staticGenerationBody),
  };
  const currentBody = {
    ...fixture.current,
    staticGenerationSha256: staticGeneration.generationSha256,
    staticGenerationRelativePath: `review/admission/authority/static-generations/${staticGeneration.generationSha256}`,
  };
  const current = {
    ...currentBody,
    currentSha256: calibrationAdmissionAuthorityCurrentSha256(currentBody),
  };
  const sourceWithCas = {
    ...source,
    sourceGeneration,
    sourceGenerationBytes: canonicalBytes(sourceGeneration),
    current: sourceCurrent,
    currentBytes: canonicalBytes(sourceCurrent),
    artifactBytes: {
      'source-review.json': source.artifactBytes['source-review.json']!,
      [casPath]: casBytes,
    },
  };
  return {
    ...fixture,
    inputGeneration,
    inputGenerationBytes: canonicalBytes(inputGeneration),
    staticGeneration,
    staticGenerationBytes: canonicalBytes(staticGeneration),
    current,
    currentBytes: canonicalBytes(current),
    sources: [sourceWithCas],
  } as PrebuiltAuthorityGraphFixture;
}

async function materialize(fixture: PrebuiltAuthorityGraphFixture): Promise<Materialized> {
  const root = await mkdtemp(join(tmpdir(), 'slopbrick-prebuilt-authority-loader-'));
  roots.push(root);
  const admission = join(root, 'review', 'admission');
  const proposalPath = join(admission, 'authority', 'proposals', `${fixture.proposal.proposalId}.json`);
  const inputGenerationPath = join(admission, 'authority', 'input-generations', fixture.inputGeneration.generationSha256, 'generation.json');
  const currentPath = join(root, 'review', 'admission', 'authority', 'current.json');
  const staticDirectory = join(root, fixture.current.staticGenerationRelativePath);
  await mkdir(join(proposalPath, '..'), { recursive: true });
  await mkdir(join(inputGenerationPath, '..'), { recursive: true });
  await mkdir(staticDirectory, { recursive: true });
  await writeFile(proposalPath, fixture.proposalBytes);
  await writeFile(inputGenerationPath, fixture.inputGenerationBytes);
  await writeFile(currentPath, fixture.currentBytes);
  await writeFile(join(staticDirectory, 'generation.json'), fixture.staticGenerationBytes);
  for (const [relativePath, bytes] of Object.entries(fixture.inputGenerationArtifactBytes)) {
    await writeFile(join(inputGenerationPath, '..', relativePath), bytes);
  }
  for (const [relativePath, bytes] of Object.entries(fixture.staticGenerationArtifactBytes)) {
    await writeFile(join(staticDirectory, relativePath), bytes);
  }
  for (const source of fixture.sources) {
    const sourceCurrentPath = join(admission, 'sources', source.current.sourceId, 'current.json');
    const sourceDirectory = join(admission, source.current.generationRelativePath);
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(sourceCurrentPath, source.currentBytes);
    await writeFile(join(sourceDirectory, 'source-generation.json'), source.sourceGenerationBytes);
    await writeFile(join(sourceDirectory, 'source-review.json'), source.sourceReviewBytes);
    if (source.sourceProposal !== undefined && source.sourceProposalBytes !== undefined) {
      const sourceProposalPath = join(admission, 'sources', source.current.sourceId, 'proposals', `${source.sourceProposal.proposalId}.json`);
      await mkdir(join(sourceProposalPath, '..'), { recursive: true });
      await writeFile(sourceProposalPath, source.sourceProposalBytes);
    }
    if (source.approval !== undefined && source.approvalBytes !== undefined) {
      const approvalPath = join(admission, 'sources', source.current.sourceId, 'proposals', `${source.sourceGeneration.proposalId}-approval.json`);
      await mkdir(join(approvalPath, '..'), { recursive: true });
      await writeFile(approvalPath, source.approvalBytes);
    }
    for (const artifact of source.sourceGeneration.artifacts) {
      const bytes = source.artifactBytes[artifact.relativePath];
      if (bytes === undefined) throw new Error(`fixture is missing ${artifact.relativePath}`);
      const artifactPath = artifact.pathBase === 'generation_local'
        ? join(sourceDirectory, artifact.relativePath)
        : join(admission, artifact.relativePath);
      await mkdir(join(artifactPath, '..'), { recursive: true });
      await writeFile(artifactPath, bytes);
    }
  }
  const unknownFile = join(staticDirectory, 'unknown-preserved.txt');
  await writeFile(unknownFile, 'keep me\n', 'utf8');
  return {
    root,
    request: { projectRoot: root, proposalPath, inputGenerationPath },
    unknownFile,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('v10.3 prebuilt admission authority graph loader', () => {
  it('accepts a project-root spelling with normalization components while keeping selected paths strict', async () => {
    const materialized = await materialize(makePrebuiltAuthorityFixture());
    const leaf = materialized.root.split('/').at(-1)!;
    const result = await loadPrebuiltAdmissionAuthorityGraph({
      ...materialized.request,
      projectRoot: `${materialized.root}/../${leaf}`,
    });
    expect(result.ok).toBe(true);
  });

  it('loads and validates a materialized authority graph without discovering or mutating files', async () => {
    const materialized = await materialize(makePrebuiltAuthorityFixture());
    const before = await readFile(materialized.unknownFile);
    const result = await loadPrebuiltAdmissionAuthorityGraph(materialized.request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.graph.proposal.proposalId).toBe('input-proposal-genesis');
      expect(result.graph.sources[0]?.current.sourceId).toBe('source-a');
    }
    expect(await readFile(materialized.unknownFile)).toEqual(before);
  });

  it('strictly reopens source-generation proposal bytes when requested', async () => {
    const fixture = makePrebuiltAuthorityFixture();
    const materialized = await materialize(fixture);
    const strict = await loadPrebuiltAdmissionAuthorityGraph({
      ...materialized.request,
      requireSourceProposalBytes: true,
    });
    expect(strict.ok).toBe(true);
    if (strict.ok) {
      expect(strict.graph.sources[0]?.sourceProposal?.proposalId).toBe(fixture.sources[0]?.sourceProposal.proposalId);
      expect(strict.graph.sources[0]?.sourceProposalBytes).toEqual(fixture.sources[0]?.sourceProposalBytes);
    }

    const proposalPath = join(materialized.root, 'review', 'admission', 'sources', 'source-a', 'proposals', `${fixture.sources[0]!.sourceProposal.proposalId}.json`);
    await writeFile(proposalPath, '{}', 'utf8');
    const tampered = await loadPrebuiltAdmissionAuthorityGraph({
      ...materialized.request,
      requireSourceProposalBytes: true,
    });
    expect(tampered.ok).toBe(false);
    if (!tampered.ok) expect(tampered.errors.join('\n')).toMatch(/source-generation proposal|canonical|invalid/i);
  });

  it('strictly reopens independent-review approval bytes and rejects tampering', async () => {
    const fixture = makeIndependentApprovalAuthorityFixture();
    const materialized = await materialize(fixture);
    const strict = await loadPrebuiltAdmissionAuthorityGraph({
      ...materialized.request,
      requireSourceProposalBytes: true,
    });
    expect(strict.ok).toBe(true);
    if (strict.ok) {
      expect(strict.graph.sources[0]?.approval?.approvalId).toBe('source-a-approval');
      expect(strict.graph.sources[0]?.approvalBytes).toEqual(fixture.sources[0]?.approvalBytes);
    }

    const approvalPath = join(materialized.root, 'review', 'admission', 'sources', 'source-a', 'proposals', 'source-a-proposal-approval.json');
    await rm(approvalPath);
    const missing = await loadPrebuiltAdmissionAuthorityGraph({
      ...materialized.request,
      requireSourceProposalBytes: true,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.join('\n')).toMatch(/approval|missing/i);
    await writeFile(approvalPath, '{}', 'utf8');
    const tampered = await loadPrebuiltAdmissionAuthorityGraph({
      ...materialized.request,
      requireSourceProposalBytes: true,
    });
    expect(tampered.ok).toBe(false);
    if (!tampered.ok) expect(tampered.errors.join('\n')).toMatch(/approval|canonical|invalid/i);
  });

  it('reopens a source-generation bundle from its admission-root CAS path', async () => {
    const materialized = await materialize(casSourceFixture());
    const result = await loadPrebuiltAdmissionAuthorityGraph(materialized.request);
    if (!result.ok) throw new Error(result.errors.join('; '));
    expect(result.ok).toBe(true);
  });

  it('reports missing files and current/static path drift', async () => {
    const materialized = await materialize(makePrebuiltAuthorityFixture());
    await rm(materialized.request.inputGenerationPath);
    const missing = await loadPrebuiltAdmissionAuthorityGraph(materialized.request);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.join('\n')).toMatch(/input generation/i);

    const drifted = makePrebuiltAuthorityFixture();
    const driftedMaterialized = await materialize(drifted);
    await writeFile(join(driftedMaterialized.root, 'review', 'admission', 'authority', 'current.json'), JSON.stringify({ ...drifted.current, staticGenerationRelativePath: 'review/admission/authority/static-generations/../escape' }), 'utf8');
    const drift = await loadPrebuiltAdmissionAuthorityGraph(driftedMaterialized.request);
    expect(drift.ok).toBe(false);
  });

  it('rejects traversal and symlink ancestors or targets', async () => {
    const materialized = await materialize(makePrebuiltAuthorityFixture());
    const traversal = await loadPrebuiltAdmissionAuthorityGraph({
      ...materialized.request,
      proposalPath: '../outside.json',
    });
    expect(traversal.ok).toBe(false);

    const symlinkTarget = join(materialized.root, 'outside.json');
    await writeFile(symlinkTarget, '{}', 'utf8');
    const linkedProposal = join(materialized.root, 'review', 'admission', 'authority', 'proposals', 'linked.json');
    const canSymlink = await symlink(symlinkTarget, linkedProposal).then(() => true).catch(() => false);
    if (canSymlink) {
      const targetResult = await loadPrebuiltAdmissionAuthorityGraph({ ...materialized.request, proposalPath: linkedProposal });
      expect(targetResult.ok).toBe(false);
    }

    const linkedDirectory = join(materialized.root, 'review', 'admission', 'authority', 'linked-input');
    await symlink(join(materialized.root, 'review', 'admission', 'authority', 'input-generations'), linkedDirectory).catch(() => undefined);
    const ancestorResult = await loadPrebuiltAdmissionAuthorityGraph({
      ...materialized.request,
      inputGenerationPath: join(linkedDirectory, materialized.request.inputGenerationPath.split('/').at(-2)!, 'generation.json'),
    });
    expect(ancestorResult.ok).toBe(false);

    const projectLink = join(materialized.root, 'project-link');
    await symlink(materialized.root, projectLink).catch(() => undefined);
    const linkedProject = await loadPrebuiltAdmissionAuthorityGraph({
      ...materialized.request,
      projectRoot: projectLink,
    });
    expect(linkedProject.ok).toBe(false);
  });

  it('rejects tampered input, static, and source artifact bytes', async () => {
    const materialized = await materialize(makePrebuiltAuthorityFixture());
    await writeFile(join(materialized.root, 'review', 'admission', 'authority', 'input-generations', makePrebuiltAuthorityFixture().inputGeneration.generationSha256, 'admission-records.jsonl'), 'tampered\n', 'utf8');
    const inputTamper = await loadPrebuiltAdmissionAuthorityGraph(materialized.request);
    expect(inputTamper.ok).toBe(false);

    const staticMaterialized = await materialize(makePrebuiltAuthorityFixture());
    const current = makePrebuiltAuthorityFixture().current;
    await writeFile(join(staticMaterialized.root, current.staticGenerationRelativePath, 'quality-ledger.json'), '{"quality":"tampered"}\n', 'utf8');
    const staticTamper = await loadPrebuiltAdmissionAuthorityGraph(staticMaterialized.request);
    expect(staticTamper.ok).toBe(false);

    const sourceMaterialized = await materialize(makePrebuiltAuthorityFixture());
    await writeFile(join(sourceMaterialized.root, 'review', 'admission', 'sources', 'source-a', 'generations', makePrebuiltAuthorityFixture().sources[0]!.sourceGeneration.generationSha256, 'decision-ledger.json'), '{}', 'utf8');
    const sourceTamper = await loadPrebuiltAdmissionAuthorityGraph(sourceMaterialized.request);
    expect(sourceTamper.ok).toBe(false);
  });

  it('rejects noncanonical and BOM object bytes', async () => {
    const materialized = await materialize(makePrebuiltAuthorityFixture());
    const fixture = makePrebuiltAuthorityFixture();
    await writeFile(materialized.request.inputGenerationPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fixture.inputGenerationBytes]));
    const bom = await loadPrebuiltAdmissionAuthorityGraph(materialized.request);
    expect(bom.ok).toBe(false);

    const noncanonical = await materialize(fixture);
    await writeFile(noncanonical.request.proposalPath, `${calibrationAdmissionCanonicalJson(fixture.proposal)}\n`, 'utf8');
    const extraNewline = await loadPrebuiltAdmissionAuthorityGraph(noncanonical.request);
    expect(extraNewline.ok).toBe(false);
  });
});
