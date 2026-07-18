import { createHash } from 'node:crypto';
import { CAL002_DETERMINISTIC_RULE_IDS } from '../../../src/calibration/cal-002/contracts';

export type CAL002DeterministicRuleId = (typeof CAL002_DETERMINISTIC_RULE_IDS)[number];
export type CAL002OracleAuthority = 'language-contract' | 'security-contract' | 'wcag-22' | 'repository-contract';
export type CAL002OracleObservation = 'finding' | 'no-finding';
export type CAL002OracleExecutionMode = 'source-text' | 'path-aware' | 'multi-file' | 'allowed-imports' | 'route-context' | 'link-resolution';

export interface CAL002OracleVirtualFile {
  readonly path: string;
  readonly content: string;
}

export interface CAL002OracleVirtualTarget {
  readonly path: string;
  readonly anchors: readonly string[];
}

export type CAL002OracleExecution =
  | {
      readonly mode: 'source-text';
      readonly context: { readonly virtualSourcePath: string };
    }
  | {
      readonly mode: 'path-aware';
      readonly context: { readonly virtualSourcePath: string };
    }
  | {
      readonly mode: 'allowed-imports';
      readonly context: {
        readonly virtualImporterPath: string;
        readonly allowedImports: readonly string[];
      };
    }
  | {
      readonly mode: 'link-resolution';
      readonly context: {
        readonly virtualDocumentPath: string;
        readonly virtualTargets: readonly CAL002OracleVirtualTarget[];
      };
    }
  | {
      readonly mode: 'multi-file';
      readonly context: {
        readonly virtualDocumentPath: string;
        readonly virtualFiles: readonly CAL002OracleVirtualFile[];
      };
    }
  | {
      readonly mode: 'route-context';
      readonly context: {
        readonly virtualRoutePath: string;
        readonly middleware: readonly string[];
        readonly authorization:
          | { readonly kind: 'authenticated' }
          | { readonly kind: 'role'; readonly role: string };
      };
    };

export interface CAL002OracleDeclaration {
  readonly ruleId: CAL002DeterministicRuleId;
  readonly authority: CAL002OracleAuthority;
  readonly reference: string;
  readonly execution: CAL002OracleExecution;
  readonly positiveCaseIds: readonly string[];
  readonly negativeCaseIds: readonly string[];
}

export interface CAL002OracleCaseResult {
  readonly caseId: string;
  readonly expected: CAL002OracleObservation;
  readonly observed: CAL002OracleObservation;
  readonly sourceSha256: string;
}

export interface CAL002OracleSourceControl {
  readonly unitId: string;
  readonly familyId: string;
  readonly contentSha256: string;
  readonly observed: CAL002OracleObservation;
}

export interface CAL002StandardsTransfer {
  readonly ruleId: string;
  readonly reason: 'standards-or-contract-quality-claim';
}

export interface CAL002OracleMutationCase extends CAL002OracleCaseResult {
  readonly ruleId: CAL002DeterministicRuleId;
  readonly source: string;
}

export interface CAL002OracleSourceControlFixture extends CAL002OracleSourceControl {
  readonly ruleId: CAL002DeterministicRuleId;
  readonly source: string;
  readonly execution: CAL002OracleExecution;
}

interface RuleFixtureDefinition {
  readonly ruleId: CAL002DeterministicRuleId;
  readonly authority: CAL002OracleAuthority;
  readonly reference: string;
  readonly positiveSource: string;
  readonly negativeSource: string;
}

function sourceText(virtualSourcePath: string): CAL002OracleExecution {
  return { mode: 'source-text', context: { virtualSourcePath } };
}

