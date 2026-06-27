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
  'visual/ai-default-palette':
    'Don\'t reach for slate/gray/zinc/stone/neutral as defaults — they\'re a tell of AI-default palette.',
  'visual/ai-vibe-purple':
    'Specifically avoid the violet-500/indigo-500/purple-500 saturated cluster.',
  'visual/ai-colored-border-card':
    'Don\'t use border-t-2 border-violet-500 on cards — use a subtle full-border or bg tint instead.',
  'visual/ai-rounded-image-no-clip':
    'If you use rounded-full on an <img>, wrap it in overflow-hidden or set a clip-path.',
  'visual/arbitrary-escape':
    'Never use bracket-notation values like text-[13px] or bg-[#7c3aed]. Use design tokens instead.',
  'visual/spacing-scale-violation':
    'Use spacing scale tokens (p-2, gap-4, etc.) instead of arbitrary values like p-[13px] or gap-[1.75rem].',
  'visual/radius-scale-violation':
    'Use radius scale tokens (rounded-md, rounded-lg, etc.) instead of arbitrary values like rounded-[7px].',
  'visual/tailwind-gradient':
    'Prefer solid backgrounds over linear-gradient/radial-gradient/conic-gradient on body sections.',
  'layout/ai-badge-above-hero':
    'Don\'t open hero sections with <Badge>New</Badge><h1>...</h1>. Open with a hook sentence or subhead instead.',
  'layout/ai-stat-banner':
    'Don\'t default to "10K+ users | 99.9% uptime | $5M revenue" rows. Use testimonials or screenshots.',
  'layout/ai-container-combo':
    'Avoid mx-auto max-w-screen-xl combos — use the project\'s container primitive.',
  'typo/placeholder-text':
    'Never leave "TODO", "placeholder", "change me", "your text here" in shipped UI.',
  'visual/ai-default-color':
    'Use the design system\'s color tokens. Don\'t write bg-[#7c3aed] or text-slate-300 by hand.',
  'visual/ai-gradient-soup':
    'Pick one gradient direction. Don\'t stack 3+ bg-gradients with different angles.',
  'typo/ai-emoji-nav-icons':
    'Don\'t use emoji (🏠 ⚙️ etc.) in nav items — use lucide or heroicons SVGs.',
  'logic/console-log':
    'Never ship console.log in production code. Remove debug logs before committing.',
  'logic/explicit-any':
    'Never use `any`. Use `unknown` and narrow with type guards. If generics are needed, use <T extends ...>.',
  'logic/non-null-assertion':
    'Avoid `!` non-null assertions. Use proper narrowing or default values.',
  'logic/ai-button-no-type':
    'Every <button> inside a <form> must have type="button" (or type="submit").',
  'logic/key-prop-missing':
    'Always provide a stable `key` prop when rendering lists.',
  'logic/event-handler-inline':
    'Avoid inline arrow functions on frequently-rendered components — extract or useCallback.',
  'logic/raw-fetch':
    'Every fetch should: have AbortSignal on cleanup, check `response.ok`, and handle errors.',
  'logic/boundary-violation':
    'Don\'t import data-layer / DB code into UI components. Server-side only.',
  'logic/prop-drilling':
    'Don\'t pass props through 3+ layers. Use context, composition, or a state library.',
  'wcag/missing-label':
    'Every <input>, <select>, <textarea> needs a <label> or aria-label.',
  'wcag/missing-alt':
    'Every <img> needs alt text. Decorative: alt="". Informative: describe the image.',
  'wcag/non-semantic-button':
    'Use <button> for clickable elements, not <div onClick> or <a onClick>.',
  'security/localstorage-token':
    'Never store JWT / access token / refresh token in localStorage or sessionStorage. Issue as httpOnly cookie.',
  'security/iframe-no-sandbox':
    'Always add sandbox="" to <iframe>. Whitelist specific permissions with sandbox="allow-scripts" etc.',
  'security/dangerously-set-inner-html':
    'Never use dangerouslySetInnerHTML with user input. Sanitize with DOMPurify or use a markdown renderer.',
  'security/eval':
    'Never use eval() or new Function(). These are RCE vectors if the input is ever attacker-controlled.',
  'security/insecure-url':
    'Never reference http:// URLs in code. Use https://.',
  'security/target-blank-no-noopener':
    'Always add rel="noopener" (or rel="noreferrer") to target="_blank" links.',
  'security/javascript-href':
    'Never use href="javascript:...". Use onClick handlers instead.',
  'security/sri-missing':
    'External <script src> tags must have integrity="sha384-..." and crossorigin="anonymous" (SRI).',
  'security/postmessage-no-origin-check':
    'postMessage handlers must verify event.origin against an allowlist.',
  'security/dangerous-redirect':
    'Never redirect to user-controlled URLs without an allowlist. Validate before window.location =.',
  'security/client-only-auth':
    'Auth checks must hit a server endpoint (/api/me) to verify the token. Client-only checks are decorative.',
  'security/client-bundle-secret':
    'Never put secrets in NEXT_PUBLIC_* / REACT_APP_* / VITE_* / import.meta.env.* env vars.',
  'security/fetch-no-origin-check':
    'Never fetch with credentials:"include" to dynamic or external origins.',
  'security/csrf-no-credentials-config':
    'State-changing fetches (POST/PUT/PATCH/DELETE) must explicitly set credentials.',
  'security/innerhtml-assignment':
    'Never assign user input to element.innerHTML — it\'s an XSS vector.',
  'arch/astro-island-leak':
    'For Astro: server-render everything by default. Only opt-in to client islands when interactivity is needed.',
  'arch/multiple-state-systems':
    'Pick one state management library per project (zustand, redux, jotai, …) and reuse it everywhere. Don\'t introduce a second state library "just for this feature".',
  'arch/multiple-modal-systems':
    'Pick one modal mechanism per project (radix-dialog, headlessui Dialog, react-modal, raw <dialog>) and reuse it everywhere. Don\'t mix libraries.',
  'arch/multiple-api-clients':
    'Pick one HTTP client (axios, ky, fetch) and one data-fetching layer (react-query, swr, apollo) per project. Don\'t stack libraries that do the same job.',
  'component/giant-component':
    'Don\'t build components > 200 lines. Extract shared subcomponents.',
  'component/multiple-components-per-file':
    'One component per file. Move subcomponents into their own files so the Context Window stays small and boundary tests are easy.',
  'component/shadcn-prop-mismatch':
    'Select shadcn variants via the `variant` prop, not long `className` overrides. See the component registry for available variants.',
  'context/import-path-mismatch':
    'Use only the canonical import paths declared in brick.config.json (e.g. @/components/ui/, @/lib/).',
  'layout/forced-layout':
    'Vary structural patterns: some containers as grids, some as horizontal flex, some as blocks. Don\'t repeat `flex flex-col gap-4` everywhere.',
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
  'logic/bayesian-conditional':
    'The Bayesian combiner aggregates multiple weak signals into a calibrated posterior P(AI|fires). Treat any fire above 0.7 as evidence of AI authorship; above 0.9 as strong evidence. (v0.12.0 — Bento et al. 2024 *Neurocomputing*.)',
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
  'logic/qwik-hook-leak':
    'Use Qwik primitives ($state, $effect, useSignal) instead of React hooks (useState, useEffect).',
  'logic/reactive-hook-soup':
    'Coordinate state via a single derived value (useMemo) or a state machine. Avoid chained useEffects that sync local state.',
  'logic/zombie-state':
    'Remove unused useState or wire it into the component. Don\'t leave declared-but-never-read state bindings.',
  'perf/cls-image':
    'Add width/height attributes or an aspect-ratio utility to prevent layout shift.',
  'perf/css-bloat':
    'Extract to a CSS variable (`--surface-card`) or a component prop when a class string repeats 5+ times.',
  'perf/halstead-anomaly':
    'Introduce domain-specific identifiers and varied operations. Low vocabulary per line is a strong AI signature (Halstead 1977 §3).',
  'typo/calc-fontsize':
    'Use a design token (`var(--font-size-lg)`) or `clamp(min, fluid, max)` for responsive typography.',
  'typo/calc-raw-px':
    'Replace px values in calc() with rem or em units for scalable layout.',
  'typo/clamp-offscale':
    'Anchor clamp() values to standard sizes (12, 14, 16, 18, 20, 24, 30, 36, 48) so they remain on the design grid.',
  'typo/math-button-label-uniformity':
    'Mix button lengths deliberately — pair a short "Save" with a longer "Mark as complete" — instead of repeating the same template.',
  'typo/math-cta-vocabulary':
    'Use domain-specific action verbs ("Reserve", "Confirm ride", "Activate card") instead of falling back on the AI-default CTA vocabulary.',
  'visual/clamp-soup':
    'Use design-system aliases (`--text-fluid-sm`, `--text-fluid-lg`) with bounded ranges (typically 2× max).',
  'visual/generic-centering':
    'Vary hero layouts: some as grids (`grid place-items-center`), some as blocks, some with different alignment.',
  'visual/inline-style-dominance':
    'Replace inline `style={{...}}` with className utilities (e.g. Tailwind `p-4 m-2 gap-3`) or a CSS module class.',
  'visual/math-default-font':
    'Import a distinctive font (next/font/google, @font-face, or a CSS variable) instead of relying on the framework default.',
  'visual/math-font-entropy':
    'Use a wider range of text sizes (text-xs, text-sm, text-lg, text-xl, text-2xl, text-3xl) for a more deliberate type scale.',
  'visual/math-gradient-hue-rotation':
    'Use wider hue spans across gradients (e.g. blue→amber, emerald→indigo) to break the violet-fuchsia monotony.',
  'visual/math-rounded-entropy':
    'Use a wider range of border-radius values (sm, md, 2xl, 3xl) instead of repeating the same lg/xl/full pattern.',
  'visual/math-spacing-entropy':
    'Mix more spacing values from the design scale (e.g. 3, 5, 7, 10, 14, 20, 28) instead of repeating the same 4/8 pattern.',
  'visual/naturalness-anomaly':
    'Use domain-specific identifier names so the identifier stream reflects the actual problem domain. Hindle 2012 §4.3: LLM-generated code reuses a narrow band of training-data identifiers, dropping distinct-token ratio below 30%.',
  'visual/math-color-cluster':
    'Use at least 3 distinct hue families (e.g. blue + amber + green) instead of clustering every color in the violet/fuchsia band.',
  'wcag/dragging-movements':
    'Provide an onClick, onKeyDown, or button role as an alternative to dragging (WCAG 2.1.1).',
  'wcag/focus-appearance':
    'Add a focus-visible:ring-* class, or remove outline-none. Keyboard users need a visible focus indicator.',
  'wcag/focus-obscured':
    'Ensure focused elements are not hidden behind fixed or sticky wrappers.',
  'wcag/target-size':
    'Add h-*, w-*, p-*, min-w-*, min-h-*, size-*, or an explicit width/height attribute to bring the target to ≥ 24×24 px.',
  'test/weak-assertion':
    'Assert on a specific value or shape: `expect(x).toEqual(expectedValue)`. Avoid `.toBeDefined()` / `.toBeTruthy()` placeholders and tautological `expect(x).toBe(x)`.',
  'test/duplicate-setup':
    'Extract shared `beforeEach` / `setupServer` blocks into a single helper (e.g. `renderWithProviders`) so each describe block calls it instead of repeating setup.',
  'test/missing-edge-case':
    'When generating tests, cover the alternate path: `else` branches, `catch` blocks, ternary alternates, and `??` fallbacks. Production branches without tests are a CI smell.',
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
  'ai/log-rank-histogram':
    'The token vocabulary is concentrated in the top-1000 most common tokens. Real codebases use more diverse identifiers (Gehrmann 2019 GLTR).',
  'ai/segment-surprisal-cv':
    'The cross-entropy is suspiciously uniform across the file. Real codebases have varied registers (Binoculars, Hans 2024).',
  'ai/compression-profile':
    'The file compresses unusually well and lines are highly repetitive — characteristic of AI-generated boilerplate (Cilibrasi 2005, Mahoney 1999).',
};

export { CATEGORY_DIRECTIVES, RULE_HINTS };