# v10.3 release Task 3 cache-root plan rereview

**Date:** 2026-07-11
**Verdict:** **APPROVE / READY**

## Reason for existence

This artifact records the independent rereview of the final Task 3 cache-root
correction before implementation review continues. It covers filesystem trust,
parent-swap resistance, POSIX portability, and the final strict-HTTP-parser
addition. It does not approve implementation, corpus admission, release, push,
tag, publication, or deployment.

## Reviewed input and scope

- Baseline plan SHA-256:
  `2fea604dd10c3a1bb91cd68ebd9ca9fdbb1f9901e8b609e099f204bca25b099e`
- Final candidate plan SHA-256:
  `3c115b75b63544c8fa281fb32532be25ed5d0a71b0afad7571163829668e93c5`
- Superseded intermediate candidate:
  `29204ee8b5ce403e61fde76405ee71a002928e40b092473f0cf8359f4ea28c39`
- Reviewed file:
  `packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md`
- Scope: Task 3 only. The final delta adds the cache-root security contract and
  explicitly pins Node's strict HTTP parser with `insecureHTTPParser: false`.
- `git diff --check` passed.

## Findings

### 1. The canonical pre-existing root is practical and fail-closed

The downloader must not create an unchecked directory chain. It resolves one
already-existing cache root to its canonical path, validates that complete
canonical ancestor chain, and then uses only the canonical path. Missing roots,
failed canonicalization, and unsupported security primitives fail before cache
or network mutation.

For implementation and tests, “non-writable” in the ancestor rule means **not
group/world-writable**: `(mode & 0o022) === 0`. Owner write permission remains
valid. Each ancestor must be a directory owned by UID 0 or the current effective
UID. The only writable-ancestor exception is a UID-0-owned directory with the
sticky bit (`mode & 0o1000`), such as a correctly configured `/tmp`. The
canonical leaf itself must be current-euid-owned and private
(`mode & 0o077 === 0`).

Node's `fsPromises.realpath`, `lstat`, POSIX `uid`/`mode`, and file-open constants
provide the required primitives.

Primary source:

- [Node.js filesystem API](https://nodejs.org/download/release/latest-v24.x/docs/api/fs.html)

### 2. The ancestor policy closes the cross-UID parent-swap path

An unprivileged different-UID process cannot replace a child beneath a
root/euid-owned ancestor that grants no group/world write permission. In a
root-owned sticky writable directory, the restricted-deletion rule prevents a
different unprivileged UID from unlinking or renaming the current-euid-owned
cache root. Any intervening directory owned by another UID, any non-sticky
writable ancestor, or any writable non-root-owned ancestor is rejected.

Canonicalization alone would not be sufficient; the complete ancestor check is
what makes later use of the canonical path defensible. Validation must proceed
over every component through `/`, and all later cache names must be derived from
the accepted canonical root.

This permission model does not claim resistance to root or to a malicious
process running under the same effective UID. A same-euid process already has
the authority to access an euid-owned private cache and is the same POSIX
security principal. Native process isolation would require a separate sandbox
boundary.

Primary sources:

- [Linux `inode(7)` sticky-directory semantics](https://www.man7.org/linux/man-pages/man7/inode.7.html)
- [Linux `unlink(2)` sticky-directory enforcement](https://www.man7.org/linux/man-pages/man2/unlink.2.html)
- [Apple Secure Coding Guide: race conditions and secure file operations](https://developer.apple.com/library/archive/documentation/Security/Conceptual/SecureCodingGuide/Articles/RaceConditions.html)

### 3. Cache-file identity checks are implementable

Existing digest entries are opened with `O_NOFOLLOW | O_NONBLOCK`, checked as
regular files through the opened handle, and compared with the pre-open path
identity using device and inode. This prevents a symlink from being followed,
prevents a FIFO open from hanging where POSIX provides nonblocking open, and
detects path substitution across the open boundary.

The implementation should use BigInt stats for exact identity comparison:
`lstat(path, { bigint: true })` against `fileHandle.stat({ bigint: true })`,
comparing `dev` and `ino` before hashing and rechecking the opened handle after
hashing. Node documents both identifiers and both required flags.

Primary sources:

- [Node.js `Stats`, `O_NOFOLLOW`, and `O_NONBLOCK`](https://nodejs.org/download/release/latest-v24.x/docs/api/fs.html#file-open-constants)
- [Apple guidance for `O_NOFOLLOW`, `lstat`, and descriptor-based `fstat`](https://developer.apple.com/library/archive/documentation/Security/Conceptual/SecureCodingGuide/Articles/RaceConditions.html)

### 4. Standard macOS and Linux temporary paths remain usable

The policy is compatible with both common layouts:

- On macOS, the user temporary directory resolves under `/private/var/folders`.
  The observed chain on the review host was root-owned `0755` system ancestors,
  a current-euid-owned `0755` user ancestor, a current-euid-owned `0700` `T`
  directory, and a `0700` cache leaf. It passes because no ancestor grants
  group/world write. `/private/tmp` also passes when it is root-owned `01777`
  and the cache leaf is current-euid-owned `0700`.
- On Linux, the conventional root-owned `0755` `/` plus root-owned sticky
  `01777` `/tmp` plus a current-euid-owned `0700` cache leaf passes.

The function must use the `realpath` result for subsequent work. A syntactic
alias such as macOS `/var` or `/tmp` may resolve under `/private`; that normal
canonicalization is not itself an unsafe cache-root condition.

Primary sources:

- [Apple `temporaryDirectory`](https://developer.apple.com/documentation/foundation/url/temporarydirectory)
- [Apple secure temporary-directory guidance](https://developer.apple.com/library/archive/documentation/Security/Conceptual/SecureCodingGuide/Articles/RaceConditions.html)
- [Linux Filesystem Hierarchy Standard: `/tmp`](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/ch03s18.html)

### 5. POSIX-only scope and native Windows deferral are proportionate

Node does not expose the required POSIX effective-UID and Unix open-flag
contract uniformly on Windows, and Windows reparse points require a native
handle-based design. Failing closed is safer than silently reducing the cache
identity guarantees. This limitation affects calibration artifact acquisition,
not ordinary SlopBrick scanning. Native Windows support can return only through
an explicit reparse-safe design and review.

### 6. The final strict-parser addition is correct

The final candidate explicitly requires Node's strict HTTP parser. Production
must set `insecureHTTPParser: false` rather than inherit a permissive caller or
environment choice. Node documents that the insecure parser enables leniency,
should be avoided, and defaults to false.

Primary source:

- [Node.js HTTP request options](https://nodejs.org/download/release/latest-v24.x/docs/api/http.html#httprequestoptions-callback)

## Blocking findings

None. The final candidate is **READY** for Task 3 implementation completion and
the subsequent independent filesystem/network security code review.

## Verification

```bash
shasum -a 256 packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md
git diff --check -- packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md
git diff --name-only -- packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md
```
