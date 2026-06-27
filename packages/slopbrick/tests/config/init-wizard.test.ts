/**
 * Tests for the v0.14.5d extended PickBrick-equivalent wizard.
 *
 * `slopbrick init` now covers the full 8-category PickBrick taxonomy
 * (Framework, UI library, Styling, State, Auth, Forms, Testing,
 * Structure) instead of the previous 4. The first three go straight
 * into the `ResolvedConfig`; the latter five go into the
 * `constitution` block so `slopbrick drift` and MCP `slop_suggest`
 * can read them.
 *
 * The "PickBrick" name is reserved for a future standalone npm
 * package; `slopbrick init` is currently the canonical PickBrick
 * wizard, gated on the "real users" condition in the user brief.
 */
import { describe, expect, it } from 'vitest';
import { buildInitConfig } from '../../src/config/init';
import type { WizardAnswers } from '../../src/config/defaults';

describe('buildInitConfig (v0.14.5d PickBrick-equivalent wizard)', () => {
  it('writes stateManagement + forms directly into the constitution', () => {
    const result = buildInitConfig(
      { supportsRsc: true },
      {
        framework: 'react',
        styling: 'tailwind',
        uiLibraries: ['shadcn/ui'],
        strictness: 'balanced',
        stateManagement: 'zustand',
        forms: 'zod',
      } as WizardAnswers,
    );
    expect(result.constitution?.stateManagement).toEqual(['zustand']);
    expect(result.constitution?.forms).toEqual(['zod']);
  });

  it('stashes auth, testing, structure in constitution.custom (forward-compat)', () => {
    const result = buildInitConfig(
      { supportsRsc: true },
      {
        framework: 'react',
        styling: 'tailwind',
        uiLibraries: ['shadcn/ui'],
        strictness: 'balanced',
        auth: 'nextauth',
        testing: 'vitest',
        structure: 'feature-based',
      } as WizardAnswers,
    );
    // The Constitution schema doesn't have auth/testing/structure
    // fields yet. Stashing them in `custom` means the user's
    // answer is preserved in the file for when the schema grows.
    expect(result.constitution?.custom).toMatchObject({
      auth: ['nextauth'],
      testing: ['vitest'],
      structure: ['feature-based'],
    });
  });

  it('omits constitution fields when the wizard answers are empty (Enter-to-skip)', () => {
    const result = buildInitConfig(
      { supportsRsc: false },
      {
        framework: 'vue',
        styling: 'css-modules',
        uiLibraries: [],
        strictness: 'permissive',
        // stateManagement, auth, forms, testing, structure all undefined
      } as WizardAnswers,
    );
    expect(result.constitution?.stateManagement).toBeUndefined();
    expect(result.constitution?.forms).toBeUndefined();
    expect(result.constitution?.custom).toBeUndefined();
  });

  it('preserves all four original categories (framework, styling, UI, strictness)', () => {
    const result = buildInitConfig(
      { supportsRsc: true },
      {
        framework: 'react',
        styling: 'tailwind',
        uiLibraries: ['shadcn/ui', 'radix'],
        strictness: 'strict',
      } as WizardAnswers,
    );
    expect(result.framework).toBe('react');
    expect(result.hasTailwind).toBe(true);
    expect(result.uiLibraries).toEqual(['shadcn/ui', 'radix']);
    // strictness 'strict' lowers the slop thresholds.
    expect(result.thresholds?.meanSlop).toBeLessThan(50);
  });
});
