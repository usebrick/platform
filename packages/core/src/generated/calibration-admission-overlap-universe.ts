// AUTO-GENERATED from calibration-admission-overlap-universe.schema.json. Do not hand-edit.

export type Sha256 = string;
export type NonNegativeInteger = number;
export type Id = string;

/**
 * Hash-bound summary for the canonical v10.3 global overlap universe stream.
 */
export interface AdmissionOverlapUniverseV1 {
  version: "v10.3-admission-overlap-universe-v1";
  registerSha256: Sha256;
  recordsJsonlSha256: Sha256;
  selectedAggregateCoverage: NonNegativeInteger;
  baselineMaterialUnits: NonNegativeInteger;
  repositoryMaterialUnits: NonNegativeInteger;
  newCandidateUnits: NonNegativeInteger;
  covered: NonNegativeInteger;
  unsupported: NonNegativeInteger;
  unreadable: NonNegativeInteger;
  unresolvedCandidateUnitIds: Id[];
  normalizerRegistrySha256: Sha256;
  universeSha256: Sha256;
}
