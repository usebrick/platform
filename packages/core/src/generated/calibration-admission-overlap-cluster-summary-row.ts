// AUTO-GENERATED from calibration-admission-overlap-cluster-summary-row.schema.json. Do not hand-edit.

export type Id = string;
export type Side = "ai_side" | "human_side" | "unassigned";
export type Sha256 = string;

/**
 * Bounded summary row for one exact or near connected component.
 */
export interface AdmissionOverlapClusterSummaryRowV1 {
  clusterId: Id;
  kind: "exact" | "near";
  canonicalCandidateUnitId: Id;
  memberCount: number;
  /**
   * @minItems 1
   * @maxItems 3
   */
  overlapSideSet: [Side] | [Side, Side] | [Side, Side, Side];
  membershipRowsSha256: Sha256;
}
