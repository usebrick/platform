# Architectural Refactor — usebrick/platform

**Date**: 2026-06-26
**Status**: Approved — proceeding to implementation plan
**Scope**: `packages/core/`, `packages/slopbrick/`, `packages/engine/` (new), `packages/website/`
**Effort estimate**: 1-2 days across 7 sub-projects (A, B, C, D, E, F, G) — G1 dropped per Q4
**Author**: dystx (post-v0.14.5 audit, brainstorming session with Kimi Code CLI)

---

## Executive Summary

The v0.14.5 publish run surfaced a real architectural problem: the verdict taxonomy (`USEFUL`/`OK`/`NOISY`/`INVERTED`/`HYGIENE`/`DORMANT`) lives in `signal-strength.json` as raw strings, but the TypeScript type `SignalStrength` in `packages/slopbrick/src/rules/signal-strength.ts` does not include a `verdict` field. Eight source files reference verdict strings with no type-safety. Five tests broke when the v7 calibration flipped HYGIENE from `defaultOff: true` to "implicit defaultOn" because the tests were pinned to v6 contract counts.

The 5 broken tests were a **symptom, not the disease**. The disease is loose coupling between the calibration contract (JSON), the type (TS), and the test assertions.

This spec decomposes the full sweep into **7 independent sub-projects** (A–G) that can ship in any order. Each is self-contained and has its own acceptance criteria. **The user can pick which to do in a session, and the rest can be deferred without blocking the chosen ones.**

---

## Background — What the Audit Found

### P0: Verdict taxonomy is loosely coupled

**File**: `packages/slopbrick/src/rules/signal-strength.ts:19-43`

```ts
export interface SignalStrength {
  recall: number;
  fpRate: number;
  ratio: number;
  precision: number;
  lastCalibratedAt: string;
  defaultOff?: boolean;  // ← present
  // verdict: Verdict;   ← MISSING
}
```

The `verdict` field exists in the JSON (32 USEFUL, 24 HYGIENE, 12 DORMANT, 6 OK, 5 NOISY, 1 INVERTED) but is **not in the TS type**. Tests and 8 source files reference `entry.verdict === 'HYGIENE'` without compiler checking. The v6→v7 contract flip (HYGIENE went from `defaultOff: true` to "absent = defaultOn") broke:

- `tests/engine/signal-strength-guardrails.test.ts:102` (USEFUL count: 13 → 32)
- `tests/engine/signal-strength-guardrails.test.ts:111` (INVERTED count: 0 → 1)
- `tests/engine/signal-strength-guardrails.test.ts:131` (every HYGIENE defaultOff: 23 offenders)
- `tests/engine/lr-combiner.test.ts:224, 249` (used rules that are no longer INVERTED)

**Root cause**: No single source of truth for the verdict enum. JSON is the de-facto source, but tests and code reach into it as if it were typed, with no enforcement.

### P1: Engine/CLI coupling

`packages/slopbrick/src/cli/scan.ts` is 1469 lines. `src/cli/program.ts` is 1617 lines. The `src/engine/` directory (worker, pool, lr-combiner, parser, memory) is the actual scanning logic, but the CLI files import across the boundary, log to console, call `process.exit`, and write files directly. The pure-vs-impure boundary is fuzzy.

`src/mcp/` (the MCP server) likely also reaches into CLI internals, not into `engine/`. **Cannot verify without a full read** — flagged for Sub-project B.

### P1: Schema/type drift

`packages/core/` has `schemas/v1/*.json` (the cross-language contract per AGENTS.md) AND `src/memory-types.ts` (the TS types). They appear hand-maintained, not codegen'd. A schema change without a type change (or vice versa) is a silent bug.

### P1: Website WebGL cleanup is incomplete

`packages/website/src/scripts/brick-shader.ts:178` returns a cleanup function that calls `cancelAnimationFrame`, `removeEventListener`, and `ro.disconnect()`. But the **WebGL context is never destroyed** — `gl.getExtension('WEBGL_lose_context')?.loseContext()` is never called. This leaks GPU memory on every navigation that hydrates/unhydrates the canvas.

### P1: Website low-power detection is naive

