# Contributing to SlopBrick

Thanks for helping make SlopBrick more accurate, useful, and honest.

The highest-value contributions are:

1. reproducible false-positive or false-negative reports;
2. focused fixes with regression tests;
3. evidence-backed improvements to existing rules;
4. framework/language adapters with explicit support limits;
5. documentation that matches the runtime.

The active v0.45 release plan prioritizes trust and reliability rather than a
larger default-on rule catalog. New rules can be reviewed, but they remain
default-off until they meet the active calibration policy.

Read the root [roadmap](../../ROADMAP.md) and [execution
ledger](../../docs/execution/README.md) before proposing broad product work.

## Development setup

```bash
git clone https://github.com/usebrick/platform.git
cd platform
corepack pnpm install
corepack pnpm --filter slopbrick typecheck
corepack pnpm --filter slopbrick build
```

SlopBrick is in `packages/slopbrick/`. Shared contracts live in
`packages/core/`; reusable scanning logic lives in `packages/engine/`.

The supported runtime lines are Node.js 22 and 24.

## Reporting a finding problem

Include:

1. `npx slopbrick --version`;
2. the exact command and relevant configuration;
3. the rule ID and complete message;
4. the smallest safe source snippet that reproduces the result;
5. the expected behavior and why;
6. whether the scan was complete, partial, or not applicable.

Remove secrets and proprietary context. A false positive is a rule-quality
bug, not evidence that the user should silence the scanner.

## Adding or changing a rule

### 1. Choose the closest current rule

Use the generated [rule catalog](./docs/rule-catalog.md), then inspect the
source and tests for the nearest behavior. Do not copy a hard-coded category
list from prose; the generated registry is authoritative.

Rules live at:

```text
src/rules/<category>/<rule-name>.ts
```

Prefer a small pure analyzer over `facts.v2`. The current rule shape is:

```ts
import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

interface Context {}

export const myRule = createRule<Context>({
  id: 'category/my-rule',
  category: 'visual',
  severity: 'medium',
  aiSpecific: false,
  description: 'Describe the observable implementation problem.',
  create(_context: RuleContext): Context {
    return {};
  },
  analyze(_context: Context, facts: ScanFacts): Issue[] {
    // Return exact, bounded findings from facts.v2.
    return [];
  },
});

export default myRule satisfies Rule<Context>;
```

Use `aiSpecific: true` only when the evidence supports an AI-associated signal.
It is still not an authorship verdict.

### 2. Add behavior tests

Add focused tests under `tests/rules/`. At minimum prove:

- the intended pattern fires;
- a nearby valid pattern does not fire;
- the reported location/message/advice is useful;
- unsupported file types or contexts do not accidentally fire;
- any auto-fix is deterministic, safe, and idempotent.

Copy a current neighboring test so parser/facts setup stays aligned with the
engine API.

Run the focused file while iterating:

```bash
corepack pnpm --filter slopbrick exec vitest run tests/rules/<test-file>.test.ts
```

### 3. Add user guidance

Every built-in rule needs a `RULE_HINTS` entry in
[`src/snippet/data.ts`](./src/snippet/data.ts). The full test suite verifies
that the registry and hint map agree.

### 4. Keep unmeasured rules default-off

Update [`src/rules/signal-strength.json`](./src/rules/signal-strength.json)
through the reviewed signal-strength workflow. A new rule must be schema-valid,
`defaultOff: true`, and explicitly marked as unmeasured/DORMANT until eligible
calibration exists. Do not invent precision, recall, FPR, lift, provenance, or
dates to satisfy the schema.

Promotion requires the active policy, including the required recall/false-
positive ratio and provenance/coverage gates. Historical v10.1 point estimates
are not v10.3 admission evidence.

### 5. Regenerate derived docs

```bash
corepack pnpm --filter slopbrick generate:rules
```

This regenerates the built-in registry and rule catalog. Do not hand-maintain
their totals.

### 6. Run proportional gates

During development:

```bash
corepack pnpm --filter slopbrick typecheck
corepack pnpm --filter slopbrick exec vitest run <focused-tests>
corepack pnpm --filter slopbrick build
```

Before a broad rule/engine change or release:

```bash
corepack pnpm --filter slopbrick test
corepack pnpm -r typecheck
corepack pnpm -r build
```

Test totals change. Do not copy a numeric total into a PR or document unless it
is explicitly a dated evidence snapshot.

## Code expectations

- TypeScript strict; avoid `any`, narrow `unknown`.
- Add explicit return types to exported functions.
- Keep I/O out of detection/scoring logic where possible.
- Reuse `@usebrick/core` and `@usebrick/engine` contracts.
- Use `facts.v2` rather than reparsing source in individual rules.
- Cite primary sources when a threshold or detector is research-derived.
- Keep explanations observable and actionable.
- Never describe code quality, a GitHub repository's age, or a rule firing as
  proof of AI or human provenance.

## Calibration contributions

Start at the live [calibration index](./docs/calibration/README.md). Corpus
records are useful only when their label, source, rights, immutable revision,
normalization, overlap, split, and denominator evidence pass the approved
method. Registered or quarantined files do not count as admitted units.

Do not commit private corpus source, local checkout paths, credentials, or raw
third-party evidence that the repository is not authorized to redistribute.

## Release process (maintainers)

SlopBrick is published only from a reviewed GitHub Release through the
protected OIDC workflow:

1. update `package.json` and `CHANGELOG.md`;
2. run root typecheck, full test, and build gates;
3. run and disposition the package-local self-scan;
4. commit and push the reviewed release;
5. tag it and create the GitHub Release;
6. approve/watch the protected publish job;
7. verify the public npm version.

A tag push alone does not publish. Never run `pnpm publish` or `npm publish`
locally.

## Code of conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). Be kind,
specific, and evidence-driven.

## License

Contributions are licensed under the [MIT License](./LICENSE).
