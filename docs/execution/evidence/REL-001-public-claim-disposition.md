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
- Tag, GitHub Release, npm publication, and website deployment from that
  integration: none.

## Owner dispositions

| Surface | Decision | Exact reviewed identifier | Action receipt | Verification |
| --- | --- | --- | --- | --- |
| npm package | not authorized | none | none | public package remains separately verified |
| website | not authorized | none | none | live artifact remains separately verified |

`not authorized` remains authoritative until the repository owner records
either `hold` or `authorize` for each surface. An authorization must include the
exact commit/SHA and, for npm, the exact tag before any action begins.

## Verification

```bash
corepack pnpm plans:validate
git diff --check
```
