import { describe, expect, it } from 'vitest';
import {
  computeFlywheelOutput,
  loadFlywheelState,
  migrateFlywheelState,
  saveFlywheelState,
  severityBump,
  severityRelax,
  FLYWHEEL_VERSION,
} from '../src/engine/flywheel';
import { DEFAULT_CONFIG } from '../src/config';
import type {
  FlywheelState,
  Issue,
  Rule,
  RuleContext,
  SlopAuditRun,
} from '../src/types';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const makeRun = (
  topOffenseIds: string[],
  slopIndex = 10,
): SlopAuditRun => ({
  timestamp: new Date().toISOString(),
  version: '0.6.0',
  slopIndex,
  categoryScores: {
    visual: 0, typo: 0, wcag: 0, layout: 0, component: 0, logic: 0, arch: 0, perf: 0, security: 0, test: 0,    docs: 0,    db: 0,    ai: 0,    context: 0,    product: 0,    i18n: 0,},
  topOffenseIds,
  thresholdExceeded: false,
});

const config = DEFAULT_CONFIG;
const rules: Rule[] = [];

describe('computeFlywheelOutput', () => {
  it('auto-tunes a rule after 3 consecutive top-3 appearances', () => {
    const runs = [
      makeRun(['logic/key-prop-index', 'visual/ai-default-palette', 'wcag/missing-alt']),
      makeRun(['logic/key-prop-index', 'visual/ai-default-palette', 'wcag/missing-alt']),
      makeRun(['logic/key-prop-index', 'visual/ai-default-palette', 'wcag/missing-alt']),
    ];
    const output = computeFlywheelOutput(runs, [], [], [], config, rules);
    expect(output.autoTuned.some((t) => t.ruleId === 'logic/key-prop-index')).toBe(true);
  });

  it('emits a chronic-offender issue for persistent top files', () => {
    const currentTopFiles = [{ filePath: 'Button.tsx', hash: 'abc123' }];
    const recentTopHashes = [['abc123'], ['abc123']];
    const runs = [
      makeRun(['logic/key-prop-index'], 10),
      makeRun(['logic/key-prop-index'], 10),
      makeRun(['logic/key-prop-index'], 10),
    ];
    const output = computeFlywheelOutput(runs, currentTopFiles, recentTopHashes, [], config, rules);
    expect(output.hotspotIssues.some((i) => i.ruleId === 'component/chronic-offender')).toBe(true);
  });

  it('suggests a rule for repeated unmatched strings', () => {
    const literals = ['AI generated content here', 'AI generated content here'];
    const output = computeFlywheelOutput([], [], [], literals, config, rules);
    expect(output.suggestions.length).toBeGreaterThan(0);
  });
});

describe('migrateFlywheelState', () => {
  it('migrates a legacy state object without a version', () => {
    const migrated = migrateFlywheelState({ autoTuned: [] });
    expect(migrated.version).toBe(FLYWHEEL_VERSION);
    expect(migrated.autoTuned).toEqual([]);
    expect(typeof migrated.updatedAt).toBe('string');
  });

  it('migrates a legacy state object while preserving auto-tuned rules', () => {
    const legacy = {
      version: '1',
      autoTuned: [{ ruleId: 'x', severity: 'medium' as const, reason: 'y' }],
    };
    const migrated = migrateFlywheelState(legacy);
    expect(migrated.version).toBe(FLYWHEEL_VERSION);
    expect(migrated.autoTuned).toHaveLength(1);
  });

  it('migrates malformed state file gracefully', () => {
    const migrated = migrateFlywheelState({ malformed: true } as unknown as Partial<FlywheelState>);
    expect(migrated.version).toBe(FLYWHEEL_VERSION);
    expect(migrated.autoTuned).toEqual([]);
  });
});

