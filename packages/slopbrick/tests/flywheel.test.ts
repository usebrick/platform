import { describe, expect, it } from 'vitest';
import {
  computeFlywheelOutput,
  loadFlywheelState,
  migrateFlywheelState,
  FLYWHEEL_VERSION,
} from '../src/engine/flywheel';
import { DEFAULT_CONFIG } from '../src/config';
import type { FlywheelState, Issue, Rule, SlopAuditRun } from '../src/types';
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
    visual: 0, typo: 0, wcag: 0, layout: 0, component: 0, logic: 0, arch: 0, perf: 0, security: 0, test: 0,    docs: 0,    db: 0,},
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
