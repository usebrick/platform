import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  calibrationAdmissionAuthorityCurrentSha256,
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionInputGenerationProposalSha256,
  calibrationAdmissionInputGenerationSha256,
  calibrationAdmissionStaticAuthorityGenerationSha256,
} from '@usebrick/core';

import { validatePrebuiltAdmissionAuthorityGraph } from '../../src/calibration/v103/admission-authority-rebuild';
import {
  makeIndependentApprovalAuthorityFixture,
  makePrebuiltAuthorityFixture,
  type PrebuiltAuthorityGraphFixture,
} from './v103-admission-authority-rebuild-fixture';

describe('v10.3 prebuilt admission authority graph', () => {
  it('accepts a self-hashed graph with canonical byte receipts', () => {
    const fixture = makePrebuiltAuthorityFixture();
    expect(validatePrebuiltAdmissionAuthorityGraph(fixture)).toEqual({ ok: true, errors: [] });
  });
});

function mutate<T extends keyof PrebuiltAuthorityGraphFixture>(
  fixture: PrebuiltAuthorityGraphFixture,
  key: T,
  value: PrebuiltAuthorityGraphFixture[T],
): PrebuiltAuthorityGraphFixture {
  return { ...fixture, [key]: value } as PrebuiltAuthorityGraphFixture;
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('v10.3 prebuilt authority graph failures', () => {
  it('rejects extra top-level wrapper keys', () => {
    const fixture = makePrebuiltAuthorityFixture();
    expect(validatePrebuiltAdmissionAuthorityGraph({ ...fixture, unexpected: true }).ok).toBe(false);
  });

  it('requires exact canonical proposal bytes', () => {
    const fixture = makePrebuiltAuthorityFixture();
    const { proposalBytes: _proposalBytes, ...withoutProposalBytes } = fixture;
    expect(validatePrebuiltAdmissionAuthorityGraph(withoutProposalBytes).ok).toBe(false);
    expect(validatePrebuiltAdmissionAuthorityGraph(mutate(
      fixture,
      'proposalBytes',
      Buffer.from(`${fixture.proposalBytes.toString('utf8')}\n`, 'utf8'),
    )).ok).toBe(false);
  });

  it('requires prior-current bytes exactly when prior current is supplied', () => {
    const fixture = makePrebuiltAuthorityFixture();
    expect(validatePrebuiltAdmissionAuthorityGraph({
      ...fixture,
      priorCurrent: fixture.current,
    }).errors).toContain('prebuilt authority prior current and prior current bytes must be supplied together');
    expect(validatePrebuiltAdmissionAuthorityGraph({
      ...fixture,
      priorCurrentBytes: fixture.currentBytes,
    }).errors).toContain('prebuilt authority prior current and prior current bytes must be supplied together');
  });

  it('rejects a BOM or non-canonical top-level byte receipt', () => {
    const fixture = makePrebuiltAuthorityFixture();
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fixture.inputGenerationBytes]);
    expect(validatePrebuiltAdmissionAuthorityGraph(mutate(fixture, 'inputGenerationBytes', bom)).ok).toBe(false);
    expect(validatePrebuiltAdmissionAuthorityGraph(mutate(fixture, 'currentBytes', Buffer.from(`${fixture.currentBytes.toString('utf8')}\n`, 'utf8'))).ok).toBe(false);
  });

  it('rejects a rehashed input receipt when its raw bytes are mutated', () => {
    const fixture = makePrebuiltAuthorityFixture();
    const mutatedBytes = Buffer.from('{"recordId":"mutated"}\n', 'utf8');
    const inputArtifact = fixture.inputGeneration.artifacts[0]!;
    const changedArtifact = {
      ...inputArtifact,
      bytes: mutatedBytes.byteLength,
      sha256: sha256(mutatedBytes),
    };
    const changedInputBody = {
      ...fixture.inputGeneration,
      artifacts: [changedArtifact, ...fixture.inputGeneration.artifacts.slice(1)],
    };
    const changedInput = {
      ...changedInputBody,
      generationSha256: calibrationAdmissionInputGenerationSha256(changedInputBody),
    } as typeof fixture.inputGeneration;
    const changedStaticBody = {
      ...fixture.staticGeneration,
      inputGenerationSha256: changedInput.generationSha256,
    };
    const changedStatic = {
      ...changedStaticBody,
      generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(changedStaticBody),
    } as typeof fixture.staticGeneration;
    const changedCurrentBody = {
      ...fixture.current,
      staticGenerationSha256: changedStatic.generationSha256,
      staticGenerationRelativePath: `review/admission/authority/static-generations/${changedStatic.generationSha256}`,
    };
    const changedCurrent = {
      ...changedCurrentBody,
      currentSha256: calibrationAdmissionAuthorityCurrentSha256(changedCurrentBody),
    } as typeof fixture.current;
    const changed = {
      ...fixture,
      inputGeneration: changedInput,
      inputGenerationBytes: Buffer.from(calibrationAdmissionCanonicalJson(changedInput), 'utf8'),
      staticGeneration: changedStatic,
      staticGenerationBytes: Buffer.from(calibrationAdmissionCanonicalJson(changedStatic), 'utf8'),
      current: changedCurrent,
      currentBytes: Buffer.from(calibrationAdmissionCanonicalJson(changedCurrent), 'utf8'),
    } as PrebuiltAuthorityGraphFixture;
    expect(validatePrebuiltAdmissionAuthorityGraph(changed).errors).toContain('input generation artifact bytes do not match admission-records.jsonl');
  });

  it('rejects a rehashed static receipt when its raw bytes are mutated', () => {
    const fixture = makePrebuiltAuthorityFixture();
    const mutatedBytes = Buffer.from('{"quality":"mutated"}\n', 'utf8');
    const staticArtifact = fixture.staticGeneration.artifacts.find((artifact) => artifact.relativePath === 'quality-ledger.json')!;
    const changedArtifact = {
      ...staticArtifact,
      bytes: mutatedBytes.byteLength,
      sha256: sha256(mutatedBytes),
    };
    const changedStaticBody = {
      ...fixture.staticGeneration,
      qualityLedgerSha256: changedArtifact.sha256,
      artifacts: fixture.staticGeneration.artifacts.map((artifact) => artifact.relativePath === changedArtifact.relativePath ? changedArtifact : artifact),
    };
    const changedStatic = {
      ...changedStaticBody,
      generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(changedStaticBody),
    } as typeof fixture.staticGeneration;
    const changedCurrentBody = {
      ...fixture.current,
      staticGenerationSha256: changedStatic.generationSha256,
      staticGenerationRelativePath: `review/admission/authority/static-generations/${changedStatic.generationSha256}`,
    };
    const changedCurrent = {
      ...changedCurrentBody,
      currentSha256: calibrationAdmissionAuthorityCurrentSha256(changedCurrentBody),
    } as typeof fixture.current;
    const changed = {
      ...fixture,
      staticGeneration: changedStatic,
      staticGenerationBytes: Buffer.from(calibrationAdmissionCanonicalJson(changedStatic), 'utf8'),
      current: changedCurrent,
      currentBytes: Buffer.from(calibrationAdmissionCanonicalJson(changedCurrent), 'utf8'),
    } as PrebuiltAuthorityGraphFixture;
    expect(validatePrebuiltAdmissionAuthorityGraph(changed).errors).toContain('static generation artifact bytes do not match quality-ledger.json');
  });

  it('rejects missing and extra top-level artifact byte paths', () => {
    const fixture = makePrebuiltAuthorityFixture();
    const { ['admission-records.jsonl']: _admissionRecords, ...missingInputArtifact } = fixture.inputGenerationArtifactBytes;
    expect(validatePrebuiltAdmissionAuthorityGraph({
      ...fixture,
      inputGenerationArtifactBytes: missingInputArtifact,
    }).errors).toContain('input generation artifact bytes do not exactly cover generation receipts');
    expect(validatePrebuiltAdmissionAuthorityGraph({
      ...fixture,
      staticGenerationArtifactBytes: {
        ...fixture.staticGenerationArtifactBytes,
        'unexpected.json': Buffer.from('{}\n', 'utf8'),
      },
    }).errors).toContain('static generation artifact bytes do not exactly cover generation receipts');
  });

  it('rejects source current/hash/path or source artifact byte drift', () => {
    const fixture = makePrebuiltAuthorityFixture();
    const source = fixture.sources[0]!;
    const changedCurrent = { ...source.current, generationSha256: 'f'.repeat(64) };
    const changed = {
      ...fixture,
      sources: [{ ...source, current: changedCurrent }, ...fixture.sources.slice(1)],
    };
    expect(validatePrebuiltAdmissionAuthorityGraph(changed).ok).toBe(false);
    const alteredBytes = { ...source.artifactBytes, 'source-review.json': Buffer.from('tampered\n', 'utf8') };
    const changedBytes = {
      ...fixture,
      sources: [{ ...source, artifactBytes: alteredBytes }, ...fixture.sources.slice(1)],
    };
    expect(validatePrebuiltAdmissionAuthorityGraph(changedBytes).ok).toBe(false);
  });

  it('rejects proposal-to-input-to-static-to-current join drift even when mutated objects are rehashed', () => {
    const fixture = makePrebuiltAuthorityFixture();
    const changedStaticBody = {
      ...fixture.staticGeneration,
      inputGenerationSha256: 'f'.repeat(64),
    };
    const changedStatic = {
      ...changedStaticBody,
      generationSha256: calibrationAdmissionStaticAuthorityGenerationSha256(changedStaticBody),
    };
    const changed = {
      ...fixture,
      staticGeneration: changedStatic,
      staticGenerationBytes: Buffer.from(calibrationAdmissionCanonicalJson(changedStatic), 'utf8'),
    } as PrebuiltAuthorityGraphFixture;
    expect(validatePrebuiltAdmissionAuthorityGraph(changed).ok).toBe(false);
  });

  it('rejects fixed-role substitutions and unsafe contained paths', () => {
    const fixture = makePrebuiltAuthorityFixture();
    const unsafeInput = {
      ...fixture.inputGeneration,
      artifacts: fixture.inputGeneration.artifacts.map((artifact) => artifact.kind === 'record_stream'
        ? { ...artifact, relativePath: '../admission-records.jsonl' }
        : artifact),
    };
    const unsafe = {
      ...fixture,
      inputGeneration: unsafeInput,
    } as PrebuiltAuthorityGraphFixture;
    expect(validatePrebuiltAdmissionAuthorityGraph(unsafe).ok).toBe(false);
    const source = fixture.sources[0]!;
    const roleSwap = {
      ...fixture,
      sources: [{
        ...source,
        sourceGeneration: {
          ...source.sourceGeneration,
          artifacts: source.sourceGeneration.artifacts.map((artifact) => artifact.kind === 'source_review'
            ? { ...artifact, kind: 'current_pointer' }
            : artifact),
        },
      }],
    } as PrebuiltAuthorityGraphFixture;
    expect(validatePrebuiltAdmissionAuthorityGraph(roleSwap).ok).toBe(false);
  });

  it('rejects noncanonical source-generation/current bytes and source-review BOMs', () => {
    const fixture = makePrebuiltAuthorityFixture();
    const source = fixture.sources[0]!;
    const sourceBOM = {
      ...fixture,
      sources: [{
        ...source,
        sourceReviewBytes: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), source.sourceReviewBytes]),
      }],
    } as PrebuiltAuthorityGraphFixture;
    expect(validatePrebuiltAdmissionAuthorityGraph(sourceBOM).ok).toBe(false);
    const sourceNewline = {
      ...fixture,
      sources: [{
        ...source,
        sourceGenerationBytes: Buffer.from(`${source.sourceGenerationBytes.toString('utf8')}\n`, 'utf8'),
      }],
    } as PrebuiltAuthorityGraphFixture;
    expect(validatePrebuiltAdmissionAuthorityGraph(sourceNewline).ok).toBe(false);
  });

  it('rejects duplicate or extra-key source wrapper entries', () => {
    const fixture = makePrebuiltAuthorityFixture();
    const source = fixture.sources[0]!;
    expect(validatePrebuiltAdmissionAuthorityGraph({
      ...fixture,
      sources: [source, source],
    }).ok).toBe(false);
    expect(validatePrebuiltAdmissionAuthorityGraph({
      ...fixture,
      sources: [{ ...source, unexpected: true }],
    }).ok).toBe(false);
  });

  it('binds an independent-review approval to the fixed input-proposal path and hash', () => {
    const fixture = makeIndependentApprovalAuthorityFixture();
    const proposalBody = {
      ...fixture.proposal,
      sourceGenerationProposals: fixture.proposal.sourceGenerationProposals.map((reference) => ({
        ...reference,
        approvalSha256: 'f'.repeat(64),
      })),
    };
    const proposal = {
      ...proposalBody,
      proposalSha256: calibrationAdmissionInputGenerationProposalSha256(proposalBody),
    };
    const changed = {
      ...fixture,
      proposal,
      proposalBytes: Buffer.from(calibrationAdmissionCanonicalJson(proposal), 'utf8'),
    } as PrebuiltAuthorityGraphFixture;
    const result = validatePrebuiltAdmissionAuthorityGraph(changed);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/approval path\/hash|independent-review/i);
  });
});
