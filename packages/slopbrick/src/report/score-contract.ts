/** User-facing contract for the four headline scores. */
export const REPOSITORY_HEALTH_FORMULA =
  '0.4 × (100 − AI Slop Score) + 0.3 × Engineering Hygiene + 0.2 × Security + 0.1 × Test Quality';

export const SCORE_BRIEFS = {
  aiSlopScore: 'raw amount of AI slop, 0-100 (lower is better)',
  engineeringHygiene: 'cleanliness across arch, logic, layout, visual, component, and test categories, 0-100 (higher is better)',
  security: 'security posture, 0-100 (higher is better)',
  repositoryHealth: `weighted composite (${REPOSITORY_HEALTH_FORMULA}), 0-100 (higher is better)`,
} as const;

export const HEADLINE_SCORES = [
  { field: 'aiSlopScore', label: 'AI Slop Score' },
  { field: 'engineeringHygiene', label: 'Engineering Hygiene' },
  { field: 'security', label: 'Security' },
  { field: 'repositoryHealth', label: 'Repository Health' },
] as const;

/** Preserve displayed score precision across human-readable renderers. */
export function formatHeadlineScore(value: number): string {
  return value.toFixed(1);
}
