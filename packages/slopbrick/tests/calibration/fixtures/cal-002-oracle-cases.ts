import { createHash } from 'node:crypto';
import type {
  CAL002DeterministicRuleId,
  CAL002OracleAuthority,
  CAL002OracleCaseResult,
  CAL002OracleDeclaration,
  CAL002OracleSourceControl,
  CAL002StandardsTransfer,
} from '../../../src/calibration/cal-002/oracles';

export interface CAL002OracleMutationCase extends CAL002OracleCaseResult {
  readonly ruleId: CAL002DeterministicRuleId;
  readonly source: string;
}

export interface CAL002OracleSourceControlFixture extends CAL002OracleSourceControl {
  readonly ruleId: CAL002DeterministicRuleId;
  readonly source: string;
}

interface RuleFixtureDefinition {
  readonly ruleId: CAL002DeterministicRuleId;
  readonly authority: CAL002OracleAuthority;
  readonly reference: string;
  readonly positiveSource: string;
  readonly negativeSource: string;
}

const CONTROL_FAMILIES = [
  'baseline',
  'alternate-syntax',
  'comment-adjacent',
  'near-miss',
  'regression-safe',
] as const;

const RULE_FIXTURES = [
  {
    ruleId: 'context/import-path-mismatch', authority: 'repository-contract', reference: 'brick.config.json allowedImports contract',
    positiveSource: "import { Button } from '@/legacy/Button';", negativeSource: "import { Button } from '@/components/Button';",
  },
  {
    ruleId: 'cs/async-without-await', authority: 'language-contract', reference: 'Microsoft C# async method convention',
    positiveSource: 'async Task Save() { SaveSync(); }', negativeSource: 'async Task Save() { await SaveAsync(); }',
  },
  {
    ruleId: 'cs/empty-catch-block', authority: 'language-contract', reference: 'Microsoft C# exception handling guidance',
    positiveSource: 'try { Work(); } catch (Exception ex) { }', negativeSource: 'try { Work(); } catch (Exception ex) { logger.LogError(ex, "work"); }',
  },
  {
    ruleId: 'cs/sql-string-interpolation', authority: 'security-contract', reference: 'OWASP SQL injection prevention',
    positiveSource: 'var sql = $"SELECT * FROM users WHERE id = {userId}";', negativeSource: 'command.Parameters.Add("@id", SqlDbType.Int).Value = userId;',
  },
  {
    ruleId: 'docs/broken-link', authority: 'repository-contract', reference: 'Markdown relative-link resolution contract',
    positiveSource: '[Guide](./missing-guide.md)', negativeSource: '[Guide](https://example.test/guide)',
  },
  {
    ruleId: 'docs/stale-function-reference', authority: 'repository-contract', reference: 'project export surface contract',
    positiveSource: 'Call `retiredWidget()` to begin.', negativeSource: 'Call `renderWidget()` to begin.',
  },
  {
    ruleId: 'docs/stale-package-reference', authority: 'repository-contract', reference: 'workspace package manifest contract',
    positiveSource: 'Install `obsolete-widget` before running.', negativeSource: 'Install `slopbrick` before running.',
  },
  {
    ruleId: 'dup/identical-block', authority: 'repository-contract', reference: 'duplicate block structural contract',
    positiveSource: 'const total = price * quantity;\nconst total = price * quantity;', negativeSource: 'const total = price * quantity;\nconst tax = total * rate;',
  },
  {
    ruleId: 'java/lost-stack-trace', authority: 'language-contract', reference: 'Java exception chaining contract',
    positiveSource: 'catch (IOException error) { throw new RuntimeException("read failed"); }', negativeSource: 'catch (IOException error) { throw new RuntimeException("read failed", error); }',
  },
  {
    ruleId: 'java/sql-string-concat', authority: 'security-contract', reference: 'OWASP SQL injection prevention',
    positiveSource: 'String sql = "SELECT * FROM users WHERE id = " + userId;', negativeSource: 'statement.setInt(1, userId);',
  },
  {
    ruleId: 'java/thread-sleep-in-loop', authority: 'language-contract', reference: 'Java concurrency contract',
    positiveSource: 'while (running) { Thread.sleep(100); }', negativeSource: 'while (running) { processNext(); }',
  },
  {
    ruleId: 'kt/coroutine-cancellation-missing', authority: 'language-contract', reference: 'Kotlin coroutine cancellation contract',
    positiveSource: 'try { await() } catch (error: Exception) { log(error) }', negativeSource: 'try { await() } catch (error: CancellationException) { throw error }',
  },
  {
    ruleId: 'kt/force-unwrap', authority: 'language-contract', reference: 'Kotlin null-safety contract',
    positiveSource: 'val name = user!!.name', negativeSource: 'val name = user?.name',
  },
  {
    ruleId: 'kt/global-coroutine-scope', authority: 'language-contract', reference: 'Kotlin structured concurrency contract',
    positiveSource: 'GlobalScope.launch { refresh() }', negativeSource: 'viewModelScope.launch { refresh() }',
  },
  {
    ruleId: 'kt/string-template-injection', authority: 'security-contract', reference: 'Kotlin SQL parameterization contract',
    positiveSource: "val sql = \"SELECT * FROM users WHERE id = $userId\"", negativeSource: 'statement.setLong(1, userId)',
  },
  {
    ruleId: 'logic/key-prop-missing', authority: 'repository-contract', reference: 'React list reconciliation contract',
    positiveSource: 'items.map((item) => <li>{item.name}</li>)', negativeSource: 'items.map((item) => <li key={item.id}>{item.name}</li>)',
  },
  {
    ruleId: 'perf/cls-image', authority: 'repository-contract', reference: 'web layout stability contract',
    positiveSource: '<img src="hero.png" alt="Hero" />', negativeSource: '<img src="hero.png" alt="Hero" width="800" height="600" />',
  },
  {
    ruleId: 'php/empty-catch', authority: 'language-contract', reference: 'PHP exception handling contract',
    positiveSource: 'try { work(); } catch (Throwable $error) { }', negativeSource: 'try { work(); } catch (Throwable $error) { report($error); }',
  },
  {
    ruleId: 'php/sql-injection', authority: 'security-contract', reference: 'OWASP SQL injection prevention',
    positiveSource: '$sql = "SELECT * FROM users WHERE id = " . $userId;', negativeSource: '$statement->execute(["id" => $userId]);',
  },
  {
    ruleId: 'rb/exception-swallowing', authority: 'language-contract', reference: 'Ruby exception handling contract',
    positiveSource: 'begin\n  work\nrescue StandardError\nend', negativeSource: 'begin\n  work\nrescue StandardError => error\n  raise error\nend',
  },
  {
    ruleId: 'rb/sql-string-concat', authority: 'security-contract', reference: 'OWASP SQL injection prevention',
    positiveSource: 'User.where("id = " + user_id.to_s)', negativeSource: 'User.where(id: user_id)',
  },
  {
    ruleId: 'security/eval', authority: 'security-contract', reference: 'OWASP code injection prevention',
    positiveSource: 'const result = eval(userExpression);', negativeSource: 'const result = parseExpression(userExpression);',
  },
  {
    ruleId: 'security/exposed-env-var', authority: 'security-contract', reference: 'client environment secret boundary',
    positiveSource: 'const secret = import.meta.env.VITE_API_SECRET;', negativeSource: 'const endpoint = import.meta.env.VITE_API_URL;',
  },
  {
    ruleId: 'security/localstorage-token', authority: 'security-contract', reference: 'OWASP token storage guidance',
    positiveSource: 'localStorage.setItem("token", accessToken);', negativeSource: 'sessionStorage.setItem("theme", theme);',
  },
  {
    ruleId: 'security/missing-auth-check', authority: 'security-contract', reference: 'authenticated route contract',
    positiveSource: 'app.get("/api/orders", listOrders);', negativeSource: 'app.get("/api/orders", requireAuth, listOrders);',
  },
  {
    ruleId: 'security/public-admin-route', authority: 'security-contract', reference: 'admin authorization contract',
    positiveSource: 'app.get("/admin", renderAdmin);', negativeSource: 'app.get("/admin", requireAdmin, renderAdmin);',
  },
  {
    ruleId: 'security/target-blank-no-noopener', authority: 'security-contract', reference: 'MDN reverse tabnabbing guidance',
    positiveSource: '<a href="https://example.test" target="_blank">Open</a>', negativeSource: '<a href="https://example.test" target="_blank" rel="noopener">Open</a>',
  },
  {
    ruleId: 'security/unsafe-html-render', authority: 'security-contract', reference: 'OWASP XSS prevention cheat sheet',
    positiveSource: '<div dangerouslySetInnerHTML={{ __html: userHtml }} />', negativeSource: '<div dangerouslySetInnerHTML={{ __html: "<strong>Safe</strong>" }} />',
  },
  {
    ruleId: 'typo/placeholder-text', authority: 'repository-contract', reference: 'finished UI copy contract',
    positiveSource: '<input placeholder="Enter text here" />', negativeSource: '<input placeholder="Search products" />',
  },
  {
    ruleId: 'wcag/focus-appearance', authority: 'wcag-22', reference: 'WCAG 2.2 focus appearance',
    positiveSource: '<button className="outline-none">Save</button>', negativeSource: '<button className="outline-none focus-visible:ring-2">Save</button>',
  },
  {
    ruleId: 'wcag/focus-obscured', authority: 'wcag-22', reference: 'WCAG 2.2 focus not obscured',
    positiveSource: '<header className="fixed top-0">Menu</header>', negativeSource: '<header className="relative">Menu</header>',
  },
  {
    ruleId: 'wcag/missing-alt', authority: 'wcag-22', reference: 'WCAG 2.2 SC 1.1.1 non-text content',
    positiveSource: '<img src="chart.png" />', negativeSource: '<img src="chart.png" alt="Revenue by month" />',
  },
] as const satisfies readonly RuleFixtureDefinition[];

