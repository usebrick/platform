# VAL-001 owner-validation ledger

**Status:** in progress; one owner walkthrough recorded
**Owner:** repository owner
**Participants:** none

This ledger records only real repository-owner actions. It is not participant
research, market-demand evidence, team validation, calibration-label evidence,
or authority to change a rule, threshold, corpus, release, or public claim.

| Run | Repository/fixture ID | Scan receipt | First useful finding | Owner decision | Fix receipt | Rescan receipt |
| --- | --- | --- | --- | --- | --- | --- |
| `VAL-001-RUN-001` | `packages/slopbrick@e1b4717e8` | [Initial self-scan](#initial-self-scan) | [Two file-level logic hygiene findings](#owner-usefulness-decision) | `useful`; immediate fix declined | [No source edit](#fix-disposition) | [Unchanged complete rescan](#unchanged-rescan) |

## RUN-001 authority and candidate identity

- Owner input: the repository owner explicitly answered `useful`, then
  approved the proposed no-fix disposition and unchanged rescan on 2026-07-18.
- Repository: the owner-controlled SlopBrick package in this repository.
- Candidate commit: `e1b4717e8843d95b5a1ac4e31d9ca47a9bb81a2f`.
- Package: unreleased `slopbrick@0.45.0`.
- Runtime: Node `v24.15.0`; pnpm `9.15.0`; one scan thread.
- Package launcher SHA-256:
  `48671e857dc4ffa642b776b591f0c3a9f68e4a21dbbc64945d86d732d2f93981`.
- `package.json` SHA-256:
  `54265301249adc771a0556e3918fae27aa97c594648bd6f4ab7c926d5a25b238`.
- Outbound telemetry: disabled with `--no-telemetry`. The documented command
  still updated ignored package-local repository-memory snapshots.
- The existing score baseline had a config-hash mismatch. Both full scans
  rejected it, and no baseline refresh was authorized or performed.

## Initial self-scan

```text
corepack pnpm --filter slopbrick exec -- node ./bin/slopbrick.js scan \
  --workspace . --threads 1 --no-telemetry
```

The initial scan generated its health snapshot at
`2026-07-18T13:06:46.790Z` and exited `0`:

- 270/270 selected files analyzed; zero parse, timeout, crash, or internal
  failures; score validity `valid`.
- 11 active medium findings: six `logic/zipf-slope-anomaly` and five
  `logic/heaps-deviation`; zero active AI-specific findings.
- 690 default-off finding instances remained audit-only.
- AI Slop Score `0.0 <= 15`; configured policy passed.
- First recommended file:
  `src/calibration/v103/admission-authority-rebuild-publication.ts`.
- Initial mutable `health.json` SHA-256 before the drill-down:
  `5572fdba53502708fb3e5cf481e2fecd05ac6f6738d7d40f0c650acb73429bc5`.

## Owner usefulness decision

The exact one-file drill-down completed 1/1 files with two active findings:

- Heaps exponent `0.375` versus the reported `0.74 +/- 0.17` baseline.
- Zipf exponent `1.213` versus the reported `0.72 +/- 0.20` baseline, with
  `R2=0.96`.

Both findings were scoped to line 1 because they are file-level vocabulary
statistics. The owner marked the recommendation **useful**. Inspection showed
that the target is a 1,388-line transactional publication module, so the
signal successfully identified a worthwhile architectural review target.

## Fix disposition

No source edit was made. The statistical evidence identified no concrete
incorrect identifier, unsafe behavior, or deterministic bounded repair.
Renaming solely to alter Heaps or Zipf statistics would contradict the rule's
own advice. A genuine module decomposition would require separate impact
analysis and implementation review, so the owner approved declining an
immediate fix for this run.

The target source SHA-256 before and after the decision remained:
`58d6fc3f02edd1b36b4edb322672752c8438586588b9b4e21b6b91d0e648bdcc`.

## Unchanged rescan

The exact full command was repeated without a source edit. The rescan generated
its health snapshot at `2026-07-18T13:12:21.297Z` and exited `0`.

| Normalized outcome | Initial scan | Rescan |
| --- | ---: | ---: |
| Selected / analyzed | 270 / 270 | 270 / 270 |
| Runtime failures | 0 | 0 |
| Active findings | 11 medium | 11 medium |
| Zipf / Heaps findings | 6 / 5 | 6 / 5 |
| Audit-only suppressed findings | 690 | 690 |
| AI Slop Score | 0.0 | 0.0 |
| Gate | pass | pass |

The rescan `health.json` SHA-256 was
`8737fd861e10d266e3b634bd0b11d7031c9a196f695a4a50bb959f1f9d72e97e`.
Generated timestamps and durations differ by design; all decision-bearing
outcomes reproduced.

## Product boundary after RUN-001

RUN-001 validates a real owner path through `scan -> useful review target ->
decline unsafe/cosmetic repair -> unchanged rescan`. It also exposes two
requirements for `SB-UX-001`: a useful finding needs an explicit
`no safe action` state, and a rescan needs to label unchanged findings without
requiring manual comparison.

This single self-scan row does not prove a successful fix loop, repeated
usefulness, participant usability, team demand, or market demand. It changes no
CAL-001 matrix row, threshold, default state, score formula, corpus admission,
release decision, or public artifact. No row may be added from a synthetic or
inferred session.