const EXECUTION_BY_RULE_ID = {
  'context/import-path-mismatch': {
    mode: 'allowed-imports',
    context: {
      virtualImporterPath: 'src/components/OracleControl.tsx',
      allowedImports: ['@/components/'],
    },
  },
  'cs/async-without-await': sourceText('src/OracleControl.cs'),
  'cs/empty-catch-block': sourceText('src/OracleControl.cs'),
  'cs/sql-string-interpolation': sourceText('src/OracleControl.cs'),
  'docs/broken-link': {
    mode: 'link-resolution',
    context: {
      virtualDocumentPath: 'docs/README.md',
      virtualTargets: [
        { path: 'docs/README.md', anchors: ['installation'] },
        { path: 'docs/guide.md', anchors: [] },
        { path: 'docs/api.md', anchors: [] },
      ],
    },
  },
  'docs/stale-function-reference': {
    mode: 'multi-file',
    context: {
      virtualDocumentPath: 'docs/README.md',
      virtualFiles: [
        { path: 'src/widget.ts', content: 'export function renderWidget() { return "ready"; }' },
      ],
    },
  },
  'docs/stale-package-reference': {
    mode: 'multi-file',
    context: {
      virtualDocumentPath: 'docs/README.md',
      virtualFiles: [
        { path: 'package.json', content: '{"name":"slopbrick","version":"0.0.0"}' },
      ],
    },
  },
  'dup/identical-block': sourceText('src/oracle-control.ts'),
  'java/lost-stack-trace': sourceText('src/OracleControl.java'),
  'java/sql-string-concat': sourceText('src/OracleControl.java'),
  'java/thread-sleep-in-loop': sourceText('src/OracleControl.java'),
  'kt/coroutine-cancellation-missing': sourceText('src/OracleControl.kt'),
  'kt/force-unwrap': sourceText('src/OracleControl.kt'),
  'kt/global-coroutine-scope': sourceText('src/OracleControl.kt'),
  'kt/string-template-injection': sourceText('src/OracleControl.kt'),
  'logic/key-prop-missing': sourceText('src/OracleControl.tsx'),
  'perf/cls-image': sourceText('src/OracleControl.tsx'),
  'php/empty-catch': sourceText('src/OracleControl.php'),
  'php/sql-injection': sourceText('src/OracleControl.php'),
  'rb/exception-swallowing': sourceText('src/oracle_control.rb'),
  'rb/sql-string-concat': sourceText('src/oracle_control.rb'),
  'security/eval': sourceText('src/oracle-control.ts'),
  'security/exposed-env-var': sourceText('src/oracle-control.ts'),
  'security/localstorage-token': sourceText('src/oracle-control.ts'),
  'security/missing-auth-check': {
    mode: 'route-context',
    context: {
      virtualRoutePath: 'app/api/orders/route.ts',
      middleware: ['requireAuth'],
      authorization: { kind: 'authenticated' },
    },
  },
  'security/public-admin-route': {
    mode: 'route-context',
    context: {
      virtualRoutePath: 'app/api/admin/users/route.ts',
      middleware: ['requireRole'],
      authorization: { kind: 'role', role: 'admin' },
    },
  },
  'security/target-blank-no-noopener': sourceText('src/OracleControl.tsx'),
  'security/unsafe-html-render': sourceText('src/OracleControl.tsx'),
  'typo/placeholder-text': sourceText('src/OracleControl.tsx'),
  'wcag/focus-appearance': sourceText('src/OracleControl.tsx'),
  'wcag/focus-obscured': sourceText('src/OracleControl.tsx'),
  'wcag/missing-alt': sourceText('src/OracleControl.tsx'),
} as const satisfies Record<CAL002DeterministicRuleId, CAL002OracleExecution>;

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

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('Oracle execution context must be JSON-serializable.');
  return encoded;
}

function controlContentSha256(source: string, execution: CAL002OracleExecution): string {
  return sha256(canonicalJson({ source, context: execution.context }));
}

function caseId(ruleId: string, polarity: 'positive' | 'negative'): string {
  return `cal002-${ruleId.replace('/', '-')}-${polarity}`;
}

