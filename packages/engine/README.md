# @usebrick/engine

The scanning engine extracted from `slopbrick`. The package root preserves
Node compatibility adapters; pure parsing and scoring functions are available
from the explicit `@usebrick/engine/pure` subpath.

This is a private implementation package, not a separately shipped product.
SlopBrick is the scanner and user-facing front door; the engine is reused by
the CLI, MCP surface, and future platform layers.

> **v0.15.0:** Extracted from `slopbrick/src/engine/`. The engine is now its
> own workspace package, consumed by `slopbrick` as a workspace dep. The
> pure-function surface is a separately testable public API. The root entry
> point remains a Node-oriented compatibility API.

## What lives here

Pure functions that:
- read structured inputs (parsed ASTs, signal-strength data, calibration)
- produce structured outputs (LRs, scores, classifications)
- have no filesystem, network, or process side effects

`@usebrick/engine/pure` is host/editor-safe: it has no filesystem discovery,
`globby`, process-control, or console dependency. It is not a browser
portability guarantee because SWC and Node-compatible crypto/path dependencies
remain deliberate requirements. The root package retains explicit Node adapters
for existing CLI callers.

## What does NOT live here

CLI orchestration, process control (`process.exit`, `process.argv`), and
stdout/stderr (`console.log`) remain in the slopbrick CLI and MCP server.

## Public APIs

### Pure API (`@usebrick/engine/pure`)

- `parseSource(source, filePath)` — parse text supplied by the host
- `extractSignatures(source, filePath, workspaceDir)`,
  `fingerprintSignature(signature)`, and `signatureSimilarity(a, b)`
- `computeLikelihoodRatios(ruleIds, signalData, corpus?)` and
  `bayesianPosterior(firedRuleIds, likelihoodRatios, prior?)`
- pure graph, distribution, novelty, scoring, and statistical helpers
  (the two-sample KS helper uses the exact pooled-label distribution for
  integer samples with combined size ≤ 40 and an asymptotic fallback above it)

The exact runtime export contract is enforced by
[`tests/pure-api.test.ts`](./tests/pure-api.test.ts). These runnable, compiled
examples are the documentation source for the three most common calls:

- [`examples/pure-parse.ts`](./examples/pure-parse.ts)
- [`examples/pure-signatures.ts`](./examples/pure-signatures.ts)
- [`examples/pure-likelihood.ts`](./examples/pure-likelihood.ts)

### Node compatibility API (`@usebrick/engine`)

- `parseFile(filePath, opts?)` — compatibility filesystem adapter with optional AST cache
- `findSimilarFunctions(query, options?)` — workspace adapter that reads files
- `saveInventory`, `readRuns`, and `appendRun` — persistence adapters
- `buildInventoryFromScan`, `buildConstitutionFromConfig`, and
  `buildHealthFromReport` remain root-only until their `@usebrick/core`
  runtime I/O dependency is separated.

## Build dependency

`slopbrick` imports `@usebrick/engine` (instead of `src/engine/`). The build order is:
1. `@usebrick/core` (no deps)
2. `@usebrick/engine` (deps: `@usebrick/core`)
3. `slopbrick` (deps: `@usebrick/core`, `@usebrick/engine`)

## Status

The root compatibility API and pure subpath have independent exact export
contracts. Package typecheck, examples, and both contracts must pass before
changing public exports.

Product priorities and active delivery status live in the root
[`ROADMAP.md`](../../ROADMAP.md) and [`docs/execution/`](../../docs/execution/).

## Runtime support

The engine follows the platform runtime policy: Node.js 22 or 24
(`^22.0.0 || ^24.0.0`). The packed-consumer matrix exercises both lines.

## License

[MIT](../../LICENSE)
