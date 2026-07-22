# CAL-002 complete calibration control-plane receipt

- **Recorded:** 2026-07-22
- **State:** `in_progress` immutable-evidence checkpoint at revision 37
- **Scope:** CAL-002 progressive authority Tasks 1–15. This receipt grants no
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
  and one approved, non-admitting 119-row matrix. The matrix and approval remain
  `applied: false` and `admitted: false`; blocked rows remain disabled and
  assignment-ineligible.
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
  transferred-oracle fixture contract, exact five-slot control ordering,
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
  five fixed control slots. The exact focused matrix passes 50/50 on Node 22.22.3
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
  source-binding receipt, and five source-bound protocol slots per row; it
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
- Task 13 is integrated on main at `e956f7900` and `366246e5d`; protected
  lock hardening is integrated at `8c8760783`. Originating sidecar commits
  `34bf81fe1` and `fa5d452c5` are provenance only. The v2 projection contains
  exactly 32 canonical `research-only` origin rows, binds frozen governing and
  replay identities, consumes no v1 owner-decision row, and stores no raw
  source or path. Every row has `runtimeOutcome: default-off`,
  `enabledByDefault: false`, `runnableByExplicitOptIn: true`,
  `scoreEligible: false`, `gateEligible: false`, and `admitted: false`. Task
  13 created no application artifact and did not apply policy; the proposed
  policy remains `applied: false`.
- Independent specification and code-quality review approved the
  lock/session-lock alias fix with no remaining findings. The protected v1
  owner state remains an input only: no Task 13 action changes an owner
  decision, durable receipt, runtime policy, admission, or release state.
- Task 14 is integrated on main from `d7b11b70e` through `c13ce8f47`. It adds
  the closed 119-row matrix reducer, approval, unapplied/applied policy and
  application-receipt contracts, six CLI commands, four new schemas, schema-
  registry hardening, and immutable paired publication.
- The reducer independently validates exactly 41 evidence-ready deterministic
  rows: 32 starting plus nine transferred. Every row carries exactly five
  ordered slots—`alternate-syntax`, `baseline`, `comment-adjacent`,
  `near-miss`, and `regression-safe`. These are fixed protocol slots, not
  semantic source families.
- The oracle receipt binds its top-level and every control to frozen Corpus v1
  source receipt SHA-256
  `47bd66907ec2efa67da718e0cfb38458151ca84d3cdedc941488fe4b001475ac`.
  Durable rows contain no raw source or path. Failed rows remain default-off;
  passed rows require all declarations, observations, controls, and identities
  to close independently.
- Immutable final application publishes the receipt first and the applied
  policy commit marker last under shared destination session locks. Rollback
  is limited to a receipt the current locked writer proved it created. Task 14
  exercises this contract only with temporary fixtures.
- Independent final review approved both specification fidelity and code
  quality with no Critical, Important, or Minor findings.
- This checkpoint grants no authority to infer a Task 15 owner choice, apply
  runtime policy, activate a rule, admit evidence, or perform a release action.
  Remote state is outside this receipt. Local application remains separate
  from push, tag, publish, deploy, and release decisions.
- Task 15 consumed the later literal owner decisions and generated the 13
  immutable evidence artifacts recorded in revision 37 below. The authority
  choice approved exactly 26 transfers, 4 blocks, 3 supersessions, and 7
  retirements while preserving all 47 starting-quality and 32 research-origin
  rows.
- The authority proposal binds the locked catalog, proposal gate SHA-256
  `5132373325a51a42e2c351512220773d47629e863206d5a0f8ec0f08c48d5ef2`,
  and byte-identical protected v1 state SHA-256
  `07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd`.
  Its canonical artifact SHA-256 is
  `b495add9c4f11ee83c3c6bc007548d36064d8fbdbe5cc478ff4c71dec51fdfc7`.
- All 41 deterministic rows passed: 32 starting plus nine transferred. The 32
  quality candidates were deliberately unmeasured with
  `not-requested-owner-capacity`; the 32 research-origin rows reused their
  exact receipt and remain default-off, score-neutral, and gate-neutral.
