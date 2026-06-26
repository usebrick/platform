import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildArchitectureScore,
  buildArchitectureScoreFromInputs,
  formatArchitectureScore,
  ARCHITECTURE_SCORE_WEIGHTS,
} from '../../src/engine/architecture-score';
import type { PatternInventory } from '../../src/mcp/patterns';
import type { ResolvedConfig } from '../../src/types';

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-arch-'));
}

function writeFile(dir: string, rel: string, content: string): string {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
  return full;
}

function emptyInventory(): PatternInventory {
  return {
    scannedFiles: 0,
    patterns: {
      modal: [],
      button: [],
      api: [],
      state: [],
      dataFetching: [],
      service: [],
      route: [],
      ormModel: [],
    },
  };
}

describe('buildArchitectureScoreFromInputs', () => {
  it('returns 100 for an empty inventory with no violations', () => {
    const score = buildArchitectureScoreFromInputs(
      { inventory: emptyInventory(), scaleIssues: { spacing: 0, radius: 0 } },
      0,
    );
    expect(score.score).toBe(100);
    expect(score.deductions).toHaveLength(0);
    expect(score.headline).toBe('Architecture consistency: 100/100');
  });

  it('deducts 12 per extra modal system', () => {
    const inventory: PatternInventory = {
      ...emptyInventory(),
      patterns: {
        ...emptyInventory().patterns,
        modal: [
          { name: 'Modal', files: ['a.tsx'], imports: [] },
          { name: 'Dialog', files: ['b.tsx'], imports: [] },
          { name: 'Drawer', files: ['c.tsx'], imports: [] },
        ],
      },
    };
    const score = buildArchitectureScoreFromInputs(
      { inventory, scaleIssues: { spacing: 0, radius: 0 } },
      3,
    );
    // 2 extras × 12 = 24
    expect(score.score).toBe(76);
    const modalDeduction = score.deductions.find((d) => d.category === 'modalSystems');
    expect(modalDeduction?.deduction).toBe(24);
    expect(modalDeduction?.count).toBe(3);
  });

  it('deducts 8 per extra button variant', () => {
    const inventory: PatternInventory = {
      ...emptyInventory(),
      patterns: {
        ...emptyInventory().patterns,
        button: [
          { name: 'Button', files: ['a.tsx'], imports: [] },
          { name: 'IconButton', files: ['b.tsx'], imports: [] },
          { name: 'PrimaryButton', files: ['c.tsx'], imports: [] },
        ],
      },
    };
    const score = buildArchitectureScoreFromInputs(
      { inventory, scaleIssues: { spacing: 0, radius: 0 } },
      3,
    );
    expect(score.score).toBe(84); // 100 - 16
  });

  it('deducts 15 per extra state library (highest weight)', () => {
    const inventory: PatternInventory = {
      ...emptyInventory(),
      patterns: {
        ...emptyInventory().patterns,
        state: [
          { name: 'zustand', files: ['a.ts'], imports: ['zustand'] },
          { name: 'redux', files: ['b.ts'], imports: ['@reduxjs/toolkit'] },
        ],
      },
    };
    const score = buildArchitectureScoreFromInputs(
      { inventory, scaleIssues: { spacing: 0, radius: 0 } },
      2,
    );
    expect(score.score).toBe(85); // 100 - 15
    expect(score.deductions[0].category).toBe('stateLibraries');
  });

  it('deducts 10 per extra data-fetching library', () => {
    const inventory: PatternInventory = {
      ...emptyInventory(),
      patterns: {
        ...emptyInventory().patterns,
        dataFetching: [
          { name: 'react-query', files: ['a.ts'], imports: ['@tanstack/react-query'] },
          { name: 'swr', files: ['b.ts'], imports: ['swr'] },
        ],
      },
    };
    const score = buildArchitectureScoreFromInputs(
      { inventory, scaleIssues: { spacing: 0, radius: 0 } },
      2,
    );
    expect(score.score).toBe(90); // 100 - 10
  });

  it('deducts 1 per 5 spacing-scale violations', () => {
    const score = buildArchitectureScoreFromInputs(
      { inventory: emptyInventory(), scaleIssues: { spacing: 12, radius: 0 } },
      5,
    );
    // ceil(12 / 5) = 3 units, 3 * 1 = 3 deduction
    expect(score.score).toBe(97);
    const spacingDeduction = score.deductions.find(
      (d) => d.category === 'spacingScaleViolations',
    );
    expect(spacingDeduction?.count).toBe(12);
    expect(spacingDeduction?.deduction).toBe(3);
  });

  it('deducts 1 per 5 radius-scale violations', () => {
    const score = buildArchitectureScoreFromInputs(
      { inventory: emptyInventory(), scaleIssues: { spacing: 0, radius: 5 } },
      5,
    );
    expect(score.score).toBe(99);
  });

  it('clamps the final score at 0', () => {
    // 10 modals * 12 = 120 deduction; well over 100
    const inventory: PatternInventory = {
      ...emptyInventory(),
      patterns: {
        ...emptyInventory().patterns,
        modal: Array.from({ length: 10 }, (_, i) => ({
          name: `Modal${i}`,
          files: [`${i}.tsx`],
          imports: [],
        })),
      },
    };
    const score = buildArchitectureScoreFromInputs(
      { inventory, scaleIssues: { spacing: 0, radius: 0 } },
      10,
    );
    expect(score.score).toBe(0);
  });

  it('combines deductions from multiple categories', () => {
    const inventory: PatternInventory = {
      ...emptyInventory(),
      patterns: {
        ...emptyInventory().patterns,
        modal: [
          { name: 'Modal', files: ['a.tsx'], imports: [] },
          { name: 'Dialog', files: ['b.tsx'], imports: [] },
        ],
        state: [
          { name: 'zustand', files: ['c.ts'], imports: ['zustand'] },
          { name: 'redux', files: ['d.ts'], imports: ['@reduxjs/toolkit'] },
        ],
      },
    };
    const score = buildArchitectureScoreFromInputs(
      { inventory, scaleIssues: { spacing: 5, radius: 0 } },
      4,
    );
    // -12 (modal) -15 (state) -1 (spacing) = -28
    expect(score.score).toBe(72);
    expect(score.deductions).toHaveLength(3);
  });

  it('skips the scale-violation categories when counts are zero', () => {
    const score = buildArchitectureScoreFromInputs(
      { inventory: emptyInventory(), scaleIssues: { spacing: 0, radius: 0 } },
      0,
    );
    expect(score.deductions).toHaveLength(0);
  });

  it('a single modal does not deduct (one is the baseline)', () => {
    const inventory: PatternInventory = {
      ...emptyInventory(),
      patterns: {
        ...emptyInventory().patterns,
        modal: [{ name: 'Modal', files: ['a.tsx'], imports: [] }],
      },
    };
    const score = buildArchitectureScoreFromInputs(
      { inventory, scaleIssues: { spacing: 0, radius: 0 } },
      1,
    );
    expect(score.score).toBe(100);
    expect(score.deductions).toHaveLength(0);
  });
});

