# Contributing to slopbrick

> **tl;dr** — to add a new rule: copy `src/rules/visual/naturalness-anomaly.ts`,
> edit the `analyze()` body, add a test in `tests/rules/`, then add
> a `defaultOff: true` entry to `src/rules/signal-strength.json`.
> v0.14.5k's calibration will validate it on the next corpus run.

Thanks for your interest in making slopbrick better. The most useful
contributions are:

1. **New rules** — patterns we don't catch yet. The current coverage gaps are tracked in the operator's local calibration log (not in the public repo).
2. **Rule calibration data** — running `slopbrick scan` on a
   real codebase and reporting what fires.
3. **Bug reports** — especially: "this rule fired on something
   that's not the pattern."
4. **New framework parsers** — the supported-framework matrix is in the operator's local notes (not in the public repo). The currently supported set: React, Vue, Svelte, Solid, Qwik, Astro, HTML, plus Python and Go (regex-only).

For anything else (docs, refactors, new commands), open an issue
first so we can align on scope.

---

## Adding a new rule

This is the most common contribution. The rule engine is designed
to make this easy.

### 1. Pick a category

The 16 categories (in `src/types.ts`):

| Category | What it covers |
|---|---|
| `ai` | AI / LLM signatures (compression-profile, segment-surprisal-cv) |
| `context` | Props, imports, state, dependency boundaries |
| `boundary` | Structural integrity — large files, multiple components per file |
| `visual` | CSS, layout, typography, colors |
| `component` | Component shape (one-per-file, default exports, prop names) |
| `logic` | State, hooks, prop usage, business-logic patterns |
| `arch` | Cross-file structure, file size, dependency direction |
| `perf` | Performance (CSS size, image CLS, render cost) |
| `security` | Secrets, XSS, injection patterns, SSRF |
| `test` | Test coverage, naming, structure, snapshot usage |
| `docs` | Stale references, broken links, README freshness |
| `db` | SQL anti-patterns, schema issues, N+1 queries |
| `wcag` | Accessibility (focus rings, target size, drag) |
| `typo` | Typography (font weights, line heights) |
| `layout` | Flex/grid, gaps, alignment |
| `product` | Feature flags, dead code, churn |
| `i18n` | Translations, locale handling |

Pick the category that best describes what the rule catches. **A
rule is in exactly one category** — if your pattern is ambiguous,
split it into two rules.

### 2. Copy the template

The simplest rules are 30-60 lines. Copy the nearest neighbor:

```bash
# Pattern-mining rule (e.g. compression-profile):
cp src/rules/visual/naturalness-anomaly.ts src/rules/<category>/<your-rule>.ts

# AST-shape rule (e.g. boundary-violation):
cp src/rules/architecture/inconsistent-structure.ts src/rules/<category>/<your-rule>.ts
```

Open the file and edit:
- The header comment (cite the source if it's a peer-reviewed paper
  or a well-known pattern)
- The `id` and `category` fields
- The `analyze()` function — this is the body
- The `threshold` / `severity` fields

### 3. Add a test

Every rule needs at least one test in `tests/rules/<your-rule>.test.ts`.
Use the existing rule tests as a template:

```ts
import { describe, it, expect } from 'vitest';
import { analyze } from '../../src/rules/<category>/<your-rule>';
import { parseFile } from '../../src/engine/parser';
import { buildFacts } from '../../src/engine/facts';

describe('<your-rule>', () => {
  it('fires on the pattern', async () => {
    const src = `
      // sample code that should fire
    `;
    const { ast, source } = await parseFile('test.ts', src);
    const facts = buildFacts(ast, source, src.split('\n'));
    const issues = analyze(facts, defaultContext('test.ts'));
    expect(issues.length).toBeGreaterThan(0);
  });

  it('does not fire on clean code', async () => {
    const src = `
      // sample code that should NOT fire
    `;
    const { ast, source } = await parseFile('test.ts', src);
    const facts = buildFacts(ast, source, src.split('\n'));
    const issues = analyze(facts, defaultContext('test.ts'));
    expect(issues.length).toBe(0);
  });
});
```

### 4. Add to signal-strength.json

Open `src/rules/signal-strength.json` and add an entry:

