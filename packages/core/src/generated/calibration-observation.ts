// AUTO-GENERATED from calibration-observation.schema.json. Do not hand-edit.

export type HttpsUsebrickDevSchemasV1CalibrationObservationSchemaJson = {
  [k: string]: unknown;
} & {
  version: "v10.3";
  runId: string;
  fileId: string;
  repositoryId: string;
  familyId: string;
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
};
