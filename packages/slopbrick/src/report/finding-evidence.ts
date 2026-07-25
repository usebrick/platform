import {
  ISSUE_EVIDENCE_MAX_SNIPPET_BYTES,
  ISSUE_EVIDENCE_MAX_SNIPPET_CHARS,
} from '../types';
import type { IssueEvidence } from '../types';

/**
 * Exact evidence must stay within the public size bounds. When a producer also
 * supplies a typed match, the snippet must contain that value; older exact
 * evidence without a typed match remains displayable. Omitted evidence has no
 * source text to reconcile.
 */
export function isIssueEvidenceSelfConsistent(
  evidence: IssueEvidence | undefined,
): evidence is IssueEvidence {
  if (!evidence) return false;
  if (evidence.status === 'omitted') return true;
  const matched = (evidence as typeof evidence & {
    matched?: { value?: unknown };
  }).matched;
  return typeof evidence.snippet === 'string'
    && evidence.snippet.length <= ISSUE_EVIDENCE_MAX_SNIPPET_CHARS
    && new TextEncoder().encode(evidence.snippet).byteLength <= ISSUE_EVIDENCE_MAX_SNIPPET_BYTES
    && (
      matched === undefined
      || (typeof matched.value === 'string' && evidence.snippet.includes(matched.value))
    );
}
