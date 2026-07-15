import {
  calibrationAdmissionCohortWitnessSha256,
  calibrationAdmissionInfeasibilityCertificateSha256,
  calibrationAdmissionSha256,
  isCalibrationAdmissionCohortWitnessV1,
  validateCalibrationAdmissionCohortWitnessV1,
  type AdmissionCohortInfeasibilityCertificateV1,
  type AdmissionCohortWitnessV1,
  type CalibrationAdmissionRecordV103,
} from '@usebrick/core';
import { deriveAdmissionDisposition, listVerifiedAdmissionRecords, type VerifiedAdmissionContextV1 } from './admission-context';

export type AdmissionWitnessGateV1 = 'smoke' | 'canary';
export type AdmissionWitnessLabelV1 = 'verified_ai' | 'verified_human';
export type AdmissionWitnessSplitV1 = 'train' | 'validation' | 'test';

export interface AdmissionWitnessCandidateV1 {
  readonly recordId: string;
  readonly contentClusterId: string;
  readonly label: AdmissionWitnessLabelV1;
  readonly language: string;
  readonly materialSourceId: string;
  readonly repositoryId: string;
  readonly familyId: string;
  readonly pairGroupId?: string;
  readonly split: AdmissionWitnessSplitV1;
  readonly selectionKey: string;
}

export interface AdmissionWitnessSearchInputV1 {
  readonly gate: AdmissionWitnessGateV1;
  readonly eligibilitySnapshotSha256: string;
  readonly verifiedContextSha256: string;
  readonly candidates: readonly AdmissionWitnessCandidateV1[];
  readonly maxSearchNodes?: number;
}

export type AdmissionWitnessSearchResultV1 =
  | {
      readonly kind: 'witness';
      readonly witness: AdmissionCohortWitnessV1;
      readonly visitedNodes: number;
      readonly prunedNodes: number;
      readonly terminal: 'witness';
    }
  | {
      readonly kind: 'infeasibility';
      readonly certificate: AdmissionCohortInfeasibilityCertificateV1;
      readonly visitedNodes: number;
      readonly prunedNodes: number;
      readonly terminal: 'proven_capacity_cut' | 'proven_exhaustive' | 'indeterminate_limit';
    };

export interface AdmissionWitnessCandidateProjectionV1 {
  readonly candidates: readonly AdmissionWitnessCandidateV1[];
  readonly excluded: Readonly<Record<string, number>>;
}

const SEED = 'slopbrick-v10.3-admission-review-v1' as const;
const ALGORITHM = 'lexicographic-bnb-feasibility-v1' as const;
const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function targetFor(gate: AdmissionWitnessGateV1): number {
  return gate === 'smoke' ? 100 : 5000;
}

function constraintsFor(gate: AdmissionWitnessGateV1): Readonly<{
  readonly target: number;
  readonly maxSource: number;
  readonly maxFamily: number;
  readonly minimumSources: number;
  readonly minimumFamilies: number;
  readonly minimumLanguages: number;
  readonly minimumPerLanguage: number;
  readonly minimumFamiliesPerLanguage: number;
}> {
  return gate === 'smoke'
    ? { target: 100, maxSource: 50, maxFamily: 50, minimumSources: 2, minimumFamilies: 3, minimumLanguages: 2, minimumPerLanguage: 20, minimumFamiliesPerLanguage: 1 }
    : { target: 5000, maxSource: 500, maxFamily: 1000, minimumSources: 10, minimumFamilies: 5, minimumLanguages: 3, minimumPerLanguage: 250, minimumFamiliesPerLanguage: 3 };
}

