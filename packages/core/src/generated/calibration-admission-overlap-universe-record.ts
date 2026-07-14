// AUTO-GENERATED from calibration-admission-overlap-universe-record.schema.json. Do not hand-edit.

export type Id = string;
export type Sha256 = string;
export type Locator =
  | {
      kind: "materialized_file";
      materializationId: Id;
      normalizedPath: RelativePath;
    }
  | {
      kind: "record_container";
      materializationId: Id;
      containerSha256: Sha256;
      rowKey: string;
      field: string;
    }
  | {
      kind: "local_inventory_file";
      localSourceId: Id;
      normalizedPath: RelativePath;
    };
export type RelativePath = string;
export type NonNegativeInteger = number;

/**
 * One canonical candidate row in the v10.3 global overlap universe stream.
 */
export interface AdmissionOverlapUniverseRecordV1 {
  version: "v10.3-overlap-universe-record-v1";
  candidateUnitId: Id;
  materialSourceId: Id;
  /**
   * @minItems 1
   */
  aggregateSourceIds: [Id, ...Id[]];
  admissionRecordId?: Sha256;
  locator: Locator;
  polarity: Polarity;
  contentSha256: Sha256;
  contentBytes: NonNegativeInteger;
  language: string;
  normalizerId: Id;
  normalizationStatus: "covered" | "unsupported" | "unreadable";
  shingleSetSha256?: Sha256;
  shingleCount?: NonNegativeInteger;
  recordSha256: Sha256;
}
export interface Polarity {
  intake: "declared_ai" | "declared_human" | "unassigned";
  proposedLabel?: "verified_ai" | "verified_human" | "mixed" | "quarantine";
  overlapSide: "ai_side" | "human_side" | "unassigned";
  bindingAuthority:
    "legacy-selected-inventory" | "admission-record" | "registered-unassigned-candidate";
  bindingSha256: Sha256;
}
