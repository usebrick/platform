import type { Category, Issue, ProjectReport } from '../types.js';

const fixHints: Record<string, string> = {
  'logic/key-prop-missing': 'Move the hook call outside the conditional block.',
  'logic/raw-fetch': 'Add an AbortSignal and validate `response.ok` before reading the body.',
  'logic/exhaustive-deps-disable': 'Remove the eslint-disable comment and add the missing dependencies.',
  'logic/missing-effect-deps': 'Add a dependency array as the second argument to useEffect.',
  'logic/mutating-props': 'Create a new object/array and call the setter instead of mutating.',
  'security/dangerously-set-inner-html': 'Use JSX interpolation or sanitize HTML with DOMPurify.',
  'security/eval': 'Replace eval() with JSON.parse or a sandboxed expression parser.',
  'security/hardcoded-secrets': 'Move the secret to an environment variable.',
  'security/insecure-url': 'Replace http:// with https:// for production endpoints.',
  'perf/missing-suspense-boundary': 'Wrap the data-fetching component in <Suspense fallback={...}>.',
};

const remediation: Record<Category, string> = {
  visual:
    'Audit arbitrary Tailwind values and inline styles; replace one-off values with design tokens.',
  typo:
    'Standardize type scales and align headings/body text with the design system typography scale.',
  wcag:
    'Add focus rings and minimum target sizes; verify color contrast and semantic landmarks.',
  layout:
    'Reduce magic numbers and hard-coded spacing; prefer grid/flex patterns from the design system.',
  component:
    'Consolidate similar components, remove dead variants, and enforce prop naming conventions.',
  logic: 'Review hook usage and remove zombie state; simplify conditional rendering chains.',
  arch:
    'Break deep module hierarchies and align file structure with feature boundaries.',
  perf:
    'Eliminate unnecessary re-renders, defer non-critical work, and audit bundle imports.',
  security:
    'Remove secrets from source, sanitize dynamic HTML, and replace unsafe dynamic execution with safe parsers.',
  test:
    'Use domain-specific fixture data, assert on value shapes not just truthiness, and consolidate repeated setup into helpers.',
  docs:
    'Update README + AGENTS.md to reflect current exports and package set; remove broken links and expired code examples.',
  db:
    'Add the missing indexes the engine flagged, run a name-consistency pass on identifiers, and use parameterized queries for raw SQL.',
  ai:
    'These rules detect AI-style patterns. For generated code: review the file for the specific pattern. For real code: ignore if the style is intentional.',
  context:
    'Verify that imports and module boundaries match the project structure declared in the Constitution.',
  product:
    'These rules detect terminology or framing that has drifted from the project glossary.',
  i18n:
    'These rules detect i18n/l10n regressions. Move user-facing strings to the message catalog.',
};

function hasSafeFix(issue: Issue): boolean {
  if (!issue.fix) return false;
  return issue.fix.kind === 'replace' || issue.fix.kind === 'insert';
}

function formatIssueLocation(issue: Issue): string {
  if (issue.filePath) {
    return `${issue.filePath}:${issue.line}:${issue.column}`;
  }
  return `line ${issue.line}:${issue.column}`;
}

export function formatAdvice(report: ProjectReport): string {
  const categories = (Object.entries(report.categoryScores) as [Category, number][])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  const lines: string[] = [];
  lines.push('Remediation advice');
  lines.push('');

  if (categories.length === 0) {
    lines.push('No problem categories detected — great job!');
  } else {
    for (const [category, score] of categories) {
      const scoreText = score.toFixed(1);
      lines.push(`• ${category} (${scoreText}): ${remediation[category]}`);
    }

    lines.push('');
    lines.push(
      `Priority order: ${categories
        .map(([category, score]) => `${category} (${score.toFixed(1)})`)
        .join(', ')}.`,
    );
  }

  if (report.issues.length > 0) {
    lines.push('');
    lines.push('Per-issue guidance');
    lines.push('');

    for (const issue of report.issues) {
      const location = formatIssueLocation(issue);
      const marker = hasSafeFix(issue) ? '•' : '[GIR]';
      lines.push(`${marker} ${location} — ${issue.ruleId}`);
      lines.push(`  ${issue.message}`);
      if (issue.advice) {
        lines.push(`  → ${issue.advice}`);
      }
      const hint = issue.fixHint ?? fixHints[issue.ruleId];
      if (hint) {
        lines.push(`  → Hint: ${hint}`);
      }
    }
  }

  return lines.join('\n');
}
