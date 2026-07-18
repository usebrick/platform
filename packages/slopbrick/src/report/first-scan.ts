import type {
  Category,
  DebtBaseline,
  FirstScanActionChange,
  FirstScanAreaId,
  FirstScanExperience,
  FirstScanFinding,
  FirstScanFindingAction,
  FirstScanFindingEvidence,
  FirstScanHeadline,
  FirstScanRecommendedAction,
  Issue,
  ProjectReport,
  Severity,
} from '../types';
import { classifyFindingContext } from './finding-context';
import { findingIdentity, repositoryRelativeFindingLocation } from './finding-identity';

export const FIRST_SCAN_AREA_BY_CATEGORY: Record<Category, FirstScanAreaId> = {
  visual: 'visual-slop',
  typo: 'visual-slop',
  layout: 'visual-slop',
  component: 'frontend-implementation',
  context: 'frontend-implementation',
  perf: 'frontend-implementation',
  logic: 'code-and-logic',
  test: 'code-and-logic',
  db: 'code-and-logic',
  docs: 'code-and-logic',
  i18n: 'code-and-logic',
  arch: 'repository-coherence',
  ai: 'repository-coherence',
  product: 'repository-coherence',
  wcag: 'accessibility-and-resilience',
  security: 'accessibility-and-resilience',
};

export const FIRST_SCAN_AREAS = [
  { id: 'visual-slop', label: 'Visual Slop' },
  { id: 'frontend-implementation', label: 'Frontend Implementation' },
  { id: 'code-and-logic', label: 'Code and Logic' },
  { id: 'repository-coherence', label: 'Repository Coherence' },
  { id: 'accessibility-and-resilience', label: 'Accessibility and Resilience' },
] as const;

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const EVIDENCE_ORDER = { deterministic: 0, calibrated: 1, advisory: 2 } as const;
const HEADLINE_LABELS = {
  aiSlopCleanliness: 'AI Slop cleanliness',
  engineeringHygiene: 'Engineering hygiene',
  security: 'Security',
  testQuality: 'Test quality',
} as const;

type FindingGroup = [FirstScanFinding, ...FirstScanFinding[]];

export interface ProjectFirstScanOptions {
  cwd: string;
  configHash: string;
  baselineState?: 'missing' | 'invalid' | 'loaded';
  baseline?: DebtBaseline;
}

function findingEvidence(issue: Issue): FirstScanFindingEvidence {
  if (issue.evidence) {
    return {
      tier: 'deterministic',
      claim: issue.evidence.status === 'exact'
        ? 'Rule-authored matched source span.'
        : 'Rule-authored matched source span; source text omitted because it exceeded the evidence bound.',
      sourceSpan: issue.evidence.status,
    };
  }
  if (issue.signalStrength) {
    return {
      tier: 'calibrated',
      claim: 'Measured rule behavior; not proof of authorship.',
      sourceSpan: 'absent',
      calibration: {
        verdict: issue.signalStrength.verdict,
        precision: issue.signalStrength.precision,
        lastCalibratedAt: issue.signalStrength.lastCalibratedAt,
      },
    };
  }
  return {
    tier: 'advisory',
    claim: 'Review guidance only; no rule-authored span or rule metrics are attached.',
    sourceSpan: 'absent',
  };
}

function allFixes(issue: Issue) {
  return [...(issue.fix ? [issue.fix] : []), ...(issue.fixes ?? [])];
}

function matchingBoundFix(issue: Issue) {
  return allFixes(issue).find((fix) => {
    const binding = fix.binding;
    return binding?.kind === 'slopbrick-fix-binding-v1'
      && binding.ruleId === issue.ruleId
      && binding.filePath === issue.filePath
      && binding.line === issue.line
      && binding.column === issue.column;
  });
}

