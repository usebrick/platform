// AUTO-GENERATED from calibration-admission-normalizer-registry.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;

/**
 * Versioned language normalizer and shingle implementation registry for the v10.3 overlap authority.
 */
export interface AdmissionNormalizerRegistryV1 {
  version: "v10.3-admission-normalizers-v1";
  /**
   * @minItems 1
   */
  entries: [Entry, ...Entry[]];
  registrySha256: Sha256;
}
export interface Entry {
  language: string;
  normalizerId: Id;
  implementationSha256: Sha256;
  fixturesSha256: Sha256;
  utf8Policy: "strict";
  shingleSize: 5;
}
