# Allocation preview review-fix report

Date: 2026-07-15

Baseline: `8d8b23d22` (`feat(calibration): add allocation provenance preview`)

## Corrective scope

The allocation preview now:

1. records a declared-polarity rejection exactly once;
2. validates repository/aggregate ownership before returning duplicate rows and
   emits stable combined reasons;
3. bounds every pending or newline-terminated JSONL unit at the v10.3 32 MiB
   hard limit before parsing;
4. enforces one consumption of the emitted records stream and preserves
   authority validation before either inventory stream is read;
5. conserves rows independently for every material register source and checks
   the source-review inventory count where present. Aggregate rows remain
   non-additive and cannot satisfy a material-source count;
6. uses deterministic code-point reason ordering and keeps noncanonical
   sourceId-first inventory JSONL accepted while emitted rows remain canonical.

The preview remains diagnostic-only: `ready=false`,
`authorityEligible=false`, and no verified label or label promotion is added.

## TDD evidence

The red run was captured before the implementation changes. The six new
regression behaviors failed as expected (eight Vitest cases because duplicate
ownership is parameterized for unknown and aggregate owners and the 32 MiB cap
covers both unterminated and newline-terminated units): duplicate
polarity/reason counting, both duplicate ownership combinations, both 32 MiB
pending-unit cases, per-source conservation, and second-consumer rejection.

The green run was:

```text
pnpm --filter slopbrick exec vitest run \
  tests/calibration/v103-admission-allocation-preview.test.ts \
  --pool=threads --poolOptions.threads.singleThread=true --reporter=dot

PASS — 1 file, 20 tests
```

The focused SlopBrick typecheck was also green:

```text
pnpm --filter slopbrick exec tsc --noEmit
PASS — exit 0
```

## Actual 452,382-row run

The first focused test constructs and consumes the complete mixed fixture,
not a reduced smoke fixture:

| measure | result |
|---|---:|
| positive declared rows | 224,903 |
| negative declared rows | 227,479 |
| total rows | 452,382 |
| baseline material rows | 58,089 |
| repository material rows | 394,293 |
| allocated rows | 452,382 |
| quarantine/unrepresented | 0 / 0 |

The asserted summary preserves the diagnostic-only readiness and authority
flags above and excludes the 1,478,350 raw-discovery denominator.

## Self-review

The staged diff is limited to the allocation implementation, its focused test
file, and this report. No corpus bytes or existing calibration/docs files were
changed by this fix. The stream remains incremental and retains only the
current pending line plus scalar counters; malformed late input and missing or
shifted material rows fail closed with source-specific reasons.