- SQL and console replacement coverage is ported. Line-based `any` coverage is
  rejected as a false positive. The resulting matrix contains 41 default-on,
  36 default-off, 32 quality-candidate-default-off, 3 superseded, and 7 retired
  rows.
- The owner approved the exact matrix file SHA-256
  `ad485bcf192fc093b2cddf0f449a27c4bec5842488ca7a9e6ea27acf87b3e91d`.
  The canonical recorded decision line is
  `1 approve this exact 119-row matrix SHA`.
- Task 15 does not apply runtime policy. Every artifact remains
  `admitted: false`; the matrix and approval remain `applied: false`. No push,
  tag, publish, deployment, or release is authorized.

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

## Revision-35 reproducible bounded gate

The Task 13 gate covers exactly these three files:

- `tests/calibration/cal-002-origin-v2.test.ts`
- `tests/calibration/cal-002-origin.test.ts`
- `tests/calibration/cal-002-cli.test.ts`

It passes 76/76 with one worker on exact Node 22.22.3 and exact Node 24.15.0,
with SlopBrick typecheck on both runtimes. The protected-state stat and SHA-256
assertions below were verified on main: mode 0600, 256 bytes, and SHA-256
`07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd`.
Revision 34's reproducible four-file 213/213 receipt remains preserved above.

### Exact command manifest

```sh
PATH=$HOME/.local/share/mise/installs/node/22.22.3/bin:$PATH corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-origin-v2.test.ts tests/calibration/cal-002-origin.test.ts tests/calibration/cal-002-cli.test.ts --maxWorkers=1 --minWorkers=1
PATH=$HOME/.local/share/mise/installs/node/24.15.0/bin:$PATH corepack pnpm --filter slopbrick exec vitest run tests/calibration/cal-002-origin-v2.test.ts tests/calibration/cal-002-origin.test.ts tests/calibration/cal-002-cli.test.ts --maxWorkers=1 --minWorkers=1
PATH=$HOME/.local/share/mise/installs/node/22.22.3/bin:$PATH corepack pnpm --filter slopbrick typecheck
PATH=$HOME/.local/share/mise/installs/node/24.15.0/bin:$PATH corepack pnpm --filter slopbrick typecheck
test "$(stat -f '%Lp %z' .slopbrick/calibration/cal-002/origin-state.json)" = "600 256"
test "$(shasum -a 256 .slopbrick/calibration/cal-002/origin-state.json | awk '{print $1}')" = "07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd"
git diff --check
```

## Revision-36 Task 14 qualification

- The final Task 14 implementation range is `d7b11b70e..c13ce8f47`.
- The expanded 13-file Task 13/14 regression gate passes 198/198 on exact Node
  22.22.3 and exact Node 24.15.0.
- SlopBrick typecheck passes on both exact runtimes.
- The bounded Node 24 full suite passes 383 files with 5 skipped and 4,485
  tests with 15 skipped.
- Independent final review returned `SPEC APPROVED` and
  `CODE QUALITY APPROVED`, with no findings at any severity.
- The protected owner-state input remains mode 0600, 256 bytes, and SHA-256
  `07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd`.

### Reproducible full-suite and typecheck commands

```sh
PATH=$HOME/.local/share/mise/installs/node/24.15.0/bin:$PATH corepack pnpm --filter slopbrick exec vitest run --maxWorkers=4 --minWorkers=1
PATH=$HOME/.local/share/mise/installs/node/22.22.3/bin:$PATH corepack pnpm --filter slopbrick typecheck
PATH=$HOME/.local/share/mise/installs/node/24.15.0/bin:$PATH corepack pnpm --filter slopbrick typecheck
test "$(stat -f '%Lp %z' .slopbrick/calibration/cal-002/origin-state.json)" = "600 256"
test "$(shasum -a 256 .slopbrick/calibration/cal-002/origin-state.json | awk '{print $1}')" = "07997204f63f9a03c16601f953ef078f1caaa8db7f7f8fca9ba4a73f3c6270fd"
git diff --check
```

