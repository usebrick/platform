// AUTO-GENERATED from calibration-admission-source-register.schema.json. Do not hand-edit.

export type Sha256 = string;
export type Id = string;

/**
 * Hash-bound v10.3 source register. Aggregate rows describe coverage; material rows own candidate bytes exactly once.
 */
export interface CalibrationAdmissionSourceRegisterV1 {
  version: "v10.3-admission-source-register-v1";
  generation: number;
  initialSourceIdsSha256: Sha256;
  parentRegisterSha256?: Sha256;
  appliedDeltaIds: Id[];
  rawDiscoveryPopulation: {
    declaredAi: 635830;
    declaredHuman: 842520;
    closedWorld: false;
  };
  selectedCoverage: {
    total: 452382;
    baselineMaterialUnits: 58089;
    repositoryMaterialUnits: 394293;
  };
  entries: Entry[];
  registerSha256: Sha256;
}
export interface Entry {
  sourceId: Id;
  kind: "aggregate_inventory" | "material_source";
  materialPartition: "aggregate" | "baseline" | "repository" | "non_selected";
  contributesToAdditiveCounts: boolean;
  childMaterialSourceIds: Id[];
  registerEvidenceIds: Id[];
  inventoryCandidateUnits: number;
  acquisitionProvenance?: {
    roundId: Id;
    sourceAuthorizationId: Id;
    sourceAcquisitionReceiptId: Id;
    materializationReceiptId: Id;
  };
}
