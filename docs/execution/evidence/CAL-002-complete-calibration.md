# CAL-002 complete calibration control-plane receipt

- **Recorded:** 2026-07-22
- **State:** `in_progress` dormant-runtime checkpoint at revision 38
- **Scope:** CAL-002 progressive authority Tasks 1–16. This receipt grants no
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
- The Task 14 checkpoint alone granted no authority to infer a Task 15 owner
  choice, apply runtime policy, activate a rule, admit evidence, or perform a
  release action. Remote state is outside this receipt. Local application
  remains separate from push, tag, publish, deploy, and release decisions.
- Task 15 consumed the later literal owner decisions and generated 13 primary
  immutable evidence artifacts plus one evidence manifest. The authority
  choice approved exactly 26 transfers, 4 blocks, 3 supersessions, and 7
  retirements while preserving all 47 starting-quality and 32 research-origin
  rows.
- The authority proposal and receipt bind the locked catalog and byte-identical
  protected v1 state. Their leaf identities remain machine-readable inside the
  evidence manifest rather than repeated in this human ledger.
- All 41 deterministic rows passed: 32 starting plus nine transferred. The 32
  quality candidates were deliberately unmeasured with
  `not-requested-owner-capacity`; the 32 research-origin rows reused their
  exact receipt and remain default-off, score-neutral, and gate-neutral.
- SQL and console replacement coverage is ported. Line-based `any` coverage is
  rejected as a false positive. The resulting matrix contains 41 default-on,
  36 default-off, 32 quality-candidate-default-off, 3 superseded, and 7 retired
  rows.
- The owner approved the exact matrix. The canonical recorded decision line is
  `1 approve this exact 119-row matrix SHA`.
- The 13 primary artifacts and ledger are checkpointed at `6a85e4346`; the
  additive manifest contract and artifact are checkpointed at `80acf1ada`.
- The single human-facing Task 15 evidence root is
  `53ab07e7fd5dbbd09f595c87c255a636f3fb902abe7ec0cbfe923a5392198f8a`.
  It binds the sorted name, byte count, and file SHA-256 of all 13 primary
  artifacts. The manifest does not include itself.
- Task 15 does not apply runtime policy. Every artifact remains
  `admitted: false`; the matrix and approval remain `applied: false`. No push,
  tag, publish, deployment, or release is authorized.
- Task 16 starts with the clean-install test dependency correction at
  `3c1572f89` and is implementation-checkpointed through `417ca5668`. Its
  red/green chain adds the current-policy truth table, exact approved-
  projection binding, rejection of generic or stale projections, and an
  immutable snapshot that cannot be altered through caller-owned state.
- The pure accessors keep blocked, superseded, and retired rows non-runnable,
  allow explicit diagnostics only where policy permits, and keep visibility
  separate from score eligibility. Unknown IDs preserve legacy fallback.
- The production provider deliberately returns `undefined`. No registry, CLI,
  watch, worker, score, baseline, or report path consumes current policy in
  production, so scanner behavior remains unchanged.
- The focused Task 16 contract passes 7/7 on exact Node 22.22.3 and 24.15.0
  with SlopBrick typecheck on both. The recursive test gate passes Core 285,
  Engine 60, Website 54, and SlopBrick 4,496 tests with 15 intentional skips;
  recursive typecheck and build also pass.
- Two independent final reviewers returned 99/100 and 100/100 with zero
  findings after independently running the focused contract, SlopBrick
  typecheck, and implementation-range review.
- Task 16 does not apply or activate policy. Every Task 15 artifact remains
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
- The frozen 119-row catalog replay is byte-identical at mode 0600 and 23,377
  bytes. Its machine identity is bound transitively by the evidence root.
- The literal authority decision was
  `approve the exact 26 transfer / 4 blocked / 3 supersede / 7 retire batch`.
- The exact 41-row oracle reducer completed with 41 passed and zero failed or
  source-shortage rows. The research-origin receipt reused all 32 bound rows.
- The final 119-row matrix and application adversarial gate passes 43/43. The
  protected v1 state remains mode 0600, 256 bytes, and byte-identical.
- `evidence-manifest-v1.json` contains exactly 13 sorted leaf entries and one
  self-validating `evidenceRootSha256`. That root is the only aggregate Task 15
  evidence hash repeated in human-facing status documentation.
- The final manifest implementation passed controller self-audit after its
  fresh-checkout file-mode portability correction. Two rounds of independent
  reviewer attempts stalled and were closed, so no independent approval is
  claimed for this additive follow-up.

## Revision-38 Task 16 dormant policy accessors

- The checkpoint sequence spans `3c1572f89` through `417ca5668`. The first
  commit fixes clean-install schema-test dependency ownership; the remaining
  red/green sequence implements and hardens the dormant accessor contract.
- The accessors accept only a complete applied 119-row policy bound to the
  exact owner-approved Task 15 matrix, approval, and row projection. Those leaf
  identities remain machine-only; the single Task 15 evidence root above is
  the human-facing aggregate.
- Validated policy state, its row array, every row, and nested association data
  are detached and frozen before exposure. A caller cannot mutate the policy
  after validation to widen runnable or score authority.
- The production provider returns `undefined`; Task 17 may exercise runtime
  paths through the exact approved-policy test helper but cannot activate the
  provider.
- The final two-reviewer AND-gate passed with no findings. Reviewer scores were
  99/100 and 100/100.

### Reproducible focused and recursive commands

```sh
PATH=$HOME/.local/share/mise/installs/node/22.22.3/bin:$PATH corepack pnpm --filter slopbrick exec vitest run tests/rules/current-evidence-policy.test.ts --maxWorkers=1 --minWorkers=1
PATH=$HOME/.local/share/mise/installs/node/24.15.0/bin:$PATH corepack pnpm --filter slopbrick exec vitest run tests/rules/current-evidence-policy.test.ts --maxWorkers=1 --minWorkers=1
PATH=$HOME/.local/share/mise/installs/node/22.22.3/bin:$PATH corepack pnpm --filter slopbrick typecheck
PATH=$HOME/.local/share/mise/installs/node/24.15.0/bin:$PATH corepack pnpm --filter slopbrick typecheck
corepack pnpm -r test
corepack pnpm -r typecheck
corepack pnpm -r build
git diff --check
```

## Next evidence

Run Task 17 next: integrate runnable and score authority into registry, CLI,
watch, and worker paths through the exact approved-policy test helper. Keep the
production provider returning `undefined`; do not apply the matrix, activate
runtime authority, or change production scanner behavior. No push, tag,
publish, deployment, or release is authorized.