function findingAction(issue: Issue): FirstScanFindingAction {
  const boundFix = matchingBoundFix(issue);
  if (boundFix) {
    return {
      kind: 'apply-finding-bound-fix',
      repairSafety: 'finding-bound',
      label: boundFix.description,
    };
  }

  const guidance = issue.advice
    ?? issue.fixHint
    ?? allFixes(issue)[0]?.description
    ?? issue.message
    ?? (issue.filePath ? `Review ${issue.filePath}:${issue.line}:${issue.column}.` : undefined);
  if (guidance) {
    return {
      kind: 'manual-review',
      repairSafety: 'no-safe-repair',
      label: `${guidance} No safe bounded repair is available.`,
    };
  }
  return {
    kind: 'none',
    repairSafety: 'no-safe-repair',
    label: 'No safe next action is available from this finding.',
  };
}

function projectFinding(issue: Issue, cwd: string): FirstScanFinding {
  const filePath = issue.filePath
    ? repositoryRelativeFindingLocation(issue, cwd)
    : undefined;
  const context = classifyFindingContext(filePath);
  return {
    identity: findingIdentity(issue, cwd),
    ruleId: issue.ruleId,
    area: FIRST_SCAN_AREA_BY_CATEGORY[issue.category],
    severity: issue.severity,
    aiSpecific: issue.aiSpecific,
    location: {
      ...(filePath ? { filePath } : {}),
      line: issue.line,
      column: issue.column,
      context: context.kind,
      contextLabel: context.label,
    },
    why: issue.message,
    evidence: findingEvidence(issue),
    change: 'current',
    action: findingAction(issue),
  };
}

function scanStatus(report: ProjectReport): FirstScanExperience['status'] {
  if (report.scoreValidity === 'not-applicable' || report.completionStatus === 'empty') {
    return 'not-applicable';
  }
  if (report.scoreValidity === 'incomplete' || report.completionStatus === 'partial') {
    return 'incomplete';
  }
  return 'complete';
}

function projectHeadline(report: ProjectReport): FirstScanHeadline | null {
  const repositoryHealth = report.scoreExplanation?.repositoryHealth;
  if (!repositoryHealth) return null;
  return {
    label: 'Repository Health',
    value: repositoryHealth.value,
    direction: 'higher-is-better',
    dimensions: repositoryHealth.inputs.map((input) => ({
      ...input,
      label: HEADLINE_LABELS[input.axis],
    })),
  };
}

function projectAreas(findings: FirstScanFinding[]) {
  return FIRST_SCAN_AREAS.map(({ id, label }) => {
    const areaFindings = findings.filter((finding) => finding.area === id);
    return {
      id,
      label,
      findingCount: areaFindings.length,
      severity: {
        high: areaFindings.filter(({ severity }) => severity === 'high').length,
        medium: areaFindings.filter(({ severity }) => severity === 'medium').length,
        low: areaFindings.filter(({ severity }) => severity === 'low').length,
      },
    };
  });
}

function representativeFinding(findings: FindingGroup): FirstScanFinding {
  return [...findings].sort((left, right) =>
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    || (left.location.filePath ?? '').localeCompare(right.location.filePath ?? '')
    || left.location.line - right.location.line
    || left.location.column - right.location.column
  )[0] ?? findings[0];
}

function weakestEvidence(findings: FindingGroup): FirstScanFindingEvidence {
  return [...findings].sort((left, right) =>
    EVIDENCE_ORDER[right.evidence.tier] - EVIDENCE_ORDER[left.evidence.tier]
    || (left.evidence.calibration?.precision ?? Number.POSITIVE_INFINITY)
      - (right.evidence.calibration?.precision ?? Number.POSITIVE_INFINITY)
  )[0]?.evidence ?? findings[0].evidence;
}

function groupedChange(findings: FindingGroup): FirstScanActionChange {
  const changes = new Set(findings.map(({ change }) => change));
  return changes.size === 1 ? findings[0].change : 'mixed';
}

