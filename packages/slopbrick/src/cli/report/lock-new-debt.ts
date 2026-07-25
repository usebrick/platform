import type {
  DebtBaseline,
  ExactIssueEvidence,
  Issue,
  LockDecision,
  LockFindingDecision,
  LockWaiver,
  LockWaiverReceipt,
  ProjectReport,
} from '../../types';
import {
  findingIdentity,
  legacyFindingIdentity,
  repositoryRelativeFindingLocation,
} from '../../report/finding-identity';
import { isIncompleteScan, isNotApplicableScan } from '../../report/scan-validity';

const LOCK_RULE_ID = 'context/import-path-mismatch' as const;

export interface EvaluateLockNewDebtInput {
  report: ProjectReport;
  baseline: DebtBaseline | undefined;
  cwd: string;
  configHash?: string;
  policySource: string;
  waivers?: readonly LockWaiver[];
  now?: Date;
}

function isQualifyingFinding(
  issue: Issue,
): issue is Issue & { ruleId: typeof LOCK_RULE_ID; evidence: ExactIssueEvidence } {
  return issue.ruleId === LOCK_RULE_ID
    && (issue.severity as string) !== 'off'
    && issue.evidence?.kind === 'matched-source-span'
    && issue.evidence.status === 'exact';
}

function notEvaluated(
  input: EvaluateLockNewDebtInput,
  qualifyingFindingCount: number,
  summary: string,
): LockDecision {
  return {
    kind: 'slopbrick-lock-decision-v1',
    status: 'not-evaluated',
    failed: true,
    evaluated: false,
    policy: { ruleId: LOCK_RULE_ID, source: input.policySource },
    baselineAvailable: input.baseline !== undefined,
    ...(input.baseline ? { baselineRevision: input.baseline.baseline_revision } : {}),
    qualifyingFindingCount,
    findings: [],
    summary,
  };
}

/**
 * Evaluate the first bounded Lock policy family against durable finding debt.
 * Only exact import-policy evidence can block; every other scanner finding is
 * deliberately outside LOCK-001.
 */
export function evaluateLockNewDebt(input: EvaluateLockNewDebtInput): LockDecision {
  const qualifying = (input.report.issues ?? []).filter(isQualifyingFinding);
  if (isIncompleteScan(input.report)) {
    return notEvaluated(
      input,
      qualifying.length,
      'Lock gate not evaluated: incomplete scan results cannot prove repository policy compliance.',
    );
  }
  if (isNotApplicableScan(input.report)) {
    return notEvaluated(
      input,
      qualifying.length,
      'Lock gate not evaluated: no files were analyzed.',
    );
  }
  if (!input.baseline) {
    return notEvaluated(
      input,
      qualifying.length,
      'Lock gate not evaluated: durable debt baseline is missing. Run `slopbrick scan --baseline` first.',
    );
  }
  if (input.configHash !== undefined && input.baseline.config_hash !== input.configHash) {
    return notEvaluated(
      input,
      qualifying.length,
      'Lock gate not evaluated: durable debt baseline config identity does not match the current repository policy.',
    );
  }

  const identify = (input.baseline.finding_identity_version ?? 1) === 1
    ? legacyFindingIdentity
    : findingIdentity;
  const baselineIds = new Set(input.baseline.finding_ids);
  const waiverByIdentity = new Map(
    (input.waivers ?? []).map((waiver) => [waiver.findingIdentity, waiver]),
  );
  const now = input.now ?? new Date();
  const byIdentity = new Map<string, Issue & { ruleId: typeof LOCK_RULE_ID; evidence: ExactIssueEvidence }>();
  for (const issue of qualifying) {
    const identity = identify(issue, input.cwd);
    if (!byIdentity.has(identity)) byIdentity.set(identity, issue);
  }

  const findings: LockFindingDecision[] = [];
  for (const [identity, issue] of byIdentity) {
    if (baselineIds.has(identity)) continue;
    const filePath = repositoryRelativeFindingLocation(issue, input.cwd);
    const waiver = waiverByIdentity.get(identity);
    let waiverReceipt: LockWaiverReceipt | undefined;
    if (waiver) {
      const expiry = Date.parse(waiver.expiresAt);
      waiverReceipt = {
        ...waiver,
        status: Number.isNaN(expiry)
          ? 'invalid'
          : expiry > now.getTime()
            ? 'active'
            : 'expired',
      };
    }
    const disposition = waiverReceipt?.status === 'active' ? 'waived' : 'blocked';
    findings.push({
      identity,
      ruleId: LOCK_RULE_ID,
      ...(filePath === '<project>' ? {} : { filePath }),
      line: issue.line,
      column: issue.column,
      disposition,
      evidence: issue.evidence,
      ...(waiverReceipt ? { waiver: waiverReceipt } : {}),
    });
  }
  findings.sort((left, right) => left.identity.localeCompare(right.identity));

  const blockedFindingCount = findings.filter(({ disposition }) => disposition === 'blocked').length;
  const waivedFindingCount = findings.length - blockedFindingCount;
  const failed = blockedFindingCount > 0;
  return {
    kind: 'slopbrick-lock-decision-v1',
    status: failed ? 'failed' : 'passed',
    failed,
    evaluated: true,
    policy: { ruleId: LOCK_RULE_ID, source: input.policySource },
    baselineAvailable: true,
    baselineRevision: input.baseline.baseline_revision,
    qualifyingFindingCount: byIdentity.size,
    newFindingCount: findings.length,
    blockedFindingCount,
    waivedFindingCount,
    findings,
    summary: failed
      ? `Lock gate failed: ${blockedFindingCount} unwaived new import-policy finding${blockedFindingCount === 1 ? '' : 's'} blocked by ${input.policySource}; ${waivedFindingCount} waived.`
      : `Lock gate passed: no unwaived new import-policy findings against ${input.policySource}; ${waivedFindingCount} waived.`,
  };
}
