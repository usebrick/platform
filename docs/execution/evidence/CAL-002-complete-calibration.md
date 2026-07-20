# CAL-002 complete calibration control-plane receipt

- **Recorded:** 2026-07-20
- **State:** `in_progress` implementation checkpoint at revision 34
- **Scope:** CAL-002 progressive authority Tasks 1–12. This receipt grants no
  authority to apply policy, admit evidence, or perform a release action;
  remote state is outside the receipt.

## Inputs

- Approved design:
  `docs/superpowers/specs/2026-07-18-complete-calibration-program-design.md`
  at `1def91feb`.
- Reviewed detailed plan:
  `docs/superpowers/plans/2026-07-18-complete-calibration-program.md`.
- Approved additive amendment and implementation boundary:
  `docs/superpowers/plans/2026-07-19-cal-002-progressive-quality-authority.md`,
  consuming `e6c9695ea`, `d2fc36676`, `996770a33`, and `ae0a4cab1`.
- Completed predecessor: `CAL-001`, whose existing matrix remains
  `applied: false` and `admitted: false`.

## Control-plane transition

- The v1 implementation is checkpointed through `e6c9695ea`; the old
  three-way origin questionnaire is paused after one historical hold.
- The approved v2 authority projection is exactly 47 starting quality + 26
  transferred quality + 4 blocked quality + 3 superseded + 7 retired + 32
  research-origin = 119. The owner-row transition is exactly `26/4/3/7`.
- `CAL-002` remains the active umbrella for separate quality and origin lanes
  and one proposed non-admitting 119-row application policy. The proposal
  remains `applied: false` and `admitted: false`; blocked rows remain disabled
  and assignment-ineligible.
- Implementation WIP remains exactly `2/2`: `SB-UX-001` and `CAL-002`.
- `VAL-001` returns to `ready` with RUN-001 preserved; `TEL-001` remains
  `ready`; `REL-001` remains unchanged.

## Implementation checkpoint

- Progressive authority Tasks 1–3 remain independently approved through
  `5f5a1c554`. They preserve exact v1 bytes, enforce the additive authority
  taxonomy, and provide a terminal immutable owner-batch path without running
  it against protected owner state.
- Task 4 is checkpointed through `0789f7bf9`; the integrated correction chain
  starts at `8b9c7789b`. It produces the exact 32-row zero-label quality
  disposition, shares the v1 quality reducer for measured outcomes, and can
  plan only an optional readiness-gated private cohort at its pinned private
  destination. Every closeout row remains disabled, score-neutral, gate-
  neutral, non-admitting, and without a claimed safe repair.
- Task 4's final focused matrix passes 92/92 on exact Node 22.22.3 and 24.15.0
  runtimes with package typecheck on both. Two independent final reviews
  approved the corrected slice.
- Task 5 is checkpointed through `67a777c27`; the integrated correction chain
  starts at `379bc946d`. It freezes the three SQL, console, and `any` parity
  case contracts, requires independent future migration commits, and validates
  exact non-admitting supersession-row shapes bound to authority and parity
  receipts. It does not implement the rule migrations; those remain Tasks
  6–8.
- The integrated Task 4 + Task 5 focused matrix passes 101/101 on exact Node
  22.22.3 and 24.15.0 runtimes with package typecheck on both. Two independent
  final reviews approved the corrected Task 5 slice.
- Task 6 is checkpointed through `7b061b695`; its main integration starts at
  `a60bd50cb`. It ports canonical CTE coverage with a forward linear parser,
  rejects CTE-shaped prose and long incomplete chains, retains parameter and
  comment guards, and covers terminal `SELECT`, `INSERT`, `UPDATE`, and
  `DELETE`. The corrected focused matrix passes 31/31 and independent review
  approved it after performance and semantic corrections.
- Task 7 is checkpointed through `93257dcab`; its main integration starts at
  `9b8c908ca`. It ports five `console.log` calls in a true 30-line inclusive
  span, preserves minimum-size, test-file, logger-file, structured-logger, and
  exact 10/9 total-debug behavior, and rejects the exact 31-line span. The
  corrected focused matrix passes 21/21 and independent review approved it at
  99% confidence.
- Task 8 is checkpointed at `e8e62b779`. It leaves the declaration-ratio
  detector and 0.30 threshold unchanged, rejects old line-denominator reach,
  retains annotation/assertion/generic detection and the TypeScript guard,
  and replaces public finding text with quality-only framing. Its focused
  matrix passes 17/17 and independent review approved it at 98% confidence.
- The integrated Tasks 6–8 matrix passes 51/51 on exact Node 22.22.3 and
  24.15.0 runtimes with package typecheck on both. Test-built parity receipts
  use synthetic valid commit SHAs; no durable actual-commit parity or
  supersession receipt was written, and all old rule IDs remain runnable.
- Task 9 is checkpointed at `33ea0d732`. It defines the reusable nine-ID
  transferred-oracle fixture contract, exact five-family control ordering,
  normalized language-path and unique-identity validation, and the source-
  free/path-free durable case projection. Complete cases for
  `cpp/c-style-cast`, `cpp/raw-new-delete`, and `rust/todo-macro` execute
  against real parser/facts/rule paths. The exact focused matrix passes 53/53
  on Node 22.22.3 and 24.15.0 with package typecheck on both. Its approved
  comment-adjacent control exposed and now guards a real commented-out C-style-
  cast false positive; comment masking preserves offsets. The independent
  reviewer stalled and was closed, so only the controller audit is recorded,
  not external approval. No durable transfer-oracle receipt was written.
