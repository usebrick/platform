import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildPatternFragmentation,
  buildReportFromCounts,
  computePatternFragmentation,
  PATTERN_CATEGORIES,
  PATTERN_NORMALIZER,
  PATTERN_WEIGHTS,
  MAX_EXCESS_PER_CATEGORY,
} from '../../src/engine/patterns';
import { DEFAULT_CONFIG } from '../../src/config';
import type { ResolvedConfig } from '../../src/types';

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-patterns-engine-'));
}

function writeFile(dir: string, rel: string, content: string): string {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
  return full;
}

function configWith(include: string[]): ResolvedConfig {
  return {
    ...DEFAULT_CONFIG,
    include,
    exclude: [],
  };
}

describe('PATTERN_WEIGHTS', () => {
  it('exposes the documented per-category weights', () => {
    expect(PATTERN_WEIGHTS.modal).toBe(10);
    expect(PATTERN_WEIGHTS.auth).toBe(8);
    expect(PATTERN_WEIGHTS.state).toBe(6);
    expect(PATTERN_WEIGHTS.button).toBe(4);
    expect(PATTERN_WEIGHTS.api).toBe(4);
    expect(PATTERN_WEIGHTS.toast).toBe(4);
    expect(PATTERN_WEIGHTS.card).toBe(4);
    expect(PATTERN_WEIGHTS.forms).toBe(3);
  });

  it('is frozen so tests + downstream consumers can\'t mutate it', () => {
    expect(Object.isFrozen(PATTERN_WEIGHTS)).toBe(true);
  });

  it('exports the max excess + normalizer for assertion', () => {
    expect(MAX_EXCESS_PER_CATEGORY).toBe(4);
    // 10 + 8 + 6 + 4 + 4 + 4 + 4 + 3 = 43, * 4 = 172
    expect(PATTERN_NORMALIZER).toBe(172);
  });
});

