# BUG-2026-07-25T211300: Current-policy projection breaks full-suite rule authority

## Problem

The recursive workspace test gate fails after the approved progressive evidence
policy is projected into runtime behavior. Fourteen failures either expect a
current default-off rule to run without an explicit opt-in or show that an
explicit repository severity does not override the current-policy default.

Environment: macOS, Node v24.15.0, pnpm 9.15.0, branch
`codex/lock-001-new-debt` at `9a4bafe24`.

## Root Cause Analysis

### Reproduce

`corepack pnpm -r test` completed with 4,601 passing tests and 15 failures.
Fourteen failures cluster in rule runtime/configuration assertions across
`cli.test.ts`, `explain-config.test.ts`, `incremental-cache-contract.test.ts`,
`maintenance-cost.test.ts`, `persistence-policy-authority.test.ts`,
`scan-completion.test.ts`, `test.test.ts`, `research/cli.test.ts`, and
`rules/registry.test.ts`.

### Isolate

`loadConfig()` correctly merges the repository's `rules` and calls
`bindExplicitRuleOverrides()`. It then spreads that bound object into a new
object to attach `policySources.allowedImports`. The provenance store is a
`WeakMap` keyed by object identity, so `getExplicitRuleOverrides()` receives an
unbound replacement object and returns an empty map. Direct policy accessors
and generated row metadata remain correct.

### Hypothesize

1. Repository-authored rule overrides are lost before current-policy runtime
   projection, so explicit `off` and explicit opt-in severities cannot win.
2. Some test fixtures correctly need explicit opt-ins because their selected
   rules are now current-default-off under the approved policy matrix.
3. Generated registry metadata differs from the approved policy projection.

Hypothesis 1 is confirmed. Hypothesis 2 explains why the now-empty provenance
has broad effects, but the affected tests already provide explicit repository
overrides. Hypothesis 3 is falsified by the passing current-evidence-policy
contract tests and the generated rows that still declare the expected runtime
outcomes.

### Verify

Focused regression
`tests/config/lock-policy-source.test.ts` loads a config with an explicit
`component/giant-component` opt-in. The resolved config contains the merged
severity but `getExplicitRuleOverrides()` returns `{}`. This directly confirms
that the final object replacement, introduced while attaching Lock policy
provenance, is the root cause. The repair must bind provenance to the final
returned object and retain the trusted policy-source annotation.

## Resolution

`loadConfig()` now constructs the final resolved configuration, including
`policySources`, before binding explicit rule overrides to that exact object.
The red regression is checkpointed at `b3d170b5c`; the repair is checkpointed
at `0b28d9c73`.

Verification after the repair:

- the focused Lock/config matrix passes 75/75 tests across eight files;
- the complete SlopBrick suite passes 4,616 tests with 18 intentional skips;
- Core, Engine, and Website pass 288, 150, and 54 tests respectively; and
- recursive typecheck and build pass.

No current-policy rule authority, registry row, or repository override was
changed to make the suite pass. The correction preserves the approved policy
projection and restores only the lost explicit repository provenance.
