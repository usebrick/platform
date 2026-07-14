// AUTO-GENERATED from calibration-admission-overlap-edge-row.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;
export type Side = "ai_side" | "human_side" | "unassigned";
export type NonNegativeInteger = number;

/**
 * One deterministic exact or near overlap edge.
 */
export interface AdmissionOverlapEdgeRowV1 {
  leftCandidateUnitId: Id;
  rightCandidateUnitId: Id;
  leftPolarityBindingSha256: Sha256;
  rightPolarityBindingSha256: Sha256;
  leftOverlapSide: Side;
  rightOverlapSide: Side;
  kind: "exact" | "near";
  intersection: NonNegativeInteger;
  union: NonNegativeInteger;
  crossSide: boolean;
}
