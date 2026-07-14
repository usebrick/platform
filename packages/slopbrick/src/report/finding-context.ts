/**
 * Deterministic source-context labels for human-facing finding reports.
 * These labels do not change scoring or rule polarity; they tell a reader
 * whether a finding is likely to be application code, a test fixture, a
 * detector implementation, or a presentation/demo artifact.
 */
export type FindingContextKind =
  | 'project-wide'
  | 'application'
  | 'rule-implementation'
  | 'test-fixture'
  | 'generated-schema'
  | 'documentation-example'
  | 'demo-marketing'
  | 'unknown';

export interface FindingContext {
  kind: FindingContextKind;
  label: string;
}

const CONTEXTS: Record<FindingContextKind, FindingContext> = {
  'project-wide': { kind: 'project-wide', label: 'project-wide' },
  application: { kind: 'application', label: 'application code' },
  'rule-implementation': { kind: 'rule-implementation', label: 'rule implementation' },
  'test-fixture': { kind: 'test-fixture', label: 'test/fixture' },
  'generated-schema': { kind: 'generated-schema', label: 'generated/schema' },
  'documentation-example': { kind: 'documentation-example', label: 'documentation/example' },
  'demo-marketing': { kind: 'demo-marketing', label: 'demo/marketing' },
  unknown: { kind: 'unknown', label: 'unknown context' },
};

/** Classify a path without depending on the host OS or absolute root. */
export function classifyFindingContext(filePath: string | undefined): FindingContext {
  // Project-level rules intentionally omit a file path. Calling these
  // findings "unknown" hides the scope that matters most in a whole-project
  // report; keep the distinction explicit across Markdown, HTML, and pretty.
  if (!filePath) return CONTEXTS['project-wide'];
  const normalized = filePath.replaceAll('\\', '/').toLowerCase();
  const parts = normalized.split('/');
  const has = (...names: string[]): boolean => names.some((name) => parts.includes(name));

  if (
    has('tests', 'test', '__tests__', 'fixtures', 'fixture') ||
    /\.(test|spec)\.[a-z0-9]+$/.test(normalized)
  ) return CONTEXTS['test-fixture'];

  if (
    has('generated', 'schemas', 'schema') ||
    /(^|\/)(dist|build|\.astro)(\/|$)/.test(normalized) ||
    /(^|\/)(builtins|product-facts|version)\.[a-z0-9]+$/.test(normalized)
  ) return CONTEXTS['generated-schema'];

  if (has('rules', 'rule', 'snippet', 'snippets') || /signal-strength/.test(normalized)) {
    return CONTEXTS['rule-implementation'];
  }

  if (has('docs', 'doc', 'examples', 'example') || /(^|\/)(readme|changelog)(\.|$)/.test(normalized)) {
    return CONTEXTS['documentation-example'];
  }

  if (parts.includes('website') || has('marketing', 'demo', 'demos')) {
    return CONTEXTS['demo-marketing'];
  }

  return CONTEXTS.application;
}

export function formatFindingContext(filePath: string | undefined): string {
  return classifyFindingContext(filePath).label;
}