`packages/website/src/components/BrickShader.astro` checks `navigator.hardwareConcurrency < 4` to fall back to the static SVG. But this misses:
- Mobile devices that report high core counts but throttle
- Laptops on battery with reduced GPU clocks
- The combination of `deviceMemory < 4` + `prefers-reduced-motion` + low-end GPU

The current heuristic is a screen-size check (max-width 720px) which is unrelated to actual rendering capability.

### P1: Tool cards are not keyboard-accessible

`packages/website/src/components/ToolCard.astro` renders `<article class="tool-card">` with a click handler in `break-on-hover.ts`. The `<article>` has no `role="button"`, no `tabindex`, no keyboard handler. Keyboard users cannot trigger the break animation. Screen readers do not announce it as interactive.

### P2: scan.ts and program.ts are too long

1469 lines in `scan.ts` + 1617 in `program.ts` = 3086 lines across two files. The internal structure has clear sections (config loading, scan orchestration, rule filtering, report generation, MCP wiring) that could be extracted.

### P2: Documentation is sparse

`packages/core/` has no `docs/` directory. The `docs/` at monorepo root has 2 files (future-extractions + old-repo-redirect), neither about architecture. The token block in `packages/website/src/styles/global.css` is documented in CSS comments but not discoverable as a "design system".

---

## Goals & Non-Goals

### Goals
- **G1**: Make the verdict taxonomy a **typed contract** so future calibration flips cannot silently break consumers.
- **G2**: Make the `core/` JSON Schemas the **single source of truth** for both TS types and (eventually) Python/Go types.
- **G3**: Eliminate the **engine/CLI coupling** so the scanning engine is testable without spawning a CLI process.
- **G4**: Fix the **website's WebGL + a11y + low-power** gaps so the marketing site works on every device.
- **G5**: Document the **architecture** at the monorepo, package, and design-system level.

### Non-Goals
- **NG1**: Adding new rules, new scores, or new features. This is a refactor, not a feature sprint.
- **NG2**: Breaking the v0.14.5 npm API. All public exports from `slopbrick` and `@usebrick/core` must remain backward-compatible.
- **NG3**: Migrating to a different framework (no React, no Bun, no Deno). TypeScript + Node 18+ stays.
- **NG4**: Splitting the monorepo. The 3 packages stay in `usebrick/platform` with workspace deps.
- **NG5**: Adding new tests beyond what's needed to verify the refactor. Test count goes up by 10-20, not 100+.

---

## Sub-project A: Verdict Type Safety (P0 — ships first)

**Estimated time**: 2-3 hours
**Files touched**: ~6
**Dependencies**: None
**Risk**: Low (additive change; can ship even if B–G are deferred)

### Problem
The `SignalStrength` interface in `packages/slopbrick/src/rules/signal-strength.ts` is missing the `verdict` field that exists in `signal-strength.json`. Eight source files reference verdict strings with no type-safety. Five tests broke because the v7 calibration flipped the meaning of `defaultOff` for HYGIENE rules.

### Design

**A1. Move the verdict enum to `core/` as a single source of truth.**

New file: `packages/core/src/verdicts.ts`:
```ts
/**
 * v0.14.5+: Single source of truth for the verdict taxonomy.
 * Adding a new verdict is a breaking change — bump MEMORY_SCHEMA_VERSION
 * (or a new VERDICT_SCHEMA_VERSION constant) and update the Zod schema.
 */
export const VERDICTS = [
  'USEFUL',     // high precision + high lift, defaultOn
  'OK',         // moderate signal, defaultOn
  'NOISY',      // fires on both classes, defaultOff
  'INVERTED',   // fires MORE on negative class, defaultOff
  'HYGIENE',    // non-AI quality check, defaultOn in v7+
  'DORMANT',    // never fires, defaultOff
] as const;

export type Verdict = typeof VERDICTS[number];

/** Property test: is this verdict opt-out by default? */
export function isDefaultOff(verdict: Verdict): boolean {
  return verdict === 'NOISY' || verdict === 'INVERTED' || verdict === 'DORMANT';
}
```

**A2. Add the `verdict` field to `SignalStrength` in `core/src/memory-types.ts`.**

```ts
import type { Verdict } from './verdicts';

export interface SignalStrength {
  recall: number;
  fpRate: number;
  ratio: number;
  precision: number;
  lastCalibratedAt: string;
  verdict: Verdict;                    // ← ADDED, required
  defaultOff?: boolean;                // ← only present if user opted out
}
```

