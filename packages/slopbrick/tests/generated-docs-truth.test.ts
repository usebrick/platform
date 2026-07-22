import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { generateRuleCatalogOutput } from '../scripts/generate-rule-catalog';
import { canonicalAuthorityRowsV2 } from '../src/calibration/cal-002/authority';
import { canonicalArtifact } from '../src/calibration/cal-002/contracts';
import { builtinRules } from '../src/rules/builtins';
import {
  assertQualityCopy,
  collectGeneratedCatalogCopy,
} from './helpers/public-rule-copy';
import { approvedCurrentPolicyArtifactFixture } from './helpers/current-evidence-policy-v2';

const PACKAGE_ROOT = resolve(__dirname, '..');
const REPOSITORY_ROOT = resolve(PACKAGE_ROOT, '..', '..');
const RULES_DIR = join(PACKAGE_ROOT, 'src', 'rules');
const SIGNAL_STRENGTH_PATH = join(PACKAGE_ROOT, 'src', 'rules', 'signal-strength.json');
const tempDirs: string[] = [];

function privateTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'slopbrick-rule-catalog-'));
  chmodSync(dir, 0o700);
  expect(statSync(dir).mode & 0o777).toBe(0o700);
  tempDirs.push(dir);
  return dir;
}

function writeCanonicalFixture(dir: string, name: string, value: unknown): string {
  const fixturePath = join(dir, name);
  writeFileSync(fixturePath, canonicalArtifact(value).json, { flag: 'wx', mode: 0o600 });
  expect(statSync(fixturePath).mode & 0o777).toBe(0o600);
  return fixturePath;
}

function writeSignalFixture(
  dir: string,
  name: string,
  mutate: (signal: Record<string, Record<string, unknown>>) => void,
): string {
  const signal = JSON.parse(
    readFileSync(SIGNAL_STRENGTH_PATH, 'utf8'),
  ) as Record<string, Record<string, unknown>>;
  mutate(signal);
  const fixturePath = join(dir, name);
  writeFileSync(fixturePath, JSON.stringify(signal), { flag: 'wx', mode: 0o600 });
  expect(statSync(fixturePath).mode & 0o777).toBe(0o600);
  return fixturePath;
}

function copyRulesFixture(
  dir: string,
  name: string,
  rulePath: string,
  mutate: (source: string) => string,
): string {
  const rulesDir = join(dir, name);
  cpSync(RULES_DIR, rulesDir, { errorOnExist: true, force: false, recursive: true });
  const fixturePath = join(rulesDir, rulePath);
  const source = readFileSync(fixturePath, 'utf8');
  const mutated = mutate(source);
  expect(mutated).not.toBe(source);
  rmSync(fixturePath);
  writeFileSync(fixturePath, mutated, { flag: 'wx', mode: 0o600 });
  return rulesDir;
}

function runCatalogPackageScript(args: readonly string[]) {
  return spawnSync('corepack', [
    'pnpm',
    '--filter',
    'slopbrick',
    'generate:rules:catalog',
    '--',
    ...args,
  ], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  });
}