describe('formatArchitectureScore', () => {
  it('renders the headline + per-category deductions', () => {
    const inventory: PatternInventory = {
      ...emptyInventory(),
      patterns: {
        ...emptyInventory().patterns,
        modal: [
          { name: 'Modal', files: ['a.tsx'], imports: [] },
          { name: 'Dialog', files: ['b.tsx'], imports: [] },
        ],
      },
    };
    const score = buildArchitectureScoreFromInputs(
      { inventory, scaleIssues: { spacing: 0, radius: 0 } },
      2,
    );
    const out = formatArchitectureScore(score);
    expect(out).toContain('Architecture consistency: 88/100');
    expect(out).toContain('[modalSystems]');
    expect(out).toContain('2 modal/dialog systems');
  });

  it('renders the no-drift case with a checkmark', () => {
    const score = buildArchitectureScoreFromInputs(
      { inventory: emptyInventory(), scaleIssues: { spacing: 0, radius: 0 } },
      0,
    );
    const out = formatArchitectureScore(score);
    expect(out).toContain('100/100');
    expect(out).toContain('✓');
  });

  it('sorts deductions by impact descending', () => {
    const inventory: PatternInventory = {
      ...emptyInventory(),
      patterns: {
        ...emptyInventory().patterns,
        state: [
          { name: 'zustand', files: ['a.ts'], imports: ['zustand'] },
          { name: 'redux', files: ['b.ts'], imports: ['@reduxjs/toolkit'] },
          { name: 'jotai', files: ['c.ts'], imports: ['jotai'] },
        ],
        button: [
          { name: 'Button', files: ['d.tsx'], imports: [] },
          { name: 'IconButton', files: ['e.tsx'], imports: [] },
        ],
      },
    };
    const score = buildArchitectureScoreFromInputs(
      { inventory, scaleIssues: { spacing: 0, radius: 0 } },
      5,
    );
    const out = formatArchitectureScore(score);
    // state (-30) should appear before button (-8) in the output.
    const stateIdx = out.indexOf('stateLibraries');
    const buttonIdx = out.indexOf('buttonVariants');
    expect(stateIdx).toBeGreaterThan(-1);
    expect(buttonIdx).toBeGreaterThan(-1);
    expect(stateIdx).toBeLessThan(buttonIdx);
  });
});

