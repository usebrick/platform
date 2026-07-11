# v10.3 release Task 3 IPv4 plan rereview

**Date:** 2026-07-11
**Verdict:** **APPROVE / READY**

## Reason for existence

This artifact records the independent, primary-source-backed rereview of the
second Task 3 correction before implementation continues. It evaluates only
the bounded HTTPS acquisition contract; it does not approve implementation,
corpus admission, release, push, tag, publication, or deployment.

## Reviewed input and scope

- Baseline plan SHA-256:
  `7a20d89c35dcea0d9255e21d3e9cdadf89404c229a7c2dcb474b6bbacac7cb41`
- Candidate plan SHA-256:
  `2fea604dd10c3a1bb91cd68ebd9ca9fdbb1f9901e8b609e099f204bca25b099e`
- Reviewed file:
  `packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md`
- Diff scope: one file, 30 additions and 13 deletions, all within Task 3.
- `git diff --check` passed.
- No Task 1, Task 2, Task 4-8, admission, release, or remote-operation contract
  changed in this candidate.

## Findings

### 1. IPv4-only acquisition is a sound fail-closed boundary

RFC 6052 permits a Network-Specific Prefix of several lengths and explicitly
requires an NSP for translation scenarios involving non-global IPv4. Without
trusted knowledge of the active NAT64 prefix, an IPv4-embedded IPv6 address can
look like ordinary global unicast while translating to a private or otherwise
non-public IPv4 destination. The plan correctly refuses to infer safety from
IPv6 syntax alone.

The production resolver can request every IPv4 result with
`dns.lookup({ family: 4, all: true })`, reject the entire answer set if any A
record violates policy, and then require the connected peer to match a vetted
A result. Any IPv6 result or peer fails closed.

Primary sources:

- [RFC 6052: IPv6 Addressing of IPv4/IPv6 Translators](https://www.rfc-editor.org/rfc/rfc6052.html)
- [Node.js DNS `dns.lookup`](https://nodejs.org/download/release/latest-v24.x/docs/api/dns.html#dnslookuphostname-options-callback)
- [IANA IPv4 Special-Purpose Address Space](https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml)

### 2. The HTTPS/TLS controls are explicit and implementable

Task 3 now requires the production adapter to pin certificate verification on,
set TLS 1.2 as the minimum, cap response headers at 16 KiB, request identity
encoding, disable connection pooling, and retain the original DNS hostname for
Host, SNI, and certificate identity checks. Node supports each required option:
custom `lookup`, `maxHeaderSize`, `agent: false`, `rejectUnauthorized`,
`minVersion`, and `servername`.

Primary sources:

- [Node.js HTTP request options](https://nodejs.org/download/release/latest-v24.x/docs/api/http.html#httprequestoptions-callback)
- [Node.js HTTPS request options](https://nodejs.org/download/release/latest-v24.x/docs/api/https.html#httpsrequestoptions-callback)
- [Node.js TLS client options](https://nodejs.org/download/release/latest-v24.x/docs/api/tls.html#tlsconnectoptions-callback)

### 3. Cache reuse and filesystem identity are fail-closed

The corrected plan requires a real, owner-private cache directory rather than
a symlink or group/world-writable directory. A digest entry is opened
nonblocking, verified as the same regular file across path and handle identity
checks, rehashed through the opened handle, and never trusted by filename
alone. These requirements are compatible with Node file-open flags and
handle-based metadata operations. Implementations must retain `O_NOFOLLOW`
alongside `O_NONBLOCK` where the platform exposes them and fail closed rather
than silently accepting a special file.

Primary source:

- [Node.js filesystem API and file-open flags](https://nodejs.org/download/release/latest-v24.x/docs/api/fs.html)

### 4. The five-minute deadline is stated honestly

The plan no longer claims that a JavaScript timer can preempt an OS-level
filesystem operation. It specifies a five-minute end-to-end **cooperative**
deadline, immediate checks after awaited cache operations, request/body abort,
and cleanup limited to the invocation's unique temporary file. This matches
Node's documented behavior: aborting buffered file operations does not abort an
individual operating-system request, and promise-based filesystem work uses
the libuv thread pool.

Primary source:

- [Node.js filesystem cancellation behavior](https://nodejs.org/download/release/latest-v24.x/docs/api/fs.html#fspromisesreadfilepath-options)

### 5. The 5 GiB policy ceiling is bounded and exact

`expectedBytes` must be a positive safe integer no greater than
`5,368,709,120` bytes. That value is exactly representable as a JavaScript
number. The plan also requires exact `Content-Length` agreement when present,
an exact streaming byte count for chunked responses, and digest verification
before publication. No whole-archive allocation is implied.

### 6. The existing interface and offline preseeding remain consistent

`AcquireArtifactOptions` is unchanged. A valid content-addressed cache entry is
opened, rehashed, and reused before network denial is evaluated. Task 5 can
therefore materialize an offline preseeded archive without a user-provided
`--allow-hosts` argument; the caller may pass the normalized manifest hostname
through the existing internal array while `network: 'deny'` prevents any
request. A missing or invalid cache entry still fails closed.

## Native IPv6 deferral

Deferring native IPv6 is a proportionate security tradeoff for this task. It
does reduce availability for IPv6-only asset hosts, but it preserves offline
preseeding and prevents an SSRF-class NAT64 ambiguity until the system gains a
trusted-prefix authority or an independently enforced network sandbox. Native
IPv6 must return only through a later explicit policy and threat-model review.

## Blocking findings

None. The candidate is **READY** for Task 3 implementation and the subsequent
independent network/security code review.

## Verification

```bash
shasum -a 256 packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md
git diff --check -- packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md
git diff --name-only -- packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md
```
