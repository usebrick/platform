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