**A3. Add a Zod schema in `core/` to validate `signal-strength.json` at load time.**

New file: `packages/core/src/signal-strength-schema.ts`:
```ts
import { z } from 'zod';
import { VERDICTS } from './verdicts';

export const signalStrengthSchema = z.record(
  z.string(),                                     // ruleId
  z.object({
    recall: z.number().min(0).max(1),
    fpRate: z.number().min(0).max(1),
    ratio: z.number(),
    precision: z.number().min(0).max(1),
    lastCalibratedAt: z.string().datetime(),
    verdict: z.enum(VERDICTS),                   // ← typed
    defaultOff: z.boolean().optional(),          // ← only if user opts out
  }),
);
```

Add `zod` to `packages/core/package.json` dependencies.

**A4. Have `packages/slopbrick/src/rules/signal-strength.ts` re-export the type from `core/`.**

```ts
import type { SignalStrength, Verdict } from '@usebrick/core';
import { isDefaultOff } from '@usebrick/core';
import signalStrengthData from './signal-strength.json' with { type: 'json' };
import { signalStrengthSchema } from '@usebrick/core';

// Validate at load time. Throws on contract violation.
const parsed = signalStrengthSchema.parse(signalStrengthData);

export type { SignalStrength, Verdict };

// Replace ad-hoc getDefaultOffRules() with property test.
export function getDefaultOffRules(): Set<string> {
  const out = new Set<string>();
  for (const [ruleId, strength] of Object.entries(parsed)) {
    if (strength.defaultOff === true || isDefaultOff(strength.verdict)) {
      out.add(ruleId);
    }
  }
  return out;
}
```

**A5. Replace the 5 broken exact-count tests with property-based assertions.**

In `tests/engine/signal-strength-guardrails.test.ts`:
- Replace `expect(useful).toBe(13)` with `expect(useful).toBeGreaterThan(20)` and document the minimum.
- Replace `expect(inverted).toBe(0)` with `expect(inverted).toBeLessThanOrEqual(5)` (some noise is OK; what we care about is "not all rules are inverted").
- Replace "every HYGIENE is defaultOff" with a property: "every INVERTED/NOISY/DORMANT is defaultOff (or absent)" — this is the v7 invariant.
- Add a new property test: "every defaultOff rule has ratio < 1 OR verdict in {NOISY, INVERTED, DORMANT}" — the property is what the consumer actually relies on.

In `tests/engine/lr-combiner.test.ts`:
- The "INVERTED fires decrease posterior" test was already rewritten to use low-LR rules. Add a property: "firing only rules with ratio < 1 moves the posterior below 0.5" — does not depend on which specific rules are INVERTED in any given calibration.

**A6. Add a test that catches future contract drift.**

In `tests/integration/calibration-contract.test.ts` (new):
- "every rule in signal-strength.json passes Zod validation"
- "every rule in builtins.ts has a signal-strength entry"
- "every verdict value is in the VERDICTS enum"
- "the type of `verdict` in `SignalStrength` matches the JSON"

### Acceptance criteria for A
- `pnpm --filter @usebrick/core build` succeeds.
- `pnpm --filter @usebrick/slopbrick test` passes all 4 critical test files (signal-strength-guardrails, lr-combiner, signal-strength, severity-contract) — already verified at 41/41 after the v6→v7 fix; now add the new contract test.
- A new calibration flip (manually test: change one verdict in the JSON) causes **only the new property test to flag** it, not the 5 tests that broke last time.
- The `defaultOff` field is no longer load-bearing for HYGIENE — it only indicates user opt-out.

### Risk mitigation
- The Zod parse is at load time and will throw if the JSON is invalid. To make the error message friendly, wrap in try/catch and rethrow with "signal-strength.json contract violation: <details>".
- The change is additive (adding a required field) — the v7 JSON already has `verdict` on every entry, so no migration needed.
- The test refactor is non-breaking — old tests stay green (already verified).

---

## Sub-project B: Engine/CLI Boundary (P1)

**Estimated time**: 4-6 hours
**Files touched**: 30+ (mostly imports)
**Dependencies**: None
**Risk**: Medium (large refactor across the engine/CLI boundary)

