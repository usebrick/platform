import type {
  Category,
  DebtBaseline,
  FirstScanActionChange,
  FirstScanAreaId,
  FirstScanEvidenceTier,
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
import type { CAL002PolicyProvenanceV2 } from '../calibration/cal-002/matrix-v2.js';
import type { CurrentEvidencePolicyAccessors } from '../rules/current-evidence-policy.js';
import { getCurrentEvidencePolicyAccessors } from '../rules/current-evidence-policy-runtime.js';
import { classifyFindingContext } from './finding-context';
import { compareFindingBaseline } from './finding-delta';
import { findingIdentity, repositoryRelativeFindingLocation } from './finding-identity';
import { isIncompleteScan, isNotApplicableScan } from './scan-validity';

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
const EVIDENCE_ORDER: Record<FirstScanEvidenceTier, number> = {
  deterministic: 0,
  'current-quality-calibrated': 1,
  'current-quality-advisory': 2,
  'quality-candidate-unmeasured': 3,
  'current-quality-failed': 4,
  'insufficient-evidence': 5,
  'internal-origin-association': 6,
  'legacy-calibrated': 7,
  calibrated: 7,
  advisory: 8,
};
const SOURCE_SPAN_ORDER: Record<FirstScanFindingEvidence['sourceSpan'], number> = {
  exact: 0,
  omitted: 1,
  absent: 2,
};

const CURRENT_POLICY_CLAIMS: Record<CAL002PolicyProvenanceV2, string> = {
  'deterministic-finding-evidence': 'Current deterministic quality evidence.',
  'current-quality-calibrated': 'Current owner-reviewed quality evidence.',
  'current-quality-advisory': 'Review utility only; disabled and score-neutral.',
  'quality-candidate-unmeasured': 'Accepted quality concern; owner measurement was not requested.',
  'blocked-quality-candidate': 'Quality candidate blocked before evidence and not runnable.',
  'internal-origin-association': 'Internal origin association only; not quality evidence and does not identify who wrote the code.',
  'current-quality-failed-claim-bar': 'Current quality claim bar was not met; diagnostic only.',
  'insufficient-evidence': 'Current evidence is insufficient; diagnostic only.',
  'superseded-policy': 'Historical rule replaced by the named canonical rule.',
  'retired-policy': 'Historical rule retired from current diagnostics.',
};

const CURRENT_POLICY_TIERS: Record<CAL002PolicyProvenanceV2, FirstScanEvidenceTier> = {
  'deterministic-finding-evidence': 'deterministic',
  'current-quality-calibrated': 'current-quality-calibrated',
  'current-quality-advisory': 'current-quality-advisory',
  'quality-candidate-unmeasured': 'quality-candidate-unmeasured',
  'blocked-quality-candidate': 'insufficient-evidence',
  'internal-origin-association': 'internal-origin-association',
  'current-quality-failed-claim-bar': 'current-quality-failed',
  'insufficient-evidence': 'insufficient-evidence',
  'superseded-policy': 'insufficient-evidence',
  'retired-policy': 'insufficient-evidence',
};
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

function legacyMetrics(issue: Issue): FirstScanFindingEvidence['legacyMetrics'] {
  if (!issue.signalStrength) return undefined;
  return {
    verdict: issue.signalStrength.verdict,
    precision: issue.signalStrength.precision,
    lastCalibratedAt: issue.signalStrength.lastCalibratedAt,
  };
}

function sourceSpan(issue: Issue): FirstScanFindingEvidence['sourceSpan'] {
  return issue.evidence?.status ?? 'absent';
}

function projectFirstScanFindingEvidence(
  issue: Issue,
  currentPolicy?: CurrentEvidencePolicyAccessors,
): FirstScanFindingEvidence {
  const row = currentPolicy?.getCurrentRulePolicy(issue.ruleId);
  const historical = legacyMetrics(issue);
  if (row && currentPolicy) {
    return {
      tier: CURRENT_POLICY_TIERS[row.provenance],
      claim: CURRENT_POLICY_CLAIMS[row.provenance],
      sourceSpan: sourceSpan(issue),
      policyVersion: currentPolicy.policy.version,
      qualityDomain: row.qualityDomain,
      claimClass: row.claimClass,
      readiness: row.readiness,
      scoreEligible: row.scoreEligible,
      admitted: false,
      ...(historical ? { legacyMetrics: historical } : {}),
    };
  }
  if (issue.evidence) {
    return {
      tier: 'deterministic',
      claim: issue.evidence.status === 'exact'
        ? 'Rule-authored matched source span.'
        : 'Rule-authored matched source span; source text omitted because it exceeded the evidence bound.',
      sourceSpan: issue.evidence.status,
      ...(historical ? { legacyMetrics: historical } : {}),
    };
  }
  if (historical) {
    return {
      tier: 'legacy-calibrated',
      claim: 'Historical rule metrics only; not current policy evidence and not proof of who wrote the code.',
      sourceSpan: 'absent',
      legacyMetrics: historical,
    };
  }
  return {
    tier: 'advisory',
    claim: 'Review guidance only; no current policy row, rule-authored span, or historical rule metrics are attached.',
    sourceSpan: 'absent',
  };
}

function formatEvidenceNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function historicalMetricsSummary(
  metrics: NonNullable<
    FirstScanFindingEvidence['legacyMetrics'] | FirstScanFindingEvidence['calibration']
  >,
): string {
  return `historical verdict ${metrics.verdict}; historical precision ${formatEvidenceNumber(metrics.precision * 100)}%; last calibrated ${metrics.lastCalibratedAt.slice(0, 10)}`;
}

/** One plain-text projection used by every human renderer. Machine renderers
 * carry the structured object itself. */
export function formatFirstScanFindingEvidence(
  evidence: FirstScanFindingEvidence,
): string {
  if (evidence.tier === 'calibrated' && evidence.calibration) {
    return `calibrated (deprecated v1); ${historicalMetricsSummary(evidence.calibration)}. ${evidence.claim}`;
  }
  if (evidence.tier === 'legacy-calibrated' && evidence.legacyMetrics) {
    return `legacy-calibrated; ${historicalMetricsSummary(evidence.legacyMetrics)}. ${evidence.claim}`;
  }
  if (evidence.policyVersion) {
    const span = evidence.sourceSpan === 'exact'
      ? ' Rule-authored source span is exact.'
      : evidence.sourceSpan === 'omitted'
        ? ' Rule-authored source span is bounded and omitted.'
        : '';
    const historical = evidence.legacyMetrics
      ? ` Historical metrics: ${historicalMetricsSummary(evidence.legacyMetrics)}.`
      : '';
    return `${evidence.tier}; ${evidence.claim}${span}${historical}`;
  }
  if (evidence.tier === 'deterministic') {
    if (evidence.sourceSpan === 'exact') return 'deterministic; exact source span.';
    if (evidence.sourceSpan === 'omitted') return 'deterministic; bounded source span omitted.';
    return 'deterministic; no source span attached.';
  }
  return `${evidence.tier}; ${evidence.claim}`;
}

export function matchesFirstScanFinding(
  issue: Issue,
  finding: FirstScanFinding | undefined,
  cwd?: string,
): finding is FirstScanFinding {
  const filePath = issue.filePath === undefined
    ? undefined
    : cwd === undefined
      ? issue.filePath
      : repositoryRelativeFindingLocation(issue, cwd);
  return finding !== undefined
    && finding.ruleId === issue.ruleId
    && finding.area === FIRST_SCAN_AREA_BY_CATEGORY[issue.category]
    && finding.severity === issue.severity
    && finding.aiSpecific === issue.aiSpecific
    && finding.location.filePath === filePath
    && finding.location.line === issue.line
    && finding.location.column === issue.column
    && finding.why === issue.message
    && (cwd === undefined || finding.identity === findingIdentity(issue, cwd));
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

function evidencePermitsBoundRepair(
  evidence: FirstScanFindingEvidence,
  policyRepairSafety: 'finding-bound-only' | 'no-safe-repair' | 'not-applicable' | undefined,
): boolean {
  if (policyRepairSafety !== undefined && policyRepairSafety !== 'finding-bound-only') return false;
  return evidence.tier === 'deterministic' || evidence.tier === 'current-quality-calibrated';
}

function findingAction(
  issue: Issue,
  evidence: FirstScanFindingEvidence,
  policyRepairSafety?: 'finding-bound-only' | 'no-safe-repair' | 'not-applicable',
): FirstScanFindingAction {
  const boundFix = matchingBoundFix(issue);
  if (boundFix && evidencePermitsBoundRepair(evidence, policyRepairSafety)) {
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

function projectFinding(
  issue: Issue,
  cwd: string,
  currentPolicy?: CurrentEvidencePolicyAccessors,
): FirstScanFinding {
  const filePath = issue.filePath
    ? repositoryRelativeFindingLocation(issue, cwd)
    : undefined;
  const context = classifyFindingContext(filePath);
  const evidence = projectFirstScanFindingEvidence(issue, currentPolicy);
  const policyRepairSafety = currentPolicy?.getCurrentRulePolicy(issue.ruleId)?.repairSafety;
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
    evidence,
    change: 'current',
    action: findingAction(issue, evidence, policyRepairSafety),
  };
}

function scanStatus(report: ProjectReport): FirstScanExperience['status'] {
  if (isNotApplicableScan(report)) {
    return 'not-applicable';
  }
  if (isIncompleteScan(report)) {
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

/**
 * Fail closed at machine-serialization boundaries when a stale first-scan
 * projection disagrees with the enclosing report's authoritative validity.
 * Valid reports retain their existing projection byte-for-byte; legacy
 * reports without first-scan data retain omission.
 */
export function normalizeFirstScanForSerialization(
  report: ProjectReport,
): FirstScanExperience | undefined {
  const firstScan = report.firstScan;
  if (!firstScan) return undefined;

  const status = scanStatus(report);
  if (status === 'complete') return firstScan;

  const findings = firstScan.findings.map((finding) =>
    finding.change === 'current' ? finding : { ...finding, change: 'current' as const }
  );
  return {
    ...firstScan,
    status,
    headline: null,
    areas: projectAreas(findings),
    findings,
    recommendedActions: [],
    delta: {
      kind: 'slopbrick-finding-delta-v1',
      status: 'not-evaluated',
      reason: status === 'incomplete' ? 'incomplete-scan' : 'no-files-analyzed',
      currentCount: findings.length,
      summary: `Finding delta not evaluated: scan status is ${status}.`,
    },
  };
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
    || SOURCE_SPAN_ORDER[right.evidence.sourceSpan]
      - SOURCE_SPAN_ORDER[left.evidence.sourceSpan]
    || ((left.evidence.tier === 'legacy-calibrated' || left.evidence.tier === 'calibrated')
      && (right.evidence.tier === 'legacy-calibrated' || right.evidence.tier === 'calibrated')
      ? (left.evidence.legacyMetrics?.precision
          ?? left.evidence.calibration?.precision
          ?? Number.POSITIVE_INFINITY)
        - (right.evidence.legacyMetrics?.precision
          ?? right.evidence.calibration?.precision
          ?? Number.POSITIVE_INFINITY)
      : 0)
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
    || ((left.evidence.tier === 'legacy-calibrated' || left.evidence.tier === 'calibrated')
      && (right.evidence.tier === 'legacy-calibrated' || right.evidence.tier === 'calibrated')
      ? (right.evidence.legacyMetrics?.precision ?? right.evidence.calibration?.precision ?? -1)
        - (left.evidence.legacyMetrics?.precision ?? left.evidence.calibration?.precision ?? -1)
      : 0)
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
  const status = scanStatus(report);
  const currentPolicy = getCurrentEvidencePolicyAccessors();
  const projectedFindings = activeIssues.map((issue) =>
    projectFinding(issue, options.cwd, currentPolicy)
  );
  const comparison = status === 'complete'
    && options.baselineState === 'loaded'
    && options.baseline
    ? compareFindingBaseline(report, options.baseline, options.cwd, options.configHash)
    : undefined;
  const findings = comparison?.status === 'compared'
    ? projectedFindings.map((finding) => ({
        ...finding,
        change: comparison.findingChanges.get(finding.identity) ?? 'current',
      }))
    : projectedFindings;
  const delta: FirstScanExperience['delta'] = (() => {
    if (status !== 'complete') {
      return {
        kind: 'slopbrick-finding-delta-v1',
        status: 'not-evaluated',
        reason: status === 'incomplete' ? 'incomplete-scan' : 'no-files-analyzed',
        currentCount: findings.length,
        summary: `Finding delta not evaluated: scan status is ${status}.`,
      };
    }
    if (options.baselineState === 'missing' || options.baselineState === 'invalid') {
      const reason = options.baselineState === 'missing'
        ? 'missing-baseline' as const
        : 'invalid-baseline' as const;
      return {
        kind: 'slopbrick-finding-delta-v1',
        status: 'unavailable',
        reason,
        currentCount: findings.length,
        summary: options.baselineState === 'missing'
          ? 'Finding delta unavailable: durable debt baseline is missing.'
          : 'Finding delta unavailable: durable debt baseline is invalid.',
      };
    }
    if (options.baselineState === 'loaded' && !options.baseline) {
      return {
        kind: 'slopbrick-finding-delta-v1',
        status: 'unavailable',
        reason: 'invalid-baseline',
        currentCount: findings.length,
        summary: 'Finding delta unavailable: durable debt baseline is invalid.',
      };
    }
    if (comparison) {
      const { findingChanges: _changes, resolvedSnapshots, ...comparedDelta } = comparison;
      return {
        ...comparedDelta,
        ...(resolvedSnapshots
          ? {
              resolved: resolvedSnapshots.map((snapshot) => ({
                identity: snapshot.identity,
                ruleId: snapshot.ruleId,
                area: FIRST_SCAN_AREA_BY_CATEGORY[snapshot.category],
                severity: snapshot.severity,
                aiSpecific: snapshot.aiSpecific,
                ...(snapshot.filePath ? { filePath: snapshot.filePath } : {}),
                line: snapshot.line,
                column: snapshot.column,
              })),
            }
          : {}),
      };
    }
    return {
      kind: 'slopbrick-finding-delta-v1',
      status: 'not-evaluated',
      currentCount: findings.length,
      summary: 'Finding delta has not been evaluated.',
    };
  })();
  return {
    kind: 'slopbrick-first-scan-v1',
    status,
    headline: status === 'complete' ? projectHeadline(report) : null,
    areas: projectAreas(findings),
    findings,
    recommendedActions: status === 'complete' ? projectRecommendations(findings) : [],
    delta,
  };
}
