# REL-001 public-claim disposition

**Status:** waiting for explicit repository-owner decisions
**Owner:** repository owner / release maintainer
**Recorded release/deployment actions:** none
**Recorded source integration:** Revision 82 source-only integration of
`3170a90d592b9a2a471744a9523ced5e02eb6107`, with Revision 83 clean-runner
closure at `ffb196d00fbb6d467a078374eb7583a6a3f3186` and Revision 84 website
authorization hardening at `2664235978d7e654ce59079046b4031db5c41f6b`

## Reason for existence

This receipt is the only current place where npm release and website deployment
authority may be recorded. Local qualification, merging, pushing, CI, and
roadmap status never substitute for the decisions below.

## Verified baseline

- Local candidate: `slopbrick@0.45.0`, qualified but unpublished.
- Public package: latest repository-verified artifact is `slopbrick@0.43.0`.
- Qualified source checkpoint:
  `3170a90d592b9a2a471744a9523ced5e02eb6107`.
- Revision 82 integrates that checkpoint into `main` as source only. Revision
  83 closes clean-runner portability at
  `ffb196d00fbb6d467a078374eb7583a6a3f3186`. Revision 84's CI-qualified source
  checkpoint `2664235978d7e654ce59079046b4031db5c41f6b` contains both in
  ancestry and is the current remote `main` target.
- GitHub Actions run
  [`30193626877`](https://github.com/usebrick/platform/actions/runs/30193626877)
  passed Node 22 and Node 24 build/test/schema jobs, the production dependency
  security audit, and packed consumers on both versions. Downstream website
  run
  [`30194092698`](https://github.com/usebrick/platform/actions/runs/30194092698)
  skipped its deploy job because no exact SHA was authorized.
- Tag, GitHub Release, npm publication, and website deployment from that
  integration: none.
- Website read-only check on 2026-07-22: copy aligns on published/candidate
  versions, the 103/119 rule boundary, four scores, local-first network
  wording, and the capability ladder. The deployed commit/SHA is unknown, so
  this content check neither proves which source integration is live nor
  authorizes a future deployment.
- Current high-severity dependency audit (2026-07-26): 377 production packages
  were checked with zero advisories at the high threshold.

## Owner dispositions

| Surface | Decision | Exact reviewed identifier | Action receipt | Verification |
| --- | --- | --- | --- | --- |
| npm package | not authorized | none | none | public package remains separately verified |
| website | not authorized | none | none | copy aligned read-only; exact-SHA gate verified by skipped run `30194092698`; deployed SHA unverified |

`not authorized` remains authoritative until the repository owner records
either `hold` or `authorize` for each surface. An authorization must include the
exact commit/SHA and, for npm, the exact tag before any action begins.

An npm authorization is necessary but not sufficient: public release execution
also requires the high-severity dependency audit to pass on the exact selected
candidate. The current checkout passes, but local CAL-002 or LOCK-001
qualification does not waive a release-time rerun.

## Verification

```bash
corepack pnpm plans:validate
corepack pnpm security:audit
git diff --check
```

The audit command currently exits zero. Source integration and hosted CI do not
change the public package or deployed website. They clear only the technical
gate for this checkout; npm and website actions remain unauthorized.
