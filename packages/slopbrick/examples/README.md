# slopbrick examples

Ready-to-use `slopbrick.config.mjs` files for common project layouts.

| Example | Use when |
|---------|----------|
| [`basic/`](./basic) | Starting point for most projects. Soft thresholds, test/storybook fixtures excluded. |
| [`strict/`](./strict) | CI gates. Strict thresholds + `noIncrease` to block any regression vs. baseline. |
| [`monorepo/`](./monorepo) | pnpm / turbo / npm workspaces. Scans `packages/*/src/**` and `apps/*/src/**`. |
| [`ci/`](./ci) | GitHub Actions / GitLab CI / CircleCI. JSON + SARIF output for archival and code-scanning upload. |

## Quick start

```bash
# 1. Pick the example that matches your project.
cp examples/strict/slopbrick.config.mjs ./slopbrick.config.mjs

# 2. Tweak thresholds and rule overrides to taste.

# 3. Run a scan.
npx slopbrick scan

# 4. (Optional) Validate the config without scanning.
npx slopbrick validate-config
```

## Verifying the install

The `basic/` example ships with `sample-component.tsx`. After copying the basic config to your project root, run:

```bash
npx slopbrick scan examples/basic/sample-component.tsx
```

The sample intentionally contains visual problems. Inspect the emitted rule IDs
instead of asserting a frozen issue count: registry/default-off changes can
alter the total while the example remains useful.

## Anatomy of a config

Every example has the same shape:

```js
export default {
  include:   ['app/**', 'src/**'],   // files to scan
  exclude:   ['**/node_modules/**'], // files to skip
  rules:     { 'rule/id': 'low' },   // per-rule severity overrides
  thresholds: {
    meanSlop: 25,                     // maximum project AI Slop Score (lower is cleaner)
    p90Slop: 45,                      // file-score percentile diagnostic/threshold
    individualSlopThreshold: 70,      // per-file ceiling
  },
};
```

The current config types live in [`src/types/config.ts`](../src/types/config.ts)
and the runtime validator in
[`src/config/validation.ts`](../src/config/validation.ts). Treat the runtime
help and tests as authoritative when the examples and implementation disagree.

## Validating without running a scan

```bash
npx slopbrick validate-config
```

This catches typos in rule ids (e.g. `visual/math-defualt-font`), bad threshold values, and unknown top-level keys — all before the next CI run wastes compute on a malformed config.

## See also

- Package [README](../README.md) — installation and current behavior
- Generated [rule catalog](../docs/rule-catalog.md) — current workspace rules
- Root [roadmap](../../../ROADMAP.md) and [execution
  ledger](../../../docs/execution/README.md) — product direction and active work
