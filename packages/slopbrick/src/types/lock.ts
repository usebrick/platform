/** One repository-policy family evaluated by the first Lock workflow. */
export interface LockPolicyReceipt {
  ruleId: 'context/import-path-mismatch';
  source: string;
  authority: 'repository' | 'built-in-default';
}

/** Repository-owned exception bound to one semantic finding identity. */
export interface LockWaiver {
  findingIdentity: string;
  owner: string;
  reason: string;
  expiresAt: string;
}

export interface LockWaiverReceipt extends LockWaiver {
  status: 'active' | 'expired' | 'invalid';
}

/** Exact new finding considered by the Lock decision. */
export interface LockFindingDecision {
  identity: string;
  ruleId: 'context/import-path-mismatch';
  filePath?: string;
  line: number;
  column: number;
  disposition: 'blocked' | 'waived';
  evidence: import('./scan').ExactIssueEvidence;
  waiver?: LockWaiverReceipt;
}

/** Machine-readable receipt for the bounded LOCK-001 new-debt gate. */
export interface LockDecision {
  kind: 'slopbrick-lock-decision-v1';
  status: 'passed' | 'failed' | 'not-evaluated';
  failed: boolean;
  evaluated: boolean;
  policy: LockPolicyReceipt;
  baselineAvailable: boolean;
  baselineRevision?: number;
  qualifyingFindingCount: number;
  newFindingCount?: number;
  blockedFindingCount?: number;
  waivedFindingCount?: number;
  findings: LockFindingDecision[];
  summary: string;
}
