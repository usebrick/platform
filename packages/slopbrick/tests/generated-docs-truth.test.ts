import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { canonicalAuthorityRowsV2 } from '../src/calibration/cal-002/authority';
import { canonicalArtifact } from '../src/calibration/cal-002/contracts';
import { builtinRules } from '../src/rules/builtins';
import {
  assertQualityCopy,
  collectGeneratedCatalogCopy,
} from './helpers/public-rule-copy';
import { approvedCurrentPolicyArtifactFixture } from './helpers/current-evidence-policy-v2';
import { generateRuleCatalogOutput } from '../scripts/generate-rule-catalog';

describe('generated documentation truth', () => {
  it('renders approved current columns separately and fails drift checking against the inactive catalog', async () => {
    const packageRoot = join(__dirname, '..');
    const policyPath = '/private/tmp/cal-002-policy-fixture-v2.json';
    const signalPath = join(packageRoot, 'src', 'rules', 'signal-strength.json');
    const signalBytes = readFileSync(signalPath);
    const inactiveCatalog = readFileSync(join(packageRoot, 'docs', 'rule-catalog.md'), 'utf8');
    expect(await generateRuleCatalogOutput({ check: false })).toBe(inactiveCatalog);
    const policy = approvedCurrentPolicyArtifactFixture();
    writeFileSync(
      policyPath,
      `${JSON.stringify(policy, null, 2)}\n`,
      { mode: 0o600 },
    );

    try {
      await expect(generateRuleCatalogOutput({ policyPath, check: false }))
        .rejects.toThrow(/exact canonical JSON/);
      writeFileSync(policyPath, canonicalArtifact(policy).json, { mode: 0o600 });

      const output = await generateRuleCatalogOutput({ policyPath, check: false });
      const expected = policy.rows.find((row) => row.ruleId === 'ai/any-density');
      const row = output.split('\n').find((line) => line.startsWith('| `ai/any-density` |'));
      expect(expected).toBeDefined();
      expect(output).toContain('| runtimeOutcome | enabledByDefault | runnableByExplicitOptIn | scoreEligible | evidenceProvenance | qualityDomain | claimClass | admitted | historicalVerdict |');
      expect(row).toContain(`| ${expected!.runtimeOutcome} | ${expected!.enabledByDefault} | ${expected!.runnableByExplicitOptIn} | ${expected!.scoreEligible} | ${expected!.provenance} | ${expected!.qualityDomain} | ${expected!.claimClass} | false | USEFUL |`);
      expect(output).toContain('historical context only; it is not current quality authority or authorship evidence');

      const result = spawnSync(process.execPath, [
        join(__dirname, 'helpers', 'tsx-runner.cjs'),
        join(packageRoot, 'scripts', 'generate-rule-catalog.ts'),
        '--policy',
        policyPath,
        '--check',
      ], {
        cwd: packageRoot,
        encoding: 'utf8',
      });

      expect(result.status).toBe(1);
      expect(`${result.stdout}${result.stderr}`).toMatch(/policy|runtimeOutcome|out of sync/i);

      const duplicatePolicy = spawnSync(process.execPath, [
        join(__dirname, 'helpers', 'tsx-runner.cjs'),
        join(packageRoot, 'scripts', 'generate-rule-catalog.ts'),
        '--policy',
        policyPath,
        '--policy',
        policyPath,
        '--check',
      ], {
        cwd: packageRoot,
        encoding: 'utf8',
      });
      expect(duplicatePolicy.status).toBe(1);
      expect(`${duplicatePolicy.stdout}${duplicatePolicy.stderr}`)
        .toContain('--policy may only be supplied once');
      expect(readFileSync(signalPath)).toEqual(signalBytes);
    } finally {
      rmSync(policyPath, { force: true });
    }
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
