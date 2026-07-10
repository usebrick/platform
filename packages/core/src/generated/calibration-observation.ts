// AUTO-GENERATED from calibration-observation.schema.json. Do not hand-edit.

export interface HttpsUsebrickDevSchemasV1CalibrationObservationSchemaJson {
  version: "v10.3";
  runId: string;
  fileId: string;
  language: string;
  polarity: "verified_ai" | "verified_human";
  status:
    | "success_findings"
    | "success_zero"
    | "excluded"
    | "parse_failure"
    | "timeout"
    | "scanner_failure";
  findingsCount?: number;
  exclusionReason?: string;
  failureCode?: string;
}