function unitId(ruleId: string, familyId: string): string {
  return `cal002-${ruleId.replace('/', '-')}-${familyId}`;
}

export const CAL002_ORACLE_CASE_IDS: readonly (readonly [string, string])[] = RULE_FIXTURES.map((fixture) => [
  caseId(fixture.ruleId, 'positive'),
  caseId(fixture.ruleId, 'negative'),
]);

export const CAL002_ORACLE_UNIT_IDS: readonly (readonly string[])[] = RULE_FIXTURES.map((fixture) =>
  CONTROL_FAMILIES.map((familyId) => unitId(fixture.ruleId, familyId)),
);

export const CAL002_ORACLE_CONTROL_SOURCES = {
  'context/import-path-mismatch': {
    baseline: "import { Button } from '@/components/Button';",
    'alternate-syntax': 'import type { ButtonProps } from "@/components/Button";',
    'comment-adjacent': "// Use the canonical component alias.\nimport { Card } from '@/components/Card';",
    'near-miss': "import { formatDate } from './format-date';",
    'regression-safe': "import { z } from 'zod';",
  },
  'cs/async-without-await': {
    baseline: 'async Task Save() { await SaveAsync(); }',
    'alternate-syntax': 'async ValueTask<int> CountAsync() { return await CountCoreAsync(); }',
    'comment-adjacent': 'async Task Refresh() { // Keep the asynchronous boundary explicit.\n  await RefreshAsync();\n}',
    'near-miss': 'Task Save() { return SaveAsync(); }',
    'regression-safe': 'async Task Copy() { await using var stream = await OpenAsync(); await stream.FlushAsync(); }',
  },
  'cs/empty-catch-block': {
    baseline: 'try { Work(); } catch (Exception error) { logger.LogError(error, "work failed"); }',
    'alternate-syntax': 'try { Work(); } catch (Exception) { Recover(); }',
    'comment-adjacent': 'try { Work(); } catch (IOException error) { // Preserve operational context.\n  throw new InvalidOperationException("read failed", error);\n}',
    'near-miss': 'try { Work(); } catch (TimeoutException error) when (error.IsTransient) { Retry(); }',
    'regression-safe': 'try { Work(); } catch (Exception error) { throw new WorkerException("work failed", error); }',
  },
  'cs/sql-string-interpolation': {
    baseline: 'using var command = new SqlCommand("SELECT * FROM users WHERE id = @id", connection);\ncommand.Parameters.Add("@id", SqlDbType.Int).Value = userId;',
    'alternate-syntax': 'var users = db.Users.FromSqlInterpolated($"SELECT * FROM users WHERE id = {userId}");',
    'comment-adjacent': '// Bind values separately from SQL text.\ncommand.Parameters.Add(new SqlParameter("@id", userId));',
    'near-miss': 'var message = $"Selected user {userId}";',
    'regression-safe': 'var command = new SqlCommand("SELECT * FROM users WHERE id = @id", connection);\ncommand.Parameters.AddWithValue("@id", userId);',
  },
  'docs/broken-link': {
    baseline: '[Guide](./guide.md)',
    'alternate-syntax': '[Guide][guide]\n\n[guide]: ./guide.md',
    'comment-adjacent': '<!-- The API guide is part of this documentation set. -->\n[API guide](./api.md)',
    'near-miss': '[Installation](#installation)',
    'regression-safe': '[Support](mailto:support@example.test)',
  },
  'docs/stale-function-reference': {
    baseline: 'Call `renderWidget`() to begin.',
    'alternate-syntax': 'After initialization, invoke `renderWidget`().',
    'comment-adjacent': '<!-- renderWidget is part of the current export surface. -->\nUse `renderWidget`() for the first render.',
    'near-miss': 'When the widget is ready, call `renderWidget`().',
    'regression-safe': 'The supported renderer remains `renderWidget`().',
  },
  'docs/stale-package-reference': {
    baseline: 'Install `slopbrick` before running.',
    'alternate-syntax': 'Run `pnpm add slopbrick` in the workspace.',
    'comment-adjacent': '<!-- slopbrick is declared by the workspace manifest. -->\nImport from `slopbrick` in scanner examples.',
    'near-miss': 'Use the `scan` function for local analysis.',
    'regression-safe': 'The supported package is `slopbrick`.',
  },
  'dup/identical-block': {
    baseline: 'const total = price * quantity;\nconst tax = total * rate;',
    'alternate-syntax': 'const subtotal = items.reduce((sum, item) => sum + item.price, 0);\nconst total = subtotal + shipping;',
    'comment-adjacent': '// Calculate each stage once.\nconst net = gross - discount;\nconst receipt = formatReceipt(net);',
    'near-miss': 'const width = box.right - box.left;\nconst height = box.bottom - box.top;',
    'regression-safe': 'function subtotal(items) { return items.reduce((sum, item) => sum + item.price, 0); }',
  },
  'java/lost-stack-trace': {
    baseline: 'try { read(); } catch (IOException error) { throw new RuntimeException("read failed", error); }',
    'alternate-syntax': 'try { read(); } catch (IOException error) { logger.error("read failed", error); throw error; }',
    'comment-adjacent': 'try { read(); } catch (IOException error) { // Retain the original cause.\n  throw new UncheckedIOException(error);\n}',
    'near-miss': 'try { read(); } catch (IOException error) { logger.warn("read failed", error); recover(); }',
    'regression-safe': 'try { read(); } catch (IOException | SecurityException error) { throw new IllegalStateException("read failed", error); }',
  },
  'java/sql-string-concat': {
    baseline: 'PreparedStatement statement = connection.prepareStatement("SELECT * FROM users WHERE id = ?");\nstatement.setLong(1, userId);',
    'alternate-syntax': 'var query = entityManager.createQuery("SELECT u FROM User u WHERE u.id = :id", User.class);\nquery.setParameter("id", userId);',
    'comment-adjacent': '// Bind the value through JDBC.\nPreparedStatement statement = connection.prepareStatement("SELECT name FROM users WHERE id = ?");',
    'near-miss': 'String message = "Selected user " + userId;',
    'regression-safe': 'String sql = "SELECT * FROM users WHERE id = ?";\nPreparedStatement statement = connection.prepareStatement(sql);',
  },
  'java/thread-sleep-in-loop': {
    baseline: 'while (running) { processNext(); }',
    'alternate-syntax': 'for (Task task : tasks) { executor.submit(task); }',
    'comment-adjacent': 'while (queue.hasNext()) { // Processing is non-blocking.\n  queue.processNext();\n}',
    'near-miss': 'Thread.sleep(backoffMillis);\nretryOnce();',
    'regression-safe': 'scheduler.scheduleWithFixedDelay(this::poll, 0, 100, TimeUnit.MILLISECONDS);',
  },
  'kt/coroutine-cancellation-missing': {
    baseline: 'scope.launch { ensureActive(); refresh() }',
    'alternate-syntax': 'scope.launch { while (isActive) { syncOnce(); yield() } }',
    'comment-adjacent': 'scope.launch { // Cooperate with parent cancellation.\n  currentCoroutineContext().ensureActive()\n  refresh()\n}',
    'near-miss': 'suspend fun refresh() = withContext(Dispatchers.IO) { load() }',
    'regression-safe': 'val result = scope.async { delay(10); load() }',
  },
  'kt/force-unwrap': {
    baseline: 'val name = user?.name',
    'alternate-syntax': 'val name = user?.name ?: "Guest"',
    'comment-adjacent': '// Validate nullability at the boundary.\nval name = requireNotNull(user).name',
    'near-miss': 'val name = if (user == null) "Guest" else user.name',
    'regression-safe': 'user?.let { render(it.name) }',
  },
  'kt/global-coroutine-scope': {
    baseline: 'viewModelScope.launch { ensureActive(); refresh() }',
    'alternate-syntax': 'lifecycleScope.launch { delay(1); refresh() }',
    'comment-adjacent': '// The injected scope is tied to this component.\nscope.launch { currentCoroutineContext().ensureActive(); refresh() }',
    'near-miss': 'coroutineScope { launch { yield(); refresh() } }',
    'regression-safe': 'supervisorScope { async { delay(1); refresh() }.await() }',
  },
  'kt/string-template-injection': {
    baseline: 'val sql = "SELECT * FROM users WHERE id = ?"\nstatement.setLong(1, userId)',
    'alternate-syntax': 'val user = Users.select { Users.id eq userId }.single()',
    'comment-adjacent': '// Keep values outside SQL text.\nval query = connection.prepareStatement("SELECT name FROM users WHERE id = ?")',
    'near-miss': 'val message = "Selected user $userId"',
    'regression-safe': 'val query = entityManager.createQuery("SELECT u FROM User u WHERE u.id = :id")\nquery.setParameter("id", userId)',
  },
  'logic/key-prop-missing': {
    baseline: 'items.map((item) => <li key={item.id}>{item.name}</li>)',
    'alternate-syntax': 'items.map(({ id, name }) => <Row key={id} name={name} />)',
    'comment-adjacent': 'items.map((item) => (\n  // Stable repository identifier.\n  <Card key={item.slug} item={item} />\n))',
    'near-miss': '<ul><li>First</li><li>Second</li></ul>',
    'regression-safe': 'items.map((item) => <Fragment key={item.id}><dt>{item.name}</dt><dd>{item.value}</dd></Fragment>)',
  },
  'perf/cls-image': {
    baseline: '<img src="hero.png" alt="Hero" loading="lazy" width="800" height="600" />',
    'alternate-syntax': '<img src="hero.png" alt="Hero" loading="lazy" className="aspect-video" />',
    'comment-adjacent': '{/* Intrinsic dimensions reserve layout space. */}\n<img src="avatar.png" alt="Profile" loading="lazy" width="96" height="96" />',
    'near-miss': '<img src="logo.png" alt="Company" loading="eager" />',
    'regression-safe': '<picture><source srcSet="hero.webp" type="image/webp" /><img src="hero.png" alt="Hero" loading="lazy" width="1200" height="675" /></picture>',
  },
  'php/empty-catch': {
    baseline: '<?php\ntry { work(); } catch (Throwable $error) { report($error); }',
    'alternate-syntax': '<?php\ntry { work(); } catch (RuntimeException $error) { throw new DomainException("work failed", 0, $error); }',
    'comment-adjacent': '<?php\ntry { work(); } catch (Throwable $error) { // Preserve failure context.\n    logger()->error("work failed", ["exception" => $error]);\n}',
    'near-miss': '<?php\ntry { work(); } finally { cleanup(); }',
    'regression-safe': '<?php\ntry { work(); } catch (Throwable $error) { return Result::failure($error); }',
  },
  'php/sql-injection': {
    baseline: '<?php\n$statement = $pdo->prepare("SELECT * FROM users WHERE id = ?");\n$statement->execute([$userId]);',
    'alternate-syntax': '<?php\n$statement = $pdo->prepare("SELECT * FROM users WHERE id = :id");\n$statement->bindValue(":id", $userId, PDO::PARAM_INT);',
    'comment-adjacent': '<?php\n// Bind request data instead of concatenating it.\n$statement = $pdo->prepare("SELECT name FROM users WHERE id = ?");',
    'near-miss': '<?php\n$message = "Selected user " . $userId;',
    'regression-safe': '<?php\n$statement = $mysqli->prepare("SELECT * FROM users WHERE id = ?");\n$statement->bind_param("i", $userId);',
  },
  'rb/exception-swallowing': {
    baseline: 'begin; work; rescue StandardError => error; raise error; end',
    'alternate-syntax': 'begin\n  work\nrescue IOError => error; logger.error(error); retry\nend',
    'comment-adjacent': '# Convert the failure into an explicit result.\nbegin; work; rescue StandardError => error; Result.failure(error); end',
    'near-miss': 'begin\n  work\nensure\n  cleanup\nend',
    'regression-safe': 'begin; work; rescue NetworkError => error; raise ServiceUnavailable, error.message; end',
  },
  'rb/sql-string-concat': {
    baseline: 'User.where(id: user_id)',
    'alternate-syntax': 'User.where("id = ?", user_id)',
    'comment-adjacent': '# Active Record binds the value.\nUser.find_by(id: user_id)',
    'near-miss': 'message = "Selected user #{user_id}"',
    'regression-safe': 'User.where("email = :email", email: email)',
  },
  'security/eval': {
    baseline: 'const result = parseExpression(userExpression);',
    'alternate-syntax': 'const data = JSON.parse(payload);',
    'comment-adjacent': '// Parse against the expression grammar.\nconst ast = expressionParser.parse(source);',
    'near-miss': 'const evaluated = interpreter.run(program);',
    'regression-safe': 'const worker = new Worker("expression-worker.js");',
  },
  'security/exposed-env-var': {
    baseline: 'const endpoint = import.meta.env.VITE_API_URL;',
    'alternate-syntax': 'const endpoint = process.env.NEXT_PUBLIC_API_URL;',
    'comment-adjacent': '// This variable contains a public feature switch.\nconst enabled = import.meta.env.VITE_FEATURE_ENABLED;',
    'near-miss': 'const secret = process.env.OPENAI_API_KEY;',
    'regression-safe': 'const appName = import.meta.env.PUBLIC_APP_NAME;',
  },
  'security/localstorage-token': {
    baseline: 'localStorage.setItem("theme", theme);',
    'alternate-syntax': "sessionStorage.setItem('lang', locale);",
    'comment-adjacent': '// Persist presentation state only.\nlocalStorage.setItem("sidebar", sidebarState);',
    'near-miss': 'const accessToken = await requestAccessToken();',
    'regression-safe': 'localStorage.setItem("settings", JSON.stringify(settings));',
  },
  'security/missing-auth-check': {
    baseline: 'export async function GET() { const session = await getServerSession(); return listOrders(session.user.id); }',
    'alternate-syntax': 'app.get("/api/orders", requireAuth, listOrders);',
    'comment-adjacent': 'export async function POST(request) { // Authenticate before mutation.\n  const user = await requireUser(request);\n  return createOrder(user);\n}',
    'near-miss': 'export const GET = withAuth(async (request) => listOrders(request.user));',
    'regression-safe': 'router.get("/api/orders", async (request, response) => { await jwt.verify(request.cookies.session); response.json(await listOrders()); });',
  },
  'security/public-admin-route': {
    baseline: 'app.get("/admin", requireAdmin, renderAdmin);',
    'alternate-syntax': 'export async function GET(request) { await requireRole(request, "admin"); return listUsers(); }',
    'comment-adjacent': 'router.post("/manage/users", async (request, response) => { // Enforce RBAC before mutation.\n  await rbac.requirePermission(request.user, "users:write");\n  response.json(await updateUser(request.body));\n});',
    'near-miss': 'export async function GET(request) { if (!isAdmin(request.user)) return forbidden(); return dashboard(); }',
    'regression-safe': 'app.delete("/internal/jobs/:id", requirePermission("jobs:delete"), deleteJob);',
  },
  'security/target-blank-no-noopener': {
    baseline: '<a href="https://example.test" target="_blank" rel="noopener">Open</a>',
    'alternate-syntax': "<a rel='noreferrer' target='_blank' href='https://example.test'>Open</a>",
    'comment-adjacent': '<!-- Isolate the new browsing context. -->\n<a href="https://example.test/docs" target="_blank" rel="noopener noreferrer">Docs</a>',
    'near-miss': '<a href="/settings">Settings</a>',
    'regression-safe': '<a href="https://example.test" target="_self">Open here</a>',
  },
  'security/unsafe-html-render': {
    baseline: '<div dangerouslySetInnerHTML={{ __html: "<strong>Safe</strong>" }} />',
    'alternate-syntax': "<div dangerouslySetInnerHTML={{ __html: '<em>Safe</em>' }} />",
    'comment-adjacent': '{/* Static application-owned markup. */}\n<div dangerouslySetInnerHTML={{ __html: "<span>Ready</span>" }} />',
    'near-miss': '<div>{userHtml}</div>',
    'regression-safe': '<section dangerouslySetInnerHTML={{ __html: `<p>Static copy</p>` }} />',
  },
  'typo/placeholder-text': {
    baseline: '<input placeholder="Search products" />',
    'alternate-syntax': "<input placeholder={'Email address'} />",
    'comment-adjacent': '{/* Describe the expected value. */}\n<input placeholder="Order number" />',
    'near-miss': '<label>Search<input name="query" /></label>',
    'regression-safe': '<textarea placeholder="Describe the issue" />',
  },
  'wcag/focus-appearance': {
    baseline: '<button className="focus-visible:ring-2">Save</button>',
    'alternate-syntax': '<a href="/settings" className="outline-none focus-visible:ring-4">Settings</a>',
    'comment-adjacent': '{/* Preserve a visible keyboard focus indicator. */}\n<button className="outline-none focus-visible:ring-2 focus-visible:ring-blue-600">Continue</button>',
    'near-miss': '<div className="outline-none">Decorative panel</div>',
    'regression-safe': '<input className="focus:outline-none focus-visible:ring-2" aria-label="Search" />',
  },
  'wcag/focus-obscured': {
    baseline: '<header className="relative">Menu</header>',
    'alternate-syntax': '<nav className="absolute inset-x-0 top-0">Menu</nav>',
    'comment-adjacent': '{/* Keep navigation in normal document flow. */}\n<header className="block">Menu</header>',
    'near-miss': '<header className="sticky-top">Menu</header>',
    'regression-safe': '<aside className="grid gap-4">Filters</aside>',
  },
  'wcag/missing-alt': {
    baseline: '<img src="chart.png" alt="Revenue by month" />',
    'alternate-syntax': "<img alt='Team portrait' src='team.png' />",
    'comment-adjacent': '{/* Concise alternative text names the content. */}\n<img src="map.png" alt="Map of service regions" />',
    'near-miss': '<img src="divider.png" alt="" />',
    'regression-safe': '<img src="texture.png" role="presentation" />',
  },
} as const satisfies Record<
  CAL002DeterministicRuleId,
  Record<(typeof CONTROL_FAMILIES)[number], string>
>;

export const CAL002_ORACLE_DECLARATIONS: readonly CAL002OracleDeclaration[] = RULE_FIXTURES.map((fixture) => ({
  ruleId: fixture.ruleId,
  authority: fixture.authority,
  reference: fixture.reference,
  execution: EXECUTION_BY_RULE_ID[fixture.ruleId],
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
    const source = CAL002_ORACLE_CONTROL_SOURCES[fixture.ruleId][familyId];
    const execution = EXECUTION_BY_RULE_ID[fixture.ruleId];
    return {
      ruleId: fixture.ruleId,
      unitId: unitId(fixture.ruleId, familyId),
      familyId,
      contentSha256: controlContentSha256(source, execution),
      observed: 'no-finding',
      source,
      execution,
    };
  }),
);

// This is intentionally an extension example only: origin rows are not part of the frozen 32 registry.
export const CAL002_ORACLE_TRANSFERS: readonly CAL002StandardsTransfer[] = [
  { ruleId: 'security/hardcoded-secret', reason: 'standards-or-contract-quality-claim' },
];
