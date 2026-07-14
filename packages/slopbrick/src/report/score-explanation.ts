import type { ProjectReport } from '../types';
import { formatHeadlineScore, REPOSITORY_HEALTH_FORMULA } from './score-contract.js';

/** Render the deterministic aggregate inputs behind the public scores. */
export function formatScoreExplanation(report: ProjectReport): string {
  const explanation = report.scoreExplanation;
  if (!explanation) {
    return 'Score explanation is unavailable for this legacy report. Re-run the scan with this version of slopbrick.';
  }

  const lines = ['Score explanation (deterministic aggregate inputs only)'];
  lines.push(explanation.attribution);
  const basis = explanation.scoreBasis ?? report.scoreBasis;
  if (basis) {
    lines.push(`Coverage: ${basis.denominator} successfully analysed file${basis.denominator === 1 ? '' : 's'}; per-file AI burdens are additive (the count does not dilute them); effective findings only (${basis.suppressedIssueCount} suppressed, ${basis.parseErrorCount} parse errors).`);
  }
  lines.push('');
  lines.push(`AI Slop Score: ${formatHeadlineScore(explanation.aiSlopScore.value)}/100 (lower is better)`);
  for (const bucket of explanation.aiSlopScore.buckets) {
    lines.push(`  ${bucket.bucket}: raw ${formatHeadlineScore(bucket.rawSlopAmount)} × ${bucket.weight.toFixed(2)} = ${formatHeadlineScore(bucket.weightedAmount)}`);
  }
  lines.push(`Engineering Hygiene: ${formatHeadlineScore(explanation.engineeringHygiene.value)}/100 (higher is better)`);
  for (const category of explanation.engineeringHygiene.categories) {
    lines.push(`  ${category.category}: burden ${formatHeadlineScore(category.burden)}; hygiene deduction ${formatHeadlineScore(category.deduction)}`);
  }
  lines.push(`Category burden: ${explanation.categoryBurden.note}`);
  lines.push(`Security: ${formatHeadlineScore(explanation.security.value)}/100 (higher is better; ${explanation.security.findingCount} security finding${explanation.security.findingCount === 1 ? '' : 's'}; ${explanation.security.formula})`);
  lines.push(`Repository Health: ${formatHeadlineScore(explanation.repositoryHealth.value)}/100 (higher is better; ${REPOSITORY_HEALTH_FORMULA})`);
  for (const input of explanation.repositoryHealth.inputs) {
    lines.push(`  ${input.axis}: ${formatHeadlineScore(input.value)} × ${input.weight.toFixed(2)} = ${formatHeadlineScore(input.weightedAmount)}`);
  }
  return lines.join('\n');
}
