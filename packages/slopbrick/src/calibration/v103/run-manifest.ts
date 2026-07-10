import {
  calibrationCheckoutMapSha256,
  isCalibrationCheckoutMapV103,
  isCalibrationRunManifestV103,
  type SlopBrickV103CalibrationRunManifest,
} from '@usebrick/core';
import { planV103Chunks } from './bisection';
import { canonicalJson, canonicalSha256 } from './canonical';
import type { SelectionLedger, SelectionRecord } from './selection';

type RunManifestDraft = Omit<SlopBrickV103CalibrationRunManifest, 'version' | 'inputHashes'> & {
  readonly version?: 'v10.3';
  readonly inputHashes: Omit<SlopBrickV103CalibrationRunManifest['inputHashes'], 'checkoutMapSha256'>;
};

/** Build the portable artifact; the local checkout map contributes only its digest. */
export function createV103RunManifest(draft: RunManifestDraft, checkoutMap: unknown): SlopBrickV103CalibrationRunManifest {
  if (!isCalibrationCheckoutMapV103(checkoutMap)) throw new Error('Checkout map does not satisfy the v10.3 local contract');
  if (checkoutMap.runId !== draft.runId) throw new Error('Checkout map run ID does not match run manifest');
  const run = {
    ...draft,
    version: 'v10.3' as const,
    inputHashes: { ...draft.inputHashes, checkoutMapSha256: calibrationCheckoutMapSha256(checkoutMap) },
  };
  if (!isCalibrationRunManifestV103(run)) throw new Error('Run manifest does not satisfy the v10.3 contract');
  return run;
}

/** Fail closed before any future scanner stage can resolve local paths. */
export function verifyV103RunInputs(run: unknown, checkoutMap: unknown): { ok: true } | { ok: false; error: string } {
  if (!isCalibrationRunManifestV103(run)) return { ok: false, error: 'Run manifest does not satisfy the v10.3 contract' };
  if (!isCalibrationCheckoutMapV103(checkoutMap)) return { ok: false, error: 'Checkout map does not satisfy the v10.3 local contract' };
  if (run.runId !== checkoutMap.runId) return { ok: false, error: 'Checkout map run ID does not match run manifest' };
  if (run.inputHashes.checkoutMapSha256 !== calibrationCheckoutMapSha256(checkoutMap)) return { ok: false, error: 'Checkout map hash does not match run manifest' };
  return { ok: true };
}

/** Ensure the portable run declaration names exactly the frozen selected corpus. */
export function verifyV103ExpectedSelection(
  run: SlopBrickV103CalibrationRunManifest,
  records: readonly SelectionRecord[],
): { ok: true } | { ok: false; error: string } {
  for (const polarity of ['verified_ai', 'verified_human'] as const) {
    const fileIds = records.filter((record) => record.status === 'selected' && record.label === polarity).map((record) => record.fileId);
    const chunkIds = planV103Chunks(fileIds, run.settings.chunkSize).map(canonicalSha256);
    if (JSON.stringify(run.expected.fileIdsByPolarity[polarity]) !== JSON.stringify(fileIds)) {
      return { ok: false, error: `Run manifest expected file IDs do not match selected ${polarity} records` };
    }
    if (JSON.stringify(run.expected.chunkIdsByPolarity[polarity]) !== JSON.stringify(chunkIds)) {
      return { ok: false, error: `Run manifest expected chunk IDs do not match selected ${polarity} records` };
    }
  }
  return { ok: true };
}

/** Bind the portable run declaration to the already manifest-verified selection ledger. */
export function verifyV103SelectionBinding(
  run: SlopBrickV103CalibrationRunManifest,
  ledger: SelectionLedger,
): { ok: true } | { ok: false; error: string } {
  if (run.selection.seed !== ledger.seed) return { ok: false, error: 'Run manifest selection seed does not match selection ledger' };
  if (canonicalJson(run.selection.policy) !== canonicalJson(ledger.policy)) {
    return { ok: false, error: 'Run manifest selection policy does not match selection ledger' };
  }
  return { ok: true };
}
