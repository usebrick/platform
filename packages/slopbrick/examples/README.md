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

You should see 1-2 visual issues reported (the inline `style` and the magic spacing value of `13px`). If you see zero issues, something is off — the basic config deliberately leaves visual rules at full sensitivity so this sample triggers them.

## Anatomy of a config

Every example has the same shape:

```js
export default {
  include:   ['app/**', 'src/**'],   // files to scan
  exclude:   ['**/node_modules/**'], // files to skip
  rules:     { 'rule/id': 'low' },   // per-rule severity overrides
  thresholds: {
    meanSlop: 25,                     // average slop across all files
    p90Slop: 45,                      // 90th-percentile slop
    individualSlopThreshold: 70,      // per-file ceiling
  },
};
```

The full schema lives at `src/config.ts` → `ResolvedConfig`. The validator at `src/config-validation.ts` will reject unknown keys with a hint.

## Validating without running a scan

```bash
npx slopbrick validate-config
```

This catches typos in rule ids (e.g. `visual/math-defualt-font`), bad threshold values, and unknown top-level keys — all before the next CI run wastes compute on a malformed config.

## See also

- Top-level [README](../README.md) — installation, CLI reference, and 42 built-in rules
- [`docs/`](../docs/) — design docs and architecture notes