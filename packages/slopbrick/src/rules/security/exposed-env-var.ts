// Rule: security/exposed-env-var
//
// Catches the AI-default mistake of declaring a server-side secret
// in a client-prefixed env var. Next.js (`NEXT_PUBLIC_*`), Create
// React App (`REACT_APP_*`), Vite (`VITE_*`), Gatsby
// (`GATSBY_*`), and Expo (`EXPO_PUBLIC_*`) all inline their public
// vars into the client bundle at build time — putting a secret
// there ships it to every browser.
//
// Detection: scan raw source for assignments whose left side is
// `process.env.<CLIENT_PREFIX>_<SECRET_LOOKING_NAME>` or whose
// value references such a var. We restrict to .ts/.tsx/.js/.jsx
// files because framework config (next.config.js etc.) is a
// different beast.
//
// Severity: high. aiSpecific: true (humans usually remember to
// strip the public prefix; AI in tutorial mode leaves it on).

import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';
import { lineOfSource } from '../utils';

const CLIENT_PREFIXES = [
  'NEXT_PUBLIC_',
  'REACT_APP_',
  'VITE_',
  'GATSBY_',
  'EXPO_PUBLIC_',
  'PUBLIC_',
];

const SECRET_NAME_HINTS =
  /SECRET|KEY|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE/i;

const CLIENT_PREFIX_RE = new RegExp(
  `(?:${CLIENT_PREFIXES.join('|')})[A-Z_][A-Z0-9_]*`,
  'g',
);

// Match `process.env.NEXT_PUBLIC_FOO` or `import.meta.env.VITE_FOO` etc.
const PROCESS_ENV_RE =
  /\b(?:process\.env|import\.meta\.env)\.([A-Z_][A-Z0-9_]*)/g;


function findClientExposedSecrets(source: string): Array<{ name: string; line: number }> {
  const hits: Array<{ name: string; line: number }> = [];
  const seen = new Set<string>();
  PROCESS_ENV_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PROCESS_ENV_RE.exec(source)) !== null) {
    const name = m[1];
    if (!seen.has(name) && CLIENT_PREFIX_RE.test(name) && SECRET_NAME_HINTS.test(name)) {
      seen.add(name);
      hits.push({ name, line: lineOfSource(source, m.index) });
    }
    CLIENT_PREFIX_RE.lastIndex = 0;
  }
  return hits;
}

export const exposedEnvVarRule = createRule<RuleContext>({
  id: 'security/exposed-env-var',
  category: 'security',
  severity: 'high',
  aiSpecific: true,
  description:
    'Secret-looking env var name exposed via a client-bundle prefix (NEXT_PUBLIC_*, VITE_*, etc.). Inlined into every browser build.',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    const source = facts.v2?._source;
    if (!source) return issues;
    for (const hit of findClientExposedSecrets(source)) {
      issues.push({
        ruleId: 'security/exposed-env-var',
        category: 'security',
        severity: 'high',
        aiSpecific: true,
        message:
          `Env var '${hit.name}' has a client-bundle prefix but a secret-looking name. ` +
          `It will be inlined into every browser build.`,
        line: hit.line,
        column: 1,
        advice:
          'Rename the var to drop the public prefix (e.g. `OPENAI_API_KEY` instead of ' +
          '`NEXT_PUBLIC_OPENAI_API_KEY`) and read it from a server-only module or API route.',
      });
    }
    return issues;
  },
});

export default exposedEnvVarRule satisfies Rule<RuleContext>;