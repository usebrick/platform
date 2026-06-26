import type { ProjectReport } from '../types';

export function formatMarkdown(report: ProjectReport): string {
  const lines: string[] = [];
  lines.push(`# Slop Audit Report`);
  lines.push('');
  lines.push(`- **Repository Coherence:** ${(report.coherence ?? 0).toFixed(2)} / 100`);
  lines.push(`- **Slop Index (informational):** ${report.slopIndex.toFixed(2)}`);
  lines.push(`- **Assembly Health:** ${report.assemblyHealth.toFixed(2)}`);
  lines.push(`- **P90 Score:** ${report.p90Score.toFixed(2)}`);
  lines.push(`- **Peak Score:** ${report.peakScore.toFixed(2)}`);
  lines.push(`- **Components:** ${report.componentCount}`);
  lines.push(`- **Files:** ${report.fileCount}`);
  lines.push(`- **Generated:** ${report.generatedAt}`);
  lines.push('');
  lines.push(`## Category scores`);
  lines.push('');
  lines.push('| Category | Score |');
  lines.push('|----------|------:|');
  for (const [cat, score] of Object.entries(report.categoryScores)) {
    lines.push(`| ${cat} | ${score.toFixed(2)} |`);
  }
  lines.push('');
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
  if (report.issues.length > 0) {
    lines.push(`## Top issues (${report.issues.length} total)`);
    lines.push('');
    const top = report.issues.slice(0, 10);
    lines.push('| Severity | Rule | File | Line | Message |');
    lines.push('|----------|------|------|-----:|---------|');
    for (const issue of top) {
      const file = typeof issue.filePath === 'string' ? issue.filePath.split('/').slice(-2).join('/') : '—';
      const msg = issue.message.replace(/\|/g, '\\|').slice(0, 80);
      lines.push(`| ${issue.severity} | \`${issue.ruleId}\` | ${file} | ${issue.line ?? '—'} | ${msg} |`);
    }
  }
  return lines.join('\n');
}