function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

function caseId(ruleId: string, polarity: 'positive' | 'negative'): string {
  return `cal002-${ruleId.replace('/', '-')}-${polarity}`;
}

function unitId(ruleId: string, familyId: string): string {
  return `cal002-${ruleId.replace('/', '-')}-${familyId}`;
}

export const CAL002_ORACLE_DECLARATIONS: readonly CAL002OracleDeclaration[] = RULE_FIXTURES.map((fixture) => ({
  ruleId: fixture.ruleId,
  authority: fixture.authority,
  reference: fixture.reference,
  positiveCaseIds: [caseId(fixture.ruleId, 'positive')],
  negativeCaseIds: [caseId(fixture.ruleId, 'negative')],
}));

export const CAL002_ORACLE_MUTATION_CASES: readonly CAL002OracleMutationCase[] = RULE_FIXTURES.flatMap((fixture) => [
  {
    ruleId: fixture.ruleId,
    caseId: caseId(fixture.ruleId, 'positive'),
    expected: 'finding',
    observed: 'finding',
    source: fixture.positiveSource,
    sourceSha256: sha256(fixture.positiveSource),
  },
  {
    ruleId: fixture.ruleId,
    caseId: caseId(fixture.ruleId, 'negative'),
    expected: 'no-finding',
    observed: 'no-finding',
    source: fixture.negativeSource,
    sourceSha256: sha256(fixture.negativeSource),
  },
]);

export const CAL002_ORACLE_SOURCE_CONTROLS: readonly CAL002OracleSourceControlFixture[] = RULE_FIXTURES.flatMap((fixture) =>
  CONTROL_FAMILIES.map((familyId) => {
    const source = `${fixture.negativeSource}\n// CAL-002 ${familyId} control`;
    return {
      ruleId: fixture.ruleId,
      unitId: unitId(fixture.ruleId, familyId),
      familyId,
      contentSha256: sha256(source),
      observed: 'no-finding',
      source,
    };
  }),
);

// This is intentionally an extension example only: origin rows are not part of the frozen 32 registry.
export const CAL002_ORACLE_TRANSFERS: readonly CAL002StandardsTransfer[] = [
  { ruleId: 'security/hardcoded-secret', reason: 'standards-or-contract-quality-claim' },
];
