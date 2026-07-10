// AUTO-GENERATED from calibration-coverage.schema.json. Do not hand-edit.

export interface HttpsUsebrickDevSchemasV1CalibrationCoverageSchemaJson {
  version: "v10.3";
  runId: string;
  requested: number;
  successful: number;
  excluded: number;
  failed: number;
  strata: Stratum[];
  repositories: Repository[];
  families: Family[];
}
export interface Stratum {
  language: string;
  polarity: "verified_ai" | "verified_human";
  requested: number;
  successful: number;
  excluded: number;
  failed: number;
}
export interface Repository {
  repositoryId: string;
  requested: number;
  successful: number;
  excluded: number;
  failed: number;
}
export interface Family {
  familyId: string;
  requested: number;
  successful: number;
  excluded: number;
  failed: number;
}