function groupedAction(
  findings: FindingGroup,
  representative: FirstScanFinding,
): FirstScanFindingAction {
  if (findings.every(({ action }) => action.repairSafety === 'finding-bound')) {
    return representative.action;
  }
  const manual = findings.find(({ action }) => action.kind === 'manual-review');
  if (manual) return manual.action;
  if (findings.every(({ action }) => action.kind === 'none')) return representative.action;
  return {
    kind: 'manual-review',
    repairSafety: 'no-safe-repair',
    label: 'Review the grouped findings. No safe bounded repair is available.',
  };
}

function recommendationGroups(findings: FirstScanFinding[]) {
  const byRule = new Map<string, FindingGroup>();
  for (const finding of findings) {
    const group = byRule.get(finding.ruleId);
    if (group) group.push(finding);
    else byRule.set(finding.ruleId, [finding]);
  }
  return [...byRule.entries()].map(([ruleId, group]) => {
    const representative = representativeFinding(group);
    const affectedFileCount = new Set(
      group.flatMap(({ location }) => location.filePath ? [location.filePath] : []),
    ).size;
    const projectWide = group.some(({ location }) => !location.filePath);
    return {
      ruleId,
      group,
      representative,
      evidence: weakestEvidence(group),
      action: groupedAction(group, representative),
      affectedFileCount,
      projectWide,
    };
  });
}

function projectRecommendations(findings: FirstScanFinding[]): FirstScanRecommendedAction[] {
  const groups = recommendationGroups(findings).sort((left, right) =>
    SEVERITY_ORDER[left.representative.severity] - SEVERITY_ORDER[right.representative.severity]
    || EVIDENCE_ORDER[left.evidence.tier] - EVIDENCE_ORDER[right.evidence.tier]
    || (right.evidence.calibration?.precision ?? -1) - (left.evidence.calibration?.precision ?? -1)
    || Number(right.projectWide) - Number(left.projectWide)
    || right.affectedFileCount - left.affectedFileCount
    || Number(right.action.repairSafety === 'finding-bound')
      - Number(left.action.repairSafety === 'finding-bound')
    || left.ruleId.localeCompare(right.ruleId)
  );
  return groups.slice(0, 3).map((candidate, index) => ({
    rank: (index + 1) as 1 | 2 | 3,
    ruleId: candidate.ruleId,
    area: candidate.representative.area,
    severity: candidate.representative.severity,
    evidence: candidate.evidence,
    change: groupedChange(candidate.group),
    reach: {
      kind: candidate.projectWide
        ? 'project-wide'
        : candidate.affectedFileCount > 1 ? 'multi-file' : 'single-file',
      findingCount: candidate.group.length,
      affectedFileCount: candidate.affectedFileCount,
    },
    representativeLocation: candidate.representative.location,
    why: candidate.representative.why,
    action: candidate.action,
    findingIds: candidate.group.map(({ identity }) => identity),
  }));
}

export function projectFirstScan(
  report: ProjectReport,
  options: ProjectFirstScanOptions,
): FirstScanExperience {
  const activeIssues = report.issues.filter((issue) => (issue.severity as string) !== 'off');
  const findings = activeIssues.map((issue) => projectFinding(issue, options.cwd));
  const status = scanStatus(report);
  return {
    kind: 'slopbrick-first-scan-v1',
    status,
    headline: status === 'complete' ? projectHeadline(report) : null,
    areas: projectAreas(findings),
    findings,
    recommendedActions: status === 'complete' ? projectRecommendations(findings) : [],
    delta: {
      kind: 'slopbrick-finding-delta-v1',
      status: 'not-evaluated',
      ...(status === 'incomplete' ? { reason: 'incomplete-scan' as const } : {}),
      ...(status === 'not-applicable' ? { reason: 'no-files-analyzed' as const } : {}),
      currentCount: findings.length,
      summary: status === 'complete'
        ? 'Finding delta has not been evaluated.'
        : `Finding delta not evaluated: scan status is ${status}.`,
    },
  };
}
