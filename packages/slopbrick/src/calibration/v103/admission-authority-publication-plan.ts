/**
 * Pure planner for a prebuilt static admission-authority publication.
 *
 * The planner only joins caller-supplied hashes and identifiers to the fixed
 * review/admission topology. It never discovers, reads, or writes a path.
 * Publication/recovery may consume the returned Core lock and transaction
 * after independently validating the prebuilt graph and its bytes.
 */
import {
  calibrationAdmissionAuthorityRebuildLockSha256,
  calibrationAdmissionAuthorityRebuildTransactionSha256,
  calibrationAdmissionSha256,
  validateCalibrationAdmissionAuthorityRebuildGraphV1,
  validateCalibrationAdmissionAuthorityRebuildLockV1,
  validateCalibrationAdmissionAuthorityRebuildTransactionV1,
  type CalibrationAdmissionAuthorityRebuildLockV1,
  type CalibrationAdmissionAuthorityRebuildTransactionV1,
} from '@usebrick/core';

const MAX_SOURCE_GENERATIONS = 452_382;
const SHA256 = /^[a-f0-9]{64}$/u;
const ADMISSION_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const AUTHORITY_ROOT = 'review/admission/authority';
const AUTHORITY_CURRENT_FINAL = `${AUTHORITY_ROOT}/current.json`;
const LOCK_RELATIVE_PATH = `${AUTHORITY_ROOT}/rebuild.lock`;
const TRANSACTION_RELATIVE_PATH = `${AUTHORITY_ROOT}/rebuild-transaction.json`;

type ExpectedCurrentState = CalibrationAdmissionAuthorityRebuildLockV1['expectedCurrentState'];

export interface PrebuiltAuthoritySourceGenerationPlanInput {
  readonly sourceId: string;
  readonly generationSha256: string;
  readonly artifactSetSha256: string;
  /** Explicit prior source generation for a replacement, when one exists. */
  readonly priorGenerationSha256?: string;
}

export interface PriorInputGenerationDescriptor {
  readonly generationSha256: string;
  /** Optional numeric metadata; the SHA remains the CAS authority. */
  readonly generation?: number;
  /** If supplied, this must be the canonical hash-derived generation path. */
  readonly relativePath?: string;
}

export interface PrebuiltAdmissionAuthorityPublicationPlanInput {
  readonly operation: 'create' | 'replace';
  readonly invocationIntentId: string;
  readonly inputGenerationProposalId: string;
  readonly inputGenerationProposalSha256: string;
  readonly expectedCurrentState: ExpectedCurrentState;
  readonly inputGeneration: {
    readonly generation: number;
    readonly generationSha256: string;
    readonly parentInputGenerationSha256?: string;
  };
  readonly staticGeneration: {
    readonly generation: number;
    readonly generationSha256: string;
    readonly parentStaticGenerationSha256?: string;
  };
  readonly sources: readonly PrebuiltAuthoritySourceGenerationPlanInput[];
  /** Required for replace; deliberately not inferred from a generation number. */
  readonly priorInputGeneration?: PriorInputGenerationDescriptor;
  /** Optional caller-selected nonce; omitted means a deterministic nonce. */
  readonly recoveryNonce?: string;
}

export interface PrebuiltAdmissionAuthorityPublicationPlanPaths {
  readonly lockRelativePath: typeof LOCK_RELATIVE_PATH;
  readonly transactionRelativePath: typeof TRANSACTION_RELATIVE_PATH;
  readonly inputGenerationRelativePath: string;
  readonly priorInputGenerationRelativePath?: string;
  readonly staticGenerationStagingRelativePath: string;
  readonly staticGenerationFinalRelativePath: string;
  readonly authorityCurrentTemporaryRelativePath: string;
  readonly authorityCurrentFinalRelativePath: typeof AUTHORITY_CURRENT_FINAL;
  readonly sourceGenerationDirectories: CalibrationAdmissionAuthorityRebuildTransactionV1['sourceGenerationDirectories'];
}

export interface PrebuiltAdmissionAuthorityPublicationPlanSuccess {
  readonly ok: true;
  readonly lock: CalibrationAdmissionAuthorityRebuildLockV1;
  readonly transaction: CalibrationAdmissionAuthorityRebuildTransactionV1;
  readonly paths: PrebuiltAdmissionAuthorityPublicationPlanPaths;
}

