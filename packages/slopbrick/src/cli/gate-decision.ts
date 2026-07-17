import {
  isIncompleteScan,
  isNotApplicableScan,
} from '../report/scan-validity.js';
import { evaluateThresholdGate, type StagedGatingResult } from './threshold.js';
import type { GateDecision, ProjectReport, ResolvedConfig } from '../types';

export interface GateDecisionInput {
  report: ProjectReport;
  config: ResolvedConfig;
  noIncreaseFailure?: boolean;
  stagedGating?: StagedGatingResult;
  strictFailure?: boolean;
  newDebtFailure?: boolean;
  gitScopedEmptySelection?: boolean;
  maxSlop?: number;
  constitutionDrift?: number;
  strictConstitution?: boolean;
}

function reasonLabel(reason: GateDecision['reasons'][number], failedThresholds: readonly string[]): string {
  switch (reason) {
    case 'threshold':
      return `thresholds: ${failedThresholds.join(', ')}`;
    case 'no-increase':
      return 'no-increase history comparison';
    case 'staged':
      return 'staged-file gate';
    case 'strict':
      return 'strict high-severity gate';
    case 'max-slop':
      return 'max-slop limit';
    case 'max-new-issues':
      return 'max-new-issues limit';
    case 'constitution':
      return 'constitution gate';
    case 'incomplete-scan':
      return 'incomplete scan';
    case 'no-files-selected':
      return 'no files selected';
    case 'no-files-analyzed':
      return 'no files analyzed';
  }
}

function decision(
  status: GateDecision['status'],
  exitCode: GateDecision['exitCode'],
  evaluated: boolean,
  reasons: GateDecision['reasons'],
  failedThresholds: readonly string[],
): GateDecision {
  const prefix = status === 'passed'
    ? 'Gate decision: pass'
    : status === 'failed'
      ? 'Gate decision: fail'
      : 'Gate decision: not evaluated';
  const details = reasons.length > 0
    ? ` (${reasons.map((reason) => reasonLabel(reason, failedThresholds)).join('; ')})`
    : '';
  return {
    kind: 'slopbrick-gate-decision-v1',
    status,
    exitCode,
    evaluated,
    reasons,
    failedThresholds,
    summary: `${prefix}${details}`,
  };
}

/**
 * Evaluate every gate that the shared scan action can know before rendering.
 * The returned value is attached to the report and is also the process exit
 * recommendation, so renderers cannot disagree with the CLI outcome.
 */
export function evaluateGateDecision(input: GateDecisionInput): GateDecision {
  const { report, config } = input;

  if (isIncompleteScan(report)) {
    return decision('not-evaluated', 1, false, ['incomplete-scan'], []);
  }
  if (isNotApplicableScan(report)) {
    return decision(
      'not-evaluated',
      input.gitScopedEmptySelection ? 0 : 1,
      false,
      [input.gitScopedEmptySelection ? 'no-files-selected' : 'no-files-analyzed'],
      [],
    );
  }

  const threshold = evaluateThresholdGate(report, config);
  const failedThresholds = threshold.status === 'failed' ? threshold.failedThresholds : [];
  const reasons: GateDecision['reasons'][number][] = [];
  if (failedThresholds.length > 0) reasons.push('threshold');
  if (input.noIncreaseFailure) reasons.push('no-increase');
  if (input.stagedGating?.failed) reasons.push('staged');
  if (input.strictFailure) reasons.push('strict');
  if (input.maxSlop !== undefined && report.aiSlopScore > input.maxSlop) reasons.push('max-slop');
  if (input.newDebtFailure) reasons.push('max-new-issues');
  if (input.strictConstitution && (input.constitutionDrift ?? 0) > 0) reasons.push('constitution');

  return reasons.length === 0
    ? decision('passed', 0, true, [], [])
    : decision('failed', 1, true, reasons, failedThresholds);
}