```json
{
  "<category>/<your-rule>": {
    "defaultOff": true,
    "aiSpecific": false,
    "calibration": {
      "precision": null,
      "recall": null,
      "fpr": null,
      "lift": null
    },
    "notes": "1-line description, what it catches"
  }
}
```

**`defaultOff: true` is critical for new rules.** Until v0.14.5k's
calibration validates the rule on the v7 corpus, it should not
appear in the user-facing score. The user can opt in via
`rules: { '<category>/<your-rule>': 'medium' }` in their
`slopbrick.config.mjs`.

### 5. Run the test suite

```bash
cd packages/slopbrick
pnpm test          # all 798 tests should still pass
pnpm typecheck     # no type errors
```

### 6. Submit a PR

PR title: `feat(rules): add <category>/<your-rule>`. Include:
- 1-line description in the PR body
- Sample input → output (paste the test case)
- A note if the rule needs calibration (most do)

The v0.14.5k calibration pipeline will auto-classify the rule as
USEFUL / OK / NOISY / INVERTED / DORMANT / HYGIENE when the v7
corpus scans finish. We'll update the rule's `defaultOff` flag
based on that classification.

---

## Reporting bugs

When reporting a bug, please include:

1. **The exact command** you ran (with `--workspace` if relevant)
2. **The output** (the full scan report, ideally `--json` form)
3. **The expected behavior** (what should the score have been?)
4. **The file the rule fired on** (if it's a false positive) — paste
   a 5-20 line snippet, not the whole file
5. **Your slopbrick version** (`npx slopbrick --version`)

This is the minimum info needed to reproduce. False positives are
the most common bug type — they're also the most valuable to report
because they feed directly into the calibration.

---

## Development setup

```bash
git clone https://github.com/usebrick/platform
cd platform
pnpm install
pnpm --filter slopbrick typecheck
pnpm --filter slopbrick test
```

The package is in `packages/slopbrick/`. The shared types and
schemas are in `packages/core/`.

### Project structure

```
packages/
├── core/          # @usebrick/core — types, schemas, loaders (private, not on npm)
└── slopbrick/     # the CLI (published as `slopbrick`)
    ├── src/
    │   ├── engine/      # parser, facts, aggregations
    │   ├── rules/       # 80 rules across 16 categories
    │   ├── visitors/    # AST visitors per language
    │   ├── cli/         # commander setup, scan/init/ci/lock
    │   ├── report/      # pretty / json / sarif / html formatters
    │   ├── mcp/         # MCP server (slop_suggest, slop_rules, ...)
    │   └── config/      # config loading + validation
    ├── tests/           # 798 tests across engine/rules/report/cli
    ├── scripts/         # corpus scan, calibration, gap analysis
    └── docs/            # public docs (see "Documentation" below)
```

### Useful commands

```bash
# Build the CLI
pnpm --filter slopbrick build

# Run a single test file
pnpm --filter slopbrick exec vitest run tests/rules/your-rule.test.ts

# Run the calibration on the partial v7 data (scans still running)
python3 scripts/compute-v7-calibration-partial.py

# Find rule-coverage gaps
python3 scripts/find-rule-coverage-gaps.py

# Self-scan the slopbrick codebase
node dist/index.js scan --workspace .
```

---

## Code style

- **TypeScript strict** — `tsc --noEmit` must pass
- **ESM imports** — `.js` extension in imports (TS resolves to `.ts`)
- **No external dependencies without discussion** — open an issue first
- **Cite sources** — if a rule is based on a paper, link it in the file header
- **One purpose per file** — keep rules, visitors, formatters separate

---

## Release process

Versions follow semver:
- **0.14.x** — calibration era (every minor release is a calibration update)
- **0.15.x** — Python/Go AST support (planned)
- **1.0.0** — stability commitment, API frozen

Each release is a single PR. The release commit bumps `version` in
`package.json`, updates `CHANGELOG.md`, and tags the commit. The CI
publishes to npm automatically on tag.

---

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
Be kind, be specific, be honest. We optimize for the v0.10
credibility milestone — every PR should move us closer to per-rule
peer-reviewed citations.

---

## License

By contributing, you agree that your contributions will be licensed
under the [MIT License](LICENSE).