export interface PrebuiltAdmissionAuthorityPublicationPlanFailure {
  readonly ok: false;
  readonly errors: readonly string[];
}

export type PrebuiltAdmissionAuthorityPublicationPlanResult =
  | PrebuiltAdmissionAuthorityPublicationPlanSuccess
  | PrebuiltAdmissionAuthorityPublicationPlanFailure;

function result(errors: readonly string[]): PrebuiltAdmissionAuthorityPublicationPlanFailure {
  return { ok: false, errors: [...new Set(errors)] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

function isAdmissionId(value: unknown): value is string {
  return typeof value === 'string' && ADMISSION_ID.test(value);
}

function expectedCurrentState(value: unknown): value is ExpectedCurrentState {
  if (!isRecord(value)) return false;
  if (value.kind === 'absent') return Object.keys(value).length === 1;
  return value.kind === 'existing'
    && Object.keys(value).length === 2
    && isSha256(value.staticGenerationSha256);
}

function relativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096
    || value.startsWith('/') || value.includes('\\') || value.includes('//')) return false;
  return value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..'
    && !/[\u0000-\u001f]/.test(segment));
}

function inputGenerationPath(generationSha256: string): string {
  return `${AUTHORITY_ROOT}/input-generations/${generationSha256}/generation.json`;
}

function staticGenerationPath(generationSha256: string): string {
  return `${AUTHORITY_ROOT}/static-generations/${generationSha256}`;
}

function sourceGenerationPaths(
  transactionId: string,
  source: PrebuiltAuthoritySourceGenerationPlanInput,
): CalibrationAdmissionAuthorityRebuildTransactionV1['sourceGenerationDirectories'][number] {
  const sourceRoot = `review/admission/sources/${source.sourceId}`;
  const generationsParentRelativePath = `${sourceRoot}/generations`;
  return {
    sourceId: source.sourceId,
    generationSha256: source.generationSha256,
    artifactSetSha256: source.artifactSetSha256,
    generationStagingRelativePath: `${sourceRoot}/staging/${transactionId}`,
    generationFinalRelativePath: `${generationsParentRelativePath}/${source.generationSha256}`,
    generationsParentRelativePath,
    ...(source.priorGenerationSha256 === undefined
      ? {}
      : { priorGenerationRelativePath: `${generationsParentRelativePath}/${source.priorGenerationSha256}` }),
    currentPointerTemporaryRelativePath: `${sourceRoot}/current.${transactionId}.tmp.json`,
    currentPointerFinalRelativePath: `${sourceRoot}/current.json`,
  };
}

function planDigest(input: PrebuiltAdmissionAuthorityPublicationPlanInput, sources: readonly PrebuiltAuthoritySourceGenerationPlanInput[]): string {
  const inputGeneration = {
    generation: input.inputGeneration.generation,
    generationSha256: input.inputGeneration.generationSha256,
    ...(input.inputGeneration.parentInputGenerationSha256 === undefined
      ? {}
      : { parentInputGenerationSha256: input.inputGeneration.parentInputGenerationSha256 }),
  };
  const staticGeneration = {
    generation: input.staticGeneration.generation,
    generationSha256: input.staticGeneration.generationSha256,
    ...(input.staticGeneration.parentStaticGenerationSha256 === undefined
      ? {}
      : { parentStaticGenerationSha256: input.staticGeneration.parentStaticGenerationSha256 }),
  };
  return calibrationAdmissionSha256({
    version: 'v10.3-admission-authority-publication-plan-v1',
    operation: input.operation,
    invocationIntentId: input.invocationIntentId,
    inputGenerationProposalId: input.inputGenerationProposalId,
    inputGenerationProposalSha256: input.inputGenerationProposalSha256,
    expectedCurrentState: input.expectedCurrentState,
    inputGeneration,
    staticGeneration,
    sources,
    priorInputGeneration: input.priorInputGeneration ?? null,
  });
}

