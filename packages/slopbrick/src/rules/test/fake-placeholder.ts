// Rule: test/fake-placeholder
//
// Catches AI-default fixture data: `'John Doe'`, `'test@test.com'`,
// `id: 1`, `password: 'password'`, `createdAt: new Date('2020-01-01')`.
// Human tests usually reflect domain entities (e.g. `email:
// 'alice@acme-corp.com'`); AI tests reach for textbook placeholders.
//
// Severity: high (a placeholder fixture is a test you don't really
// trust). aiSpecific: true.
//
// Detection: regex over `_source` for object-literal property
// assignments whose value matches a known placeholder pattern. Each
// pattern is gated by a property-name allowlist to avoid false
// positives on real production-like values.

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { extractPlaceholderCandidates, isTestFile } from './utils';

export interface FakePlaceholderContext {
  /** Per-config allowlist of values to skip. Reserved for v2. */
  allowlist: Set<string>;
}

// Patterns whose presence in the value is enough to fire. The
// property-name gate filters out legitimate uses of these literals
// (e.g. `name: 'X'` is suspicious, but `error: 'X'` is not).
const NAME_HINTS: RegExp[] = [
  /^['"]?John\s+Doe['"]?$/i,
  /^['"]?Jane\s+Doe['"]?$/i,
  /^['"]?Test\s+User['"]?$/i,
  /^['"]?Foo\s+Bar['"]?$/i,
  /^['"]?Sample\s+(User|Name|Text)['"]?$/i,
  /^['"]?Placeholder(\s+\w+)?['"]?$/i,
];

const EMAIL_HINTS: RegExp[] = [
  /^['"]?test@test\.com['"]?$/i,
  /^['"]?test@example\.com['"]?$/i,
  /^['"]?user@example\.com['"]?$/i,
  /^['"]?foo@bar\.com['"]?$/i,
  /^['"]?your@email\.com['"]?$/i,
  /^['"]?name@example\.com['"]?$/i,
  /^['"]?admin@admin\.com['"]?$/i,
];

const PASSWORD_HINTS: RegExp[] = [
  /^['"]?password['"]?$/i,
  /^['"]?123456['"]?$/i,
  /^['"]?test1234['"]?$/i,
  /^['"]?changeme['"]?$/i,
  /^['"]?secret['"]?$/i,
];

const DATE_HINTS: RegExp[] = [
  /^['"]?2020-01-01['"]?$/i,
  /^['"]?2021-01-01['"]?$/i,
  /^['"]?1970-01-01['"]?$/i,
  /^['"]?\d{4}-\d{2}-\d{2}T00:00:00Z?['"]?$/i,
];

const NAME_PROPS = new Set(['name', 'firstName', 'lastName', 'fullName', 'username', 'displayName']);
const EMAIL_PROPS = new Set(['email', 'userEmail', 'contactEmail', 'senderEmail']);
const PASSWORD_PROPS = new Set(['password', 'passwd', 'hashedPassword', 'plainPassword']);

export const fakePlaceholderRule = createRule<FakePlaceholderContext>({
  id: 'test/fake-placeholder',
  category: 'test',
  severity: 'high',
  aiSpecific: true,
  description:
    "Object-literal fixture uses textbook placeholder data (e.g. 'John Doe', 'test@test.com', id: 1).",
  create(): FakePlaceholderContext {
    return { allowlist: new Set() };
  },
  analyze(_context, facts: ScanFacts): Issue[] {
    const issues: Issue[] = [];
    if (!isTestFile(facts.v2.file.path)) return issues;
    const source = facts.v2._source;
    if (!source) return issues;

    const candidates = extractPlaceholderCandidates(source);
    for (const hit of candidates) {
      const prop = hit.prop;
      const value = hit.value;

      // FP guards
      if (looksRealistic(value)) continue;

      let matched = false;
      let category: string | null = null;

      if (NAME_PROPS.has(prop) && NAME_HINTS.some((re) => re.test(value))) {
        matched = true;
        category = 'name';
      } else if (EMAIL_PROPS.has(prop) && EMAIL_HINTS.some((re) => re.test(value))) {
        matched = true;
        category = 'email';
      } else if (PASSWORD_PROPS.has(prop) && PASSWORD_HINTS.some((re) => re.test(value))) {
        matched = true;
        category = 'password';
      } else if (
        /^(createdAt|updatedAt|timestamp|expiresAt|deletedAt)$/.test(prop) &&
        DATE_HINTS.some((re) => re.test(value))
      ) {
        matched = true;
        category = 'date';
      } else if (
        /^(id|userId|orderId|productId|tenantId|customerId)$/.test(prop) &&
        /^\d{1,2}$/.test(value)
      ) {
        // id: 1 / userId: 1 — only when the number is tiny.
        matched = true;
        category = 'id';
      }

      if (!matched || !category) continue;
      issues.push({
        ruleId: 'test/fake-placeholder',
        category: 'test',
        severity: 'high',
        aiSpecific: true,
        message:
          `Fake placeholder at line ${hit.line}: '${prop}: ${value}' — ` +
          `replace with a realistic value that reflects your domain ` +
          `or use a factory like @faker-js/faker.`,
        line: hit.line,
        column: hit.column,
        advice:
          'Real fixtures should mirror the domain: `alice@acme-corp.com`, `Order#48231`, `2019-04-22T09:14:11Z`. ' +
          'Use a factory (faker, rosie, @jackfranklin/test-data-factory) so each test gets distinct values.',
      });
    }
    return issues;
  },
});

/**
 * Conservative realism checks. If the value already looks real, skip
 * even when the property matches a placeholder-prone field.
 *
 *   - email: has `@` AND a multi-segment domain that isn't a known
 *     placeholder (test.com, example.com, foo.com, ...)
 *   - name: 3+ tokens OR contains a digit
 *   - date: ISO-8601 timestamp with non-midnight time component
 */
const PLACEHOLDER_EMAIL_DOMAINS = new Set([
  'test.com',
  'example.com',
  'foo.com',
  'bar.com',
  'example.org',
  'gmail.com',
  'yahoo.com',
]);

function looksRealistic(value: string): boolean {
  if (!value) return false;
  if (value.includes('@')) {
    const [, domain = ''] = value.split('@');
    if (!domain.includes('.')) return false; // no real domain
    const root = domain.split('.').slice(-2).join('.'); // e.g. "acme.com"
    if (PLACEHOLDER_EMAIL_DOMAINS.has(root.toLowerCase())) return false;
    // Looks real — non-trivial subdomain or non-placeholder TLD
    // pattern. (Substrings like `alice@acme-corp.com` count as real.)
    return true;
  }
  // Real-looking date: ISO-8601 with a non-midnight time.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) && !/T00:00:00/.test(value)) {
    return true;
  }
  // Real-looking name: 3+ tokens (e.g. "Mary Anne Smith") or contains a digit.
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length >= 3) return true;
  if (/\d/.test(value) && tokens.length >= 2) return true;
  return false;
}

export default fakePlaceholderRule satisfies Rule<FakePlaceholderContext>;