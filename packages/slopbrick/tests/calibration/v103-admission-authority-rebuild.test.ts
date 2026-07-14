import { describe, expect, it } from 'vitest';

import {
  calibrationAdmissionCanonicalJson,
  calibrationAdmissionStaticAuthorityGenerationSha256,
} from '@usebrick/core';

import { validatePrebuiltAdmissionAuthorityGraph } from '../../src/calibration/v103/admission-authority-rebuild';
import {
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

describe('v10.3 prebuilt authority graph failures', () => {
  it('rejects a BOM or non-canonical top-level byte receipt', () => {
    const fixture = makePrebuiltAuthorityFixture();
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fixture.inputGenerationBytes]);
    expect(validatePrebuiltAdmissionAuthorityGraph(mutate(fixture, 'inputGenerationBytes', bom)).ok).toBe(false);
    expect(validatePrebuiltAdmissionAuthorityGraph(mutate(fixture, 'currentBytes', Buffer.from(`${fixture.currentBytes.toString('utf8')}\n`, 'utf8'))).ok).toBe(false);
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
});