describe('ARCHITECTURE_SCORE_WEIGHTS', () => {
  it('exposes the documented weights', () => {
    expect(ARCHITECTURE_SCORE_WEIGHTS.modal).toBe(12);
    expect(ARCHITECTURE_SCORE_WEIGHTS.button).toBe(8);
    expect(ARCHITECTURE_SCORE_WEIGHTS.api).toBe(10);
    expect(ARCHITECTURE_SCORE_WEIGHTS.state).toBe(15);
    expect(ARCHITECTURE_SCORE_WEIGHTS.fetching).toBe(10);
    expect(ARCHITECTURE_SCORE_WEIGHTS.spacingScalePerFive).toBe(1);
    expect(ARCHITECTURE_SCORE_WEIGHTS.radiusScalePerFive).toBe(1);
  });
});

describe('buildArchitectureScore (integration)', () => {
  it('runs end-to-end on a synthetic project', async () => {
    const dir = freshDir();
    try {
      // Project with 2 modal systems + 2 state libs — should deduct.
      writeFile(dir, 'src/components/Modal.tsx', `export const Modal = () => null;`);
      writeFile(dir, 'src/components/Dialog.tsx', `export const Dialog = () => null;`);
      writeFile(
        dir,
        'src/store.ts',
        `import { create } from 'zustand';\nimport { configureStore } from '@reduxjs/toolkit';\n`,
      );
      const config: ResolvedConfig = {
        include: ['src/**/*.ts', 'src/**/*.tsx'],
        exclude: [],
        // minimal config; rest will be defaulted
        rules: {},
        frameworkMultipliers: {},
        ruleConfig: {},
        arbitraryValueAllowlist: [],
        wcag: { targetSizeExemptSelectors: [] },
        thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
        spacingScale: [],
        radiusScale: [],
      };
      const score = await buildArchitectureScore(dir, config, 100);
      expect(score.scannedFiles).toBeGreaterThan(0);
      // 1 extra modal (-12) + 1 extra state lib (-15) = -27
      // Final score = 73, give or take any per-5 scale deductions.
      expect(score.score).toBeLessThanOrEqual(73);
      expect(score.score).toBeGreaterThanOrEqual(50);
      const modalDed = score.deductions.find((d) => d.category === 'modalSystems');
      const stateDed = score.deductions.find((d) => d.category === 'stateLibraries');
      expect(modalDed).toBeDefined();
      expect(stateDed).toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // v0.9.2 — drift deductions wired into the architecture-consistency
  // headline. Uses a Python fixture because drift surfaces most cleanly
  // in backend stacks (UserService + UserManager + UserHandler).
  it('deducts for cross-file drift on a Python fixture', async () => {
    const dir = freshDir();
    try {
      writeFile(
        dir,
        'src/admin/user_service.py',
        `class UserService:\n    pass\n`,
      );
      writeFile(
        dir,
        'src/admin/user_manager.py',
        `class UserManager:\n    pass\n`,
      );
      writeFile(
        dir,
        'src/admin/user_handler.py',
        `class UserHandler:\n    pass\n`,
      );
      const config: ResolvedConfig = {
        include: ['src/**/*.py', 'src/**/*.ts'],
        exclude: [],
        rules: {},
        frameworkMultipliers: {},
        ruleConfig: {},
        arbitraryValueAllowlist: [],
        wcag: { targetSizeExemptSelectors: [] },
        thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
        spacingScale: [],
        radiusScale: [],
      };
      const score = await buildArchitectureScore(dir, config, 100);
      // 3 service variants on stem 'User' → (3-1) * 10 = 20 deduction.
      const driftDed = score.deductions.find((d) => d.category === 'crossFileDrift');
      expect(driftDed).toBeDefined();
      expect(driftDed?.count).toBe(2); // 2 extra variants
      expect(driftDed?.deduction).toBe(20);
      // The signals are returned alongside the score for the pretty
      // report to consume without a second inventory build.
      expect(score.driftSignals).toHaveLength(1);
      expect(score.driftSignals[0]!.stem).toBe('User');
      expect(score.driftSignals[0]!.variants.sort()).toEqual([
        'UserHandler',
        'UserManager',
        'UserService',
      ]);
      // Score reflects the deduction (was 100, now ≤ 80).
      expect(score.score).toBeLessThanOrEqual(80);
      expect(score.score).toBeGreaterThanOrEqual(50);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not deduct when there is no drift', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/admin/user_service.py', `class UserService:\n    pass\n`);
      writeFile(dir, 'src/admin/order_service.py', `class OrderService:\n    pass\n`);
      const config: ResolvedConfig = {
        include: ['src/**/*.py'],
        exclude: [],
        rules: {},
        frameworkMultipliers: {},
        ruleConfig: {},
        arbitraryValueAllowlist: [],
        wcag: { targetSizeExemptSelectors: [] },
        thresholds: { meanSlop: 0, p90Slop: 0, individualSlopThreshold: 0 },
        spacingScale: [],
        radiusScale: [],
      };
      const score = await buildArchitectureScore(dir, config, 100);
      const driftDed = score.deductions.find((d) => d.category === 'crossFileDrift');
      expect(driftDed).toBeUndefined();
      expect(score.driftSignals).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('buildArchitectureScoreFromInputs — drift (v0.9.2)', () => {
  it('no drift inputs → no drift deduction (auto-computed from inventory)', () => {
    const inv: PatternInventory = {
      ...emptyInventory(),
      patterns: {
        ...emptyInventory().patterns,
        service: [
          { name: 'UserService', files: ['a.py'], imports: [] },
          { name: 'UserManager', files: ['b.py'], imports: [] },
        ],
      },
    };
    const score = buildArchitectureScoreFromInputs(
      { inventory: inv, scaleIssues: { spacing: 0, radius: 0 } },
      2,
    );
    const driftDed = score.deductions.find((d) => d.category === 'crossFileDrift');
    expect(driftDed).toBeDefined();
    expect(driftDed?.count).toBe(1);
    expect(driftDed?.deduction).toBe(10);
    expect(score.score).toBe(90); // 100 - 10
  });

  it('single drift signal with 3 variants → 20 deduction', () => {
    const inv: PatternInventory = emptyInventory();
    inv.patterns.service.push(
      { name: 'UserService', files: ['a.py'], imports: [] },
      { name: 'UserManager', files: ['b.py'], imports: [] },
      { name: 'UserHandler', files: ['c.py'], imports: [] },
    );
    const score = buildArchitectureScoreFromInputs(
      { inventory: inv, scaleIssues: { spacing: 0, radius: 0 } },
      3,
    );
    const driftDed = score.deductions.find((d) => d.category === 'crossFileDrift');
    expect(driftDed?.deduction).toBe(20); // (3-1) * 10
    expect(score.score).toBe(80);
  });

  it('two drift signals sum their extra variants', () => {
    const inv: PatternInventory = emptyInventory();
    inv.patterns.service.push(
      { name: 'UserService', files: ['a.py'], imports: [] },
      { name: 'UserManager', files: ['b.py'], imports: [] },
      { name: 'OrderService', files: ['c.py'], imports: [] },
      { name: 'OrderManager', files: ['d.py'], imports: [] },
    );
    const score = buildArchitectureScoreFromInputs(
      { inventory: inv, scaleIssues: { spacing: 0, radius: 0 } },
      4,
    );
    const driftDed = score.deductions.find((d) => d.category === 'crossFileDrift');
    // 2 signals × 1 extra each = 2 extras × 10 = 20.
    expect(driftDed?.count).toBe(2);
    expect(driftDed?.deduction).toBe(20);
    expect(score.score).toBe(80);
  });

  it('cross-category drift costs 15 per stem in 2+ categories', () => {
    const inv: PatternInventory = emptyInventory();
    inv.patterns.service.push(
      { name: 'UserService', files: ['a.py'], imports: [] },
      { name: 'UserManager', files: ['b.py'], imports: [] },
    );
    inv.patterns.ormModel.push(
      { name: 'User', files: ['c.py'], imports: [] },
      { name: 'UserModel', files: ['d.py'], imports: [] },
    );
    const score = buildArchitectureScoreFromInputs(
      { inventory: inv, scaleIssues: { spacing: 0, radius: 0 } },
      4,
    );
    // Cross-file drift: 1 service signal (1 extra) + 1 ormModel signal (1 extra)
    //   = 2 extras × 10 = 20.
    // Cross-category drift: 1 stem (User) in 2 categories = 1 × 15 = 15.
    // Total = 35 → score = 65.
    expect(score.deductions.find((d) => d.category === 'crossFileDrift')?.deduction).toBe(20);
    expect(score.deductions.find((d) => d.category === 'crossCategoryDrift')?.deduction).toBe(15);
    expect(score.score).toBe(65);
  });

  it('combines drift deduction with modal deduction', () => {
    const inv: PatternInventory = emptyInventory();
    inv.patterns.modal.push(
      { name: 'Modal', files: ['a.tsx'], imports: [] },
      { name: 'Dialog', files: ['b.tsx'], imports: [] },
      { name: 'Drawer', files: ['c.tsx'], imports: [] },
    );
    inv.patterns.service.push(
      { name: 'UserService', files: ['d.py'], imports: [] },
      { name: 'UserManager', files: ['e.py'], imports: [] },
    );
    const score = buildArchitectureScoreFromInputs(
      { inventory: inv, scaleIssues: { spacing: 0, radius: 0 } },
      5,
    );
    // modal: 2 extras × 12 = 24
    // drift: 1 extra × 10 = 10
    // total = 34 → score = 66
    expect(score.score).toBe(66);
    expect(score.deductions.find((d) => d.category === 'modalSystems')?.deduction).toBe(24);
    expect(score.deductions.find((d) => d.category === 'crossFileDrift')?.deduction).toBe(10);
  });

  it('explicit drift inputs override auto-detection', () => {
    // Inventory has drift, but we explicitly pass empty signals — the
    // explicit input wins. Useful for tests that want to assert the
    // deduction logic in isolation.
    const inv: PatternInventory = emptyInventory();
    inv.patterns.service.push(
      { name: 'UserService', files: ['a.py'], imports: [] },
      { name: 'UserManager', files: ['b.py'], imports: [] },
    );
    const score = buildArchitectureScoreFromInputs(
      {
        inventory: inv,
        scaleIssues: { spacing: 0, radius: 0 },
        driftSignals: [],
        crossCategoryDrift: [],
      },
      2,
    );
    expect(score.score).toBe(100);
    expect(score.deductions.find((d) => d.category === 'crossFileDrift')).toBeUndefined();
  });

  it('returns driftSignals + crossCategoryDrift on the score', () => {
    const inv: PatternInventory = emptyInventory();
    inv.patterns.service.push(
      { name: 'UserService', files: ['a.py'], imports: [] },
      { name: 'UserManager', files: ['b.py'], imports: [] },
    );
    const score = buildArchitectureScoreFromInputs(
      { inventory: inv, scaleIssues: { spacing: 0, radius: 0 } },
      2,
    );
    expect(score.driftSignals).toHaveLength(1);
    expect(score.driftSignals[0]!.category).toBe('service');
    expect(score.driftSignals[0]!.stem).toBe('User');
    expect(score.crossCategoryDrift).toHaveLength(0);
  });
});

describe('ARCHITECTURE_SCORE_WEIGHTS — drift weights (v0.9.2)', () => {
  it('exposes the documented drift weights', () => {
    expect(ARCHITECTURE_SCORE_WEIGHTS.crossFileDrift).toBe(10);
    expect(ARCHITECTURE_SCORE_WEIGHTS.crossCategoryDrift).toBe(15);
  });
});