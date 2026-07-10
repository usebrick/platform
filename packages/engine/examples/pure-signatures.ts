import { extractSignatures, signatureSimilarity } from '@usebrick/engine/pure';

/** Compare signatures without walking a workspace. */
export function signatureExample(): number {
  const [first] = extractSignatures(
    'export function Button({ label }: { label: string }) { useState(); }',
    '/virtual/button.tsx',
    '/virtual',
  );
  const [second] = extractSignatures(
    'export function Button({ label }: { label: string }) { useState(); }',
    '/virtual/other.tsx',
    '/virtual',
  );
  if (!first || !second) throw new Error('expected two signatures');
  return signatureSimilarity(first, second);
}
