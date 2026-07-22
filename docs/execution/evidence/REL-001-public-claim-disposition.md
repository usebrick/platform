# REL-001 public-claim disposition

**Status:** waiting for explicit repository-owner decisions
**Owner:** repository owner / release maintainer
**Recorded public actions:** none

## Reason for existence

This receipt is the only current place where npm release and website deployment
authority may be recorded. Local qualification, merging, pushing, CI, and
roadmap status never substitute for the decisions below.

## Verified baseline

- Local candidate: `slopbrick@0.45.0`, qualified but unpublished.
- Public package: latest repository-verified artifact is `slopbrick@0.43.0`.
- Integrated main checkpoint:
  `11769b3a6d88faa94b16e8a3de96536a8bbc5ca6`.
- Tag, GitHub Release, and npm publication from that integration: none.
- Website read-only check on 2026-07-22: copy aligns on published/candidate
  versions, the 103/119 rule boundary, four scores, local-first network
  wording, and the capability ladder. The deployed commit/SHA is unknown, so
  this content check neither proves which source integration is live nor
  authorizes a future deployment.
- Current high-severity dependency audit: blocked by transitive
  `brace-expansion` and `svgo` advisories. One moderate Astro advisory is also
  present. No Task 19 dependency or lockfile change attempted to resolve them.

## Owner dispositions

| Surface | Decision | Exact reviewed identifier | Action receipt | Verification |
| --- | --- | --- | --- | --- |
| npm package | not authorized | none | none | public package remains separately verified |
| website | not authorized | none | none | copy aligned read-only; deployed SHA unverified |

`not authorized` remains authoritative until the repository owner records
either `hold` or `authorize` for each surface. An authorization must include the
exact commit/SHA and, for npm, the exact tag before any action begins.

An npm authorization is necessary but not sufficient: public release execution
also requires the high-severity dependency audit to pass after a separately
reviewed correction. Local CAL-002 qualification does not waive that gate.

## Verification

```bash
corepack pnpm plans:validate
corepack pnpm security:audit
git diff --check
```

The audit command currently exits nonzero; that result is the recorded release
blocker, not a successful verification claim.
