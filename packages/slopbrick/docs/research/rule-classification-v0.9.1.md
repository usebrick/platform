# Rule classification — v0.9.1 Coherence lens

**Lens (per cheng, 2026-06-25):** every rule answers one question: *Did this code introduce a new pattern when an existing pattern already existed?*

**Tier definitions:**

- **Core Coherence** — measures pattern drift / duplication / boundary / convention violation. **In the headline Coherence score.**
- **Supporting** — useful finding, reported in scan output, but not in the headline. Doesn't measure pattern drift.
- **Independent Domain** — separate score entirely (Security Risk, Accessibility, Performance). Not in Coherence.

**Heuristic for Core Coherence:** ask "if the repo already had a clear convention here, would this rule catch the AI drifting from it?" If yes, it's coherence. If it's about a hard rule (secrets, accessibility, perf), it's independent.

---

## All 55 rules

### Arch (1 rule)

| Rule | Category | Coherence? | Headline? | Domain | Rationale |
|---|---|---|---|---|---|
| `arch/astro-island-leak` | arch | ✅ Core Coherence | ✅ | Coherence | Astro islands used outside `client:*` directives is drift from Astro's island architecture. |

### Component (3 rules)

| Rule | Category | Coherence? | Headline? | Domain | Rationale |
|---|---|---|---|---|---|
| `component/giant-component` | component | ⚪ Supporting | ❌ | Code Hygiene | Size smell, not pattern drift. Could go in Code Hygiene domain. |
| `component/multiple-components-per-file` | component | ✅ Core Coherence | ✅ | Coherence | One component per file is a common convention; multiple = drift. |
| `component/shadcn-prop-mismatch` | component | ✅ Core Coherence | ✅ | Coherence | Overriding shadcn props = drift from the "shadcn is the established component library" convention. The whole point of shadcn is reuse; overriding breaks the convention. |

### Context (1 rule)

| Rule | Category | Coherence? | Headline? | Domain | Rationale |
|---|---|---|---|---|---|
| `context/import-path-mismatch` | context | ✅ Core Coherence | ✅ | Coherence | Mixing relative + absolute paths = drift from the repo's import convention. |

### Layout (4 rules)

| Rule | Category | Coherence? | Headline? | Domain | Rationale |
|---|---|---|---|---|---|
| `layout/gap-monopoly` | layout | ⚪ Supporting | ❌ | Code Hygiene | One gap value used 80%+ of the time is a style choice, not a drift signal. |
| `layout/math-element-uniformity` | layout | ⚪ Supporting | ❌ | Code Hygiene | Math: same dimensions used everywhere. Style uniformity, not drift. |
| `layout/math-grid-uniformity` | layout | ⚪ Supporting | ❌ | Code Hygiene | Same. |
| `layout/spacing-grid` | layout | ⚪ Supporting | ❌ | Code Hygiene | Spacing scale adherence is a design-token rule, not pattern drift. |

### Logic (10 rules)

| Rule | Category | Coherence? | Headline? | Domain | Rationale |
|---|---|---|---|---|---|
| `logic/boundary-violation` | logic | ✅ Core Coherence | ✅ | Coherence | Data + UI in one file = drift from the layer-boundary convention. |
| `logic/ghost-defensive` | logic | ⚪ Supporting | ❌ | Code Hygiene | Dead `if (x) return` guards. Dead code, not drift. |
| `logic/key-prop-missing` | logic | ⚪ Supporting | ❌ | Code Hygiene | React-correctness. Not about pattern drift. |
| `logic/math-any-density` | logic | ⚪ Supporting | ❌ | Code Hygiene | `any` usage. Type hygiene, not drift. |
| `logic/math-console-log-storm` | logic | ⚪ Supporting | ❌ | Code Hygiene | Debug logs left in. Not drift. |
| `logic/math-gini-class-usage` | logic | ⚪ Supporting | ❌ | Code Hygiene | Gini of class strings = style concentration. Not drift. |
| `logic/math-variable-name-entropy` | logic | ⚪ Supporting | ❌ | Code Hygiene | Math: name diversity. Style rule. |
| `logic/optimistic-no-rollback` | logic | ⚪ Supporting | ❌ | Code Hygiene | Bug pattern (no catch-rollback on optimistic update). Not drift. |
| `logic/qwik-hook-leak` | logic | ⚪ Supporting | ❌ | Code Hygiene | Qwik resumability violation. Framework-correctness. |
| `logic/reactive-hook-soup` | logic | ⚪ Supporting | ❌ | Code Hygiene | Multiple effects/handlers inline. Code smell. |
| `logic/zombie-state` | logic | ⚪ Supporting | ❌ | Code Hygiene | Dead state. Not drift. |