### Problem
`src/cli/scan.ts` (1469 lines) and `src/cli/program.ts` (1617 lines) contain the CLI surface. `src/engine/` contains the pure scanning logic. The boundary is fuzzy: the CLI imports from `engine/`, but also reaches into `engine/`'s internals via ad-hoc imports. The MCP server (`src/mcp/`) likely also reaches into CLI internals, not into `engine/`. This makes `engine/` untestable in isolation and forces any tool that wants to use the scanner to depend on the CLI.

### Design

**B1. Define the engine's public API explicitly.**

New file: `packages/slopbrick/src/engine/index.ts`:
```ts
// The pure scanning engine. No I/O, no console.log, no process.exit.
// All public functions are pure or return a Result<, Error>.

export { scanProject, type ScanResult, type ScanOptions } from './scanner';
export { loadMemory, saveMemory, type MemoryFile } from './memory';
export { combineFireSet, computeLikelihoodRatios, type RuleLikelihoodRatio } from './lr-combiner';
export { parseFile, detectSyntax, type ParsedFile } from './parser';
// ... 10-15 more exports

// Internal helpers are NOT exported. If a consumer needs them, that's
// a signal the engine surface is wrong.
```

**B2. Move all `console.log` / `process.exit` / file I/O out of `engine/`.**

Audit pattern: `grep -rn "console\.\|process\." packages/slopbrick/src/engine/`. Each match is either (a) a real violation to fix, or (b) a diagnostic log that moves to a `--verbose` callback parameter.

The new `ScanOptions` interface includes:
```ts
export interface ScanOptions {
  // ... existing options
  /** Called with progress messages; consumer decides how to display. */
  onProgress?: (msg: ProgressEvent) => void;
  /** Called with error events; engine never throws on recoverable errors. */
  onError?: (err: ScanError) => void;
}
```

**B3. The CLI becomes a thin wrapper.**

`src/cli/scan.ts` shrinks from 1469 lines to ~300 lines. It parses argv, calls `engine.scanProject()`, formats the result. The 1169 lines of "what to do with the result" move to `src/report/`.

**B4. The MCP server imports from `engine/`, not from `cli/`.**

`src/mcp/patterns.ts` currently imports from `src/cli/scan.ts` for the rule definitions. Move the rule definitions to `src/rules/` (already there) and have the MCP server import directly from `engine/`.

**B5. Add `src/engine/__tests__/api.test.ts`** — a snapshot of the public API surface. New exports require updating this test, making API changes reviewable.

### Acceptance criteria for B
- `src/cli/scan.ts` ≤ 500 lines
- `src/cli/program.ts` ≤ 800 lines
- `src/engine/index.ts` exports only public functions; internal helpers stay private
- `engine/` has zero `console.log` / `process.exit` / `fs.writeFile` calls
- A new tool (e.g. a future `slopbrick doctor`) can be built using only `engine/index.ts` + `report/`, without touching `cli/`
- All existing tests still pass

### Risk mitigation
- Do this in a separate branch. The CLI is the user-facing surface; even a minor regression breaks the npm release.
- Add a "compatibility" test that invokes the CLI binary and compares its stdout to a known-good baseline.
- Keep the old CLI files as `src/cli/scan-legacy.ts` for one release cycle, then delete.

---

## Sub-project C: Core Schema ↔ TS Codegen (P1)

