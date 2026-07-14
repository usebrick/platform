// AUTO-GENERATED from calibration-admission-policy.schema.json. Do not hand-edit.

export type Sha256 = string;

/**
 * Durable, immutable v10.3 admission policy. Runtime validation additionally binds the policy self-hash and the exact frozen tool-profile set.
 */
export interface CalibrationAdmissionPolicyV1 {
  version: "v10.3-admission-policy-v1";
  policyId: "v10.3-admission-v1";
  initialRegisterEntryCount: 329;
  selectedCoverage: 452382;
  baselineMaterialUnits: 58089;
  repositoryMaterialUnits: 394293;
  labels: {
    positive: "verified_ai";
    negative: "verified_human";
  };
  evidenceCasPolicy: "sha256-wx-fsync-v1";
  overlapPolicy: "prefix-filter-exact-jaccard-0.80-v1";
  reasonVocabularySha256: Sha256;
  /**
   * @minItems 1
   */
  toolProfileSha256s: [Sha256, ...Sha256[]];
  smoke: Smoke;
  canary: Canary;
  policySha256: Sha256;
}
export interface Smoke {
  unitsPerPolarity: 100;
  maxSourceOrFamilyUnitsPerPolarity: 50;
  minimumSourcesPerPolarity: 2;
  minimumFamiliesPerPolarity: 3;
  minimumLanguages: 2;
  minimumUnitsPerRepresentedLanguagePerPolarity: 20;
}
export interface Canary {
  unitsPerPolarity: 5000;
  maxSourceUnitsPerPolarity: 500;
  maxFamilyUnitsPerPolarity: 1000;
  minimumSourcesPerPolarity: 10;
  minimumFamiliesPerPolarity: 5;
  minimumLanguages: 3;
  minimumUnitsPerLanguagePerPolarity: 250;
  minimumFamiliesPerLanguagePerPolarity: 3;
  minimumAiGeneratorFamilies: 3;
}
