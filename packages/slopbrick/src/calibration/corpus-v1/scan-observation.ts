import type { FileScanResult, Issue } from '../../types';
import type { V103MetricObservation } from '../v103/metrics';
import type { V103RuleEvidence } from '../v103/rule-evidence';

export interface CorpusV1ScanObservationRow {
  readonly unitId: string;
  readonly sourceId: string;
  readonly familyKey: string;
  readonly language: string;
  readonly label: 'positive' | 'negative';
}

function ruleEvidence(issues: readonly Issue[]): readonly V103RuleEvidence[] | undefined {
  const byRule = new Map<string, V103RuleEvidence>();
  for (const issue of issues) {
    const existing = byRule.get(issue.ruleId);
    if (existing === undefined) {
      byRule.set(issue.ruleId, {
        ruleId: issue.ruleId,
        category: issue.category,
        aiSpecific: issue.aiSpecific,
        severity: issue.severity,
        count: 1,
      });
    } else {
      if (existing.category !== issue.category || existing.aiSpecific !== issue.aiSpecific || existing.severity !== issue.severity) {
        throw new Error(`scanner emitted inconsistent evidence for ${issue.ruleId}`);
      }
      byRule.set(issue.ruleId, { ...existing, count: existing.count + 1 });
    }
  }
  if (byRule.size === 0) return undefined;
  return [...byRule.values()].sort((left, right) => left.ruleId.localeCompare(right.ruleId));
}

export function buildCorpusV1Observation(
  row: CorpusV1ScanObservationRow,
  runId: string,
  result: FileScanResult,
): V103MetricObservation {
  const identity = {
    version: 'v10.3' as const,
    runId,
    fileId: row.unitId,
    repositoryId: row.sourceId,
    familyId: row.familyKey,
    language: row.language,
    polarity: row.label === 'positive' ? 'verified_ai' as const : 'verified_human' as const,
  };
  if (result.failureKind === 'parse' || (result.parseError !== undefined && result.failureKind === undefined)) {
    return { ...identity, status: 'parse_failure', failureCode: 'parse_failure' };
  }
  if (result.failureKind !== undefined) return { ...identity, status: 'scanner_failure', failureCode: result.failureKind };
  const evidence = ruleEvidence(result.issues);
  if (result.issues.length === 0) return { ...identity, status: 'success_zero', findingsCount: 0 };
  return { ...identity, status: 'success_findings', findingsCount: result.issues.length, ...(evidence === undefined ? {} : { ruleEvidence: evidence }) };
}
