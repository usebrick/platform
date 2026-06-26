import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertDistBuilt, cleanupTempDir, createTmpDir, run } from '../helpers/cli';

beforeAll(assertDistBuilt);

describe('research analyze', () => {
  let dir: string;

  beforeEach(() => {
    dir = createTmpDir();
  });

  afterEach(() => {
    cleanupTempDir(dir);
  });

  it('exits 2 when metadata.json is missing', async () => {
    const { exitCode, stderr } = await run(['research', 'analyze', '--input-dir', dir]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain('No metadata.json found');
  });

  it('writes analysis JSON when metadata.json exists and samples have issues', async () => {
    const samplePath = join(dir, 'sample.tsx');
    writeFileSync(
      samplePath,
      `export function Sloppy() {
  return (
    <div className="bg-slate-500 text-gray-300 font-['Inter']">
      <button className="rounded-full bg-indigo-500 text-white px-4 py-2 rounded-full">
        Get Started
      </button>
      <button className="rounded-full bg-indigo-500 text-white px-4 py-2 rounded-full">
        Learn More
      </button>
      <button className="rounded-full bg-indigo-500 text-white px-4 py-2 rounded-full">
        Sign Up Free
      </button>
    </div>
  );
}
`,
    );

    const metadata = [
      {
        filePath: resolve(samplePath),
        framework: 'react',
        componentType: 'demo',
        provider: 'openai',
        timestamp: new Date().toISOString(),
      },
    ];
    writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');

    const outputPath = join(dir, 'analysis.json');
    const { exitCode, stdout } = await run([
      'research',
      'analyze',
      '--input-dir',
      dir,
      '--output',
      outputPath,
      '--framework',
      'react',
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Analyzed 1 samples');
    expect(stdout).toContain(`Wrote analysis to ${outputPath}`);
    expect(existsSync(outputPath)).toBe(true);

    const analysis = JSON.parse(readFileSync(outputPath, 'utf8')) as {
      summary: { total: number; covered: number; coverage: number };
      samples: { covered: boolean; aiSpecificRuleIds: string[] }[];
    };
    expect(analysis.summary.total).toBe(1);
    expect(analysis.summary.covered).toBeGreaterThan(0);
    expect(analysis.samples[0].covered).toBe(true);
    expect(analysis.samples[0].aiSpecificRuleIds.length).toBeGreaterThan(0);
  });
});
