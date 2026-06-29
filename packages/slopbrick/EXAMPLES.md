# slopbrick configuration examples

> **Common patterns for `slopbrick.config.mjs`.** Each example is
> copy-paste ready. The config file is a JS module — you can use
> any Node.js logic (env vars, conditional imports, etc.).

The `slopbrick init` wizard writes a working config for the 8
common categories. This doc covers the OTHER cases — CI overrides,
custom rule severities, large monorepos, and edge cases.

## Table of contents

- [Default config (no file)](#default-config-no-file)
- [Strict CI gate](#strict-ci-gate)
- [Monorepo (multi-package)](#monorepo-multi-package)
- [Per-rule severity overrides](#per-rule-severity-override)
- [Excluding test fixtures](#excluding-test-fixtures)
- [Including Python or Go](#including-python-or-go)
- [Disabling defaultOff rules](#disabling-defaultoff-rules)
- [Enabling dormant rules](#enabling-dormant-rules)
- [Custom category weights](#custom-category-weights)
- [MCP server settings](#mcp-server-settings)

---

## Default config (no file)

If you don't have a `slopbrick.config.mjs`, slopbrick uses a
sensible default. The defaults are:

```js
// This is what slopbrick uses if you have no config file.
import { defineConfig } from 'slopbrick';

export default defineConfig({
  include: [
    'app/**/*.{ts,tsx,js,jsx,vue,svelte,astro,py,go}',
    'src/**/*.{ts,tsx,js,jsx,vue,svelte,astro,py,go}',
    'components/**/*.{ts,tsx,js,jsx,vue,svelte,astro,py,go}',
    'pages/**/*.{ts,tsx,js,jsx,vue,svelte,astro,py,go}',
    '**/*.py',
    '**/*.go',
  ],
  exclude: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/.nuxt/**',
    '**/.svelte-kit/**',
    '**/.slopbrick/**',  // never scan our own artifacts
    '**/coverage/**',
  ],
  rules: {},  // use defaults
  thresholds: { meanSlop: 15, p90Slop: 30, individualSlopThreshold: 60 },
});
```

This is what you get from `slopbrick init` with no answers (the
"empty" option in the wizard).

---

## Strict CI gate

For CI to fail the build when the score is below 70:

```js
import { defineConfig } from 'slopbrick';

export default defineConfig({
  // ... include / exclude ...
  thresholds: { meanSlop: 15, p90Slop: 30, individualSlopThreshold: 60 },
  // Run `slopbrick ci` — exits 1 on threshold fail.
});
```

```bash
slopbrick ci
# exits 0 on pass, 1 on fail
```

Add to `.github/workflows/ci.yml`:

```yaml
- name: slopbrick CI gate
  run: npx slopbrick ci
```

For more aggressive gating (lower threshold):

```js
thresholds: { meanSlop: 5, p90Slop: 10, individualSlopThreshold: 30 },
```

---

## Monorepo (multi-package)

A `pnpm` / `npm` / `yarn` monorepo with multiple packages. Each
package gets its own scan:

```js
import { defineConfig } from 'slopbrick';

export default defineConfig({
  workspaces: ['packages/*', 'apps/*'],
  // Each workspace scans independently. The CI gate runs per-package.
  include: ['src/**/*.{ts,tsx,js,jsx}'],
  exclude: ['**/node_modules/**', '**/dist/**'],
});
```

For shared rule severity across the monorepo:

```js
export default defineConfig({
  workspaces: ['packages/*'],
  rules: {
    'ai/compression-profile': 'high',
    'visual/math-color-cluster': 'medium',
  },
});
```

---

## Per-rule severity override

Change the severity of a specific rule (without disabling it):

```js
export default defineConfig({
  rules: {
    // Lower the severity (less noise)
    'visual/naturalness-anomaly': 'low',      // was 'medium'
    'ai/segment-surprisal-cv': 'medium',     // was 'high'

    // Raise the severity (more strict)
    'security/hardcoded-secret': 'high',     // was 'medium'
    'logic/zombie-import': 'high',           // was 'low'
  },
});
```

Severities: `'low'`, `'medium'`, `'high'`, `'critical'`.

---

## Excluding test fixtures

Some test files contain known-bad code (e.g. SQL injection
fixtures for security tests). Exclude them so they don't pollute
the score:

```js
export default defineConfig({
  exclude: [
    '**/node_modules/**',
    '**/test/fixtures/**',     // our security test fixtures
    '**/test/mocks/**',        // mocks contain "weird" code on purpose
    '**/*.snap',               // snapshot files (auto-generated)
    '**/scripts/seed/**',      // database seeds
  ],
});
```

For a one-off file, use a leading-underscore convention:

```js
export default defineConfig({
  exclude: [
    'src/_deprecated/**',     // explicit "do not scan" prefix
  ],
});
```

slopbrick does NOT scan anything in `**/_deprecated/**` by default.

---

## Including Python or Go

The v0.14.5l fix made slopbrick scan Python and Go files
(they previously got an empty result). To include them
explicitly:

```js
export default defineConfig({
  include: [
    'src/**/*.{ts,tsx,js,jsx,py,go}',  // add py, go
    '**/*.py',
    '**/*.go',
  ],
});
```

Note: Python and Go files are parsed as empty modules (line
offsets preserved) so regex-only rules (markdown-leakage,
comment-ratio) can fire. AST-dependent rules silently produce
0 issues. Full Python AST support is planned for v0.15.

---

## Disabling defaultOff rules

If a rule is marked `defaultOff: true` in `signal-strength.json`
(meaning it has high FPR or low precision) but is firing in your
project and you want to silence it, you can set it to `'off'`:

```js
export default defineConfig({
  rules: {
    'logic/ghost-defensive': 'off',  // fires on defensive checks
    'product/ux-pattern-fragmentation': 'off',
  },
});
```

Use this when:
- The rule's signature is real but doesn't apply to your domain
- The rule is firing on test fixtures (and you can't exclude them)
- You're still investigating the rule's signal and want quiet

`off` is different from `'low'` — `'low'` still shows in the
score, just with less weight. `'off'` is completely silent.

---

## Enabling dormant rules

If a rule is marked `defaultOff: true` because it's new
(haven't been calibrated yet) and you want to opt in:

```js
export default defineConfig({
  rules: {
    'ai/empty-docstring-spam': 'medium',  // enable a new rule
  },
});
```

This is the opt-in pattern. The rule will start firing. If it
fires too often, you can dial down to `'low'` or `'off'`. After
v0.14.5k's calibration runs, the rule's `defaultOff` flag will
be updated based on the corpus data.

---

## Custom category weights

The default weights for the headline `repositoryHealth` (v0.16.0+):

| Subscore | Default weight |
|---|---|
| `aiQuality` | 40% |
| `engineeringHygiene` | 30% |
| `security` | 20% |
| `testQuality` | 10% |

To change them (e.g. you care more about AI quality than security):

```js
export default defineConfig({
  categoryWeights: {
    aiQuality: 0.50,
    security: 0.10,
    engineeringHygiene: 0.30,
    testQuality: 0.10,
  },
});
```

Weights must sum to 1.0. The `repositoryHealth` composite is recalculated using your weights.

For per-category importance (adjusts the engineeringHygiene sub-score, not the headline):

```js
export default defineConfig({
  categoryWeights: {
    security: 1.5,   // 50% more important than the default
    'boundary-violation': 0.5,  // 50% less important
  },
});
```

---

## MCP server settings

When `slopbrick mcp` is connected to Claude Code or Cursor, the
server reads the same config but some settings take effect
differently:

```js
export default defineConfig({
  mcp: {
    // Pre-load `.slopbrick/structure.md` at server start so
    // `slop_suggest_with_structure` is fast. Default: true.
    preloadStructure: true,

    // When the agent calls `slop_scan_file`, also include
    // `defaultOff` rules. Default: false (silent).
    includeDefaultOff: false,

    // Trust the agent to see all rules, including ones marked
    // DORMANT. Default: false.
    trustMode: false,
  },
});
```

`trustMode: true` is for advanced users who want to see
everything slopbrick knows. Most teams should leave it off.

---

## Full config reference

| Field | Type | Default | What it does |
|---|---|---|---|
| `include` | `string[]` | `app/src/components/pages/**` | Glob patterns to scan |
| `exclude` | `string[]` | `node_modules/dist/build/...` | Glob patterns to skip |
| `workspaces` | `string[]` | `[]` | Monorepo workspace globs |
| `rules` | `Record<string, Severity\|'off'>` | `{}` | Per-rule severity overrides |
| `thresholds` | `{ meanSlop, p90Slop, individualSlopThreshold }` | `{ 15, 30, 60 }` | CI gate thresholds |
| `categoryWeights` | `Record<string, number>` | `{ aiQuality: 0.40, engineeringHygiene: 0.30, security: 0.20, testQuality: 0.10 }` | repositoryHealth composite weights |
| `mcp` | `{ preloadStructure, includeDefaultOff, trustMode }` | `{ true, false, false }` | MCP server settings |
| `constitution` | `string` | `null` | Path to a custom `.slopbrick/constitution.json` |
| `output` | `{ format, dir }` | `{ format: 'pretty', dir: '.slopbrick' }` | Output settings |

For the latest reference, see `src/config/validation.ts`.