### Perf (2 rules)

| Rule | Category | Coherence? | Headline? | Domain | Rationale |
|---|---|---|---|---|---|
| `perf/cls-image` | perf | ❌ Independent | ❌ | Performance | Cumulative layout shift from images. Pure perf metric. |
| `perf/css-bloat` | perf | ❌ Independent | ❌ | Performance | CSS size. Pure perf metric. |

### Security (8 rules)

| Rule | Category | Coherence? | Headline? | Domain | Rationale |
|---|---|---|---|---|---|
| `security/dangerous-cors` | security | ❌ Independent | ❌ | Security Risk | Wildcard CORS. Security, not coherence. |
| `security/exposed-env-var` | security | ❌ Independent | ❌ | Security Risk | Client-bundle env vars. Security. |
| `security/fail-open-auth` | security | ❌ Independent | ❌ | Security Risk | Auth bypass on missing token. Security. |
| `security/hardcoded-secret` | security | ❌ Independent | ❌ | Security Risk | API key in client code. Security. |
| `security/missing-auth-check` | security | ❌ Independent | ❌ | Security Risk | Route handler without auth. Security. |
| `security/public-admin-route` | security | ❌ Independent | ❌ | Security Risk | Privileged route without role check. Security. |
| `security/sql-construction` | security | ❌ Independent | ❌ | Security Risk | Raw SQL string concat. Security. |
| `security/unsafe-html-render` | security | ❌ Independent | ❌ | Security Risk | `dangerouslySetInnerHTML` patterns. Security. |

### Test (4 rules)

| Rule | Category | Coherence? | Headline? | Domain | Rationale |
|---|---|---|---|---|---|
| `test/duplicate-setup` | test | ✅ Core Coherence | ✅ | Coherence | Same `beforeEach` setup across files = drift from DRY test convention. |
| `test/fake-placeholder` | test | ⚪ Supporting | ❌ | Code Hygiene | Placeholder test bodies. Test quality, not drift. |
| `test/missing-edge-case` | test | ⚪ Supporting | ❌ | Delivery Readiness | Missing edge-case tests = ship readiness, not drift. |
| `test/weak-assertion` | test | ⚪ Supporting | ❌ | Code Hygiene | `toBeTruthy()` instead of value assertion. Test quality. |

### Typo (5 rules)

| Rule | Category | Coherence? | Headline? | Domain | Rationale |
|---|---|---|---|---|---|
| `typo/calc-fontsize` | typo | ⚪ Supporting | ❌ | Code Hygiene | `calc(...)` font-size. Style rule. |
| `typo/calc-raw-px` | typo | ⚪ Supporting | ❌ | Code Hygiene | `calc()` raw px. Style rule. |
| `typo/clamp-offscale` | typo | ⚪ Supporting | ❌ | Code Hygiene | `clamp()` off-scale. Style rule. |
| `typo/math-button-label-uniformity` | typo | ⚪ Supporting | ❌ | Code Hygiene | Same button labels. Math: text uniformity. |
| `typo/math-cta-vocabulary` | typo | ⚪ Supporting | ❌ | Code Hygiene | Math: CTA word variety. Style rule. |

### Visual (13 rules)

| Rule | Category | Coherence? | Headline? | Domain | Rationale |
|---|---|---|---|---|---|
| `visual/arbitrary-escape` | visual | ⚪ Supporting | ❌ | Code Hygiene | `[]` arbitrary values. Style rule. |
| `visual/clamp-soup` | visual | ⚪ Supporting | ❌ | Code Hygiene | Heavy `clamp()` use. Style rule. |
| `visual/forced-layout` | visual | ⚪ Supporting | ❌ | Code Hygiene | Forced layout (`flex flex-col ...`). Style rule. |
| `visual/generic-centering` | visual | ⚪ Supporting | ❌ | Code Hygiene | Generic centering (`mx-auto` etc.). Style rule. |
| `visual/inline-style-dominance` | visual | ⚪ Supporting | ❌ | Code Hygiene | Inline `style={...}`. Style rule. |
| `visual/math-color-cluster` | visual | ⚪ Supporting | ❌ | Code Hygiene | Math: color concentration. Style. |
| `visual/math-default-font` | visual | ⚪ Supporting | ❌ | Code Hygiene | Defaults to system fonts. Style. |
| `visual/math-font-entropy` | visual | ⚪ Supporting | ❌ | Code Hygiene | Math: font diversity. Style. |
| `visual/math-gradient-hue-rotation` | visual | ⚪ Supporting | ❌ | Code Hygiene | Math: gradient hue. Style. |
| `visual/math-rounded-entropy` | visual | ⚪ Supporting | ❌ | Code Hygiene | Math: radius uniformity. Style. |
| `visual/math-spacing-entropy` | visual | ⚪ Supporting | ❌ | Code Hygiene | Math: spacing diversity. Style. |
| `visual/radius-scale-violation` | visual | ⚪ Supporting | ❌ | Code Hygiene | Border-radius off scale. Token rule. |
| `visual/spacing-scale-violation` | visual | ⚪ Supporting | ❌ | Code Hygiene | Spacing off scale. Token rule. |

