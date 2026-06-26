import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { clsImageRule } from '../../src/rules/perf/cls-image';
import type { Issue, ResolvedConfig, RuleContext } from '../../src/types';

function makeConfig(overrides?: Partial<ResolvedConfig>): ResolvedConfig {
  return {
    include: [],
    exclude: [],
    rules: {},
    frameworkMultipliers: {},
    ruleConfig: {},
    arbitraryValueAllowlist: [],
    wcag: { targetSizeExemptSelectors: [] },
    thresholds: {
      meanSlop: 0,
      p90Slop: 0,
      individualSlopThreshold: 0,
    },
    ...overrides,
  };
}

async function runRule(
  source: string,
  config: ResolvedConfig,
  fileName = 'Component.tsx',
): Promise<Issue[]> {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-cls-image-test-'));
  try {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);
    const { ast, source: parsedSource } = await parseFile(filePath);
    const facts = extractFacts(filePath, ast, parsedSource);
    const context: RuleContext = { config, filePath, cwd: dir };
    const ruleContext = clsImageRule.create(context);
    return clsImageRule.analyze(ruleContext, facts);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('perf/cls-image', () => {
  it('flags a lazy image without dimensions or aspect ratio', async () => {
    const source = `
export function Gallery() {
  return <img src="/photo.jpg" loading="lazy" alt="Photo" />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe('perf/cls-image');
    expect(issues[0].category).toBe('perf');
    expect(issues[0].severity).toBe('low');
    expect(issues[0].aiSpecific).toBe(false);
    expect(issues[0].message).toBe(
      'Lazy-loaded image lacks explicit dimensions or aspect ratio',
    );
    expect(issues[0].advice).toBe(
      'Add width/height attributes or an aspect-ratio utility to prevent layout shift.',
    );
  });

  it('does not flag a lazy image with explicit width and height', async () => {
    const source = `
export function Gallery() {
  return <img src="/photo.jpg" loading="lazy" width="800" height="600" alt="Photo" />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('does not flag a lazy image with an aspect-ratio class', async () => {
    const source = `
export function Gallery() {
  return <img src="/photo.jpg" loading="lazy" className="aspect-video" alt="Photo" />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags a lazy image with only one dimension', async () => {
    const source = `
export function Gallery() {
  return <img src="/photo.jpg" loading="lazy" width="800" alt="Photo" />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('flags a lazy image with non-positive dimensions', async () => {
    const source = `
export function Gallery() {
  return <img src="/photo.jpg" loading="lazy" width="0" height="auto" alt="Photo" />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
  });

  it('does not flag eager images', async () => {
    const source = `
export function Gallery() {
  return <img src="/photo.jpg" alt="Photo" />;
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(0);
  });

  it('flags only lazy images that are missing dimensions', async () => {
    const source = `
export function Gallery() {
  return (
    <>
      <img src="/a.jpg" loading="lazy" width="100" height="100" alt="A" />
      <img src="/b.jpg" loading="lazy" alt="B" />
      <img src="/c.jpg" alt="C" />
    </>
  );
}
`;
    const issues = await runRule(source, makeConfig());
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe(
      'Lazy-loaded image lacks explicit dimensions or aspect ratio',
    );
  });
});
