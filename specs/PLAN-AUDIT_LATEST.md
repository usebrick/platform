# Plan Audit — SlopBrick evidence-led first scan

**Date:** 2026-07-18 · **Verdict:** READY
**Plan:** `docs/superpowers/plans/2026-07-18-slopbrick-first-scan-experience.md`
**Execution authority:** `docs/execution/index.json` revision 24

## Principles Alignment

| Check | Status | Note |
| --- | --- | --- |
| Vertical slices | ✅ | Eight bounded tasks each define files, interfaces, a red state, focused green verification, and a Conventional Commit checkpoint. Legacy behavior remains runnable between slices. |
| Scope bounded | ✅ | The plan permits one additive report projection, baseline snapshots, human rendering, and JSON/SARIF metadata. It explicitly excludes detector, score, rule, corpus, telemetry, network, release, and deployment changes. |
| Success criteria | ✅ | The final matrix covers five areas, one transparent headline, three actions, evidence and repair truth, deltas, invalid scans, compatibility, accessibility-oriented text, owner comprehension, and release boundaries. |
| Hard gates | ✅ | Revision-25 WIP entry precedes code; baseline identity and no-auto-refresh are frozen; focused/full gates precede a real self-scan; owner comprehension precedes revision-26 closeout. |
| Domain language | ✅ | `firstScan`, evidence tiers, finding-bound repair, five areas, current/new/resolved/unchanged, Repository Health, policy gate, and baseline compatibility are defined once in the locked product contract. |

## Conventions Completeness

| Check | Status | Note |
| --- | --- | --- |
| Repository rules | ✅ | Root `AGENTS.md` is the authoritative equivalent of a project-agent guide and defines planning authority, TypeScript/Node policy, package contracts, gates, and release boundaries. |
| `CLAUDE.md` / `CONVENTIONS.md` | ⚠️ | Separate files are absent, but no convention is missing for this slice: `AGENTS.md`, existing source patterns, and the detailed plan define the required behavior. Creating duplicate convention files would add authority drift. |
| Spec layout | ✅ | `specs/`, `docs/execution/plans/`, the machine index, status, changelog, and evidence destinations exist. No `specs/release-plan.yaml` exists; `docs/execution/index.json` is the declared story authority. |
| Commit convention | ✅ | The plan specifies scoped Conventional Commit messages for every checkpoint. Recent repository history follows the same convention. |
| Git workflow | ✅ | `solo-git` for this owner-led slice on `main`, with task-scoped commits and the installed main-branch pre-push gate. A source push remains separate from tag, release, publish, and deploy authority. |

## Pre-flight Answers

| Question | Value |
| --- | --- |
| Test command | `SLOPBRICK_VITEST_WORKERS=1 corepack pnpm -r test` |
| Build command | `corepack pnpm -r build` |
| Lint command | `corepack pnpm -r lint` |
| Typecheck command | `corepack pnpm -r typecheck` |
| Focused command | `corepack pnpm --filter slopbrick exec vitest run tests/report/first-scan.test.ts --maxWorkers=1 --minWorkers=1` |
| CI platform | GitHub Actions: `.github/workflows/ci.yml`, `publish.yml`, `deploy-website.yml`, and `slopbrick-review.yml` |
| Collaboration mode | Solo repository owner/tester; owner comprehension is the human acceptance gate |
| Language / framework | TypeScript on Node.js 22/24, Vitest, Commander CLI, Chalk terminal rendering |
| Codebase state | Existing monorepo; additive backward-compatible change to a published package candidate |

## Open Gaps

No planning gap blocks implementation. These are execution gates, not plan defects:

- [ ] Produce the red tests before each implementation slice.
- [ ] Preserve the frozen finding-identity hash and revision-1 baseline reader.
- [ ] Pass focused, package, recursive, machine-format, and package-local self-scan gates.
- [ ] Obtain the owner's explicit first-action comprehension disposition before marking `SB-UX-001` done.

## Verdict

**READY** — scope, terminology, dependencies, tests, commands, compatibility, owner acceptance, and rollback are concrete. Repository survey and impact mapping are complete; proceed with either `superpowers:subagent-driven-development` or `superpowers:executing-plans` after the user selects the execution mode.