- Task 10 is checkpointed at `aeef2915a`. It adds complete real-execution
  cases for `dead/unreachable`, `dead/unused-import`, `dead/unused-local`, and
  `dead/unused-parameter`, including exact positive, negative, adversarial, and
  five-family controls. The exact focused matrix passes 50/50 on Node 22.22.3
  and 24.15.0 with package typecheck on both; 45 broader visitor assertions
  and signal-strength guardrails also pass. Its approved JSX control exposed
  and now guards a classic default `React` runtime-import false positive using
  an exact name/source plus actual-JSX condition. The independent reviewer
  stalled and was closed, so only the controller audit is recorded. No durable
  transfer-oracle receipt was written.
- Task 11 is checkpointed at `651f52d78`. It adds complete real-execution
  fixtures for `security/hardcoded-secret` and `security/sql-construction`,
  completes the canonical nine-transfer aggregate, and adds the strict 32-
  starting + 9-transferred = 41-row v2 oracle reducer and schema. The reducer
  revalidates the frozen v1 receipt, exact authority transfers, fixture hashes,
  source-binding receipt, and five real-source control families per row; it
  stores no raw source or path, preserves failed/default-off rows, and remains
  `admitted: false`. The approved comment control exposed and now guards a real
  hardcoded-secret comment false positive while preserving line offsets. The
  exact integrated matrix plus signal-strength guardrails passes 134/134 on
  Node 22.22.3 and 24.15.0 with package typecheck on both. Two independent
  reviewers stalled and were closed, so only the controller audit is recorded,
  not external approval. No durable oracle receipt was written.
- Task 12 is integrated at `473ceafc3` from originating implementation
  `5adba9714`. Its fail-closed TypeScript-AST extractor and doctrine cover
  exactly 73 active quality rows across rule descriptions, emitted messages
  and advice, `RULE_HINTS`, and the deterministic 119-row generated catalog.
  Current quality-facing copy does not assert AI/human causation or authorship;
  detector behavior, severity, category, and legacy provenance remain
  unchanged. The catalog replays identically on both runtimes at SHA-256
  `9bc6ede48b7df38d0b0e71be32691c3eebb9258817a95916752e442c7e771efd`.
- The existing quality-disposition, parity, and supersession receipt schemas
  are closed at `dd8360fba`, `b5bd09090`, and `66251c9fa`. Strict validation
  rejects malformed open shapes. The revision-34 bounded gate below replaces
  session-only aggregate totals as the durable code-path receipt.
- This checkpoint grants no authority to create an authority proposal, private
  cohort, durable quality/parity/supersession or transfer-oracle receipt, apply
  runtime policy, activate a rule, admit evidence, or perform a release action.
  Remote state is outside this receipt. Local application remains separate from
  push, tag, publish, deploy, and release decisions.

## Revision-34 reproducible bounded gate

The gate covers exactly these four files:

- `tests/rules/quality-authority-copy.test.ts`
- `tests/generated-docs-truth.test.ts`
- `tests/calibration/cal-002-quality-disposition.test.ts`
- `tests/calibration/cal-002-supersession.test.ts`

It passes 213/213 with one worker on exact Node 22.22.3 and exact Node 24.15.0.
The catalog remains the deterministic 119-row projection with exactly 73 active
quality rows, SHA-256
`9bc6ede48b7df38d0b0e71be32691c3eebb9258817a95916752e442c7e771efd`, and
`applied: false` / `admitted: false`.

### Exact command manifest

```sh
PATH=$HOME/.local/share/mise/installs/node/22.22.3/bin:$PATH corepack pnpm --filter slopbrick exec vitest run tests/rules/quality-authority-copy.test.ts tests/generated-docs-truth.test.ts tests/calibration/cal-002-quality-disposition.test.ts tests/calibration/cal-002-supersession.test.ts --maxWorkers=1 --minWorkers=1
PATH=$HOME/.local/share/mise/installs/node/24.15.0/bin:$PATH corepack pnpm --filter slopbrick exec vitest run tests/rules/quality-authority-copy.test.ts tests/generated-docs-truth.test.ts tests/calibration/cal-002-quality-disposition.test.ts tests/calibration/cal-002-supersession.test.ts --maxWorkers=1 --minWorkers=1
PATH=$HOME/.local/share/mise/installs/node/22.22.3/bin:$PATH corepack pnpm --filter slopbrick typecheck
PATH=$HOME/.local/share/mise/installs/node/24.15.0/bin:$PATH corepack pnpm --filter slopbrick typecheck
test "$(stat -f '%Lp %z' .slopbrick/calibration/cal-002/origin-state.json)" = "600 256"
test "$(shasum -a 256 .slopbrick/calibration/cal-002/origin-state.json | awk '{print $1}')" = "07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd"
git diff --check
```

The stat and SHA-256 assertions protect the local private owner-state input
when that input is intentionally available. They do not establish a remote
state or grant release authority.

## Next evidence

The next implementation evidence is Task 13's exact 32-row research-origin v2
receipt projection and `verify-origin-v2` path. It must derive only canonical
`research-only` authority rows, bind frozen governing evidence and replay
identities, consume no v1 owner-decision rows, store no raw source or path, and
remain non-admitting and unapplied without changing protected owner artifacts,
runtime policy, admission, or release state.