### WCAG (4 rules)

| Rule | Category | Coherence? | Headline? | Domain | Rationale |
|---|---|---|---|---|---|
| `wcag/dragging-movements` | wcag | ❌ Independent | ❌ | Accessibility | WCAG 2.1 SC 2.5.1. Hard accessibility rule. |
| `wcag/focus-appearance` | wcag | ❌ Independent | ❌ | Accessibility | WCAG 2.4.7 / 2.4.11. Hard rule. |
| `wcag/focus-obscured` | wcag | ❌ Independent | ❌ | Accessibility | WCAG 2.4.7. Hard rule. |
| `wcag/target-size` | wcag | ❌ Independent | ❌ | Accessibility | WCAG 2.5.5 / 2.5.8. Hard rule. |

---

## Tally

| Tier | Count | % |
|---|---|---|
| Core Coherence (headline) | 7 | 13% |
| Supporting (reported, not headline) | 31 | 56% |
| Independent Domain — Security | 8 | 15% |
| Independent Domain — Accessibility | 4 | 7% |
| Independent Domain — Performance | 2 | 4% |
| (Missing: arch rule for multiple-state-systems, etc.) | — | — |

## What this tells us

- **13% of rules fit the Coherence lens directly.** Lower than cheng's 30–40% estimate.
- The remaining 87% are valuable findings but they aren't *coherence*. They shouldn't pollute the headline.
- The headline should be computed from a small set of coherence-specific sub-dimensions, not from summing issue counts across all 55 rules.
- The headline needs MORE coherence coverage (currently 7 rules). Options:
  - Add new rules: `arch/multiple-state-systems`, `arch/multiple-modal-systems`, `arch/multiple-api-clients` (the user's "service proliferation" example)
  - OR rely on the Architecture Consistency + Pattern Fragmentation scores (which already measure these) as the headline signal, with the 7 rules as supporting evidence
- The simpler path for v0.9.1: **Architecture Consistency + Pattern Fragmentation ARE the Coherence headline**. The 7 rules above are reported as "coherence-related" issues but the score is driven by the pattern-inventory math.

## Proposed Coherence composite (v0.9.1)

Headline: **Repository Coherence** (0–100, higher = better)

Built from:
- Architecture Consistency (existing score, 0–100) — 50% weight
- Pattern Fragmentation (existing score, inverted to 0–100 higher=better) — 30% weight
- Constitution Violations count (lower = better, mapped to 0–100) — 10% weight
- AI Debt band (mapped from A/B/C/D/F to 95/85/70/50/25) — 10% weight

The 7 "Core Coherence" rules above are reported as evidence that lowered the score. The other 31 supporting rules are reported separately but don't move the Coherence headline.

Independent scores (reported alongside, never headline):
- Security Risk (existing categorical)
- Accessibility (new, derived from wcag/* fires)
- Performance (new, derived from perf/* fires)
- Code Hygiene (new, derived from supporting logic/test/typo/visual/layout fires — count of issues)
- Delivery Readiness (existing doc/db freshness + test edge-case coverage)

---

## Cross-references

- [`docs/research/v4-per-rule-pr-fpr.md`](./v4-per-rule-pr-fpr.md) — v4.1 P/R/FPR (separate axis: does rule separate AI from hand-written?)
- [`docs/research/labeled-dataset-protocol.md`](./labeled-dataset-protocol.md) — labeled-dataset protocol (deferred)
- [`docs/strategy/v1-score-compression.md`](../strategy/v1-score-compression.md) — score compression (deferred to v1.1)
- cheng's strategic reframe: 2026-06-25 conversation; saved as `docs/research/rule-classification-v0.9.1.md`
