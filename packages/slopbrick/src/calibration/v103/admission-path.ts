import { realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

/** Resolve a root-relative admission input through symlinks before containment checking. */
export async function requireContainedAdmissionPath(root: string, candidate: string): Promise<string> {
  if (isAbsolute(candidate)) throw new Error('Admission input path must be root-relative');
  const canonicalRoot = await realpath(resolve(root));
  const lexicalCandidate = resolve(canonicalRoot, candidate);
  const canonicalParent = await realpath(dirname(lexicalCandidate));
  const canonicalCandidate = await realpath(lexicalCandidate);
  const parentRelative = relative(canonicalRoot, canonicalParent);
  const candidateRelative = relative(canonicalRoot, canonicalCandidate);
  if (parentRelative === '..' || parentRelative.startsWith(`..${sep}`) || isAbsolute(parentRelative)
    || candidateRelative === '..' || candidateRelative.startsWith(`..${sep}`) || isAbsolute(candidateRelative)) {
    throw new Error('Admission input path escapes root');
  }
  return canonicalCandidate;
}
