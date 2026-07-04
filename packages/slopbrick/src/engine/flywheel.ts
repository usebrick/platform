import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  AutoRelaxedRule,
  AutoTunedRule,
  FlywheelOutput,
  FlywheelState,
  Issue,
  ResearchMetrics,
  ResolvedConfig,
  Rule,
  RuleSuggestion,
  Severity,
  SlopAuditRun,
} from '../types';

const FLYWHEEL_DIR = '.slopbrick/flywheel';
const STATE_FILE = 'auto-tuned.json';
const CONSECUTIVE_THRESHOLD = 3;

/**
 * v0.40.0 (Sprint 2.1): number of consecutive scans a rule may
 * stay in `topOffenseIds` without being acted on before the
 * flywheel proposes a relaxation. 5 is the design-doc recommendation
 * (the strategy memo section "Self-calibration loop"); chosen so
 * it crosses the existing 3-scan bump threshold with a margin —
 * a rule that the bump-promoted would still need to be
 * ignored 2 more times before relaxation kicks in.
 */
const IGNORE_THRESHOLD = 5;

/**
 * Default AI-corpus prevalence used when emitting `AutoRelaxedRule`
 * entries. Mirrors the engine's `composite-scoring.ts`
 * `DEFAULT_PRIOR_PREVALENCE` so the relaxation's `defaultPrior`
 * is consistent with the Bayesian composite score computed at
 * scan time. If the user later changes prior via a future
 * config field, replay the relaxation against the new prior.
 */
const DEFAULT_RELAXATION_PRIOR = 0.30;

// v0.40.0 (Sprint 2.1): bumped to v3 to carry the new
// `autoRelaxed` field. v2 state files (pre-v0.40.0) load cleanly
// via `migrateFlywheelState` (the field defaults to `[]`). v1
// state files (pre-2024) also load; both new fields default.
export const FLYWHEEL_VERSION = '3';

export function severityBump(severity: Severity): Severity {
  const order: Severity[] = ['low', 'medium', 'high'];
  const idx = order.indexOf(severity);
  return order[Math.min(idx + 1, order.length - 1)]!;
}

/**
 * v0.40.0 (Sprint 2.1): mirror of `severityBump`. Walks
 * `high → medium → low → off`. The floor is `'off'` because
 * the relaxation's purpose is "stop firing on this rule" —
 * if the rule keeps getting ignored even at `low`, the only
 * honest answer is "the user has ruled this rule out for
 * their repo." `'off'` here corresponds to the existing
 * `config.rules[id] = 'off'` user override.
 *
 * Note: `severityBump` and `severityRelax` are inverses on the
 * bounded `['low', 'medium', 'high']` interval but have different
 * floors — bump saturates at `'high'`; relax walks through
 * `'high'` and out the other end to `'off'`.
 *
 * Return type widens to `Severity | 'off'` so callers can carry
 * the floor into `AutoRelaxedRule.severity`. The base `Severity`
 * type itself stays `'low' | 'medium' | 'high'` because
 * `AutoTunedRule` (the upward direction) genuinely never sees
 * `'off'` — it would be a type error to widen the whole category.
 */
export function severityRelax(severity: Severity): Severity | 'off' {
  // Order is `'off' < 'low' < 'medium' < 'high'`. We walk
  // down one step, floor at `'off'`. Once a rule reaches
  // `'off'`, the read-side (`cli/scan.ts`) skips it for this
  // scan; the entry persists in `autoRelaxed` so re-enabling
  // the rule in `slopbrick.config.mjs` doesn't immediately
  // re-fire.
  //
  // The array type widens to `Severity | 'off'` because the
  // base `Severity` union excludes `'off'` (see
  // `types/primitives.ts`). Walking down the array requires
  // the floor element to be present.
  const order: Array<Severity | 'off'> = ['off', 'low', 'medium', 'high'];
  const idx = order.indexOf(severity);
  if (idx <= 0) return 'off';
  return order[idx - 1]!;
}

export function resolveEffectiveSeverity(
  override: ResolvedConfig['rules'][string],
  defaultSeverity: Severity,
): Severity {
  if (override === undefined || override === 'off' || override === 'auto') {
    return defaultSeverity;
  }
  return override;
}

