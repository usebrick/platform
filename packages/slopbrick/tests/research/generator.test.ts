import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  extForFramework,
  extractCodeFromMarkdown,
  generateSamples,
  type GeneratedSample,
  type GenerateSamplesOptions,
} from '../../src/research/generator';
import type { ResearchProvider } from '../../src/research/provider';

describe('extForFramework', () => {
  it.each([
    ['react', '.tsx'],
    ['vue', '.tsx'],
    ['solid', '.tsx'],
    ['qwik', '.tsx'],
    ['svelte', '.svelte'],
    ['astro', '.astro'],
    ['unknown', '.tsx'],
  ] as const)('returns %s for framework "%s"', (framework, expected) => {
    expect(extForFramework(framework)).toBe(expected);
  });
});

describe('extractCodeFromMarkdown', () => {
  it('extracts code from a tsx fenced block', () => {
    const raw = 'Some intro\n```tsx\nexport default function App() {\n  return <div />;\n}\n```\nSome outro';
    expect(extractCodeFromMarkdown(raw)).toBe('export default function App() {\n  return <div />;\n}');
  });

  it('extracts code from a generic fenced block', () => {
    const raw = '```\nconst x = 1;\n```';
    expect(extractCodeFromMarkdown(raw)).toBe('const x = 1;');
  });

  it('returns trimmed input when no fence is present', () => {
    const raw = 'const x = 1;\n';
    expect(extractCodeFromMarkdown(raw)).toBe('const x = 1;');
  });
});

describe('generateSamples', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'slopbrick-research-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeProvider(response: string): ResearchProvider {
    return {
      name: 'mock',
      generateSample: async () => response,
    };
  }

  it('writes sample files and metadata for a known template', async () => {
    const outputDir = join(tempDir, 'generated');
    const provider = makeProvider('```tsx\nexport default function Landing() { return <div />; }\n```');
    const options: GenerateSamplesOptions = {
      count: 2,
      framework: 'react',
      componentType: 'landing-page',
      provider,
      outputDir,
      temperature: 0.5,
    };

    const samples = await generateSamples(options);

    expect(samples).toHaveLength(2);
    const sample1Path = join(outputDir, 'react', 'landing-page', 'sample-1.tsx');
    const sample2Path = join(outputDir, 'react', 'landing-page', 'sample-2.tsx');
    expect(existsSync(sample1Path)).toBe(true);
    expect(existsSync(sample2Path)).toBe(true);
    expect(readFileSync(sample1Path, 'utf8')).toBe('export default function Landing() { return <div />; }');
    expect(readFileSync(sample2Path, 'utf8')).toBe('export default function Landing() { return <div />; }');

    const metadataPath = join(outputDir, 'react', 'landing-page', 'metadata.json');
    expect(existsSync(metadataPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(metadataPath, 'utf8')) as GeneratedSample[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0].filePath).toBe(sample1Path);
    expect(parsed[0].framework).toBe('react');
    expect(parsed[0].componentType).toBe('landing-page');
    expect(parsed[0].provider).toBe('mock');
    expect(typeof parsed[0].timestamp).toBe('string');
  });

  it('throws a clear error when the template is not found', async () => {
    const provider = makeProvider('code');
    const options: GenerateSamplesOptions = {
      count: 1,
      framework: 'vue',
      componentType: 'dashboard',
      provider,
      outputDir: join(tempDir, 'generated'),
    };

    await expect(generateSamples(options)).rejects.toThrow(
      "No prompt template found for framework='vue', componentType='dashboard'",
    );
  });
});