function processOutput(result: ReturnType<typeof runCatalogPackageScript>): string {
  return `${result.stdout}${result.stderr}`;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('generated documentation truth', () => {
  it('renders approved current columns separately and fails drift checking against the inactive catalog', async () => {
    const dir = privateTempDir();
    const inactiveCatalog = readFileSync(join(PACKAGE_ROOT, 'docs', 'rule-catalog.md'), 'utf8');
    expect(await generateRuleCatalogOutput({ check: false })).toBe(inactiveCatalog);
    const policy = approvedCurrentPolicyArtifactFixture();
    const noncanonicalPolicyPath = join(dir, 'noncanonical-policy.json');
    writeFileSync(
      noncanonicalPolicyPath,
      `${JSON.stringify(policy, null, 2)}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    await expect(generateRuleCatalogOutput({ policyPath: noncanonicalPolicyPath, check: false }))
      .rejects.toThrow(/exact canonical JSON/);

    const policyPath = writeCanonicalFixture(dir, 'approved-policy.json', policy);
    const output = await generateRuleCatalogOutput({ policyPath, check: false });
    const expected = policy.rows.find((row) => row.ruleId === 'ai/any-density');
    const row = output.split('\n').find((line) => line.startsWith('| `ai/any-density` |'));
    expect(expected).toBeDefined();
    expect(output).toContain('| runtimeOutcome | enabledByDefault | runnableByExplicitOptIn | scoreEligible | gateEligible | evidenceProvenance | qualityDomain | claimClass | admitted | historicalVerdict |');
    expect(row).toContain(`| ${expected!.runtimeOutcome} | ${expected!.enabledByDefault} | ${expected!.runnableByExplicitOptIn} | ${expected!.scoreEligible} | ${expected!.gateEligible} | ${expected!.provenance} | ${expected!.qualityDomain} | ${expected!.claimClass} | false | USEFUL |`);
    expect(output).toContain('historical context only; it is not current quality authority or authorship evidence');
  });

  it('accepts one package separator and resolves policy paths from the repository root', () => {
    const dir = privateTempDir();
    const policyPath = writeCanonicalFixture(
      dir,
      'approved-policy.json',
      approvedCurrentPolicyArtifactFixture(),
    );
    const signalBytes = readFileSync(SIGNAL_STRENGTH_PATH);
    const relativePolicyPath = relative(REPOSITORY_ROOT, policyPath);

    const relativeResult = runCatalogPackageScript([
      '--policy',
      relativePolicyPath,
      '--check',
    ]);
    expect(relativeResult.status).toBe(1);
    expect(processOutput(relativeResult)).toMatch(
      /out of sync with src\/rules\/ and the selected current policy projection/u,
    );

    const absoluteResult = runCatalogPackageScript([
      '--policy',
      policyPath,
      '--check',
    ]);
    expect(absoluteResult.status).toBe(1);
    expect(processOutput(absoluteResult)).toMatch(
      /out of sync with src\/rules\/ and the selected current policy projection/u,
    );
    expect(readFileSync(SIGNAL_STRENGTH_PATH)).toEqual(signalBytes);
  });

  it.each([
    {
      name: 'a second standalone separator',
      args: ['--', '--check'],
      message: /standalone -- separator may only appear once at the beginning/u,
    },
    {
      name: 'duplicate policy options',
      args: ['--policy', 'first.json', '--policy', 'second.json', '--check'],
      message: /--policy may only be supplied once/u,
    },
    {
      name: 'duplicate check options',
      args: ['--check', '--check'],
      message: /--check may only be supplied once/u,
    },
    {
      name: 'unknown options',
      args: ['--unknown'],
      message: /Unknown generate-rule-catalog option: --unknown/u,
    },
  ])('rejects $name after the approved package separator', ({ args, message }) => {
    const result = runCatalogPackageScript(args);
    expect(result.status).toBe(1);
    expect(processOutput(result)).toMatch(message);
  });

  it('binds policy mode to the locked catalog metadata and policy hash', async () => {
    const dir = privateTempDir();
    const policy = approvedCurrentPolicyArtifactFixture();
    const policyPath = writeCanonicalFixture(dir, 'approved-policy.json', policy);
    const metadataDriftPath = writeSignalFixture(dir, 'default-off-drift.json', (signal) => {
      signal['ai/any-density']!.defaultOff = true;
    });

    await expect(generateRuleCatalogOutput(
      { policyPath, check: false },
      { signalStrengthPath: metadataDriftPath },
    )).rejects.toThrow(/canonical locked CAL-002 catalog metadata identity/u);

    const policyHashDriftPath = writeCanonicalFixture(dir, 'policy-hash-drift.json', {
      ...policy,
      catalogSha256: '0'.repeat(64),
    });
    await expect(generateRuleCatalogOutput({ policyPath: policyHashDriftPath, check: false }))
      .rejects.toThrow(/catalogSha256/u);
  });

  it('rejects a valid-looking 120th signal row without a discovered rule', async () => {
    const dir = privateTempDir();
    const policyPath = writeCanonicalFixture(
      dir,
      'approved-policy.json',
      approvedCurrentPolicyArtifactFixture(),
    );
    const extraRowPath = writeSignalFixture(dir, 'extra-signal-row.json', (signal) => {
      const sourceRow = signal['ai/any-density'];
      if (!sourceRow) throw new TypeError('Expected the source signal row fixture');
      const ruleIds = Object.keys(signal).filter((ruleId) => !ruleId.startsWith('_'));
      expect(ruleIds).toHaveLength(119);
      signal['ai/valid-looking-120th'] = { ...sourceRow };
      expect(Object.keys(signal).filter((ruleId) => !ruleId.startsWith('_'))).toHaveLength(120);
    });

    await expect(generateRuleCatalogOutput(
      { policyPath, check: false },
      { signalStrengthPath: extraRowPath },
    )).rejects.toThrow(/extra: ai\/valid-looking-120th/u);
  });

  it('rejects missing, duplicate, and invalid-shape policy signal rows', async () => {
    const dir = privateTempDir();
    const policyPath = writeCanonicalFixture(
      dir,
      'approved-policy.json',
      approvedCurrentPolicyArtifactFixture(),
    );
    const missingRowPath = writeSignalFixture(dir, 'missing-signal-row.json', (signal) => {
      delete signal['ai/any-density'];
    });
    await expect(generateRuleCatalogOutput(
      { policyPath, check: false },
      { signalStrengthPath: missingRowPath },
    )).rejects.toThrow(/missing: ai\/any-density/u);

    const invalidShapePath = writeSignalFixture(dir, 'invalid-signal-row.json', (signal) => {
      signal['ai/any-density'] = { verdict: 'USEFUL' };
    });
    await expect(generateRuleCatalogOutput(
      { policyPath, check: false },
      { signalStrengthPath: invalidShapePath },
    )).rejects.toThrow(/valid historical signal row shape for ai\/any-density/u);

    const signal = JSON.parse(
      readFileSync(SIGNAL_STRENGTH_PATH, 'utf8'),
    ) as Record<string, Record<string, unknown>>;
    const sourceRow = signal['ai/any-density'];
    if (!sourceRow) throw new TypeError('Expected the duplicate source signal row fixture');
    const source = readFileSync(SIGNAL_STRENGTH_PATH, 'utf8').trimEnd();
    expect(source.endsWith('}')).toBe(true);
    const duplicateRowPath = join(dir, 'duplicate-signal-row.json');
    writeFileSync(
      duplicateRowPath,
      `${source.slice(0, -1)},${JSON.stringify('ai/any-density')}:${JSON.stringify(sourceRow)}}`,
      { flag: 'wx', mode: 0o600 },
    );
    expect(statSync(duplicateRowPath).mode & 0o777).toBe(0o600);
    await expect(generateRuleCatalogOutput(
      { policyPath, check: false },
      { signalStrengthPath: duplicateRowPath },
    )).rejects.toThrow(/duplicate historical signal rule IDs: ai\/any-density/u);
  });

  it.each([
    {
      name: 'category',
      mutate: (source: string) => source.replace("category: 'ai'", "category: 'logic'"),
    },
    {
      name: 'aiSpecific',
      mutate: (source: string) => source.replace('aiSpecific: true', 'aiSpecific: false'),
    },
  ])('rejects same-ID $name metadata drift', async ({ name, mutate }) => {
    const dir = privateTempDir();
    const policyPath = writeCanonicalFixture(
      dir,
      'approved-policy.json',
      approvedCurrentPolicyArtifactFixture(),
    );
    const rulesDir = copyRulesFixture(
      dir,
      `${name}-rules`,
      join('ai', 'any-density.ts'),
      mutate,
    );

    await expect(generateRuleCatalogOutput(
      { policyPath, check: false },
      { rulesDir },
    )).rejects.toThrow(/canonical locked CAL-002 catalog metadata identity/u);
  });

  it('requires readable signal data and a recognized historical verdict for all 119 policy rows', async () => {
    const dir = privateTempDir();
    const policyPath = writeCanonicalFixture(
      dir,
      'approved-policy.json',
      approvedCurrentPolicyArtifactFixture(),
    );
    const missingVerdictPath = writeSignalFixture(dir, 'missing-verdict.json', (signal) => {
      delete signal['ai/any-density']!.verdict;
    });
    await expect(generateRuleCatalogOutput(
      { policyPath, check: false },
      { signalStrengthPath: missingVerdictPath },
    )).rejects.toThrow(/recognized historicalVerdict for ai\/any-density/u);

    const unknownVerdictPath = writeSignalFixture(dir, 'unknown-verdict.json', (signal) => {
      signal['ai/any-density']!.verdict = 'CURRENT';
    });
    await expect(generateRuleCatalogOutput(
      { policyPath, check: false },
      { signalStrengthPath: unknownVerdictPath },
    )).rejects.toThrow(/recognized historicalVerdict for ai\/any-density/u);

    await expect(generateRuleCatalogOutput(
      { policyPath, check: false },
      { signalStrengthPath: join(dir, 'missing-signal-strength.json') },
    )).rejects.toThrow(/readable historical signal data/u);
  });

  it('binds the package front door to the approved UseBrick doctrine', () => {
    const approvedPositioning = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        'docs',
        'superpowers',
        'specs',
        '2026-07-19-usebrick-coherence-positioning-design.md',
      ),
      'utf8',
    );
    const packageReadme = readFileSync(join(__dirname, '..', 'README.md'), 'utf8');
    const packageRoadmap = readFileSync(join(__dirname, '..', 'ROADMAP.md'), 'utf8');

    expect(approvedPositioning).toContain('UseBrick is the coherence and verification layer');
    expect(packageReadme).toContain('SlopBrick is the shipped scanner and CLI');
    expect(packageReadme).not.toMatch(
      /\busebrick (scan|init|ci|mcp|explain|baseline|check|fix|runtime)\b/,
    );
    expect(packageRoadmap).toContain('../../ROADMAP.md');
  });

  it('frames aiSpecific as a detector lane rather than authorship proof', () => {
    const catalog = readFileSync(
      join(__dirname, '..', 'docs', 'rule-catalog.md'),
      'utf8',
    );

    expect(catalog).toContain('AI-associated detector lane');
    expect(catalog).not.toContain('patterns introduced (or disproportionately introduced) by AI');
    expect(catalog).not.toContain('ai-slop-rule-catalog.md');
  });

  it('links to the canonical root roadmap without a frozen phase count', () => {
    const catalog = readFileSync(
      join(__dirname, '..', 'docs', 'rule-catalog.md'),
      'utf8',
    );

    expect(catalog).toContain('[../../../ROADMAP.md](../../../ROADMAP.md)');
    expect(catalog).not.toContain('12-phase plan');
  });

  it('keeps generated descriptions for all 73 quality rows exact and provenance-neutral', () => {
    const catalogPath = join(__dirname, '..', 'docs', 'rule-catalog.md');
    const qualityIds = canonicalAuthorityRowsV2()
      .filter((row) => row.sourceClass === 'starting-quality' || row.action === 'transfer')
      .map((row) => row.ruleId)
      .sort();
    expect(qualityIds).toHaveLength(73);
    for (const ruleId of qualityIds) {
      const copy = collectGeneratedCatalogCopy(ruleId, catalogPath);
      const runtimeRules = builtinRules.filter((rule) => rule.id === ruleId);
      expect(runtimeRules, `${ruleId} runtime rule identity`).toHaveLength(1);
      expect(copy.text, `${ruleId} generated description`).toBe(runtimeRules[0]!.description);
      expect(() => assertQualityCopy(copy.text, copy.location)).not.toThrow();
    }
  });
});
