// AUTO-GENERATED from calibration-observation.schema.json. Do not hand-edit.

export type HttpsUsebrickDevSchemasV1CalibrationObservationSchemaJson = {
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
} & (
  | {
      status: "success_findings";
      findingsCount: number;
      exclusionReason?: never;
      failureCode?: never;
    }
  | {
      status: "success_zero";
      findingsCount: 0;
      exclusionReason?: never;
      failureCode?: never;
    }
  | {
      status: "excluded";
      findingsCount?: never;
      exclusionReason: string;
      failureCode?: never;
    }
  | {
      status: "parse_failure" | "timeout" | "scanner_failure";
      findingsCount?: never;
      exclusionReason?: never;
      failureCode: string;
    }
);