function countConsecutiveTopOffenses(
  runs: SlopAuditRun[],
  ruleId: string,
): number {
  let count = 0;
  for (let i = runs.length - 1; i >= 0; i--) {
    if (runs[i]!.topOffenseIds.includes(ruleId)) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * v0.40.0 (Sprint 2.1): count of consecutive top-3 appearances.
 *
 * Originally had a `bumpedRuleIds` parameter that broke the
 * streak on bump. That was wrong design — bumping and relaxing
 * are TWO independent signals on top of the same data: the
 * bump says "this rule matters in this corpus" (system view);
 * the relax says "the user has been ignoring this rule for 5+
 * scans" (user view). They're orthogonal. The bump does not
 * indicate user action any more than the relax does. A user
 * who ignores a `dead/unused-import` finding for 5+ scans
 * should have that rule relaxed — even if the system has
 * simultaneously bumped it because it's been in top-3.
 *
 * The correct helper is just `countConsecutiveTopOffenses`
 * (defined above) — no bump-aware variant needed.
 */

function countConsecutiveTopFileAppearances(
  currentHash: string,
  recentTopHashes: string[][],
): number {
  let consecutive = 1; // current run
  for (let i = recentTopHashes.length - 1; i >= 0; i--) {
    if (recentTopHashes[i]!.includes(currentHash)) {
      consecutive++;
    } else {
      break;
    }
  }
  return consecutive;
}

export function computeFlywheelOutput(
  runs: SlopAuditRun[],
  currentTopFiles: { filePath: string; hash: string }[],
  recentTopHashes: string[][],
  unmatchedStringLiterals: string[],
  config: ResolvedConfig,
  rules: Rule[],
): FlywheelOutput {
  const autoTuned: AutoTunedRule[] = [];
  const autoRelaxed: AutoRelaxedRule[] = [];
  const hotspotIssues: Issue[] = [];
  const suggestions: RuleSuggestion[] = [];
  const ruleById = new Map(rules.map((r) => [r.id, r]));

  if (runs.length >= CONSECUTIVE_THRESHOLD) {
    const allRuleIds = new Set(runs.slice(-CONSECUTIVE_THRESHOLD).flatMap((r) => r.topOffenseIds));
    for (const ruleId of allRuleIds) {
      if (countConsecutiveTopOffenses(runs, ruleId) >= CONSECUTIVE_THRESHOLD) {
        const rule = ruleById.get(ruleId);
        const currentSeverity = resolveEffectiveSeverity(
          config.rules[ruleId]!,
          rule?.severity ?? 'medium',
        );
        autoTuned.push({
          ruleId,
          severity: severityBump(currentSeverity),
          reason: `In top-3 offenses for ${CONSECUTIVE_THRESHOLD} consecutive scans`,
        });
      }
    }
  }

  // v0.40.0 (Sprint 2.1): relaxation pass. Independent of the
  // bump pass above — a rule CAN appear in both `autoTuned` and
  // `autoRelaxed` in the same output. Bumping is the system
  // signal ("rule matters"); relaxation is the user signal
  // ("user keeps ignoring"); they are orthogonal and the
  // read-side resolves them by writing both into
  // `config.rules[id]` (relaxation wins on the next scan's
  // severity assignment, but the persisted state carries
  // both so the user can audit).
  //
  // Window: last `IGNORE_THRESHOLD` scans. Outside this window,
  // the streak signal is too stale to act on — a rule that
  // was in top-3 last month isn't being ignored NOW.
  if (runs.length >= IGNORE_THRESHOLD) {
    // Candidate set: every rule that appeared in the recent
    // top-3 across the window. Distinct from the bump's set
    // (which uses `slice(-CONSECUTIVE_THRESHOLD)` — last 3).
    const window = runs.slice(-IGNORE_THRESHOLD);
    const candidateRuleIds = new Set(window.flatMap((r) => r.topOffenseIds));
    for (const ruleId of candidateRuleIds) {
      const rule = ruleById.get(ruleId);
      const defaultSeverity = rule?.severity ?? 'medium';
      const currentSeverity = resolveEffectiveSeverity(
        config.rules[ruleId] ?? 'auto',
        defaultSeverity,
      );
      // Streak: walks the ENTIRE history of `runs`. The recent
      // window already filters to the candidates that appeared
      // recently; counting from `runs.length - 1` backward
      // stops at the first scan where the rule was not in
      // top-3 (= the user fixed it or it stopped firing).
      const streak = countConsecutiveTopOffenses(runs, ruleId);
      if (streak >= IGNORE_THRESHOLD) {
        autoRelaxed.push({
          ruleId,
          severity: severityRelax(currentSeverity),
          previousSeverity: currentSeverity,
          reason: `In top-3 offenses for ${streak} consecutive scans; corpus prior ${DEFAULT_RELAXATION_PRIOR.toFixed(2)} suggests the rule is high-FP for this corpus slice.`,
          defaultPrior: DEFAULT_RELAXATION_PRIOR,
          relaxedAt: new Date().toISOString(),
        });
      }
    }
  }

  if (currentTopFiles.length > 0 && runs.length >= CONSECUTIVE_THRESHOLD) {
    for (const file of currentTopFiles) {
      const consecutive = countConsecutiveTopFileAppearances(file.hash, recentTopHashes);
      if (consecutive >= CONSECUTIVE_THRESHOLD) {
        hotspotIssues.push({
          ruleId: 'component/chronic-offender',
          category: 'component',
          severity: 'low',
          aiSpecific: false,
          message: `File has been in the top slop files for ${consecutive} consecutive scans`,
          filePath: file.filePath,
          line: 1,
          column: 1,
          advice: 'Prioritize refactoring this file or add it to the baseline.',
        });
      }
    }
  }

  // Simple suggestion heuristic: repeated string literals that look like placeholder copy.
  const literalCounts = new Map<string, number>();
  for (const literal of unmatchedStringLiterals) {
    const normalized = literal.toLowerCase().trim();
    if (normalized.length < 10) continue;
    literalCounts.set(normalized, (literalCounts.get(normalized) ?? 0) + 1);
  }
  for (const [literal, count] of literalCounts) {
    if (count >= 2) {
      suggestions.push({
        pattern: literal,
        example: unmatchedStringLiterals.find((l) => l.toLowerCase().trim() === literal) ?? literal,
        count,
        suggestedRuleId: 'typo/placeholder-text',
      });
    }
  }

  return { autoTuned, autoRelaxed, hotspotIssues, suggestions };
}

export function migrateFlywheelState(state: Partial<FlywheelState>): FlywheelState {
  // v0.40.0 (Sprint 2.1): `autoRelaxed` is the only new field.
  // v2 files (pre-2025-07-04, pre-v0.40.0) don't carry it. The
  // migration defaults to `[]`, matching the existing pattern
  // for `autoTuned`. Both arrays are required fields on
  // `FlywheelState` from v3 onward, so any caller that loads a
  // v2 file via `loadFlywheelState` is guaranteed the
  // empty-list default.
  return {
    version: FLYWHEEL_VERSION,
    updatedAt: state.updatedAt ?? new Date().toISOString(),
    autoTuned: state.autoTuned ?? [],
    autoRelaxed: state.autoRelaxed ?? [],
    research: state.research,
  };
}

export function loadFlywheelState(cwd: string): FlywheelState {
  const path = join(cwd, FLYWHEEL_DIR, STATE_FILE);
  if (!existsSync(path)) {
    return migrateFlywheelState({});
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<FlywheelState>;
    return migrateFlywheelState(parsed);
  } catch {
    return migrateFlywheelState({});
  }
}

/**
 * Read research/corpus-analysis artifacts from the flywheel directory and
 * build a ResearchMetrics snapshot. Returns undefined when nothing is on
 * disk so callers can distinguish "no research yet" from "research ran but
 * found 0".
 */
export function loadResearchMetricsFromDisk(cwd: string): ResearchMetrics | undefined {
  const flywheelDir = join(cwd, FLYWHEEL_DIR);
  const analysisPath = join(flywheelDir, 'analysis.json');
  const candidatesPath = join(flywheelDir, 'rule-candidates.json');

  const hasAnalysis = existsSync(analysisPath);
  const hasCandidates = existsSync(candidatesPath);
  if (!hasAnalysis && !hasCandidates) return undefined;

  let generatedSampleCount = 0;
  let generatedRuleCoverage = 0;
  let candidateYield = 0;

  if (hasAnalysis) {
    try {
      const raw = JSON.parse(readFileSync(analysisPath, 'utf8')) as {
        summary?: { total?: number; coverage?: number };
      };
      generatedSampleCount = raw.summary?.total ?? 0;
      generatedRuleCoverage = raw.summary?.coverage ?? 0;
    } catch {
      // Corrupt analysis.json — ignore; don't poison the rest.
    }
  }

  if (hasCandidates) {
    try {
      const raw = JSON.parse(readFileSync(candidatesPath, 'utf8')) as {
        candidates?: unknown[];
      };
      candidateYield = raw.candidates?.length ?? 0;
    } catch {
      // Ignore.
    }
  }

  return {
    generatedSampleCount,
    generatedRuleCoverage,
    candidateYield,
    updatedAt: new Date().toISOString(),
  };
}

export function saveFlywheelState(cwd: string, state: FlywheelState): void {
  const dir = join(cwd, FLYWHEEL_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, STATE_FILE), JSON.stringify(state, null, 2));
}

export function hashFile(filePath: string): string {
  return createHash('sha256').update(filePath).digest('hex').slice(0, 16);
}
