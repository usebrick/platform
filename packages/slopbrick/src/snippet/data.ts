// Directive text content for AI agent snippets.
//
//   CATEGORY_DIRECTIVES — category-level guidance. Each key is a
//                          rule category (visual / typo / wcag / etc);
//                          each value is one Markdown bullet.
//
//   RULE_HINTS           — per-rule guidance. Each key is a rule id;
//                          each value is the prose shown next to the
//                          rule in the generated snippet.
//
// Both constants are pure data (no logic, no imports). They live in
// this module so the renderer can stay focused on layout and the
// targets module can stay focused on registry metadata.

// ---------------------------------------------------------------------------
// Category-level directives
// ---------------------------------------------------------------------------

const CATEGORY_DIRECTIVES: Record<string, string> = {
  visual:
    'Avoid the saturated "vibe purple" Tailwind palette (violet-400-700, indigo-400-700). Prefer emerald, sky, amber, rose for accents. Never use arbitrary color values like bg-[#7c3aed] when a token exists.',
  logic:
    'Never use explicit `any`. Use `unknown` and narrow. Always add an AbortSignal to fetches. Handle errors with try/catch, never swallow with empty catch. Use `as const` instead of `as Type` casts.',
  wcag:
    'All form inputs must have an accessible label (visible <label>, aria-label, or aria-labelledby). Decorative images must have empty alt="". Buttons must be <button>, never <div onClick>. Touch targets must be ≥ 24×24 CSS px.',
  security:
    'Never store tokens in localStorage or sessionStorage — use httpOnly Secure SameSite cookies. Never put secrets in NEXT_PUBLIC_* / REACT_APP_* / VITE_* env vars. Validate e.origin in postMessage handlers. Never dangerouslySetInnerHTML with user input. Never use target="_blank" without rel="noopener".',
  perf:
    'Always use AbortController with fetch. Use image width/height attributes to prevent CLS. Use <Suspense> around async client components. Don\'t load all images eagerly.',
  typo:
    'Never leave TODO / placeholder / "change me" copy in shipped code. Use real i18n strings or the project\'s content map.',
  layout:
    'Don\'t stack badge-above-h1 hero patterns. Don\'t build 3-stat banner rows without explicit user request. Don\'t use emoji inside nav items (use SVG icons). Use the project\'s spacing scale (4px or 8px grid), never arbitrary values like p-[13px].',
  component:
    'Don\'t build components > 200 lines. Extract shared subcomponents. Avoid circular prop drilling — use context.',
  arch:
    'For Astro: server-render everything by default; only opt-in to client islands when you need interactivity. Don\'t put secrets in client-side code.',
  test:
    'Use domain-specific fixture data, assert on value shapes not just truthiness, and consolidate repeated setup into helpers. Avoid `expect(x).toBeDefined()` placeholders and textbook fixtures like \'John Doe\' or \'test@test.com\'.',
};

// ---------------------------------------------------------------------------
// Per-rule directives
// ---------------------------------------------------------------------------

