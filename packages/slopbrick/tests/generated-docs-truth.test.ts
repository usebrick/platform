import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('generated documentation truth', () => {
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
