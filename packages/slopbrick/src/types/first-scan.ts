import type { Severity } from './primitives';
import type { Issue } from './scan';
import type {
  CAL002ClaimClass,
  CAL002QualityDomain,
  CAL002Readiness,
} from '../calibration/cal-002/contracts-v2';

export type FirstScanAreaId =
  | 'visual-slop'
  | 'frontend-implementation'
  | 'code-and-logic'
  | 'repository-coherence'
  | 'accessibility-and-resilience';

export type FirstScanEvidenceTier =
  | 'deterministic'
  | 'current-quality-calibrated'
  | 'current-quality-advisory'
  | 'quality-candidate-unmeasured'
  | 'current-quality-failed'
  | 'insufficient-evidence'
  | 'internal-origin-association'
  | 'legacy-calibrated'
  | 'advisory';
export type FirstScanFindingChange = 'current' | 'new' | 'unchanged';
export type FirstScanActionChange = FirstScanFindingChange | 'mixed';
export type FirstScanRepairSafety = 'finding-bound' | 'no-safe-repair';
export type FirstScanActionKind = 'apply-finding-bound-fix' | 'manual-review' | 'none';
export type FirstScanStatus = 'complete' | 'incomplete' | 'not-applicable';
export type FirstScanContextKind =
  | 'project-wide'
  | 'application'
  | 'rule-implementation'
  | 'test-fixture'
  | 'generated-schema'
  | 'documentation-example'
  | 'demo-marketing'
  | 'unknown';

export interface FirstScanFindingEvidence {
  tier: FirstScanEvidenceTier;
  claim: string;
  sourceSpan: 'exact' | 'omitted' | 'absent';
  policyVersion?: 'slopbrick-rule-evidence-policy-v2';
  qualityDomain?: CAL002QualityDomain;
  claimClass?: CAL002ClaimClass;
  readiness?: CAL002Readiness;
  scoreEligible?: boolean;
  admitted?: false;
  legacyMetrics?: {
    verdict: NonNullable<Issue['signalStrength']>['verdict'];
    precision: number;
    lastCalibratedAt: string;
  };
}

export interface FirstScanFindingAction {
  kind: FirstScanActionKind;
  repairSafety: FirstScanRepairSafety;
  label: string;
}

export interface FirstScanFinding {
  identity: string;
  ruleId: string;
  area: FirstScanAreaId;
  severity: Severity;
  aiSpecific: boolean;
  location: {
    filePath?: string;
    line: number;
    column: number;
    context: FirstScanContextKind;
    contextLabel: string;
  };
  why: string;
  evidence: FirstScanFindingEvidence;
  change: FirstScanFindingChange;
  action: FirstScanFindingAction;
}

export interface FirstScanHeadlineDimension {
  axis: 'aiSlopCleanliness' | 'engineeringHygiene' | 'security' | 'testQuality';
  label: string;
  value: number;
  weight: number;
  weightedAmount: number;
}

export interface FirstScanHeadline {
  label: 'Repository Health';
  value: number;
  direction: 'higher-is-better';
  dimensions: FirstScanHeadlineDimension[];
}

export interface FirstScanAreaSummary {
  id: FirstScanAreaId;
  label: string;
  findingCount: number;
  severity: { high: number; medium: number; low: number };
}

export interface FirstScanRecommendedAction {
  rank: 1 | 2 | 3;
  ruleId: string;
  area: FirstScanAreaId;
  severity: Severity;
  evidence: FirstScanFindingEvidence;
  change: FirstScanActionChange;
  reach: {
    kind: 'project-wide' | 'multi-file' | 'single-file';
    findingCount: number;
    affectedFileCount: number;
  };
  representativeLocation: FirstScanFinding['location'];
  why: string;
  action: FirstScanFindingAction;
  findingIds: string[];
}

export interface FirstScanResolvedFinding {
  identity: string;
  ruleId: string;
  area: FirstScanAreaId;
  severity: Severity;
  aiSpecific: boolean;
  filePath?: string;
  line: number;
  column: number;
}

export interface FirstScanFindingDelta {
  kind: 'slopbrick-finding-delta-v1';
  status: 'not-evaluated' | 'unavailable' | 'incompatible' | 'compared';
  reason?:
    | 'incomplete-scan'
    | 'no-files-analyzed'
    | 'missing-baseline'
    | 'invalid-baseline'
    | 'config-mismatch';
  baselineRevision?: number;
  currentCount: number;
  baselineCount?: number;
  newCount?: number;
  unchangedCount?: number;
  resolvedCount?: number;
  resolvedDetails?: 'available' | 'legacy-unavailable';
  resolved?: FirstScanResolvedFinding[];
  summary: string;
}

export interface FirstScanExperience {
  kind: 'slopbrick-first-scan-v1';
  status: FirstScanStatus;
  headline: FirstScanHeadline | null;
  areas: FirstScanAreaSummary[];
  findings: FirstScanFinding[];
  recommendedActions: FirstScanRecommendedAction[];
  delta: FirstScanFindingDelta;
}
