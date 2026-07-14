// AUTO-GENERATED from calibration-admission-overlap-cluster-membership-row.schema.json. Do not hand-edit.

export type Id = string;
export type Side = "ai_side" | "human_side" | "unassigned";

/**
 * One candidate membership in an exact or near component.
 */
export interface AdmissionOverlapClusterMembershipRowV1 {
  kind: "exact" | "near";
  clusterId: Id;
  candidateUnitId: Id;
  overlapSide: Side;
}