function validateInput(input: unknown): { readonly errors: readonly string[]; readonly value?: PrebuiltAdmissionAuthorityPublicationPlanInput; readonly sources?: readonly PrebuiltAuthoritySourceGenerationPlanInput[] } {
  const errors: string[] = [];
  if (!isRecord(input)) return { errors: ['authority publication plan input is not an object'] };
  if (input.operation !== 'create' && input.operation !== 'replace') errors.push('authority publication plan operation is invalid');
  if (!isSha256(input.invocationIntentId)) errors.push('authority publication plan invocation intent ID is invalid');
  if (!isAdmissionId(input.inputGenerationProposalId)) errors.push('authority publication plan input-generation proposal ID is invalid');
  if (!isSha256(input.inputGenerationProposalSha256)) errors.push('authority publication plan input-generation proposal hash is invalid');
  if (!expectedCurrentState(input.expectedCurrentState)) errors.push('authority publication plan expected current state is invalid');

  const operation = input.operation;
  if (operation === 'create' && isRecord(input.expectedCurrentState) && input.expectedCurrentState.kind !== 'absent') {
    errors.push('create publication must expect an absent authority current pointer');
  }
  if (operation === 'replace' && isRecord(input.expectedCurrentState) && input.expectedCurrentState.kind !== 'existing') {
    errors.push('replace publication must expect an existing authority current pointer');
  }

  const inputGeneration = isRecord(input.inputGeneration) ? input.inputGeneration : undefined;
  if (!inputGeneration) errors.push('authority publication plan input generation metadata is invalid');
  else {
    if (!safeInteger(inputGeneration.generation)) errors.push('authority publication plan input generation number is invalid');
    if (!isSha256(inputGeneration.generationSha256)) errors.push('authority publication plan input generation hash is invalid');
    if (inputGeneration.parentInputGenerationSha256 !== undefined && !isSha256(inputGeneration.parentInputGenerationSha256)) {
      errors.push('authority publication plan input generation parent hash is invalid');
    }
  }

  const staticGeneration = isRecord(input.staticGeneration) ? input.staticGeneration : undefined;
  if (!staticGeneration) errors.push('authority publication plan static generation metadata is invalid');
  else {
    if (!safeInteger(staticGeneration.generation)) errors.push('authority publication plan static generation number is invalid');
    if (!isSha256(staticGeneration.generationSha256)) errors.push('authority publication plan static generation hash is invalid');
    if (staticGeneration.parentStaticGenerationSha256 !== undefined && !isSha256(staticGeneration.parentStaticGenerationSha256)) {
      errors.push('authority publication plan static generation parent hash is invalid');
    }
  }

  const sources: PrebuiltAuthoritySourceGenerationPlanInput[] = [];
  if (!Array.isArray(input.sources) || input.sources.length === 0 || input.sources.length > MAX_SOURCE_GENERATIONS) {
    errors.push('authority publication plan sources are invalid or outside the bounded limit');
  } else {
    for (const source of input.sources) {
      if (!isRecord(source)) {
        errors.push('authority publication plan source descriptor is invalid');
        continue;
      }
      if (!isAdmissionId(source.sourceId)) errors.push('authority publication plan source ID is invalid');
      if (!isSha256(source.generationSha256)) errors.push(`authority publication plan source ${String(source.sourceId)} generation hash is invalid`);
      if (!isSha256(source.artifactSetSha256)) errors.push(`authority publication plan source ${String(source.sourceId)} artifact-set hash is invalid`);
      if (source.priorGenerationSha256 !== undefined && !isSha256(source.priorGenerationSha256)) {
        errors.push(`authority publication plan source ${String(source.sourceId)} prior generation hash is invalid`);
      }
      if (operation === 'create' && source.priorGenerationSha256 !== undefined) {
        errors.push(`create publication source ${String(source.sourceId)} must not carry a prior generation`);
      }
      sources.push({
        sourceId: String(source.sourceId),
        generationSha256: String(source.generationSha256),
        artifactSetSha256: String(source.artifactSetSha256),
        ...(source.priorGenerationSha256 === undefined ? {} : { priorGenerationSha256: String(source.priorGenerationSha256) }),
      });
    }
    const sourceIds = sources.map((source) => source.sourceId);
    if (new Set(sourceIds).size !== sourceIds.length) errors.push('authority publication plan source IDs are duplicated');
    sources.sort((left, right) => left.sourceId < right.sourceId ? -1 : left.sourceId > right.sourceId ? 1 : 0);
  }

  const priorInput = input.priorInputGeneration;
  if (priorInput !== undefined) {
    if (!isRecord(priorInput) || !isSha256(priorInput.generationSha256)) {
      errors.push('authority publication plan prior input-generation descriptor is invalid');
    } else {
      if (priorInput.generation !== undefined && !safeInteger(priorInput.generation)) errors.push('authority publication plan prior input-generation number is invalid');
      if (priorInput.relativePath !== undefined
        && (typeof priorInput.relativePath !== 'string'
          || !relativePath(priorInput.relativePath)
          || priorInput.relativePath !== inputGenerationPath(priorInput.generationSha256))) {
        errors.push('authority publication plan prior input-generation path is not canonical');
      }
    }
  }

  if (input.recoveryNonce !== undefined && !isSha256(input.recoveryNonce)) errors.push('authority publication plan recovery nonce is invalid');

  if (operation === 'create' && inputGeneration && safeInteger(inputGeneration.generation)) {
    if (inputGeneration.generation !== 0 || inputGeneration.parentInputGenerationSha256 !== undefined) errors.push('create publication must use input generation zero without a parent');
  }
  if (operation === 'create' && staticGeneration && safeInteger(staticGeneration.generation)) {
    if (staticGeneration.generation !== 0 || staticGeneration.parentStaticGenerationSha256 !== undefined) errors.push('create publication must use static generation zero without a parent');
  }
  if (operation === 'create' && priorInput !== undefined) errors.push('create publication must not carry a prior input-generation descriptor');

  if (operation === 'replace') {
    if (!priorInput || !isRecord(priorInput) || !isSha256(priorInput.generationSha256)) {
      errors.push('replace publication requires an explicit prior input-generation SHA/descriptor');
    } else if (inputGeneration && isSha256(inputGeneration.parentInputGenerationSha256)
      && inputGeneration.parentInputGenerationSha256 !== priorInput.generationSha256) {
      errors.push('replace publication input-generation parent does not exactly match the supplied prior input SHA');
    } else if (inputGeneration && inputGeneration.parentInputGenerationSha256 === undefined) {
      errors.push('replace publication input generation must carry the explicit prior input SHA as its parent');
    }
    if (isRecord(staticGeneration) && isRecord(input.expectedCurrentState)
      && input.expectedCurrentState.kind === 'existing'
      && (staticGeneration.parentStaticGenerationSha256 === undefined
        || staticGeneration.parentStaticGenerationSha256 !== input.expectedCurrentState.staticGenerationSha256)) {
      errors.push('replace publication requires static-generation parent to exactly match expected current static SHA');
    }
    if (inputGeneration && safeInteger(inputGeneration.generation) && inputGeneration.generation === 0) errors.push('replace publication input generation must be greater than zero');
    if (staticGeneration && safeInteger(staticGeneration.generation) && staticGeneration.generation === 0) errors.push('replace publication static generation must be greater than zero');
    if (priorInput && isRecord(priorInput) && safeInteger(priorInput.generation)
      && inputGeneration && safeInteger(inputGeneration.generation)
      && inputGeneration.generation !== priorInput.generation + 1) {
      errors.push('replace publication input generation number does not follow the explicit prior descriptor');
    }
  }

  return { errors, value: input as unknown as PrebuiltAdmissionAuthorityPublicationPlanInput, sources };
}

