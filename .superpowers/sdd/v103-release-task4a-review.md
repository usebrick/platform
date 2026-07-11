# v10.3 release-materialization Task 4A review

**Date:** 2026-07-11
**Verdict:** **APPROVE / COMPLETE**

## Scope and immutable basis

- Frozen release plan SHA-256:
  `08d30d9dca5b177764c5c631d98d570d75b2702a556438eaf8c10dadf292c26f`
- Task 4A implementation commit: `521c0e888`
- Scope: shared trusted-POSIX-cache guards only. No ZIP parser, extraction,
  receipt, publication, corpus, signal, package, remote, or release behavior.

## TDD evidence

The pre-refactor acquisition baseline passed 184/184 tests. The initial direct
Task 4A RED failed before collection because
`src/calibration/v103/trusted-posix-cache.ts` did not exist:

```text
Test Files  1 failed (1)
Tests       no tests
Error: Failed to load .../trusted-posix-cache
```

The final focused gate passed:

```text
v103-trusted-posix-cache.test.ts  43 passed
v103-artifact-download.test.ts   184 passed
total                            227 passed
```

SlopBrick typecheck, SlopBrick build, and `git diff --check` passed. The build
still emits non-fatal pre-existing Rollup DTS warnings about Zod v3 named
exports from Core declarations; the command exits zero, so this is not a Task
4A regression or a claim that the package toolchain is warning-clean.

## Reviewed behavior

Task 4A moves only the previously proven primitives:

- POSIX capability validation and exact derived no-follow/nonblocking read
  flags;
- canonical cache-root and complete ancestor owner/mode policy;
- exact BigInt device/inode identity comparison;
- bounded 64-KiB positional SHA-256 reads that continue after positive short
  reads and stop honestly on zero; and
- the Task 3 pathname/handle verification wrapper.

The shared hash and identity functions do not close a borrowed descriptor.
The Task 3 wrapper still owns and closes the descriptor it opens. A deadline
observed immediately after open now closes that acquired handle before the
authoritative deadline escapes. Caller-authoritative Artifact errors retain
precedence over generic I/O translation, matching the prior downloader error
domain. Only an initial pathname `ENOENT` means `missing`; later failures are
`invalid`.

The direct characterization matrix covers unsupported capabilities, canonical
aliases, private/sticky/foreign/writable ancestor modes, cache I/O, exact
identity, pre/open/final/post-close size and identity changes, caller-supplied
flags, short and zero reads, digest mismatch, open/read/stat/lstat/close
failures, deadline timing, authoritative-error precedence, and single-close
behavior. The original 184-test acquisition file remains byte-unchanged.

## Independent review

Independent specification review returned **APPROVE** and independently reran
227/227 focused tests, typecheck, and `git diff --check`. Independent
code/security review returned **APPROVE** with no blocking correctness,
filesystem-security, TOCTOU, descriptor-lifecycle, API-compatibility, or test-
gap finding.

Final reviewed hashes:

- `artifact-download.ts`:
  `5d7fe26c5671c6a679d3702eea8a10e35590d7f5a5d99a524d8fc9d507bff693`
- `trusted-posix-cache.ts`:
  `8ede7164fcfbf535b53924f788f5fd159e16c1e871c388e0581ae36b7e2c1f21`
- unchanged `v103-artifact-download.test.ts`:
  `c93a076be69053891793e902660c7abbcd8d2228eaef680a3c67d23ae56f4004`
- final direct test after type-cast cleanup:
  `25d67ee157b2bc86772a0124d9acc788ba56a78c3bb81adb5897ce3c6200fbbd`

The repository did not contain the generic audit skill's optional
`CONVENTIONS.md` or churn helper, so self-review used `AGENTS.md`, manual
90-day history, the frozen Task 4 plan, and the complete changed-file diff.
No new secret, dependency, suppression, `any`, double-cast, circular import,
dead code, or out-of-scope file was introduced.

## Staged self-scan

The staged hook selected the two production TypeScript files and passed:

- AI Slop Score: 7.2/100, below the 15 gate;
- engineering: 100; security: 100; repository health: 97.1;
- two effective low `ai/compression-profile` findings; seven default-off
  findings suppressed; zero parse errors.

The output also repeated the known baseline minor/patch migration warning,
wrote ignored `.slopbrick/` state, and gave a visual-axis score to non-visual
files. Those remain self-scan correctness/UX work; this scoped pass is not
whole-repository or release evidence.

## Boundary

Task 4A changes no external corpus byte, source register, label, admission
decision, manifest, run, rule signal/verdict, remote, tag, publication, or
deployment. The next implementation slice is Task 4B.