describe('computePatternFragmentation', () => {
  it('returns 100 for a clean project (one pattern per category)', () => {
    const report = buildReportFromCounts({
      modal: ['Modal'],
      button: ['Button'],
      auth: ['useAuth'],
      api: ['lib/api/index.ts'],
      state: ['zustand'],
      forms: ['react-hook-form'],
      toast: ['Toast'],
      card: ['Card'],
    });
    expect(report.score).toBe(100);
    expect(report.doNotCreate).toEqual([]);
  });

  it('returns 100 for an empty project (no patterns at all)', () => {
    const report = buildReportFromCounts({});
    expect(report.score).toBe(100);
    expect(report.uxPatternCount).toBe(0);
  });

  it('deducts proportionally to excess patterns', () => {
    // 2 modals (excess 1, weight 10) → deduction 10
    // 1.0 normalized: 10/172 = 5.8% → 94
    const report = buildReportFromCounts({
      modal: ['ConfirmModal', 'AlertDialog'],
    });
    const capped = Math.min(1, MAX_EXCESS_PER_CATEGORY);
    const expectedDeduction = PATTERN_WEIGHTS.modal * capped;
    const expectedScore = Math.round(100 - (expectedDeduction / PATTERN_NORMALIZER) * 100);
    expect(report.score).toBe(expectedScore);
    expect(report.byCategory.modal.excess).toBe(1);
  });

  it('caps excess at MAX_EXCESS_PER_CATEGORY so one flood does not pin score at 0', () => {
    // 10 modals → raw excess 9, capped at 4. Without cap, the score
    // would be 100 - (10*9/172)*100 = 47.6. With cap: 100 - (10*4/172)*100
    // = 76.7, so other categories still influence the result.
    const manyModals = Array.from({ length: 10 }, (_, i) => `Modal${i}`);
    const report = buildReportFromCounts({ modal: manyModals });
    const expectedDeduction = PATTERN_WEIGHTS.modal * MAX_EXCESS_PER_CATEGORY;
    const expectedScore = Math.round(100 - (expectedDeduction / PATTERN_NORMALIZER) * 100);
    expect(report.score).toBe(expectedScore);
    // The stats.excess field reports the raw count (uncapped) so
    // consumers can still see "this category has 9 extras".
    expect(report.byCategory.modal.excess).toBe(9);
  });

  it('clamps the final score at 0', () => {
    // Every category maxed out → 100 - (43*4 / 172)*100 = 0
    const report = buildReportFromCounts({
      modal: Array.from({ length: 5 }, (_, i) => `Modal${i}`),
      button: Array.from({ length: 5 }, (_, i) => `Btn${i}`),
      auth: Array.from({ length: 5 }, (_, i) => `Auth${i}`),
      api: Array.from({ length: 5 }, (_, i) => `api/${i}.ts`),
      state: ['zustand', 'redux', 'jotai', 'mobx', 'valtio'],
      forms: ['react-hook-form', 'formik', 'zod', 'yup', 'joi'],
      toast: Array.from({ length: 5 }, (_, i) => `Toast${i}`),
      card: Array.from({ length: 5 }, (_, i) => `Card${i}`),
    });
    expect(report.score).toBe(0);
  });

  it('combines deductions across multiple categories', () => {
    // 2 modals + 2 auth = (10+8) = 18 deduction
    // score = 100 - (18/172)*100 = 89
    const report = buildReportFromCounts({
      modal: ['Modal', 'Dialog'],
      auth: ['useAuth', 'withAuth'],
    });
    const expectedDeduction =
      PATTERN_WEIGHTS.modal * 1 + PATTERN_WEIGHTS.auth * 1;
    const expectedScore = Math.round(100 - (expectedDeduction / PATTERN_NORMALIZER) * 100);
    expect(report.score).toBe(expectedScore);
  });

  it('populates the doNotCreate list for any category with count > 1', () => {
    const report = buildReportFromCounts({
      modal: ['ConfirmModal', 'AlertDialog', 'Drawer'],
      button: ['Button'], // 1 → not in doNotCreate
    });
    expect(report.doNotCreate).toHaveLength(1);
    expect(report.doNotCreate[0]).toContain('modal');
    expect(report.doNotCreate[0]).toContain('3');
    expect(report.doNotCreate[0]).toContain('ConfirmModal');
  });

  it('always includes all 8 categories in byCategory', () => {
    const report = buildReportFromCounts({ modal: ['Modal'] });
    for (const cat of PATTERN_CATEGORIES) {
      expect(report.byCategory[cat]).toBeDefined();
      expect(report.byCategory[cat].weight).toBe(PATTERN_WEIGHTS[cat]);
    }
  });

  it('preserves pattern order (first-seen wins on dedupe)', () => {
    const report = buildReportFromCounts({
      modal: ['A', 'B', 'A', 'C', 'B'],
    });
    expect(report.byCategory.modal.patterns).toEqual(['A', 'B', 'C']);
    expect(report.byCategory.modal.count).toBe(3);
  });

  it('computePatternFragmentation is pure (does not mutate inputs)', () => {
    const report = buildReportFromCounts({ modal: ['Modal', 'Dialog'] });
    const before = JSON.parse(JSON.stringify(report.byCategory));
    computePatternFragmentation(report.byCategory);
    const after = JSON.parse(JSON.stringify(report.byCategory));
    expect(after).toEqual(before);
  });
});

