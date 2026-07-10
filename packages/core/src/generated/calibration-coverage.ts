// AUTO-GENERATED from calibration-coverage.schema.json. Do not hand-edit.

export interface HttpsUsebrickDevSchemasV1CalibrationCoverageSchemaJson {
  version: "v10.3";
  runId: string;
  requested: number;
  successful: number;
  excluded: number;
  failed: number;
  strata: {
    language: string;
    polarity: "verified_ai" | "verified_human";
    requested: number;
    successful: number;
    excluded: number;
    failed: number;
  }[];
}
