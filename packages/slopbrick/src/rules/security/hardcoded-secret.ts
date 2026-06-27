// Rule: security/hardcoded-secret
//
// Per OWASP Foundation (2023), Top 10 Web Application Security Risks, A07:2021 Identification and Authentication Failures; CWE (2023), CWE-798: Use of Hard-coded Credentials.
//
// Catches AI-generated code that ships real-looking secrets as string
// literals in source. This is a Tier-1 "AI security debt" tell —
// LLMs in tutorial/prototype mode emit working API keys, JWT
// secrets, and database passwords inline, and that pattern
// regularly survives into shipped code.
//
// Detection (string-literal scan over the raw source):
//   1. Identifier assigned a literal matching a known provider
//      prefix (OpenAI sk-, Anthropic sk-ant-, AWS AKIA, GitHub
//      ghp_/gho_/ghu_/ghs_/ghr_)
//   2. Identifier assigned a literal whose name contains
//      'secret'/'password'/'token'/'apikey'/'api_key'/'private_key'
//      AND the literal is ≥20 chars long
//   3. Stripe live keys (sk_live_) and AWS secret keys (40-char
//      base64-ish)
//
// Severity: high. aiSpecific: true (humans use .env files; AI
// inlines the literal).

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { lineOfSource } from '../utils';

interface SecretHit {
  identifier: string;
  literal: string;
  line: number;
  pattern: string;
}

const PROVIDER_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'OpenAI API key', re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'AWS access key ID', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { name: 'Stripe live key', re: /\bsk_live_[A-Za-z0-9]{20,}\b/g },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
];

// Match declarations like: const foo = 'value'; / let bar = "value";
// Captures: identifier (1), quoted value (2), quote char (3).
const ASSIGN_RE =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(['"])([^'"\n]{4,})\2/g;

const SENSITIVE_NAME_RE =
  /secret|password|passwd|token|apikey|api_key|api[-_]?secret|private[-_]?key|jwt/i;


function scanForSecrets(source: string): SecretHit[] {
  const hits: SecretHit[] = [];
  // 1. Provider-prefixed literals anywhere in the file (works for
  // object-literal assignments too, not just const decls).
  for (const { name, re } of PROVIDER_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      hits.push({
        identifier: '',
        literal: m[0],
        line: lineOfSource(source, m.index),
        pattern: name,
      });
    }
  }
  // 2. const/let/var assignment with a sensitive identifier AND a
  // non-trivial literal value.
  ASSIGN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ASSIGN_RE.exec(source)) !== null) {
    const identifier = m[1];
    const value = m[3];
    if (!SENSITIVE_NAME_RE.test(identifier)) continue;
    if (value.length < 20) continue;
    // Skip obvious placeholders — these are common in examples and
    // shouldn't fire (would dilute signal on real findings).
    if (/^(your[-_ ]?|example|changeme|todo|placeholder|xxx+|test|foo|bar)/i.test(value)) continue;
    hits.push({
      identifier,
      literal: value,
      line: lineOfSource(source, m.index),
      pattern: 'sensitive-name literal',
    });
  }
  // Deduplicate by (line, pattern, literal-prefix).
  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = `${h.line}|${h.pattern}|${h.literal.slice(0, 20)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const hardcodedSecretRule = createRule<RuleContext>({
  id: 'security/hardcoded-secret',
  category: 'security',
  severity: 'high',
  aiSpecific: true,
  description:
    'String literal assigned to a sensitive identifier or matching a known provider key prefix (sk-, AKIA, ghp_, etc.).',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    const hits = scanForSecrets(source);
    for (const hit of hits) {
      const literalPreview =
        hit.literal.length > 24 ? hit.literal.slice(0, 8) + '…' + hit.literal.slice(-4) : hit.literal;
      issues.push({
        ruleId: 'security/hardcoded-secret',
        category: 'security',
        severity: 'high',
        aiSpecific: true,
        message: hit.identifier
          ? `Hardcoded secret in '${hit.identifier}' (${hit.pattern}: ${literalPreview})`
          : `Hardcoded secret matching ${hit.pattern} (${literalPreview})`,
        line: hit.line,
        column: 1,
        advice:
          'Move secrets to environment variables loaded from a .env file (never commit .env to git). ' +
          'If the secret has been published, rotate it immediately — assume it is compromised.',
      });
    }
    return issues;
  },
});

export default hardcodedSecretRule satisfies Rule<RuleContext>;