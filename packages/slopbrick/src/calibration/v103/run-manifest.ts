import {
  calibrationCheckoutMapSha256,
  isCalibrationCheckoutMapV103,
  isCalibrationRunManifestV103,
  type SlopBrickV103CalibrationRunManifest,
} from '@usebrick/core';

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
