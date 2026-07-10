// AUTO-GENERATED from calibration-failure.schema.json. Do not hand-edit.

export interface HttpsUsebrickDevSchemasV1CalibrationFailureSchemaJson {
  version: "v10.3";
  runId: string;
  fileId: string;
  status: "parse_failure" | "timeout" | "scanner_failure";
  failureCode: string;
}