describe('buildPatternFragmentation (integration)', () => {
  it('returns 100/100 for a clean project (one per category)', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/components/Modal.tsx', '');
      writeFile(dir, 'src/components/Button.tsx', '');
      writeFile(dir, 'src/hooks/useAuth.ts', '');
      writeFile(dir, 'src/lib/api/index.ts', '');
      writeFile(dir, 'src/store/index.ts', `import { create } from 'zustand';`);
      writeFile(dir, 'src/forms/index.tsx', `import { useForm } from 'react-hook-form';`);
      writeFile(dir, 'src/components/Toast.tsx', '');
      writeFile(dir, 'src/components/Card.tsx', '');
      const report = await buildPatternFragmentation(
        dir,
        configWith(['src/**/*.{ts,tsx}']),
      );
      expect(report.score).toBe(100);
      expect(report.uxPatternCount).toBe(8);
      expect(report.doNotCreate).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects modal sprawl (multiple modal implementations)', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/components/ConfirmModal.tsx', '');
      writeFile(dir, 'src/components/AlertDialog.tsx', '');
      writeFile(dir, 'src/components/Drawer.tsx', '');
      const report = await buildPatternFragmentation(
        dir,
        configWith(['src/**/*.{ts,tsx}']),
      );
      const modalStats = report.byCategory.modal;
      expect(modalStats.count).toBe(3);
      expect(modalStats.excess).toBe(2);
      expect(modalStats.patterns).toContain('ConfirmModal');
      expect(modalStats.patterns).toContain('AlertDialog');
      expect(modalStats.patterns).toContain('Drawer');
      expect(report.score).toBeLessThan(100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects auth pattern sprawl from hook files', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/hooks/useAuth.ts', '');
      writeFile(dir, 'src/hooks/withAuth.ts', '');
      writeFile(dir, 'src/hooks/requireAuth.ts', '');
      writeFile(dir, 'src/components/AuthGuard.tsx', '');
      const report = await buildPatternFragmentation(
        dir,
        configWith(['src/**/*.{ts,tsx}']),
      );
      expect(report.byCategory.auth.count).toBe(4);
      expect(report.byCategory.auth.excess).toBe(3);
      expect(report.byCategory.auth.patterns).toEqual(
        expect.arrayContaining(['useAuth', 'withAuth', 'requireAuth', 'AuthGuard']),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects state library sprawl from import signals', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/store/user.ts', `import { create } from 'zustand';`);
      writeFile(dir, 'src/store/admin.ts', `import { configureStore } from '@reduxjs/toolkit';`);
      writeFile(dir, 'src/store/settings.ts', `import { atom } from 'jotai';`);
      const report = await buildPatternFragmentation(
        dir,
        configWith(['src/**/*.{ts,tsx}']),
      );
      expect(report.byCategory.state.count).toBe(3);
      expect(report.byCategory.state.patterns).toEqual(
        expect.arrayContaining(['zustand', 'redux', 'jotai']),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects form library sprawl (canonical signals only)', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/forms/a.tsx', `import { useForm } from 'react-hook-form';`);
      writeFile(dir, 'src/forms/b.tsx', `import { useFormik } from 'formik';`);
      writeFile(dir, 'src/forms/c.tsx', `import { z } from 'zod';`);
      const report = await buildPatternFragmentation(
        dir,
        configWith(['src/**/*.{ts,tsx}']),
      );
      expect(report.byCategory.forms.count).toBe(3);
      expect(report.byCategory.forms.patterns).toEqual(
        expect.arrayContaining(['react-hook-form', 'formik', 'zod']),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects api-client modules by directory', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/lib/api/users.ts', '');
      writeFile(dir, 'src/lib/api/orders.ts', '');
      writeFile(dir, 'src/services/payments.ts', '');
      const report = await buildPatternFragmentation(
        dir,
        configWith(['src/**/*.{ts,tsx}']),
      );
      expect(report.byCategory.api.count).toBe(3);
      expect(report.byCategory.api.patterns).toEqual(
        expect.arrayContaining([
          'src/lib/api/users.ts',
          'src/lib/api/orders.ts',
          'src/services/payments.ts',
        ]),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects toast system sprawl from component basenames', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/components/Toast.tsx', '');
      writeFile(dir, 'src/components/Notification.tsx', '');
      writeFile(dir, 'src/components/Snackbar.tsx', '');
      const report = await buildPatternFragmentation(
        dir,
        configWith(['src/**/*.{ts,tsx}']),
      );
      expect(report.byCategory.toast.count).toBe(3);
      expect(report.byCategory.toast.patterns).toEqual(
        expect.arrayContaining(['Toast', 'Notification', 'Snackbar']),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects card variant sprawl from component basenames', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/components/Card.tsx', '');
      writeFile(dir, 'src/components/ProductCard.tsx', '');
      writeFile(dir, 'src/components/UserCard.tsx', '');
      writeFile(dir, 'src/components/Tile.tsx', '');
      const report = await buildPatternFragmentation(
        dir,
        configWith(['src/**/*.{ts,tsx}']),
      );
      expect(report.byCategory.card.count).toBe(4);
      expect(report.byCategory.card.patterns).toEqual(
        expect.arrayContaining(['Card', 'ProductCard', 'UserCard', 'Tile']),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('aggregates a fully-fragmented project to a low score', async () => {
    const dir = freshDir();
    try {
      // 5 modal impls
      writeFile(dir, 'src/components/ConfirmModal.tsx', '');
      writeFile(dir, 'src/components/AlertDialog.tsx', '');
      writeFile(dir, 'src/components/BottomSheet.tsx', '');
      writeFile(dir, 'src/components/Drawer.tsx', '');
      writeFile(dir, 'src/components/Sidebar.tsx', '');
      // 3 button impls
      writeFile(dir, 'src/components/Button.tsx', '');
      writeFile(dir, 'src/components/IconButton.tsx', '');
      writeFile(dir, 'src/components/LinkButton.tsx', '');
      // 4 auth impls
      writeFile(dir, 'src/hooks/useAuth.ts', '');
      writeFile(dir, 'src/hooks/withAuth.ts', '');
      writeFile(dir, 'src/hooks/requireAuth.ts', '');
      writeFile(dir, 'src/components/AuthGuard.tsx', '');
      // 2 state libs
      writeFile(dir, 'src/store/user.ts', `import { create } from 'zustand';`);
      writeFile(dir, 'src/store/admin.ts', `import { configureStore } from '@reduxjs/toolkit';`);
      // 2 form libs
      writeFile(dir, 'src/forms/a.tsx', `import { useForm } from 'react-hook-form';`);
      writeFile(dir, 'src/forms/b.tsx', `import { useFormik } from 'formik';`);
      // 2 toast impls
      writeFile(dir, 'src/components/Toast.tsx', '');
      writeFile(dir, 'src/components/Notification.tsx', '');
      // 4 card impls
      writeFile(dir, 'src/components/Card.tsx', '');
      writeFile(dir, 'src/components/ProductCard.tsx', '');
      writeFile(dir, 'src/components/UserCard.tsx', '');
      writeFile(dir, 'src/components/ArticleCard.tsx', '');
      // 2 api client modules
      writeFile(dir, 'src/lib/api/users.ts', '');
      writeFile(dir, 'src/services/payments.ts', '');

      const report = await buildPatternFragmentation(
        dir,
        configWith(['src/**/*.{ts,tsx}']),
      );
      expect(report.score).toBeLessThan(60);
      // doNotCreate should fire for every fragmented category.
      expect(report.doNotCreate.length).toBeGreaterThanOrEqual(7);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('respects the maxFiles cap', async () => {
    const dir = freshDir();
    try {
      for (let i = 0; i < 5; i++) {
        writeFile(dir, `src/components/Modal${i}.tsx`, '');
      }
      const report = await buildPatternFragmentation(
        dir,
        configWith(['src/**/*.{ts,tsx}']),
        2,
      );
      // Only the first 2 files are scanned → at most 2 modals detected.
      expect(report.scannedFiles).toBe(2);
      expect(report.byCategory.modal.count).toBeLessThanOrEqual(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns 100/100 for a project with no source files', async () => {
    const dir = freshDir();
    try {
      const report = await buildPatternFragmentation(
        dir,
        configWith(['src/**/*.{ts,tsx}']),
      );
      expect(report.score).toBe(100);
      expect(report.scannedFiles).toBe(0);
      expect(report.uxPatternCount).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('handles the on-disk fragmented-app fixture (smoke)', async () => {
    const fixtureDir = join(__dirname, '..', 'fixtures', 'patterns', 'fragmented-app');
    const report = await buildPatternFragmentation(
      fixtureDir,
      configWith(['src/**/*.{ts,tsx}']),
    );
    expect(report.score).toBeLessThan(100);
    expect(report.byCategory.modal.count).toBeGreaterThan(1);
    expect(report.byCategory.button.count).toBeGreaterThan(1);
    expect(report.byCategory.auth.count).toBeGreaterThan(1);
    expect(report.byCategory.card.count).toBeGreaterThan(1);
  });

  it('handles the on-disk clean-app fixture (100/100)', async () => {
    const fixtureDir = join(__dirname, '..', 'fixtures', 'patterns', 'clean-app');
    const report = await buildPatternFragmentation(
      fixtureDir,
      configWith(['src/**/*.{ts,tsx}']),
    );
    expect(report.score).toBe(100);
    expect(report.doNotCreate).toEqual([]);
  });
});
