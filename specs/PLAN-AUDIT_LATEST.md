# Plan Audit — v10.3 immutable release-asset materialization

**Date:** 2026-07-10 · **Verdict:** READY

**Plan audited:**
`packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md`

## Principles alignment

| Check | Status | Note |
|---|---|---|
| Scope bounded | ✅ | Frozen decisions explicitly limit the change to checksum-pinned HTTPS ZIP release assets and list tar, LFS, OCI, S3, model hubs, local directories, label decisions, and release decisions as out of scope. |
| Success criteria | ✅ | The completion checklist binds schema compatibility, identity hashes, network denial, archive attacks, cache mutation, resolver behavior, packed consumption, deterministic smoke, full gates, and four independent reviews. |
| HARD GATEs | ✅ | Schema/provenance review precedes identity work; network and archive security reviews precede integration; corpus promotion remains gated after materialization. |
| Domain language | ✅ | `release_archive`, materialization, checkout-map binding, `safe-zip-v1`, receipt, inventory, selection, resolver, and diagnostic eligibility are defined distinctly. |
| Vertical delivery | ⚠️ | Tasks 1–4 are deliberately risk-layered rather than individually user-visible. This is acceptable because the new source kind stays unusable until the manifest-aware Task 5 integration; every intermediate commit preserves the existing Git path and has a focused independent gate. |
| Backward compatibility | ✅ | Existing v10.3.0 Git manifests and IDs are frozen; release assets require v10.3.1+; Repository Structure schema/version is untouched. |
| Security boundary | ✅ | Network is opt-in, redirects/hosts/DNS destinations are constrained, extraction is bounded and atomic, cache reuse is fully reverified, and scanning remains network-free. |
| Evidence boundary | ✅ | Materialization explicitly does not decide authorship labels, pair safety, licensing, statistical admissibility, or release eligibility. |

## Conventions completeness

| Check | Status | Note |
|---|---|---|
| `AGENTS.md` | ✅ | Root project rules define monorepo architecture, schema compatibility, tests, quality gates, hooks, and release boundaries. |
| `CLAUDE.md` | ⚠️ | Absent, but not required for this Codex workflow; root `AGENTS.md` is the authoritative project instruction source. |
| `CONVENTIONS.md` | ⚠️ | Absent as a separate file. The necessary conventions are present in `AGENTS.md` and repeated where task-specific in the plan. Creating a duplicate file is not a prerequisite. |
| `specs/` layout | ✅ | Present; `specs/IMPACT_LATEST.md` maps 17 direct surfaces and high-risk test gaps. |
| Commit convention | ✅ | Every task names a scoped Conventional Commit and requires a fresh read-only review. |
| Git workflow | ✅ | Existing-codebase team discipline on `codex/v0.45-recovery`; one task owner, scoped staging, root integration, no push/tag/publish/deploy authorization. |

## Pre-flight answers

| Item | Value |
|---|---|
| Focused tests | Exact `corepack pnpm --filter ... exec vitest run ...` commands are listed per task. |
| Full tests | `corepack pnpm -r test` |
| Build | `corepack pnpm -r build` |
| Typecheck | `corepack pnpm -r typecheck` |
| Lint/static gate | No separate ESLint gate exists; TypeScript typecheck plus generated registry/language/schema drift checks are the repository's static gates. |
| Schema gate | `corepack pnpm --filter @usebrick/core validate:schema` and `test:contract` |
| CI platform | GitHub Actions, `.github/workflows/ci.yml`, currently Node 24 with pinned pnpm from root `packageManager`. |
| Language/framework | TypeScript/Node, JSON Schema/AJV, Vitest, tsup, pnpm workspace. |
| Project state | Existing monorepo; additive calibration-contract change. |
| Team mode | Subagent implementation with independent read-only reviewers; external corpus remains outside Git and is never silently promoted. |

## Plan corrections made during audit

- Pinned the proposed ZIP reader/writer and matching type-package versions.
- Added explicit shared-branch, dirty-tree preservation, `corepack pnpm`, and no-remote-mutation rules.
- Added public-address DNS enforcement to the HTTPS redirect threat model.
- Removed the ambiguous “if mixed sources are needed” branch: Task 5 now requires and validates an optional base Git checkout map for mixed manifests.
- Linked the detailed plan from Section 20 of the authoritative continuation plan.

## Open gaps

No blocking planning gaps remain. These are implementation-time evidence gates,
not unanswered design choices:

- [ ] Verify the exact resolved dependency versions and vulnerability state when the lockfile is changed.
- [ ] Confirm `yauzl` exposes every needed entry attribute; if not, stop and amend the policy/plan rather than weakening `safe-zip-v1`.
- [ ] Finish the independent EvalPlus provenance/duplicate review before creating any eligible manifest.
- [ ] Measure packed size and test duration effects before release acceptance.

## Verdict

**READY.** The plan has explicit scope, threat boundaries, test/build commands,
compatibility rules, success evidence, and review gates. Proceed with Task 1
only after the current recursive test-gate review is accepted. The recommended
next execution discipline is task-by-task test-driven implementation with a
fresh reviewer after every scoped commit.