describe('loadFlywheelState', () => {
  it('migrates a legacy state file missing required fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-flywheel-test-'));
    try {
      const flywheelDir = join(dir, '.slopbrick', 'flywheel');
      mkdirSync(flywheelDir, { recursive: true });
      writeFileSync(join(flywheelDir, 'auto-tuned.json'), JSON.stringify({ autoTuned: [] }));
      const state = loadFlywheelState(dir);
      expect(state.version).toBe(FLYWHEEL_VERSION);
      expect(state.autoTuned).toEqual([]);
      expect(typeof state.updatedAt).toBe('string');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * v0.40.0 (Sprint 2.1): the relaxation half of the flywheel
 * ratchet. Mirrors `severityBump` (which still has its own
 * existing tests above). Each case asserts both the new
 * severity AND that the floor is `'off'`, since the asymmetry
 * between bump-saturates-at-high and relax-floors-at-off is
 * the whole point of the test.
 */
describe('severityRelax', () => {
  it('walks one step down on every Severity value', () => {
    expect(severityRelax('high')).toBe('medium');
    expect(severityRelax('medium')).toBe('low');
  });

  it('floors at "off" when the input is "low"', () => {
    expect(severityRelax('low')).toBe('off');
  });

  it('idempotently returns "off" once at the floor', () => {
    expect(severityRelax('off')).toBe('off');
    expect(severityRelax(severityRelax('off'))).toBe('off');
  });

  it('mirror round-trip works for in-bound values', () => {
    // ∀ x ∈ {low, medium}: severityRelax(severityBump(x)) === x
    expect(severityRelax(severityBump('low'))).toBe('low');
    expect(severityRelax(severityBump('medium'))).toBe('medium');
  });

  it('mirror breaks at "high" — bump saturates, relax walks down', () => {
    // This asymmetry is the structural difference between the
    // two halves: bump saturates at 'high', relax floors at
    // 'off' but keeps walking through 'medium' and 'low'.
    expect(severityBump('high')).toBe('high');
    expect(severityRelax('high')).toBe('medium');
  });
});

/**
 * v0.40.0 (Sprint 2.1): autoRelaxed emission.
 *
 * Bumping side already covered above. The relaxation side
 * fires when a rule has stayed in `topOffenseIds` for
 * IGNORE_THRESHOLD (5) consecutive scans WITHOUT being bumped
 * in any of them. It produces an AutoRelaxedRule entry with
 * severity relaxed one step, previousSeverity set, and a
 * string reason citing the streak + prior.
 */
describe('computeFlywheelOutput — autoRelaxed (v0.40.0 two-way loop)', () => {
  // Pin the rule-shape: a minimal valid Rule has id, category,
  // severity, aiSpecific, create, analyze. create() must return
  // an opaque context object (the relaxer doesn't read it).
  const makeRule = (
    ruleId: string,
    severity: 'low' | 'medium' | 'high',
  ): Rule => ({
    id: ruleId,
    category: 'logic',
    severity,
    aiSpecific: false,
    create: () => ({}) as unknown as RuleContext,
    analyze: () => [],
  });

  it('BOTH bumps and relaxes a rule that is consistently in top-3 (the realistic case)', () => {
    // v0.40.0 (Sprint 2.1): the bump and relax halves are
    // independent signals on top of the same data. A rule that
    // is in top-3 for 3+ scans bumps (system view: "rule
    // matters"); the same rule in 5+ scans also relaxes (user
    // view: "user keeps ignoring"). Both fire on the same scan.
    const targetRule = makeRule('logic/key-prop-index', 'medium');
    const runs = [
      makeRun(['logic/key-prop-index', 'a', 'b'], 10),
      makeRun(['logic/key-prop-index', 'a', 'b'], 10),
      makeRun(['logic/key-prop-index', 'a', 'b'], 10),
      makeRun(['logic/key-prop-index', 'c', 'd'], 10),
      makeRun(['logic/key-prop-index', 'c', 'd'], 10),
      makeRun(['logic/key-prop-index', 'c', 'd'], 10),
    ];
    const output = computeFlywheelOutput(
      runs, [], [], [], config, [targetRule],
    );
    // Bump side fires.
    expect(output.autoTuned.some((t) => t.ruleId === 'logic/key-prop-index')).toBe(true);
    // Relax side ALSO fires — distinct from the bump, recorded
    // separately, persisted as a second entry in `autoRelaxed`.
    expect(output.autoRelaxed.some((r) => r.ruleId === 'logic/key-prop-index')).toBe(true);
  });

  it('relaxes a rule that hit IGNORE_THRESHOLD consecutive top-3 scans', () => {
    // 6 consecutive scans with the target in every top-3 +
    // 2 cyclers that change each scan. The target will
    // BOTH bump (3 consecutive → bump) AND relax (5+
    // consecutive → relax). They are independent signals.
    // Here we focus the assertion on the relaxer's payload
    // shape.
    const targetRule = makeRule('logic/key-prop-index', 'high');
    const otherRules = ['a', 'b', 'c', 'd', 'e', 'f'];
    const runs = otherRules.map((other, i) =>
      makeRun(['logic/key-prop-index', other, `${other}2`], 10),
    );
    expect(runs).toHaveLength(6);
    const output = computeFlywheelOutput(
      runs, [], [], [], config, [targetRule],
    );
    const r = output.autoRelaxed.find((x) => x.ruleId === 'logic/key-prop-index');
    expect(r).toBeDefined();
    expect(r?.severity).toBe('medium'); // high → medium
    expect(r?.previousSeverity).toBe('high');
    expect(r?.defaultPrior).toBeCloseTo(0.30);
    expect(typeof r?.reason).toBe('string');
    expect(r?.reason).toMatch(/consecutive scans/);
    expect(typeof r?.relaxedAt).toBe('string');
    // Sanity: bump side also fires (independent signal).
    expect(output.autoTuned.some((t) => t.ruleId === 'logic/key-prop-index')).toBe(true);
  });

  it('walks one ratchet step per call (high → medium on a single scan)', () => {
    const targetRule = makeRule('logic/key-prop-index', 'high');
    const otherRules = ['a', 'b', 'c', 'd', 'e', 'f'];
    const runs = otherRules.map((other, i) =>
      makeRun(['logic/key-prop-index', other, `${other}2`], 10),
    );
    const output = computeFlywheelOutput(
      runs, [], [], [], config, [targetRule],
    );
    expect(output.autoRelaxed).toHaveLength(1);
    expect(output.autoRelaxed[0]?.severity).toBe('medium');
  });

  it('floors at "off" when the input is already "low"', () => {
    const targetRule = makeRule('logic/low-rule', 'low');
    const otherRules = ['a', 'b', 'c', 'd', 'e', 'f'];
    const runs = otherRules.map((other, i) =>
      makeRun(['logic/low-rule', other, `${other}2`], 10),
    );
    const output = computeFlywheelOutput(
      runs, [], [], [], config, [targetRule],
    );
    const r = output.autoRelaxed.find((x) => x.ruleId === 'logic/low-rule');
    expect(r?.severity).toBe('off');
    expect(r?.previousSeverity).toBe('low');
  });

  it('does NOT relax when the streak is below IGNORE_THRESHOLD (4 scans)', () => {
    const targetRule = makeRule('logic/short-streak', 'medium');
    const otherRules = ['a', 'b', 'c', 'd'];
    const runs = otherRules.map((other, i) =>
      makeRun(['logic/short-streak', other, `${other}2`], 10),
    );
    const output = computeFlywheelOutput(
      runs, [], [], [], config, [targetRule],
    );
    expect(output.autoRelaxed.some((r) => r.ruleId === 'logic/short-streak')).toBe(false);
  });

  it('asymmetry: bump fires at 3 runs, relax requires 5', () => {
    // Pins the threshold asymmetry explicitly. The bump
    // direction (CONSECUTIVE_THRESHOLD = 3) is alive well
    // before the relaxation direction (IGNORE_THRESHOLD = 5).
    const targetRule = makeRule('logic/no-window', 'medium');
    const runs = [
      makeRun(['logic/no-window', 'a', 'b'], 10),
      makeRun(['logic/no-window', 'c', 'd'], 10),
      makeRun(['logic/no-window', 'e', 'f'], 10),
    ];
    const output = computeFlywheelOutput(
      runs, [], [], [], config, [targetRule],
    );
    // Bump side IS triggered (3 consecutive top-3).
    expect(output.autoTuned.some((t) => t.ruleId === 'logic/no-window')).toBe(true);
    // Relax side is not (5-run window not satisfied).
    expect(output.autoRelaxed.some((r) => r.ruleId === 'logic/no-window')).toBe(false);
  });

  it('does NOT relax when fewer than IGNORE_THRESHOLD runs exist at all', () => {
    const targetRule = makeRule('logic/very-short-history', 'medium');
    const runs = [
      makeRun(['logic/very-short-history', 'a', 'b'], 10),
      makeRun(['logic/very-short-history', 'c', 'd'], 10),
    ];
    const output = computeFlywheelOutput(
      runs, [], [], [], config, [targetRule],
    );
    expect(output.autoRelaxed.some((r) => r.ruleId === 'logic/very-short-history')).toBe(false);
  });
});

/**
 * v0.40.0 (Sprint 2.1): state migration v2 → v3.
 *
 * v0.39.x state files have `autoTuned` but no `autoRelaxed`.
 * The migration carries both fields forward correctly: a v2
 * state gains `autoRelaxed: []`, and a v3 state with
 * relaxations preserves them.
 */
describe('migrateFlywheelState — v2 → v3 (v0.40.0 two-way loop)', () => {
  it('migrates a v2 state without autoRelaxed to v3 with autoRelaxed: []', () => {
    const v2 = {
      version: '2',
      autoTuned: [{ ruleId: 'x', severity: 'high' as const, reason: 'y' }],
    };
    const migrated = migrateFlywheelState(v2);
    expect(migrated.version).toBe(FLYWHEEL_VERSION);
    expect(migrated.autoTuned).toEqual(v2.autoTuned);
    expect(migrated.autoRelaxed).toEqual([]);
  });

  it('preserves a v3 state autoRelaxed across migration', () => {
    const v3 = {
      version: '3',
      autoTuned: [{ ruleId: 'x', severity: 'high' as const, reason: 'y' }],
      autoRelaxed: [
        {
          ruleId: 'y',
          severity: 'off' as const,
          previousSeverity: 'low' as const,
          reason: 'z',
          defaultPrior: 0.30,
          relaxedAt: '2026-07-04T18:00:00Z',
        },
      ],
    };
    const migrated = migrateFlywheelState(v3);
    expect(migrated.version).toBe(FLYWHEEL_VERSION);
    expect(migrated.autoRelaxed).toEqual(v3.autoRelaxed);
  });

  it('round-trips a fresh empty state through load → save → load', () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-flywheel-test-'));
    try {
      const flywheelDir = join(dir, '.slopbrick', 'flywheel');
      mkdirSync(flywheelDir, { recursive: true });
      const empty = loadFlywheelState(dir);
      expect(empty.version).toBe(FLYWHEEL_VERSION);
      expect(empty.autoRelaxed).toEqual([]);
      saveFlywheelState(dir, empty);
      const reloaded = loadFlywheelState(dir);
      expect(reloaded.autoRelaxed).toEqual([]);
      expect(reloaded.version).toBe(FLYWHEEL_VERSION);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
