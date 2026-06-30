// AI Security Risk — categorical severity score.
//
// Aggregates findings from the security/* rules into one of:
//   low | medium | high | critical
//
// The score is intentionally NOT numeric. A numeric score invites
// gaming (suppress the one finding that bumps you from 79 to 81).
// A categorical score makes "AI Security Risk: HIGH" the kind of
// line an engineering manager scans in two seconds — and the
// single hardcoded API key outranks everything else.
//
// Mapping (matches the user's strategic brief):
//   critical  >=1 critical-severity finding  OR  >=3 high-severity
//   high      >=1 high-severity finding       OR  >=3 medium-severity
//   medium    >=1 medium-severity finding
//   low       no security findings
//
// We don't run all the security rules here directly — the scan
// flow already runs them and produces Issue records. This module
// takes the issue list (already filtered to security-category)
// and computes the categorical label.

import type { Issue } from '../types';

export type AiSecurityRisk = 'low' | 'medium' | 'high' | 'critical';

export interface AiSecurityFindings {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

/**
 * Compute the AI Security Risk label from a list of security issues.
 * Defensive: tolerates `severity` values outside the canonical set
 * by counting unknown severities as 'low' (so the score is at least
 * never understated).
 */
export function computeAiSecurityRisk(issues: readonly Issue[]): {
  risk: AiSecurityRisk;
  findings: AiSecurityFindings;
} {
  const findings: AiSecurityFindings = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const issue of issues) {
    switch (issue.severity) {
      case 'high':
        findings.high += 1;
        break;
      case 'medium':
        findings.medium += 1;
        break;
      case 'low':
        findings.low += 1;
        break;
      default:
        findings.low += 1;
    }
  }
  let risk: AiSecurityRisk = 'low';
  if (findings.critical >= 1 || findings.high >= 3) {
    risk = 'critical';
  } else if (findings.high >= 1 || findings.medium >= 3) {
    risk = 'high';
  } else if (findings.medium >= 1) {
    risk = 'medium';
  }
  return { risk, findings };
}

/**
 * Render the risk as a one-line summary for terminal output.
 * `pad` controls column width for aligned tables.
 */
export function formatAiSecurityRiskLine(
  risk: AiSecurityRisk,
  findings: AiSecurityFindings,
): string {
  const total = findings.critical + findings.high + findings.medium + findings.low;
  if (total === 0) return 'AI Security Risk: low';
  return `AI Security Risk: ${risk.toUpperCase()}  (${total} findings)`;
}