function counts(units: readonly AdmissionWitnessCandidateV1[], key: keyof AdmissionWitnessCandidateV1): Record<string, number> {
  const output: Record<string, number> = {};
  for (const unit of units) {
    const value = String(unit[key]);
    output[value] = (output[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(output).sort(([left], [right]) => compareStrings(left, right)));
}

function pairSplitProjection(units: readonly AdmissionWitnessCandidateV1[]): readonly Record<string, string>[] {
  return units
    .filter((unit) => unit.pairGroupId !== undefined)
    .map((unit) => ({ pairGroupId: unit.pairGroupId!, recordId: unit.recordId, split: unit.split }))
    .sort((left, right) => compareStrings(`${left.pairGroupId}\u0000${left.recordId}`, `${right.pairGroupId}\u0000${right.recordId}`));
}

function constraintProof(units: readonly AdmissionWitnessCandidateV1[]): AdmissionCohortWitnessV1['constraintProof'] {
  return {
    verifiedAi: units.filter((unit) => unit.label === 'verified_ai').length,
    verifiedHuman: units.filter((unit) => unit.label === 'verified_human').length,
    languageCountsSha256: calibrationAdmissionSha256(counts(units, 'language')),
    sourceCountsSha256: calibrationAdmissionSha256(counts(units, 'materialSourceId')),
    familyCountsSha256: calibrationAdmissionSha256(counts(units, 'familyId')),
    pairSplitChecksSha256: calibrationAdmissionSha256(pairSplitProjection(units)),
  };
}

function candidateValid(candidate: AdmissionWitnessCandidateV1): boolean {
  return SHA256.test(candidate.recordId)
    && ID.test(candidate.contentClusterId)
    && (candidate.label === 'verified_ai' || candidate.label === 'verified_human')
    && candidate.language.length > 0
    && ID.test(candidate.materialSourceId)
    && ID.test(candidate.repositoryId)
    && ID.test(candidate.familyId)
    && (candidate.pairGroupId === undefined || ID.test(candidate.pairGroupId))
    && (candidate.split === 'train' || candidate.split === 'validation' || candidate.split === 'test')
    && candidate.selectionKey.length > 0;
}

function capacityReasons(gate: AdmissionWitnessGateV1, candidates: readonly AdmissionWitnessCandidateV1[]): readonly string[] {
  const constraints = constraintsFor(gate);
  const reasons: string[] = [];
  for (const label of ['verified_ai', 'verified_human'] as const) {
    const units = candidates.filter((candidate) => candidate.label === label);
    if (units.length < constraints.target) reasons.push(`${label}_capacity`);
    const sources = counts(units, 'materialSourceId');
    const families = counts(units, 'familyId');
    const languages = counts(units, 'language');
    if (Object.keys(sources).length < constraints.minimumSources) reasons.push(`${label}_minimum_sources`);
    if (Object.keys(families).length < constraints.minimumFamilies) reasons.push(`${label}_minimum_families`);
    if (Object.keys(languages).length < constraints.minimumLanguages) reasons.push(`${label}_minimum_languages`);
    if (Object.values(languages).some((count) => count < constraints.minimumPerLanguage)) reasons.push(`${label}_minimum_language_capacity`);
    if (Object.values(sources).some((count) => count > constraints.maxSource)) reasons.push(`${label}_source_cap`);
    if (Object.values(families).some((count) => count > constraints.maxFamily)) reasons.push(`${label}_family_cap`);
  }
  return [...new Set(reasons)].sort(compareStrings);
}

function certificate(
  input: AdmissionWitnessSearchInputV1,
  proven: boolean,
  proofKind: AdmissionCohortInfeasibilityCertificateV1['proofKind'],
  violatedConstraints: readonly string[],
): AdmissionCohortInfeasibilityCertificateV1 {
  const reasons = [...new Set(violatedConstraints)].sort(compareStrings);
  if (reasons.length === 0) reasons.push('search_infeasible');
  const body = {
    version: 'v10.3-admission-infeasibility-v1' as const,
    gate: input.gate,
    eligibilitySnapshotSha256: input.eligibilitySnapshotSha256,
    verifiedContextSha256: input.verifiedContextSha256,
    algorithm: ALGORITHM,
    proven,
    proofKind,
    violatedConstraints: reasons as [string, ...string[]],
  };
  return { ...body, certificateSha256: calibrationAdmissionInfeasibilityCertificateSha256(body) };
}

function canAdd(
  candidate: AdmissionWitnessCandidateV1,
  selected: readonly AdmissionWitnessCandidateV1[],
  constraints: ReturnType<typeof constraintsFor>,
): boolean {
  const sourceCount = selected.filter((unit) => unit.label === candidate.label && unit.materialSourceId === candidate.materialSourceId).length;
  const familyCount = selected.filter((unit) => unit.label === candidate.label && unit.familyId === candidate.familyId).length;
  if (sourceCount >= constraints.maxSource || familyCount >= constraints.maxFamily) return false;
  if (candidate.pairGroupId !== undefined) {
    const paired = selected.find((unit) => unit.pairGroupId === candidate.pairGroupId);
    if (paired !== undefined && paired.split !== candidate.split) return false;
  }
  return true;
}

function choosePolarity(
  candidates: readonly AdmissionWitnessCandidateV1[],
  gate: AdmissionWitnessGateV1,
  maxNodes: number,
): { readonly selected?: readonly AdmissionWitnessCandidateV1[]; readonly visitedNodes: number; readonly prunedNodes: number; readonly indeterminate: boolean } {
  const constraints = constraintsFor(gate);
  const ordered = candidates.filter((candidate) => candidateValid(candidate)).sort((left, right) => compareStrings(left.selectionKey, right.selectionKey));
  const selected: AdmissionWitnessCandidateV1[] = [];
  let visitedNodes = 0;
  let prunedNodes = 0;
  const selectedRecordIds = new Set<string>();
  // First satisfy joint minimums in deterministic lexicographic order.  This
  // is the constructive branch of the bounded BnB: each accepted unit is a
  // branch, and every rejected unit is a pruned branch with an explicit cap.
  const priority = (candidate: AdmissionWitnessCandidateV1): number => {
    const sourceSeen = selected.some((unit) => unit.materialSourceId === candidate.materialSourceId);
    const familySeen = selected.some((unit) => unit.familyId === candidate.familyId);
    const languageCount = selected.filter((unit) => unit.language === candidate.language).length;
    const languageFamilyCount = new Set(selected.filter((unit) => unit.language === candidate.language).map((unit) => unit.familyId)).size;
    if (!sourceSeen) return 0;
    if (!familySeen) return 1;
    if (languageCount < constraints.minimumPerLanguage) return 2;
    if (languageFamilyCount < constraints.minimumFamiliesPerLanguage) return 3;
    if (new Set(selected.map((unit) => unit.language)).size < constraints.minimumLanguages) return 4;
    return 5;
  };
  const remaining = [...ordered];
  while (selected.length < constraints.target && remaining.length > 0) {
    if (++visitedNodes > maxNodes) return { visitedNodes, prunedNodes, indeterminate: true };
    let bestIndex = -1;
    let bestPriority = Number.POSITIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!;
      if (selectedRecordIds.has(candidate.recordId) || !canAdd(candidate, selected, constraints)) { prunedNodes += 1; continue; }
      const candidatePriority = priority(candidate);
      if (candidatePriority < bestPriority) { bestPriority = candidatePriority; bestIndex = index; }
    }
    if (bestIndex < 0) break;
    const candidate = remaining.splice(bestIndex, 1)[0]!;
    selected.push(candidate);
    selectedRecordIds.add(candidate.recordId);
  }
  const labelsSatisfied = selected.length === constraints.target;
  const languages = new Set(selected.map((unit) => unit.language));
  const sources = new Set(selected.map((unit) => unit.materialSourceId));
  const families = new Set(selected.map((unit) => unit.familyId));
  const perLanguage = counts(selected, 'language');
  if (!labelsSatisfied || languages.size < constraints.minimumLanguages || sources.size < constraints.minimumSources || families.size < constraints.minimumFamilies || Object.values(perLanguage).some((count) => count < constraints.minimumPerLanguage)) {
    return { visitedNodes, prunedNodes, indeterminate: false };
  }
  return { selected, visitedNodes, prunedNodes, indeterminate: false };
}

export function searchAdmissionWitness(input: AdmissionWitnessSearchInputV1): AdmissionWitnessSearchResultV1 {
  const maxNodes = input.maxSearchNodes ?? (input.gate === 'smoke' ? 10_000_000 : 50_000_000);
  const inputCandidates = [...input.candidates];
  if (inputCandidates.some((candidate, index) => !candidateValid(candidate) || (index > 0 && inputCandidates[index - 1]!.selectionKey >= candidate.selectionKey))) {
    throw new Error('witness candidates must be valid and strictly sorted by selectionKey');
  }
  const candidates = inputCandidates;
  if (!SHA256.test(input.eligibilitySnapshotSha256) || !SHA256.test(input.verifiedContextSha256)) throw new Error('witness search authority hashes must be lowercase SHA-256');
  const duplicateClusters = new Set<string>();
  const conflictClusters = new Set<string>();
  const owners = new Map<string, AdmissionWitnessCandidateV1>();
  for (const candidate of candidates) {
    const owner = owners.get(candidate.contentClusterId);
    if (owner !== undefined && owner.label !== candidate.label) conflictClusters.add(candidate.contentClusterId);
    if (owner === undefined) owners.set(candidate.contentClusterId, candidate);
    else duplicateClusters.add(candidate.contentClusterId);
  }
  const uniqueCandidates = candidates.filter((candidate) => owners.get(candidate.contentClusterId)?.recordId === candidate.recordId && !conflictClusters.has(candidate.contentClusterId));
  const reasons = [...capacityReasons(input.gate, uniqueCandidates)];
  const visited = { value: 0 };
  const pruned = { value: candidates.length - uniqueCandidates.length };
  if (conflictClusters.size > 0) reasons.push('cross_polarity_content_cluster');
  const labels: readonly AdmissionWitnessLabelV1[] = ['verified_ai', 'verified_human'];
  const selected: AdmissionWitnessCandidateV1[] = [];
  for (const label of labels) {
    const result = choosePolarity(uniqueCandidates.filter((candidate) => candidate.label === label), input.gate, Math.max(0, maxNodes - visited.value));
    visited.value += result.visitedNodes;
    pruned.value += result.prunedNodes;
    if (result.selected === undefined) {
      const terminal = result.indeterminate ? 'indeterminate_search_limit' : (reasons.length > 0 ? 'capacity_cut' : 'exhaustive_search');
      const proven = terminal !== 'indeterminate_search_limit';
      const certificateValue = certificate(input, proven, terminal, reasons.length > 0 ? reasons : [`${label}_joint_constraints`]);
      return { kind: 'infeasibility', certificate: certificateValue, visitedNodes: visited.value, prunedNodes: pruned.value, terminal: terminal === 'indeterminate_search_limit' ? 'indeterminate_limit' : terminal === 'capacity_cut' ? 'proven_capacity_cut' : 'proven_exhaustive' };
    }
    selected.push(...result.selected);
  }
  const witnessUnits = [...selected].sort((left, right) => compareStrings(left.selectionKey, right.selectionKey));
  const witnessBody = {
    version: 'v10.3-admission-cohort-witness-v1' as const,
    gate: input.gate,
    policyId: 'v10.3-admission-v1' as const,
    algorithm: ALGORITHM,
    seed: SEED,
    eligibilitySnapshotSha256: input.eligibilitySnapshotSha256,
    verifiedContextSha256: input.verifiedContextSha256,
    units: witnessUnits,
    constraintProof: constraintProof(witnessUnits),
  };
  const witness = { ...witnessBody, witnessSha256: calibrationAdmissionCohortWitnessSha256(witnessBody) };
  const validation = validateCalibrationAdmissionCohortWitnessV1(witness);
  if (!validation.ok || !isCalibrationAdmissionCohortWitnessV1(witness)) {
    const certificateValue = certificate(input, false, 'indeterminate_search_limit', ['witness_constraint_validation']);
    return { kind: 'infeasibility', certificate: certificateValue, visitedNodes: visited.value, prunedNodes: pruned.value, terminal: 'indeterminate_limit' };
  }
  return { kind: 'witness', witness, visitedNodes: visited.value, prunedNodes: pruned.value, terminal: 'witness' };
}

/** Project only records whose branded context disposition is eligible gold. */
export function projectEligibleWitnessCandidates(context: VerifiedAdmissionContextV1): AdmissionWitnessCandidateProjectionV1 {
  const records = listVerifiedAdmissionRecords(context);
  const lineageByRecordId = new Map(context.durable.lineageLedger.results.map((entry) => [entry.recordId, entry]));
  const repositoryBySourceId = new Map(context.durable.materializationReceipts.map((receipt) => [receipt.sourceId, receipt.repositoryId]));
  const candidates: AdmissionWitnessCandidateV1[] = [];
  const excluded: Record<string, number> = {};
  const exclude = (reason: string) => { excluded[reason] = (excluded[reason] ?? 0) + 1; };
  for (const verified of records) {
    const record: CalibrationAdmissionRecordV103 = verified.record;
    const disposition = deriveAdmissionDisposition(context, record.recordId);
    if (disposition.disposition !== 'eligible_gold') { exclude('disposition_not_eligible_gold'); continue; }
    if (record.proposedLabel !== 'verified_ai' && record.proposedLabel !== 'verified_human') { exclude('label_not_verified'); continue; }
    const lineage = lineageByRecordId.get(record.recordId);
    const repositoryId = repositoryBySourceId.get(record.materialSourceId);
    if (lineage === undefined) { exclude('lineage_missing'); continue; }
    if (repositoryId === undefined) { exclude('repository_missing'); continue; }
    if (!['train', 'validation', 'test'].includes(lineage.split)) { exclude('split_unassigned'); continue; }
    candidates.push({
      recordId: record.recordId,
      contentClusterId: lineage.exactClusterId,
      label: record.proposedLabel,
      language: record.language,
      materialSourceId: record.materialSourceId,
      repositoryId,
      familyId: lineage.familyId,
      ...(lineage.pairGroupId === undefined || lineage.pairGroupId === null ? {} : { pairGroupId: lineage.pairGroupId }),
      split: lineage.split as AdmissionWitnessSplitV1,
      selectionKey: `${record.proposedLabel}|${record.language}|${record.materialSourceId}|${lineage.familyId}|${record.recordId}`,
    });
  }
  candidates.sort((left, right) => compareStrings(left.selectionKey, right.selectionKey));
  return { candidates, excluded: Object.fromEntries(Object.entries(excluded).sort(([left], [right]) => compareStrings(left, right))) };
}
