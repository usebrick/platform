import type { Issue, ProjectReport } from '../types';
import { HEADLINE_SCORES, SCORE_BRIEFS, formatHeadlineScore } from './score-contract.js';
import { bucketForRule, isDefaultOffIssue, summarizeDefaultOffIssues } from './buckets';
import type { Bucket } from './buckets';
import { getSignalStrength } from '../rules/signal-strength.js';
import {
  formatScanAccountingSummary,
  formatScanValidityNotice,
  isIncompleteScan,
  isNotApplicableScan,
} from './scan-validity.js';
import { formatFindingContext } from './finding-context.js';
import type { Verdict } from '@usebrick/core';

/**
 * v0.15.0 (U.3) — ProjectReport fields that U.5 will add to the type.
 * Until U.5 lands, they're read off a structural cast so the report
 * renders cleanly. The cast is a no-op once U.5 adds the fields.
 */
interface ProjectReportV015 {
  aiSlopScore?: number;
  engineeringHygiene?: number;
  security?: number;
}

/** Pretty-print a rule id: `logic/boundary-violation` → `Boundary Violation`. */
function ruleDisplayName(ruleId: string): string {
  const last = ruleId.split('/').pop() ?? ruleId;
  return last
    .split('-')
    .map((part) => (part.length === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

/** Confidence label derived from a rule's calibration precision. */
function confidenceLabel(precision: number): string {
  if (precision >= 0.8) return 'High';
  if (precision >= 0.5) return 'Medium';
  return 'Low';
}

/** Render the bounded finding-evidence contract without exposing unbounded
 * source. Markdown is a local human report, so exact snippets remain useful;
 * producer-omitted spans stay explicitly omitted rather than becoming a
 * misleading empty code fragment. */
function formatIssueEvidence(evidence: Issue['evidence']): string | null {
  if (!evidence) return null;
  const start = evidence.location.start;
  const end = evidence.location.end;
  const location = `${start.line}:${start.column}-${end.line}:${end.column}`;
  if (evidence.status === 'omitted') {
    return `evidence omitted (${evidence.omission.reason}) at ${location}`;
  }
  const snippet = evidence.snippet.replaceAll('`', '\\`').replace(/[\r\n]+/g, ' ');
  return `evidence: \`${snippet}\` (${location})`;
}

/** Title-case a verdict enum (`NOISY` → `Noisy`). */
function verdictLabel(verdict: Verdict): string {
  return verdict.charAt(0).toUpperCase() + verdict.slice(1).toLowerCase();
}

interface RuleBucketEntry {
  ruleId: string;
  verdict: Verdict;
  precision: number;
  bucket: Bucket;
  count: number;
  contexts: string[];
  evidence: string[];
}

function bucketEntriesForIssues(issues: ProjectReport['issues']): {
  grouped: Record<Bucket, RuleBucketEntry[]>;
  dist: Record<Bucket, number>;
} {
  // Dedupe by ruleId — the spec shows one entry per rule ("Zombie State"),
  // not one entry per firing.
  const byRule = new Map<string, RuleBucketEntry>();
  for (const issue of issues) {
    const existing = byRule.get(issue.ruleId);
    if (existing) {
      existing.count++;
      const context = formatFindingContext(issue.filePath);
      if (!existing.contexts.includes(context)) existing.contexts.push(context);
      const evidence = formatIssueEvidence(issue.evidence);
      if (evidence && !existing.evidence.includes(evidence) && existing.evidence.length < 3) {
        existing.evidence.push(evidence);
      }
      continue;
    }
    const strength = getSignalStrength(issue.ruleId);
    const verdict = (strength?.verdict ?? 'OK') as Verdict;
    // The issue's explicit aiSpecific flag is authoritative for the
    // human-facing taxonomy. Calibration verdicts describe signal quality,
    // not whether a rule is an authorship signal: a USEFUL security or
    // performance rule must not be presented as an AI finding. Keep noisy and
    // dormant verdicts suppressed regardless of polarity.
    const aiSpecific = typeof issue.aiSpecific === 'boolean'
      ? issue.aiSpecific
      : strength?.aiSpecific ?? true;
    const evidence = formatIssueEvidence(issue.evidence);
    byRule.set(issue.ruleId, {
      ruleId: issue.ruleId,
      verdict,
      precision: strength?.precision ?? 0,
      bucket: bucketForRule(verdict, aiSpecific),
      count: 1,
      contexts: [formatFindingContext(issue.filePath)],
      evidence: evidence ? [evidence] : [],
    });
  }
  const entries = Array.from(byRule.values());

  const dist: Record<Bucket, number> = { ai: 0, hygiene: 0, suppressed: 0 };
  const grouped: Record<Bucket, RuleBucketEntry[]> = {
    ai: [],
    hygiene: [],
    suppressed: [],
  };
  for (const entry of entries) {
    grouped[entry.bucket].push(entry);
    dist[entry.bucket]++;
  }
  return { grouped, dist };
}

export function formatMarkdown(report: ProjectReport): string {
  if (isNotApplicableScan(report) || isIncompleteScan(report)) {
    const notice = formatScanValidityNotice(report) ??
      'NO FILES ANALYSED — scores are not applicable for gating.';
    const completionStatus = report.completionStatus ?? (isIncompleteScan(report) ? 'partial' : 'empty');
    const scoreValidity = report.scoreValidity ?? (isIncompleteScan(report) ? 'incomplete' : 'not-applicable');
    const lines = [
      '# Slop Audit Report',
      '',
      `> **${notice}**`,
      '',
      `- **Completion status:** ${completionStatus}`,
      `- **Score validity:** ${scoreValidity}`,
      `- **Requested files:** ${report.requested ?? 0}`,
      `- **Analysed files:** ${report.analyzed ?? 0}`,
      `- **Failed files:** ${report.failed ?? 0}`,
      `- **Skipped files:** ${report.skipped ?? 0}`,
    ];
    return `${lines.join('\n')}\n`;
  }
  const lines: string[] = [];
  lines.push(`# Slop Audit Report`);
  lines.push('');
  const validityNotice = formatScanValidityNotice(report);
  if (validityNotice) {
    lines.push(`> **${validityNotice}**`);
    lines.push('');
  }

  const ext = report as ProjectReport & ProjectReportV015;

  // ----- Repository Health (4 named scores, replacing single slopIndex) -----
  lines.push(`## Repository Health`);
  lines.push('');
  for (const { field, label } of HEADLINE_SCORES) {
    const value = ext[field] ?? 0;
    lines.push(`- **${label}** ${formatHeadlineScore(value)}/100 — ${SCORE_BRIEFS[field]}`);
  }
  lines.push('');

  // ----- Metadata (kept from the legacy header, minus the replaced scores) -----
  if (typeof report.coherence === 'number') {
    lines.push(`- **Repository Coherence:** ${report.coherence.toFixed(2)} / 100`);
  }
  lines.push(`- **Components:** ${report.componentCount}`);
  lines.push(`- **Files:** ${report.fileCount}`);
  if (report.scoreBasis) {
    lines.push(`- **Score coverage:** ${report.scoreBasis.denominator} successfully analysed files; per-file AI burdens are additive (the count does not dilute them); effective findings only (${report.scoreBasis.suppressedIssueCount} suppressed finding instances are audit-only, ${report.scoreBasis.parseErrorCount} parse errors)`);
  }
  const accountingSummary = formatScanAccountingSummary(report);
  if (accountingSummary) lines.push(`- ${accountingSummary}`);
  const defaultOff = summarizeDefaultOffIssues(report.issues);
  if (defaultOff.instances > 0) {
    lines.push(`- **Default-off audit:** ${defaultOff.instances} suppressed finding instance${defaultOff.instances === 1 ? '' : 's'} across ${defaultOff.ruleCount} rule${defaultOff.ruleCount === 1 ? '' : 's'}; excluded from actionable buckets`);
  }
  lines.push(`- **Generated:** ${report.generatedAt}`);
  lines.push('');

  // ----- 3-bucket grouping via bucketForVerdict() + bucketDistribution() -----
  const { grouped, dist } = bucketEntriesForIssues(report.issues.filter((issue) => !isDefaultOffIssue(issue)));

  // AI Findings (USEFUL + OK → ai bucket)
  lines.push(`## AI Findings (${dist.ai})`);
  lines.push('');
  if (grouped.ai.length === 0) {
    lines.push('_No AI findings._');
    lines.push('');
  } else {
    for (const r of grouped.ai) {
      const evidence = r.evidence.length > 0 ? `; ${r.evidence.join('; ')}` : '';
      lines.push(`- ✓ ${ruleDisplayName(r.ruleId)} (${r.count} instance${r.count === 1 ? '' : 's'}; context: ${r.contexts.join(', ')}; Confidence: ${confidenceLabel(r.precision)}${evidence})`);
    }
    lines.push('');
  }

  // Engineering Hygiene (HYGIENE + INVERTED → hygiene bucket)
  lines.push(`## Engineering Hygiene (${dist.hygiene})`);
  lines.push('');
  if (grouped.hygiene.length === 0) {
    lines.push('_No engineering hygiene findings._');
    lines.push('');
  } else {
    for (const r of grouped.hygiene) {
      const evidence = r.evidence.length > 0 ? `; ${r.evidence.join('; ')}` : '';
      lines.push(`- ✓ ${ruleDisplayName(r.ruleId)} (${r.count} instance${r.count === 1 ? '' : 's'}; context: ${r.contexts.join(', ')}${evidence})`);
    }
    lines.push('');
  }

  // Suppressed Rules (NOISY + DORMANT → suppressed bucket, collapsed by default)
  lines.push(`## Suppressed Rules (${dist.suppressed})`);
  lines.push('');
  if (grouped.suppressed.length === 0) {
    lines.push('_No suppressed rules._');
    lines.push('');
  } else {
    // Sub-group by verdict so the <details> count matches each verdict
    // (e.g., "1 Noisy", "3 Dormant").
    const byVerdict = new Map<Verdict, RuleBucketEntry[]>();
    for (const r of grouped.suppressed) {
      const list = byVerdict.get(r.verdict) ?? [];
      list.push(r);
      byVerdict.set(r.verdict, list);
    }
    for (const [verdict, entries] of byVerdict) {
      lines.push(`<details><summary>${entries.length} ${verdictLabel(verdict)}</summary>`);
      lines.push('');
      for (const r of entries) {
        const evidence = r.evidence.length > 0 ? `; ${r.evidence.join('; ')}` : '';
        lines.push(`- ${ruleDisplayName(r.ruleId)} (${r.count} instance${r.count === 1 ? '' : 's'}; context: ${r.contexts.join(', ')}${evidence})`);
      }
      lines.push('');
      lines.push(`</details>`);
      lines.push('');
    }
  }

  // ----- Legacy category scores (unchanged) -----
  if (Object.keys(report.categoryScores).length > 0) {
    lines.push(`## Category scores (effective finding burden; higher is worse)`);
    lines.push('');
    lines.push('| Category | Score |');
    lines.push('|----------|------:|');
    for (const [cat, score] of Object.entries(report.categoryScores)) {
      lines.push(`| ${cat} | ${score.toFixed(2)} |`);
    }
    lines.push('');
  }

  if (typeof report.architectureConsistency === 'number') {
    lines.push(`## Architecture Consistency: ${report.architectureConsistency}/100`);
    lines.push('');
  }

  if (typeof report.businessLogicCoherence === 'number') {
    lines.push(`## Business Logic Coherence: ${report.businessLogicCoherence}/100`);
    lines.push('');
    const issues = report.businessLogicIssues ?? [];
    if (issues.length > 0) {
      const byCat = {
        pricing: issues.filter((i) => i.category === 'pricing'),
        validation: issues.filter((i) => i.category === 'validation'),
        formatting: issues.filter((i) => i.category === 'formatting'),
      };
      lines.push('| Category | Issues |');
      lines.push('|----------|--------|');
      lines.push(`| Pricing | ${byCat.pricing.length} |`);
      lines.push(`| Validation | ${byCat.validation.length} |`);
      lines.push(`| Formatting | ${byCat.formatting.length} |`);
      lines.push('');
      for (const cat of ['pricing', 'validation', 'formatting'] as const) {
        if (byCat[cat].length === 0) continue;
        const cap = cat[0]!.toUpperCase() + cat.slice(1);
        lines.push(`### ${cap}`);
        lines.push('');
        for (const issue of byCat[cat]) {
          lines.push(`- \`${issue.filePath}:${issue.line}\` — ${issue.message}`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}
