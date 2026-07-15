# Task 2B fixture-scale authority publication/recovery report

Date: 2026-07-15

## Scope

This slice implements `publishPrebuiltAdmissionAuthority` and
`recoverPrebuiltAdmissionAuthority` in
`packages/slopbrick/src/calibration/v103/admission-authority-rebuild-publication.ts`.
It accepts an explicit, byte-backed graph plus the pure publication plan. It
does not discover a corpus, access the network, invoke the CLI, resolve witness
authority, or publish a release.

## Evidence

- Initial publisher: `da15142fc`.
- Adversarial hardening: `ec85d754c`.
- Boundary-fault normalization: `1b7b1bee1`.
- Focused authority/loader/validator/planner gate: 4 files / 38 tests, one
  worker, green.
- SlopBrick TypeScript (`tsc --noEmit --incremental false`): green.
- `git diff --check`: green.
- Final package-wide one-worker gate: 313 files passed / 5 skipped; 3,596
  tests passed / 9 skipped in 245.32 seconds with a 2 GiB heap cap.

## Implemented guarantees

The publisher validates the Core lock/transaction graph and complete prebuilt
graph before mutation; binds caller plans to the fixed `review/admission`
topology, graph operation, ancestry, source descriptors, and current path;
uses no-clobber regular-file writes and fsync boundaries; stages and promotes
immutable generation directories; checks expected-current CAS; and promotes
source/current pointers in a defined order with authority current last.

Recovery reads only the fixed lock/transaction paths. It checks self-hashes,
transaction/lock identity, nonce and selector binding, transaction state
bindings, every known byte durable at the current phase, current-pointer CAS,
and final output bytes before cleanup. Promoted unknown files are preserved.
Lock-only recovery requires an explicit no-live-writer/from-lock acknowledgement
and cleans only its lock; an orphaned complete transaction can be authenticated,
verified, and cleaned without a lock. Unsupported
`overlap_generation_verified` state is rejected.

## Explicit boundary

The v10.3 prebuilt graph contract carries source-proposal references but not
source-proposal bytes, and the publication request carries tool-receipt hashes
but not indexed receipt objects or snapshot-membership proof. A `complete`
result therefore means only local transaction durability for supplied bytes;
it is not admission readiness and does not change the 329-source census or
candidate/eligible counts. Source-proposal/approval materialization, indexed
tool-receipt authority, operation-aware CLI/resource authority, real static and
witness context, corpus admission, and calibration remain later slices.
