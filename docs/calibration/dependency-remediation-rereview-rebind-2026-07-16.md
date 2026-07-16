# Dependency-remediation rereview rebind — current recovery branch

**Date:** 2026-07-16  
**Bound commit:** `dbab01604e3645d8dfadcd90255cc1f5a4f13511`  
**Scope:** Mechanical correction of the earlier clean-boundary dependency
rebind. This note does not approve a release, publication, corpus mutation, or
deployment.

The 2026-07-14 rebind incorrectly stated that all eight reviewed input bytes
still matched the old clean snapshot. A live hash audit found two additive
manifest changes after that snapshot:

| File | Current SHA-256 | Change from the old snapshot |
|---|---|---|
| `package.json` | `f518928e603aeff1eb9acf0afb4b70298dca5f0051040a7221a7b2916e936340` | adds root `security:audit` |
| `packages/core/package.json` | `d004f1b8fb7d37f8763e3108f3745130915e8291bc5ff2dddedbcbbcaea908ea` | unchanged |
| `packages/engine/package.json` | `5fe21d700897656225eae9d5d8c363ff3054cefaa5b38c8e9d17d0d4957133b6` | unchanged |
| `packages/slopbrick/package.json` | `9151cd8cdad5f5221b0453f2248b072ded8bd4bc5cf4be1d1562f3a6d175570b` | adds `cal:admission:smoke-input` |
| `packages/website/package.json` | `c4e78e637cf07fcda2cd9a08d42787819c5e87c70f35f76186aa06d2cbd1516d` | unchanged |
| `pnpm-lock.yaml` | `a0c05d3ead7d06b3e6d3e0c3dae2f689e86d9c7ad0828fe8ac96dde6d640c559` | unchanged |
| `packages/slopbrick/vitest.config.ts` | `16f6097b456cc56af59fbe0930df37989383ad886ba138d1b51214f8d5cba47f` | unchanged |
| `packages/website/src/components/StructureDemo.astro` | `e81c389b20dc452aded507c298a0eaf5da2ca8c50f4f70521bfedb10df91f29e` | unchanged |

The manifest diff from the former clean snapshot is exactly **two inserted
script entries**, with no dependency, engine, override, or lockfile change.
Existing bounded evidence covers the audit helper (3/3) and smoke-input CLI
boundary (15/15 in the current focused run). These checks are implementation
evidence, not independent release approval.

The tracked worktree is clean; the status-list SHA is
`ae88aee9ffe708b5d8fa7983fecf6afdf43937f45deaacaefb78dfc8119193b7`, reflecting
the three preserved unrelated untracked paths (`.astro/`, `TODO.md`, `src/`).
Independent dependency/release approval, corpus authority, and remote release
operations remain open.

## Launcher portability correction — 2026-07-16

The current branch also replaces supported `tsx` binary script launchers with
`node --import tsx` in Core, SlopBrick, Website, and the SlopBrick pre-push
generation checks. This is a script-execution change only: dependency ranges,
engines, overrides, and `pnpm-lock.yaml` remain unchanged. It removes the
one-shot tsx IPC socket that this host denies (`listen EPERM`). After the
change, `pnpm -r typecheck` and `pnpm -r build` both pass; build output retains
only the existing non-fatal Zod declaration warnings.

Current hashes for the affected manifests are:

| File | Current SHA-256 |
|---|---|
| `packages/core/package.json` | `2de8b28ffeb97e1e50687baf5d0ff2881dafb2ef0001544d9eb21ecf47a0a702` |
| `packages/slopbrick/package.json` | `5c242c046fe909554ed771b5322df93228dc21e798579ee42fa7831ba176b433` |
| `packages/website/package.json` | `d08053e31fc8bd9b79c45a0c97fe2848999bba1ab69a856f9588d2804e33a29d` |
| `packages/slopbrick/scripts/pre-push` | `df1a94409a50faf476f872f40c373e669950c3de11dd0eb599e9311090f2cc89` |

The current status-list SHA is
`ae88aee9ffe708b5d8fa7983fecf6afdf43937f45deaacaefb78dfc8119193b7`, which
includes the intended implementation/docs edits and the three preserved
unrelated untracked paths. This remains mechanical evidence, not independent
release approval; no corpus, authority, remote, publish, or deployment state
changed. The launcher correction is committed on the recovery branch as
`b19c57309763ae0a42976ebec05b39ef76b0ae44`.