const RULE_HINTS: Record<string, string> = {
  // v0.38.0 hygiene: 37 v10-DORMANT rule hints were removed. Every
  // remaining key matches a rule in src/rules/builtins.ts. No orphans.
  // (v0.16.0 previously moved 35 out-of-scope orphan hints to
  //   docs/research/backlog-rule-hints.md
  // for future implementers to paste back when the corresponding rules ship.)
  'security/hardcoded-secret':
    'Never inline API keys, JWT secrets, or database passwords in source. Load them from env vars and never commit a .env file. Assume any published secret is compromised and rotate it.',
  'security/exposed-env-var':
    'NEVER prefix a secret with NEXT_PUBLIC_, VITE_, REACT_APP_, EXPO_PUBLIC_, GATSBY_, or PUBLIC_ — those vars are inlined into every browser build.',
  'security/dangerous-cors':
    "Don't set Access-Control-Allow-Origin: * on production endpoints. Restrict to an explicit allowlist; never combine wildcard origin with credentials: true.",
  'security/missing-auth-check':
    'Every server route handler must perform an authentication + authorization check at the top. Reachability of an endpoint by any user (authenticated or not) is a vulnerability, not a feature.',
  'security/unsafe-html-render':
    "Sanitize any non-literal value passed to dangerouslySetInnerHTML with DOMPurify. Better: avoid the prop entirely and let React escape via children.",
  'security/fail-open-auth':
    "Don't gate auth bypasses on NODE_ENV. Replace dev-env checks with an explicit AUTH_BYPASS flag that's never set in production.",
  'security/sql-construction':
    'Never build SQL with string concatenation or template-literal interpolation. Use parameterized queries: pg client.query("... WHERE id = $1", [id]) or your ORM query builder.',
  'security/public-admin-route':
    'Routes under /admin, /internal, /debug, /staff, /manage, /private need an explicit role check on top of standard auth — auth alone is not enough for privileged paths.',
  'visual/arbitrary-escape':
    'Never use bracket-notation values like text-[13px] or bg-[#7c3aed]. Use design tokens instead.',
  'visual/spacing-scale-violation':
    'Use spacing scale tokens (p-2, gap-4, etc.) instead of arbitrary values like p-[13px] or gap-[1.75rem].',
  'visual/radius-scale-violation':
    'Use radius scale tokens (rounded-md, rounded-lg, etc.) instead of arbitrary values like rounded-[7px].',
  // v0.16.0 — in-scope orphans kept here (corresponding rule ships in v0.16.0).
  'typo/placeholder-text':
    'Never leave "TODO", "placeholder", "change me", "your text here" in shipped UI.',
  'logic/key-prop-missing':
    'Always provide a stable `key` prop when rendering lists.',
  'logic/boundary-violation':
    'Don\'t import data-layer / DB code into UI components. Server-side only.',
  'wcag/missing-alt':
    'Every <img> needs alt text. Decorative: alt="". Informative: describe the image.',
  'security/localstorage-token':
    'Never store JWT / access token / refresh token in localStorage or sessionStorage. Issue as httpOnly cookie.',
  'security/eval':
    'Never use eval() or new Function(). These are RCE vectors if the input is ever attacker-controlled.',
  'security/target-blank-no-noopener':
    'Always add rel="noopener" (or rel="noreferrer") to target="_blank" links.',
  'component/giant-component':
    'Don\'t build components > 200 lines. Extract shared subcomponents.',
  'component/multiple-components-per-file':
    'One component per file. Move subcomponents into their own files so the Context Window stays small and boundary tests are easy.',
  'component/shadcn-prop-mismatch':
    'Select shadcn variants via the `variant` prop, not long `className` overrides. See the component registry for available variants.',
  'context/import-path-mismatch':
    'Use only the canonical import paths declared in brick.config.json (e.g. @/components/ui/, @/lib/).',
  'layout/gap-monopoly':
    'Mix gap-2 / gap-4 / gap-6 / gap-12 deliberately. Don\'t repeat the same gap value across the whole project.',
  'layout/math-element-uniformity':
    'Human files have lopsided interactive counts (1 button + 12 inputs). AI tends to balance them. Build forms with many inputs and few buttons.',
  'layout/math-grid-uniformity':
    'Vary grid-cols-N (grid-cols-2, grid-cols-3, grid-cols-4, grid-cols-6) across sections instead of repeating grid-cols-3.',
  'layout/spacing-grid':
    'Use the configured spacing scale (4px or 8px grid). Avoid arbitrary values like p-[13px] that aren\'t on the scale.',
  'logic/ghost-defensive':
    'Use optional chaining (?.) or early returns instead of deep && guards. If a defensive chain runs 3+ levels deep, refactor.',
  'logic/heaps-deviation':
    "Inspect for LLM-style vocabulary patterns: this file's vocabulary grows faster (high Heaps λ) or slower (low λ) than typical source code. Verify authorship if unexpected. (v0.12.0 — Christ et al. EMNLP Findings 2025.)",
  'logic/ks-distribution-shift':
    'Inspect the shifted features. KS detects both AI anomalies and production-rot anomalies (it is symmetric); combine with Heaps/Zipf for AI-specific signal. (v0.12.0 — arXiv:2510.15996, Oct 2025.)',
  'logic/zipf-slope-anomaly':
    "Inspect for LLM-style frequency distribution: this file's identifier usage is more peaked or flatter than typical human code. (v0.12.0 — Christ et al. EMNLP Findings 2025.)",
  'logic/math-any-density':
    'Replace `: any` with proper types. Start with the parameter/return types of the most-used functions.',
  'logic/math-console-log-storm':
    'Replace debug logs with a proper debugger or logger.debug(). Remove all console.log before shipping.',
  'logic/math-gini-class-usage':
    'Spread usage across more class tokens instead of repeating the same handful (p-4, p-8, rounded-lg, etc.).',
  'logic/math-variable-name-entropy':
    'Use domain-specific identifier names (reservations, invoices, customers) instead of generic data/items/value.',
  'logic/optimistic-no-rollback':
    'In optimistic updates, revert state in the catch block: `setX(prev => prev)`. Never leave stale UI on error.',
  'logic/reactive-hook-soup':
    'Coordinate state via a single derived value (useMemo) or a state machine. Avoid chained useEffects that sync local state.',
  'logic/zombie-state':
    'Remove unused useState or wire it into the component. Don\'t leave declared-but-never-read state bindings.',
  'dead/unused-import':
    'Remove the import or use the symbol somewhere. Unused imports are the most common AI-iteration signature — the model added it for a feature, then rewrote the function without cleaning up.',
  'dead/unused-local':
    'Remove the declaration or use the variable. AI-iteration signature: the model declared a binding for a feature, then rewrote the function without cleaning up.',
  'dead/unused-parameter':
    'Remove the parameter (and update every call site) or use it in the function body. AI-iteration signature: the model added a parameter for a feature, then rewrote the function without removing parameters the new code does not need.',
  'dead/dead-branch':
    'Replace the literal boolean with a real condition, or remove the dead branch. AI-iteration signature: a feature flag toggled to a constant, or a wrapper from a previous refactor that was never cleaned up.',
  'dead/unreachable':
    'Remove this statement — code after a return/throw/break/continue is unreachable. AI-iteration signature: the model added an early return for a new error path, then forgot the rest of the function body was still sitting below it.',
  'perf/cls-image':
    'Add width/height attributes or an aspect-ratio utility to prevent layout shift.',
  'perf/css-bloat':
    'Extract to a CSS variable (`--surface-card`) or a component prop when a class string repeats 5+ times.',
  'typo/math-button-label-uniformity':
    'Mix button lengths deliberately — pair a short "Save" with a longer "Mark as complete" — instead of repeating the same template.',
  'visual/inline-style-dominance':
    'Replace inline `style={{...}}` with className utilities (e.g. Tailwind `p-4 m-2 gap-3`) or a CSS module class.',
  'visual/math-default-font':
    'Import a distinctive font (next/font/google, @font-face, or a CSS variable) instead of relying on the framework default.',
  'visual/math-font-entropy':
    'Use a wider range of text sizes (text-xs, text-sm, text-lg, text-xl, text-2xl, text-3xl) for a more deliberate type scale.',
  'visual/math-rounded-entropy':
    'Use a wider range of border-radius values (sm, md, 2xl, 3xl) instead of repeating the same lg/xl/full pattern.',
  'visual/math-spacing-entropy':
    'Mix more spacing values from the design scale (e.g. 3, 5, 7, 10, 14, 20, 28) instead of repeating the same 4/8 pattern.',
  'visual/naturalness-anomaly':
    'Use domain-specific identifier names so the identifier stream reflects the actual problem domain. Hindle 2012 §4.3: LLM-generated code reuses a narrow band of training-data identifiers, dropping distinct-token ratio below 30%.',
  'visual/math-color-cluster':
    'Use at least 3 distinct hue families (e.g. blue + amber + green) instead of clustering every color in the violet/fuchsia band.',
  'wcag/focus-appearance':
    'Add a focus-visible:ring-* class, or remove outline-none. Keyboard users need a visible focus indicator.',
  'wcag/focus-obscured':
    'Ensure focused elements are not hidden behind fixed or sticky wrappers.',
  'test/weak-assertion':
    'Assert on a specific value or shape: `expect(x).toEqual(expectedValue)`. Avoid `.toBeDefined()` / `.toBeTruthy()` placeholders and tautological `expect(x).toBe(x)`.',
  'test/duplicate-setup':
    'Extract shared `beforeEach` / `setupServer` blocks into a single helper (e.g. `renderWithProviders`) so each describe block calls it instead of repeating setup.',
  'test/fake-placeholder':
    'Use domain-specific fixture values (`alice@acme-corp.com`, `Order#48231`) or a factory like @faker-js/faker. Avoid textbook placeholders (`John Doe`, `test@test.com`, `id: 1`).',
  'product/terminology-drift':
    'Keep the leading noun consistent across files: `PostList`, `PostDetail`, `PostCard` are one entity, not three. AI agents pick slightly different words each invocation; product copy drifts.',
  'product/ux-pattern-fragmentation':
    'Keep the per-category count tight: modal ≤3, toast ≤2, button ≤4, input ≤3, card ≤3. Pick the canonical one and alias the rest. `slopbrick patterns` reports the per-category count.',
  // v0.13.0 — AI-specific rules (peer-reviewed signals).
  'ai/markdown-leakage':
    'Delete stray `\\`\\`\\`<lang>\\`\\`\\`` markers; they are Markdown fences, not valid syntax in standalone source files (Yotkova et al. SemEval-2026).',
  'ai/comment-ratio':
    'AI tools either skip comments (reductive models) or over-comment (expansive models). Match the corpus mean ± 2σ (Rahman et al. 2024, Bisztray et al. 2025).',
  'ai/whitespace-regularity':
    'Vary inter-token spacing (single spaces mostly, occasional alignment in tables). Uniform runs are an AI tell (Shi et al. DetectCodeGPT 2024).',
  'ai/text-like-ratio':
    'Move natural-language explanations to README files or doc comments. Inline prose in source code is hard to maintain (Yotkova 2026).',
  'ai/errors-near-eof':
    'Check whether the file was truncated by a token limit. Unbalanced delimiters near EOF suggest the model ran out of output budget (Yotkova 2026).',
  'ai/any-density':
    'Replace `any` with `unknown`, `Record<string, unknown>`, or a domain type. The `: any` annotation propagates type-errors and defeats TS safety (Lee, Hassan, Hindle MSR 2026).',
  'ai/renyi-profile':
    'The token distribution is mass-concentrated on a few high-frequency tokens. Verify authorship if unexpected (Rényi 1961, Moslonka 2025).',
  'ai/segment-surprisal-cv':
    'The cross-entropy is suspiciously uniform across the file. Real codebases have varied registers (Binoculars, Hans 2024).',
  'ai/compression-profile':
    'The file compresses unusually well and lines are highly repetitive — characteristic of AI-generated boilerplate (Cilibrasi 2005, Mahoney 1999).',
  // v0.14.5b — 6 new AI tendency detection rules (DORMANT in v0.14.5b;
  // reclassified post-v7 calibration in v0.14.5d)
  'ai/tailwind-color-overuse':
    "If most utility classes are bg-violet-500, text-violet-600, ring-violet-400 — the project is on the AI-default palette. Audit and replace with the project's design tokens.",
  'ai/default-react-stack':
    "Every new file is a Vite + React + Tailwind + Zustand + React Hook Form clone. Verify the project actually needs each piece before adding it.",
  'ai/library-reinvention':
    "Re-implementing zustand, react-hook-form, or date-fns inline (custom event emitters, useState reducers, manual date math) is a sign of LLM completion-mode code. Use the libraries the project already depends on.",
  'ai/state-default-overuse':
    "Wrapping every component in useState + useEffect for transient UI state is the React tutorial default. Real production code uses refs, uncontrolled inputs, or the project's state lib.",
  'ai/fetch-default-overuse':
    "Calling fetch() inline in components instead of going through the project's data-fetching layer (react-query, swr, or your own client) bypasses the cache, error boundary, and abort handling.",
  'ai/console-debug-storm':
    "5+ console.log calls in a single file is debug-by-print-statement, the LLM training-data default. Remove before commit; use the project's logger or a real debugger.",
  // v0.17.0 — db/* rules (Postgres static analysis via pgsql-parser)
  'db/sql-concat':
    'Never build SQL with template-literal interpolation — `db.query(\`SELECT … WHERE id = ${id}\`)` is a SQL injection vector. Use parameterized queries (`db.query("… WHERE id = $1", [id])`) or your ORM query builder.',
  // v0.17.0 — docs/* rules (markdown drift detection)
  'docs/stale-package-reference':
    'Update the doc to reference an installed package, or add the package to package.json. Copy-pasted install commands from a previous project are the #1 doc-drift failure mode.',
  'docs/stale-function-reference':
    'Rename the doc reference to match a current export, or add a wrapper export. Stale function callouts in tutorials cost readers 10+ minutes of debugging.',
  'docs/broken-link':
    'Create the file or fix the link target. On a public docs site, broken links erode trust more than stale copy.',
  // v0.18.9 — Rust-specific rules (tree-sitter-backed)
  'rust/unused-pub-fn':
    "Remove the function or call it. Rust's compiler doesn't warn on `pub fn` references unless `#![warn(dead_code)]` is set at the crate root. AI agents leave these behind during iterative refactors.",
  'rust/unwrap-in-production':
    "Replace `.unwrap()` / `.expect()` with `?` (early-return on Err), `.map_err(...)` for error conversion, or an explicit `match`. They panic in production; reserve them for `#[cfg(test)]` or `#[test]` scopes.",
  'rust/todo-macro':
    "Implement the function body or remove the stub. `todo!()` / `unimplemented!()` both expand to `panic!()`, so a hit at runtime crashes the program. Move them into a `#[cfg(test)] mod tests` block to suppress.",
  'rust/stringly-typed':
    "Replace the `String` / `&str` parameter with the typed enum that already exists in the file. Stringly-typed APIs lose type information at the boundary — typos (`\"Click\"` vs `\"click\"`) only fail at runtime.",
  // v0.19.0 — TypeScript-specific rules
  'ts/enum-vs-as-const':
    "Replace `enum Foo { A, B }` with `const Foo = { A: 'A', B: 'B' } as const` (or `const Foo = ['A', 'B'] as const`). Modern TS style guides (Google, TS-eslint) prefer `as const` because enums have surprising runtime semantics.",
  'ts/import-type-misuse':
    "Use `import type { X } from '...'` instead of `import { type X } from '...'`. The split form is more common in real codebases and makes the type-only intent unambiguous.",
  'ts/never-vs-unknown':
    "The `never` return type means 'this function never returns'. Reserve it for functions that always throw, always loop, or always exit. For 'impossible' branches, use a concrete type (`void`, `Error`, `unknown`) and an exhaustive check.",
  'ts/excessive-type-assertion':
    "More than 3 `as` assertions in one function is a strong signal that the type is wrong, not the code. Fix the type definition (or use a type guard) instead of bypassing the type system.",
  // v0.19.0 — Go-specific rules
  'go/struct-tag-inconsistency':
    "Pick one tag style per struct. If most fields are `json:\"foo\"`, this field should be too. Real Go code maintains consistency within a struct (or within a package).",
  'go/nil-slice-vs-empty':
    "Either declare as `var x = []int{}` or assign with `make([]int, 0)`. The nil/empty inconsistency is an AI signal — real code picks one form and sticks with it.",
  // v0.19.0 — Duplication detector
  'dup/identical-block':
    "Refactor to a shared helper. This is a Type-1 clone (byte-for-byte identical after normalization). Common in AI-generated code that copy-pastes from training data.",
  // v0.23.0 — Type-2 near-duplicate detector (MinHash + LSH)
  'dup/near-duplicate':
    "Refactor to a shared helper. Type-2 near-duplicate: same identifiers + structure, different whitespace/comments. AI-iterated code regenerates the same function with cosmetic edits. (v0.23.0 — MinHash + LSH, k=5, thr 0.7.)",
  // v0.24.0 — Type-3 structural clone detector (two-stage MinHash)
  'dup/structural-clone':
    "Refactor to a shared helper. Type-3 clone: same shape as another file after identifier canonicalization, with renames and/or added/removed statements. AI agents and copy-paste both produce this. Extract the shared part. (v0.24.0.)",
  // v0.24.0 — Kotlin rules (DORMANT until v9 Kotlin corpus calibration)
  // v0.29.0 — non-AI Kotlin rules (DORMANT until larger pos arm)
  // v0.30.0 — non-AI Java rules (Option C applied to v9 Java corpus, 92k files)
  'java/sql-string-concat':
    "Use a PreparedStatement (JDBC), setParameter (jOOQ), or an ORM (Hibernate, MyBatis with #{}). String concat into SQL is the canonical SQL-injection pattern. OWASP A03:2021. (v0.30.0 — DORMANT, ratio 0.59.)",
  'java/thread-sleep-in-loop':
    "Use ScheduledExecutorService for periodic work, or BlockingQueue.take() for event-driven work. Thread.sleep in a loop is the polling anti-pattern — ties up Tomcat/Jetty/Netty threads. (v0.30.0 — DORMANT, era-confounded ratio 0.97.)",
  // v0.35.0 — content-based detection (CoCoNUTS-inspired)
  'java/suspicious-implementation':
    "Function name claims validate/encrypt/hash/sanitize but body is empty, returns null/true, or returns the input. This is a content mismatch — the function's claimed behavior doesn't match its actual behavior. OWASP A04:2021.",
  // v0.35.1 — Raidar-inspired content-based detection
  'java/lost-stack-trace':
    "catch block throws a new exception without the original cause — stack trace is lost. Pass the original exception as the second arg to the new exception's constructor: `throw new XxxException(\"msg\", e)`.",
  // v0.24.0 — Swift rules (DORMANT until v9 Swift corpus calibration)
  'swift/force-unwrap':
    "Replace with the safe form: `as?` + guard/if let, `try?`, or `guard let x = optional else { return }`. `!` crashes unconditionally in release. (v0.24.0 — DORMANT.)",
  'swift/print-debug':
    "Replace with `Logger(subsystem:..., category:...).info(...)` (os.log). `print` writes to stdout with no level and no redaction. (v0.24.0 — DORMANT.)",
  'swift/fatal-error-thrown':
    "Replace with `return` of a typed default (e.g. `nil`, `[]()`) or throw a typed `enum MyError: Error`. `fatalError` survives release builds. (v0.24.0 — DORMANT.)",
  'swift/implicitly-unwrapped-optional':
    "Declare as `var name: Type?` and unwrap with `guard let`. IUOs exist for Obj-C bridging / IBOutlets but using them everywhere is an AI signal. (v0.24.0 — DORMANT.)",
  'swift/strong-self-capture':
    "Capture with `[weak self]` (or `[unowned self]` if guaranteed non-nil): `[weak self] in self?.foo = bar`. Strong self capture creates a retain cycle. (v0.24.0 — DORMANT.)",
  // v0.24.0 — C++ rules (DORMANT until v9 C++ corpus calibration)
  'cpp/raw-new-delete':
    "Replace with `auto p = std::make_unique<T>(...)`. Smart pointers delete on scope exit, never leak on early return / exception, never double-free. (v0.24.0 — DORMANT.)",
  'cpp/c-style-cast':
    "Use the named cast: `static_cast<int>(x)`, `reinterpret_cast<...>(p)`, `const_cast<...>(ref)`. C-style casts silently pick static / reinterpret / const — impossible to grep. (v0.24.0 — DORMANT.)",
  'cpp/printf-debug':
    "Replace with `spdlog::info(...)`, `LOG(INFO) << ...` (glog), or `ABSL_LOG(INFO) << ...`. `printf` / `std::cout` have no levels, no redaction, no sink routing. (v0.24.0 — DORMANT.)",
  'cpp/magic-numbers':
    "Replace with `constexpr int MAX = 1024;` (or `static constexpr`). Named constants live next to their value, can be searched, force the reader to mean what they say. (v0.24.0 — DORMANT.)",

    // v0.43.0 — Kotlin rules (DORMANT until v10.2 Kotlin corpus calibration)
  'kt/string-template-injection':
    'Use a parameterized query: `prepareStatement(sql, listOf(id))` with `?` placeholders, or Exposed/ktorm. Never concatenate user input into SQL. (v0.43.0 — DORMANT.)',
  'kt/coroutine-cancellation-missing':
    'Add `ensureActive()` inside long loops, use `delay()` (a suspension point), or wrap in `coroutineScope { ... }` so the coroutine respects parent cancellation. (v0.43.0 — DORMANT.)',
  'kt/force-unwrap':
    'Use safe call `?.` or the Elvis operator `?:`. If the value must be non-null, use `requireNotNull(x) { ... }` so you can throw a meaningful error. (v0.43.0 — DORMANT.)',
  'kt/global-coroutine-scope':
    'Use `coroutineScope { ... }` for structured concurrency, or inject a `CoroutineScope` via DI (Hilt, Koin) tied to the component lifecycle. (v0.43.0 — DORMANT.)',
  // v0.43.0 — Ruby rules (DORMANT until v10.2 Ruby corpus calibration)
  'rb/sql-string-concat':
    'Use ActiveRecord: `User.where(id: params[:id])` or Sequel: `User.where(id: $id)`. Never interpolate user input into a SQL string. (v0.43.0 — DORMANT.)',
  'rb/exception-swallowing':
    'At minimum, log: `rescue => e; Rails.logger.error(e)`. Better: re-raise (`raise e`) or use a narrower exception class. (v0.43.0 — DORMANT.)',
  'rb/n-plus-one-query':
    'Use `.includes(:assoc)` (2 queries total) or `.preload(:assoc)` (1 query). For large datasets, use `.find_each(batch_size: 1000)`. (v0.43.0 — DORMANT.)',
  // v0.43.0 — C# rules (DORMANT until v10.2 C# corpus calibration)
  'cs/sql-string-interpolation':
    'Use parameterized queries: `FromSqlInterpolated($"...id = {0}", id)` (EF Core), or `SqlCommand.Parameters.Add("@id", ...)`. (v0.43.0 — DORMANT.)',
  'cs/async-without-await':
    'Either remove the `async` modifier (return `Task` synchronously) or add a real `await` expression. (v0.43.0 — DORMANT.)',
  'cs/empty-catch-block':
    'At minimum, log: `catch (Exception ex) { logger.LogError(ex, "context"); }`. Better: re-throw with a wrapper exception that includes your operation context. (v0.43.0 — DORMANT.)',
  // v0.43.0 — PHP rules (DORMANT until v10.2 PHP corpus calibration)
  'php/sql-injection':
    'Use PDO prepared statements: `$stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?"); $stmt->execute([$id]);` (v0.43.0 — DORMANT.)',
  'php/empty-catch':
    'At minimum, log: `catch (Exception $e) { error_log($e->getMessage()); }`. Better: re-throw with a wrapper exception. (v0.43.0 — DORMANT.)',
  // v0.44.0 — Dart rules (DORMANT until v10.2 Dart corpus calibration)
  'dart/dynamic-call':
    'Replace `dynamic` and unchecked `as` casts with concrete types, typed parameters, or pattern matching so refactors fail at compile time. (v0.44.0 — DORMANT.)',
  'dart/missing-dispose':
    'Dispose every controller, subscription, and focus node in `State.dispose()` (for example, `controller.dispose()`) to prevent Flutter memory leaks. (v0.44.0 — DORMANT.)',
  'dart/print-debug':
    'Replace production `print()` calls with `debugPrint()` or a structured logger so release builds avoid unbounded stdout and accidental data disclosure. (v0.44.0 — DORMANT.)',
  'dart/unwrapped-futures':
    'Await async calls (`await fetchData()`) or intentionally chain `.then(...)`; otherwise Future errors can be swallowed and execution order becomes nondeterministic. (v0.44.0 — DORMANT.)',
};

export { CATEGORY_DIRECTIVES, RULE_HINTS };
