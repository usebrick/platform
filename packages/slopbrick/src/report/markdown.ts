import type { ProjectReport } from '../types';
import { bucketForVerdict, bucketDistribution, type Bucket } from './buckets';
import { getSignalStrength } from '../rules/signal-strength.js';
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

/** Title-case a verdict enum (`NOISY` → `Noisy`). */
function verdictLabel(verdict: Verdict): string {
  return verdict.charAt(0).toUpperCase() + verdict.slice(1).toLowerCase();
}

interface RuleBucketEntry {
  ruleId: string;
  verdict: Verdict;
  precision: number;
}

function bucketEntriesForIssues(issues: ProjectReport['issues']): {
  grouped: Record<Bucket, RuleBucketEntry[]>;
  dist: Record<Bucket, number>;
} {
  // Dedupe by ruleId — the spec shows one entry per rule ("Zombie State"),
  // not one entry per firing.
  const byRule = new Map<string, RuleBucketEntry>();
  for (const issue of issues) {
    if (byRule.has(issue.ruleId)) continue;
    const strength = getSignalStrength(issue.ruleId);
    byRule.set(issue.ruleId, {
      ruleId: issue.ruleId,
      // Unknown rules default to OK (lands in `ai` bucket) — matches the
      // "show everything until the user opts out" stance.
      verdict: (strength?.verdict ?? 'OK') as Verdict,
      precision: strength?.precision ?? 0,
    });
  }
  const entries = Array.from(byRule.values());

  const dist = bucketDistribution(entries.map((e) => e.verdict));
  const grouped: Record<Bucket, RuleBucketEntry[]> = {
    ai: [],
    hygiene: [],
    suppressed: [],
  };
  for (const entry of entries) {
    grouped[bucketForVerdict(entry.verdict)].push(entry);
  }
  return { grouped, dist };
}

export function formatMarkdown(report: ProjectReport): string {
  const lines: string[] = [];
  lines.push(`# Slop Audit Report`);
  lines.push('');

  const ext = report as ProjectReport & ProjectReportV015;

  // ----- Repository Health (4 named scores, replacing single slopIndex) -----
  lines.push(`## Repository Health`);
  lines.push('');
  lines.push(`- **AI Slop Score** ${Math.round(ext.aiSlopScore ?? 0)}/100`);
  lines.push(`- **Engineering Hygiene** ${Math.round(ext.engineeringHygiene ?? 0)}/100`);
  lines.push(`- **Security** ${Math.round(ext.security ?? 0)}/100`);
  lines.push(`- **Repository Health** ${Math.round(report.repositoryHealth ?? 0)}/100`);
  lines.push('');

  // ----- Metadata (kept from the legacy header, minus the replaced scores) -----
  if (typeof report.coherence === 'number') {
    lines.push(`- **Repository Coherence:** ${report.coherence.toFixed(2)} / 100`);
  }
  lines.push(`- **Components:** ${report.componentCount}`);
  lines.push(`- **Files:** ${report.fileCount}`);
  lines.push(`- **Generated:** ${report.generatedAt}`);
  lines.push('');

  // ----- 3-bucket grouping via bucketForVerdict() + bucketDistribution() -----
  const { grouped, dist } = bucketEntriesForIssues(report.issues);

  // AI Findings (USEFUL + OK → ai bucket)
  lines.push(`## AI Findings (${dist.ai})`);
  lines.push('');
  if (grouped.ai.length === 0) {
    lines.push('_No AI findings._');
    lines.push('');
  } else {
    for (const r of grouped.ai) {
      lines.push(`- ✓ ${ruleDisplayName(r.ruleId)} (Confidence: ${confidenceLabel(r.precision)})`);
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
      lines.push(`- ✓ ${ruleDisplayName(r.ruleId)}`);
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
        lines.push(`- ${ruleDisplayName(r.ruleId)}`);
      }
      lines.push('');
      lines.push(`</details>`);
      lines.push('');
    }
  }

  // ----- Legacy category scores (unchanged) -----
  if (Object.keys(report.categoryScores).length > 0) {
    lines.push(`## Category scores`);
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