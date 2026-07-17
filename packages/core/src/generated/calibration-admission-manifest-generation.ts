// AUTO-GENERATED from calibration-admission-manifest-generation.schema.json. Do not hand-edit.

export type ManifestId = "v10.3-admission-smoke" | "v10.3-admission-canary";
export type Sha256 = string;

/**
 * Immutable manifest generation record.
 */
export interface CalibrationAdmissionManifestGenerationV1 {
  version: "v10.3-admission-manifest-generation-v1";
  manifestId: ManifestId;
  generation: number;
  parentGenerationSha256?: Sha256;
  manifestSha256: Sha256;
  manifestRelativePath: "manifest.json";
  buildReceiptSha256: Sha256;
  buildReceiptRelativePath: "build-receipt.json";
  generationSha256: Sha256;
}