The bounded worker count is part of the reproducible qualification command.
Earlier unbounded full-suite attempts exposed only load-sensitive test-harness
assumptions; their two bounded corrections are included in `c13ce8f47`.

## Revision-37 Task 15 immutable evidence

- The integrated nine-file Task 15 preflight passes 122/122 on exact Node
  22.22.3 and exact Node 24.15.0.
- The frozen 119-row catalog replay is byte-identical: mode 0600, 23,377 bytes,
  canonical file SHA-256
  `6faeed123ee1414cc5a8ead873178e43fb23d46cab985d3254acbe9e3cf0e4d5`,
  and locked rule-catalog SHA-256
  `d6d17e252b71e4918375c526c5c209a7550cb089a12f9d82281bb99883a1f506`.
- The literal authority decision was
  `approve the exact 26 transfer / 4 blocked / 3 supersede / 7 retire batch`.
  Its immutable receipt SHA-256 is
  `2adf533cdf38d1d0b3c22a18e6f09356cdd8b6bfced8dcdf439cb628e87b9229`.
- The exact 41-row oracle reducer completed with 41 passed and zero failed or
  source-shortage rows. The research-origin receipt reused all 32 bound rows.
- The final 119-row matrix and application adversarial gate passes 43/43. The
  protected v1 state remains mode 0600, 256 bytes, and byte-identical at its
  recorded SHA-256.

| Immutable artifact | Canonical file SHA-256 |
| --- | --- |
| `catalog.json` | `6faeed123ee1414cc5a8ead873178e43fb23d46cab985d3254acbe9e3cf0e4d5` |
| `authority-proposal-v2.json` | `b495add9c4f11ee83c3c6bc007548d36064d8fbdbe5cc478ff4c71dec51fdfc7` |
| `authority-receipt-v2.json` | `2adf533cdf38d1d0b3c22a18e6f09356cdd8b6bfced8dcdf439cb628e87b9229` |
| `quality-disposition-v2.json` | `650849be9936163733ea84df5e1ed809d3934930e91cb771d5fd9f156ba3f972` |
| `parity-db-sql-concat-v2.json` | `b87b9983f7bc9a31d2ca4ccc49a010f087d43b90b2cb5cf0ca76bb596fe1ec6c` |
| `parity-logic-math-console-log-storm-v2.json` | `2f8a7bd6ef4def9b400c4dcf9d60e21025f9537f6e1a2c7bf20372825875edc4` |
| `parity-logic-math-any-density-v2.json` | `6384dc392d10dd69ce51b15f1fa7639999db9896d393c8c5c7e31c19a68062ef` |
| `supersession-receipt-v2.json` | `2ff96be2718cdc3c7c4aca90b3f6a73a8a40c460b8b33bdb0db7dcff0d9c0975` |
| `oracle-receipt-v1.json` | `6593c37928498f081c8cf63de4352e4cc62158132ece2659aa670d41a5fda5e8` |
| `oracle-receipt-v2.json` | `4c25c32458ffc5aee570f0576de2a83d148adfae33cb5fd360b48accb3d5d9a1` |
| `origin-receipt-v2.json` | `f3dcb64d11c227e414b81b3249e05c210aeee676834292f4230c862b57cd10bc` |
| `final-matrix-v2.json` | `ad485bcf192fc093b2cddf0f449a27c4bec5842488ca7a9e6ea27acf87b3e91d` |
| `matrix-approval-v2.json` | `f80c86e89d21af7927ab394975fc311461026e340ea1c1db620cca54630507ee` |

## Next evidence

Run Task 16 next: add pure current-policy accessors behind an inactive provider.
Task 16 may consume the approved matrix as a test fixture, but it must not apply
the matrix, activate runtime authority, or change scanner behavior. Task 17
runtime integration remains a later bounded slice. No push, tag, publish,
deployment, or release is authorized.
