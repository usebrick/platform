// AUTO-GENERATED from calibration-admission-overlap-adjacency-row.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;

/**
 * One endpoint row in the symmetric overlap adjacency stream.
 */
export interface AdmissionOverlapAdjacencyRowV1 {
  candidateUnitId: Id;
  neighborCandidateUnitId: Id;
  edgeRowSha256: Sha256;
  kind: "exact" | "near";
}