**Estimated time**: 3-4 hours
**Files touched**: ~10
**Dependencies**: A (verdict type safety enables the codegen)
**Risk**: Low (additive; doesn't change the schemas)

### Problem
`packages/core/schemas/v1/*.json` (4 schemas) are the cross-language contract per AGENTS.md. `packages/core/src/memory-types.ts` is a hand-maintained TypeScript mirror. They drift. The schemas are the public API; the TS types are an internal implementation detail of the slopbrick consumer.

### Design

**C1. Add a codegen script.**

New file: `packages/core/scripts/codegen-types.ts`:
```ts
/**
 * Read each schema in schemas/v1/*.json, generate a TypeScript interface
 * in src/generated/<name>.ts. Run via `pnpm --filter @usebrick/core codegen`.
 *
 * The generated types are the public API. The hand-written types in
 * src/memory-types.ts are deprecated in favor of the generated ones.
 */
```

Uses `json-schema-to-typescript` (npm package, well-maintained). Output:
- `src/generated/inventory.ts` → `InventoryFile`
- `src/generated/constitution.ts` → `ConstitutionFile`
- `src/generated/memory.ts` → `MemoryFile`
- `src/generated/health.ts` → `HealthFile`

**C2. Make `src/memory-types.ts` re-export the generated types.**

```ts
export type { InventoryFile } from './generated/inventory';
export type { ConstitutionFile } from './generated/constitution';
export type { MemoryFile } from './generated/memory';
export type { HealthFile } from './generated/health';
```

This preserves the public API. The next major version can drop the hand-written types entirely.

**C3. Add a pre-commit hook (or CI check) that fails if a schema changes without a generated type regen.**

In `packages/core/package.json`:
```json
{
  "scripts": {
    "codegen": "tsx scripts/codegen-types.ts",
    "prebuild": "pnpm codegen && tsup",
    "test:contract": "tsx scripts/verify-codegen-fresh.ts"
  }
}
```

`verify-codegen-fresh.ts` regenerates types and `git diff`s against the committed versions. Fails CI if there's an uncommitted diff.

**C4. Document the codegen contract in `packages/core/README.md`.**

Add a section explaining:
- Schemas are the source of truth
- TS types are generated; do not hand-edit
- To add a new field: add it to the schema (optional with default), run `pnpm codegen`, commit both

### Acceptance criteria for C
- `pnpm --filter @usebrick/core codegen` regenerates all 4 type files
- `pnpm --filter @usebrick/core build` succeeds
- The hand-written types in `src/memory-types.ts` are re-exports (no logic change for consumers)
- A new schema field can be added by editing ONLY the JSON, then running codegen
- CI fails if schemas and types are out of sync

### Risk mitigation
- The hand-written types have a richer surface (TSDoc, branded types, helper functions). The generated types are mechanical. To preserve the rich surface, the generated types are re-exported with additional TSDoc and helper functions layered on top.
- Run codegen as part of the publish workflow, not just the build, so a stale regen cannot ship.

---

## Sub-project D: WebGL/Animation Hardening (P1, website)

**Estimated time**: 2-3 hours
**Files touched**: 5
**Dependencies**: None
**Risk**: Low (additive fixes to existing scripts)

### Problem
The website's WebGL hero, click-to-break tool cards, smooth scroll, reveal animations, and counting stats are all newly written. They have:
- Incomplete cleanup (WebGL context leak)
- Naive low-power detection (screen size, not hardware capability)
- No debounce on rapid clicks
- Tool cards not keyboard-accessible

### Design

**D1. Properly destroy the WebGL context on unmount.**

In `brick-shader.ts`:
```ts
return () => {
  cancelAnimationFrame(raf);
  window.removeEventListener('resize', resize);
  window.removeEventListener('mousemove', onMouse);
  window.removeEventListener('scroll', onScroll);
  ro.disconnect();
  // Destroy the WebGL context to free GPU memory.
  const ext = gl.getExtension('WEBGL_lose_context');
  if (ext) ext.loseContext();
};
```

**D2. Add a `LowPowerDetector` to `src/scripts/low-power.ts`** (new file).

```ts
/**
 * Returns true if the device is likely too low-power to render the
 * WebGL brick shader smoothly. Combines:
 *   - hardwareConcurrency (CPU cores)
 *   - deviceMemory (GB)
 *   - prefers-reduced-motion (user preference)
 *   - canvas.getContext('webgl') failure
 *   - devicePixelRatio > 2 (high-DPI displays are GPU-hungry)
 *
 * Conservative: returns true on any unknown signal. False positives
 * mean a static SVG hero; false negatives mean a janky WebGL hero.
 * We optimize for the former.
 */
export function isLowPower(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  if (navigator.deviceMemory !== undefined && navigator.deviceMemory < 4) return true;
  if (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency < 4) return true;
  if (window.devicePixelRatio > 2) return true;
  // Test WebGL availability without creating a real context
  const test = document.createElement('canvas');
  const gl = test.getContext('webgl') || test.getContext('experimental-webgl');
  if (!gl) return true;
  return false;
}
```

`BrickShader.astro` calls `isLowPower()` instead of the current naive check.

**D3. Add rapid-click debounce to `break-on-hover.ts`.**

Current: each click fires a new animation. If user clicks 5 times in 1 second, the SVG line lengths get overwritten mid-animation, looking glitchy.

```ts
const onClick = (e: MouseEvent) => {
  if (Date.now() - lastClickAt < 200) return; // debounce
  lastClickAt = Date.now();
  // ... rest of the handler
};
```

**D4. Add tool card a11y: button role + keyboard.**

In `ToolCard.astro`:
```astro
<article
  class="tool-card"
  data-tool={name}
  role="button"
  tabindex="0"
  aria-label={`Trigger crack animation on ${name} card`}
>
```

In `break-on-hover.ts`:
```ts
card.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onClick(e as unknown as MouseEvent);
  }
});
```

Add focus-visible CSS:
```css
.tool-card:focus-visible {
  outline: 2px solid var(--text-accent);
  outline-offset: 2px;
}
```

**D5. Add a skip-to-content link.**

In `Base.astro`:
```astro
<a class="skip-to-content" href="#top">Skip to content</a>
```

In `global.css`:
```css
.skip-to-content {
  position: absolute;
  top: -100px;
  left: 1rem;
  z-index: 100;
  padding: 0.5rem 1rem;
  background: var(--text-accent);
  color: var(--text-on-accent);
  border-radius: var(--radius);
  font-weight: 600;
  transition: top 0.2s var(--ease-out);
}
.skip-to-content:focus {
  top: 1rem;
}
```

### Acceptance criteria for D
- `pnpm --filter @usebrick/website build` succeeds
- `pnpm --filter @usebrick/website dev` shows a skip link when tabbed
- A keyboard user can Tab to a tool card, press Enter, and trigger the break animation
- WebGL canvas on a low-power mobile device shows the static SVG picture
- Rapid clicks on a tool card do not glitch
- WebGL context is destroyed when the user navigates away (verify with Chrome DevTools memory snapshot)

### Risk mitigation
- The WebGL context destroy is a no-op on browsers that don't support the extension. Wrap in try/catch.
- The debounce threshold (200ms) is conservative; can be tuned.

---

## Sub-project E: WebGL Brick Shader Improvement (P2, website)

**Estimated time**: 1-2 hours
**Files touched**: 1
**Dependencies**: D (the LowPowerDetector feeds into the shader skip logic)
**Risk**: Low (visual polish; the static SVG fallback already exists)

### Problem
The current shader renders a uniform brick pattern — every brick is the same color, no per-brick variation, no realistic texture. This is acceptable for a hero background but feels artificial up close.

### Design

**E1. Add per-brick jitter to the shader.**

In the fragment shader:
```glsl
// Hash function for per-brick pseudo-random
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  // ... existing brick cell calculation
  float brickSeed = hash(cell);
  vec3 brickColor = mix(
    vec3(0.42, 0.18, 0.10),
    vec3(0.72, 0.35, 0.18),
    uv.y + brickSeed * 0.15  // ← per-brick variation
  );
  // ... existing mortar + composite
}
```

This gives every brick a slightly different shade, breaking the "wallpaper" look.

**E2. Add a "shader compile error" fallback.**

If `gl.getShaderInfoLog(fs)` is non-empty after compile, swap to the static SVG picture:
```ts
if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
  console.error('fragment shader:', gl.getShaderInfoLog(fs));
  canvas.style.display = 'none';
  wrap.querySelector('picture')!.style.display = 'block';
  return () => {};
}
```

(Already present in the current code, but only logged to console. The fallback swap is missing.)

### Acceptance criteria for E
- The shader visually shows per-brick variation on a desktop browser
- A bad shader edit (intentionally broken) triggers the static SVG fallback

---

## Sub-project F: Documentation Pass (P1)

**Estimated time**: 2-3 hours
**Files touched**: 3-4 (new markdown files)
**Dependencies**: None
**Risk**: None (docs only)

### Problem
The monorepo has good inline TSDoc in some files and zero in others. The architecture (3 packages, their relationships, the data flow) is implicit. New contributors must read code to understand the structure.

### Design

**F1. Add `docs/architecture.md` at the monorepo root.**

Sections:
- Monorepo layout (3 packages + 1 root)
- Data flow: `slopbrick scan` → `core` writes `.slopbrick/{inventory,constitution,memory,health}.json` → MCP server reads them
- Build order: `core` first (workspace dep), then `slopbrick`, then `website`
- Release cadence: per-package versions, no lock-step
- How to add a new rule (the contract: implement FactExtractor, register in builtins.ts, add signal-strength entry, add rule hint, add test)

**F2. Add `packages/core/docs/public-api.md`.**

The public exports of `@usebrick/core` are spread across `src/index.ts`, `src/memory-types.ts`, and the schemas. A single doc page listing the surface makes the contract discoverable.

**F3. Add `packages/website/docs/design-system.md`.**

The design system (tokens, components, patterns) is currently only in CSS comments. A markdown doc captures:
- Color tokens (with hex values + usage)
- Spacing scale
- Typography
- Component patterns (Nav, Hero, ToolCard, etc.)
- Accessibility notes
- How to add a new component

**F4. Add a `CONTRIBUTING.md` at the monorepo root.**

Sections:
- The AGENTS.md compliance checklist (already in AGENTS.md, but CONTRIBUTING is the discoverable file for new contributors)
- The "rules" of contributing: tests must pass, typecheck must pass, conventional commits
- How to run the full quality gate: `pnpm -r typecheck && pnpm -r test && pnpm -r build`

### Acceptance criteria for F
- All 4 markdown files exist and are linked from README.md
- A new contributor can find the architecture, public API, design system, and contributing rules from the repo root

---

## Sub-project G: Performance Audit (P2)

**Estimated time**: 2-3 hours
**Files touched**: 3-4
**Dependencies**: D (the WebGL fixes enable the perf budget work)
**Risk**: Medium (can regress visuals if not careful)

### Problem
The website bundle is 53.5 kB gzipped (141 kB raw). The hero canvas is 100vh of WebGL. Lighthouse score unknown. There are two specific perf improvements that don't require removing dependencies:
- The WebGL canvas paints on first load, which is expensive; the user sees a blank canvas until the shader compiles.
- The brick pattern is inlined as a data URI in 2 CSS files, so the browser can't cache it across page loads.

**GSAP stays.** The 5-line RAF replacement was considered and rejected (Q4 user decision): the bundle is already small for a marketing site, the shake animation is a delight (not a critical path), and `elastic.out(1, 0.3)` is non-trivial to reimplement correctly. Removing GSAP for 41 kB would regress animation quality for a non-problem.

### Design

**G1. SKIPPED (per Q4 user decision — keep GSAP).** The 5-line RAF replacement code is documented in the spec appendix for future reference, but not implemented.

**G2. Render the WebGL hero as a static image on first paint, hydrate to WebGL after LCP.**

Currently the WebGL canvas paints on first load, which is expensive. The first paint shows a blank canvas (with the `--surface-0` background) until the shader compiles.

Change: render the static SVG picture first (CSS), then after the Largest Contentful Paint event, swap to the WebGL canvas:
```ts
// In BrickShader.astro
const lcpPromise = new Promise<number>((resolve) => {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      resolve(entry.startTime);
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
});

lcpPromise.then(() => {
  // Now swap the static SVG for the WebGL canvas
  picture.style.display = 'none';
  canvas.style.display = 'block';
  initBrickShader(canvas);
});
```

**G3. Inline the brick pattern SVG as a `<link rel="preload">`.**

Currently the brick pattern is inlined as a data URI in 2 CSS files. The browser can't cache it. Move to a single `<link rel="preload" as="image" href="/brick-pattern.svg">` in `<head>`, then reference the URL in CSS.

### Acceptance criteria for G
- First paint shows the static SVG; WebGL kicks in after LCP (target: < 2.5s LCP)
- The brick-pattern SVG is fetched once and cached across navigations
- No visual regression on desktop
- GSAP stays in the bundle (no change)

### Risk mitigation
- The LCP-swap is purely additive. If the WebGL never kicks in (LCP never fires), the user sees the static SVG only.
- The preload link is a browser hint, not a hard requirement. If the SVG fails to fetch, the page falls back to the data URI.

---

## Sequencing & Dependencies

```
A (verdict type)  ←  ship first, no deps, P0 fix
       ↓
C (schema codegen) ←  needs A's Zod schema
B (engine/CLI)     ←  independent, can run parallel to A and C
D (web hardening)  ←  independent, can run parallel to A/B/C
E (shader polish)  ←  needs D's LowPowerDetector
F (docs)           ←  independent, can run anytime
G (perf)           ←  needs D's WebGL fixes
```

**Suggested order for a single session that wants to do A + D + F** (the "good shape" sweep from the previous question):
1. **A** (2-3h) — type safety, the P0 fix
2. **D** (2-3h) — WebGL + a11y, the website hardening
3. **F** (2-3h) — docs, the durable artifact

**For a full sweep across all 7** (the user's current choice):
- Day 1 morning: A + F (A unblocks C, F is independent)
- Day 1 afternoon: D + B start (D is website, B is slopbrick)
- Day 2 morning: C + B finish
- Day 2 afternoon: E + G

The user can pick any subset and ship it as one or more PRs to `v0.14.5d`.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A breaks the build because a v7 JSON entry is missing a required field | Low | Medium | The v7 JSON already has `verdict` on every entry (verified). Zod parse will catch any drift. |
| B regresses the CLI because the engine refactor is large | Medium | High | Do B in a separate branch with a compatibility shim. Add a CLI smoke test that compares stdout to a baseline. |
| C's generated types differ subtly from the hand-written ones | Medium | Medium | The hand-written types become re-exports of the generated types. Consumers see no change. |
| D's WebGL context destroy breaks on some browser | Low | Low | The `WEBGL_lose_context` extension is supported on all major browsers. Wrap in try/catch. |
| E's per-brick jitter makes the wall look "noisy" instead of "brick" | Medium | Low | Easy to revert. A/B test with a flag. |
| F's docs are wrong or out of date | Low | Low | Docs are docs. Update in follow-up PRs. |
| G's GSAP replacement loses animation quality | Medium | Medium | Keep GSAP in a sub-import for now; replace only the shake. Compare visually before/after. |

---

## Acceptance Criteria for the Whole Sweep

When all 7 sub-projects ship:
- The verdict taxonomy is a typed, validated contract — future calibration flips cannot silently break consumers
- The engine/CLI boundary is explicit; the engine is reusable from non-CLI tools (MCP, future web IDEs)
- The core schemas drive the TS types via codegen; no more hand-maintained drift
- The website works on every device (a11y, low-power, debounced)
- The architecture is documented and discoverable
- Bundle size stays at 53.5 kB gzipped (GSAP stays); WebGL LCP-swap brings the first paint under 2.5s

---

## Open Questions for User Review

## Decisions (resolved 2026-06-26)

All 5 open questions have been resolved:

1. **Q1 (engine extraction)**: **Clean break → `packages/engine/`**. New workspace package. Engine becomes a real product surface reusable from non-CLI tools.
2. **Q2 (generated types)**: **Public**. Generated types ARE the public API; the JSON Schemas ARE the contract. A schema bump is an immediate breaking change (semver major).
3. **Q3 (a11y testing)**: **axe-core via Playwright in CI**. New dev dep in `packages/website/`. Runs on every PR to catch regressions.
4. **Q4 (GSAP removal)**: **SKIPPED**. GSAP stays in the bundle. The 5-line RAF replacement was considered and rejected — the bundle is already small (53.5 kB gzipped) for a marketing site, the shake is a delight (not a critical path), and `elastic.out(1, 0.3)` is non-trivial to reimplement. Removing GSAP for 41 kB would regress animation quality for a non-problem. Sub-project G1 is removed from scope; G2 (LCP-swap) and G3 (preload brick pattern SVG) remain.
5. **Q5 (session scope)**: **All 7, 1-2 days, this session**. Big lift; may need to pause mid-way and resume tomorrow. Spec is approved; implementation plan will follow.

## Implementation Order (per the decisions)

```
Phase 1 (P0, ship first):
  A — verdict type safety + Zod schema + property-based tests
  F — docs (independent, parallel to A)

Phase 2 (P1, next):
  D — WebGL hardening + axe-core a11y testing in CI
  C — schema → TS codegen (depends on A's Zod)

Phase 3 (P1, the big lift):
  B — packages/engine/ extraction (depends on A's type safety)

Phase 4 (P2, polish):
  E — per-brick shader variation
  G — LCP-swap + preload brick pattern (G1 GSAP-removal skipped)
```
