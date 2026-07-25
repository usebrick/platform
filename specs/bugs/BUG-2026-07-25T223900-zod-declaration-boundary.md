# BUG-2026-07-25T223900: Core Zod types leak into SlopBrick declaration bundling

## Problem

`corepack pnpm -r build` exits successfully but SlopBrick declaration bundling
emits repeated warnings that `ZodRecord`, `ZodObject`, `ZodNumber`, and related
types are not exported by Zod's CommonJS `external.cjs` entry.

Environment: macOS, Node v24.15.0, pnpm 9.15.0, branch
`codex/lock-001-new-debt` at `3ebfae5a7`.

## Root Cause Analysis

### Reproduce

Build Core, then SlopBrick. The SlopBrick DTS pass resolves private
`@usebrick/core` declarations and logs the Zod named-export warnings while
processing `packages/core/dist/index.d.ts`.

### Isolate

Core's facade exports `signalStrengthSchema`, whose inferred declaration is a
large concrete `z.ZodRecord<...>` type. SlopBrick imports that schema only to
call `.parse()`, while its DTS configuration resolves private `@usebrick/*`
packages into the published declaration. The final SlopBrick declaration does
not expose the schema, but the resolver still traverses the Zod type graph and
warns on the CJS boundary.

### Hypothesize

Replace the facade's concrete schema export with a typed
`parseSignalStrength(value: unknown)` function. Keep the schema available only
inside Core for implementation and package-internal schema tests. This should
preserve validation while removing all Zod types from Core's facade
declaration.

### Verify

The facade contract was first captured as a failing test in `659c1200a`: the
Core entry point did not provide `parseSignalStrength`. Implementation
checkpoint `40cb1778f` keeps the concrete Zod schema inside Core, exports only
the parser plus a plain `SignalStrengthEntry` interface, and routes SlopBrick
through that parser.

Verification after the implementation:

- Core tests pass 289/289.
- The affected SlopBrick signal-strength and policy matrix passes 39/39.
- Packed-consumer verification passes 9/9.
- Recursive typecheck, test, and build gates pass; SlopBrick remains 4,616
  passed tests with 18 intentional skips.
- Core's generated facade declarations contain no `zod`, `ZodRecord`, or
  `ZodObject` references.
- SlopBrick's CJS, ESM, and DTS builds complete without the former named-export
  warnings; both declaration outputs are 292.58 KB.

## Resolution

Validation behavior and the versioned signal-strength data contract are
unchanged. The public workspace facade now exposes behavior and a plain result
type instead of a validator-library implementation type. This keeps the private
package boundary reusable, prevents third-party declaration coupling, and
removes the warning without suppressing bundler diagnostics.
