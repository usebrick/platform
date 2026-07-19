import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('generated documentation truth', () => {
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
});