/** Build a deterministic, Core-valid lock/transaction pair without I/O. */
export function planPrebuiltAdmissionAuthorityPublication(
  input: PrebuiltAdmissionAuthorityPublicationPlanInput,
): PrebuiltAdmissionAuthorityPublicationPlanResult {
  try {
    const validated = validateInput(input);
    if (validated.errors.length > 0 || !validated.value || !validated.sources) return result(validated.errors);
    const value = validated.value;
    const sources = validated.sources;
    const inputGenerationSha256 = value.inputGeneration.generationSha256;
    const staticGenerationSha256 = value.staticGeneration.generationSha256;
    const planDigestValue = planDigest(value, sources);
    const recoveryNonce = value.recoveryNonce ?? calibrationAdmissionSha256({
      version: 'v10.3-admission-authority-rebuild-recovery-v1',
      planDigest: planDigestValue,
      expectedCurrentState: value.expectedCurrentState,
    });
    // The recovery nonce is part of the transaction identity. Without this
    // binding, two caller-selected nonces could share staging paths while
    // carrying different lock bytes, making recovery ambiguous.
    const identityDigest = calibrationAdmissionSha256({
      version: 'v10.3-admission-authority-rebuild-transaction-id-v1',
      planDigest: planDigestValue,
      recoveryNonce,
    });
    const transactionId = `authority-rebuild-${identityDigest.slice(0, 32)}`;
    const lockId = `authority-rebuild-lock-${identityDigest.slice(32)}`;
    const sourceGenerationDirectories = sources.map((source) => sourceGenerationPaths(transactionId, source));
    if (sourceGenerationDirectories.length === 0) return result(['authority publication plan must contain at least one source generation']);
    const sourceGenerationDirectoryTuple = sourceGenerationDirectories as CalibrationAdmissionAuthorityRebuildTransactionV1['sourceGenerationDirectories'];
    const paths: PrebuiltAdmissionAuthorityPublicationPlanPaths = {
      lockRelativePath: LOCK_RELATIVE_PATH,
      transactionRelativePath: TRANSACTION_RELATIVE_PATH,
      inputGenerationRelativePath: inputGenerationPath(inputGenerationSha256),
      ...(value.priorInputGeneration === undefined
        ? {}
        : { priorInputGenerationRelativePath: inputGenerationPath(value.priorInputGeneration.generationSha256) }),
      staticGenerationStagingRelativePath: `${AUTHORITY_ROOT}/staging/${transactionId}`,
      staticGenerationFinalRelativePath: staticGenerationPath(staticGenerationSha256),
      authorityCurrentTemporaryRelativePath: `${AUTHORITY_ROOT}/current.${transactionId}.tmp.json`,
      authorityCurrentFinalRelativePath: AUTHORITY_CURRENT_FINAL,
      sourceGenerationDirectories: sourceGenerationDirectoryTuple,
    };
    const lockBody: Omit<CalibrationAdmissionAuthorityRebuildLockV1, 'lockSha256'> = {
      version: 'v10.3-admission-authority-rebuild-lock-v1',
      lockId,
      intendedTransactionId: transactionId,
      invocationIntentId: value.invocationIntentId,
      inputGenerationProposalId: value.inputGenerationProposalId,
      inputGenerationProposalSha256: value.inputGenerationProposalSha256,
      operation: value.operation,
      expectedCurrentState: value.expectedCurrentState,
      recoveryNonce,
    };
    const lock: CalibrationAdmissionAuthorityRebuildLockV1 = {
      ...lockBody,
      lockSha256: calibrationAdmissionAuthorityRebuildLockSha256(lockBody),
    };
    const transactionBody: Omit<CalibrationAdmissionAuthorityRebuildTransactionV1, 'transactionSha256'> = {
      version: 'v10.3-admission-authority-rebuild-transaction-v1',
      transactionId,
      lockSha256: lock.lockSha256,
      invocationIntentId: value.invocationIntentId,
      inputGenerationProposalId: value.inputGenerationProposalId,
      inputGenerationProposalSha256: value.inputGenerationProposalSha256,
      operation: value.operation,
      expectedCurrentState: value.expectedCurrentState,
      recoveryNonce,
      inputGenerationRelativePath: paths.inputGenerationRelativePath,
      staticGenerationStagingRelativePath: paths.staticGenerationStagingRelativePath,
      authorityCurrentTemporaryRelativePath: paths.authorityCurrentTemporaryRelativePath,
      authorityCurrentFinalRelativePath: paths.authorityCurrentFinalRelativePath,
      sourceGenerationDirectories: sourceGenerationDirectoryTuple,
      state: { phase: 'intent_fsynced' },
    };
    const transaction: CalibrationAdmissionAuthorityRebuildTransactionV1 = {
      ...transactionBody,
      transactionSha256: calibrationAdmissionAuthorityRebuildTransactionSha256(transactionBody),
    };
    const lockValidation = validateCalibrationAdmissionAuthorityRebuildLockV1(lock);
    const transactionValidation = validateCalibrationAdmissionAuthorityRebuildTransactionV1(transaction);
    const graphValidation = validateCalibrationAdmissionAuthorityRebuildGraphV1(lock, transaction);
    if (!lockValidation.ok || !transactionValidation.ok || !graphValidation.ok) {
      return result([...lockValidation.errors, ...transactionValidation.errors, ...graphValidation.errors]);
    }
    return { ok: true, lock, transaction, paths };
  } catch {
    return result(['authority publication plan validation failed closed']);
  }
}
