# v10.3 release-materialization Task 3 plan targeted rereview

**Date:** 2026-07-11
**Verdict:** **APPROVE / READY**

## Reviewed bytes and scope

- Baseline plan SHA-256:
  `0115a2c73dcfd0a086c70b1e3fe6519558bf7c34ff4942d97d52c3dfa92c585d`
- Candidate plan SHA-256:
  `7a20d89c35dcea0d9255e21d3e9cdadf89404c229a7c2dcb474b6bbacac7cb41`
- Reviewed file:
  `packages/slopbrick/docs/calibration/v10.3-release-asset-materialization-plan.md`

`git diff --unified=0` confines every changed hunk to Task 3. Tasks 1-2 and
Tasks 4-8 are otherwise byte-unchanged. This rereview made no plan or
implementation change.

## Corrected defects

| Defect | Rereview evidence | Result |
|---|---|---|
| No-overwrite publication | Task 3 now creates a same-directory random `wx`, mode-`0600` temporary file, syncs and closes it, publishes with `link`-if-absent, and rehashes an `EEXIST` winner without deleting or replacing an invalid target. Node documents that `rename` overwrites an existing target, while POSIX `link` fails when the new entry exists. | Correct and testable. |
| Duplicate/framing headers | The transport exposes distinct/raw values before policy checks. Tests reject duplicate or invalid `Content-Length`, `Content-Length` plus `Transfer-Encoding`, duplicate `Location`, non-identity content encoding, and `206`. Node 20 exposes `headersDistinct` and exact `rawHeaders`; RFC 9112 identifies ambiguous framing and CL+TE as unsafe. | Correct, fail-closed, and implementable with Node 20 built-ins. |
| DNS and SSRF | Every hop requires canonical exact-host allow-list matching, OS lookup in all-address mode, rejection if any answer is non-public, rejection of mapped IPv6, no pooled connection, and verification that the connected peer is one of the vetted answers. The original hostname remains in use for Host, SNI, and certificate verification. | Correctly closes redirect rebinding, mixed-answer, and peer-substitution paths. |
| Redirect policy | Only 301, 302, 303, 307, and 308 are followed; each hop repeats URL, host, port, DNS, TLS, and header policy. Five followed redirects are accepted, the sixth is rejected, and loops or missing/duplicate `Location` fail. | Boundary is explicit and consistent with RFC 9110. |
| Timeouts and cleanup | A 30-second idle deadline and five-minute whole-operation deadline abort the request/body and remove only this invocation's temporary file. The injected abort/destroy boundary and fake timers make both cases deterministic to test. | Correct and not dependent on live internet or wall-clock waits. |
| Redaction | Public errors use stable constant codes/messages and never interpolate authorization data, query secrets, cache paths, response bodies, or raw underlying messages, causes, or stacks. | Correct and mutation-testable. |
| Dependency scope | Task 3 no longer owns `package.json` or `pnpm-lock.yaml`; it uses Node built-ins only. ZIP dependencies remain in Task 4. | Ownership is correct and avoids an unnecessary dependency tranche. |
| Network default | `network` is optional and omission is explicitly tested as denied. | Default is unambiguous and fail-closed. |

## Primary-source checks

- Node.js 20 HTTP headers: <https://nodejs.org/download/release/latest-v20.x/docs/api/http.html#messageheadersdistinct>
- Node.js 20 raw headers: <https://nodejs.org/download/release/latest-v20.x/docs/api/http.html#messagerawheaders>
- Node.js 20 HTTP request options, including custom `lookup` and agent control: <https://nodejs.org/download/release/latest-v20.x/docs/api/http.html#httprequesturl-options-callback>
- Node.js 20 HTTPS agent defaults: <https://nodejs.org/download/release/latest-v20.x/docs/api/https.html#httpsglobalagent>
- Node.js 20 all-address OS lookup: <https://nodejs.org/download/release/latest-v20.x/docs/api/dns.html#dnslookuphostname-options-callback>
- Node.js 20 connected peer address: <https://nodejs.org/download/release/latest-v20.x/docs/api/net.html#socketremoteaddress>
- Node.js 20 `fs.link`: <https://nodejs.org/download/release/latest-v20.x/docs/api/fs.html#fslinkexistingpath-newpath-callback>
- Node.js 20 `fs.rename`: <https://nodejs.org/download/release/latest-v20.x/docs/api/fs.html#fsrenameoldpath-newpath-callback>
- Node.js 20 `FileHandle.sync`: <https://nodejs.org/download/release/latest-v20.x/docs/api/fs.html#filehandlesync>
- POSIX link `EEXIST` behavior: <https://man7.org/linux/man-pages/man3/link.3p.html>
- POSIX rename replacement behavior: <https://pubs.opengroup.org/onlinepubs/000095399/functions/rename.html>
- IANA IPv4 special-purpose registry: <https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml>
- IANA IPv6 special-purpose registry: <https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xhtml>
- RFC 9112 HTTP/1.1 framing: <https://www.rfc-editor.org/rfc/rfc9112.html#section-6>
- RFC 9110 redirection semantics: <https://www.rfc-editor.org/rfc/rfc9110.html#section-15.4>
- Node.js 20 WHATWG URL/Punycode behavior: <https://nodejs.org/download/release/latest-v20.x/docs/api/url.html#the-whatwg-url-api>

## Nonblocking implementation note

Exercise the stated "invalid pre-existing digest path" rule with symlink and
other non-regular entries. A symlink whose target happens to be a valid regular
file must not qualify as a valid cache entry. This is an implementation/test
detail already entailed by the plan's requirement to rehash an opened regular-
file handle and never accept an invalid digest path; it does not require a plan
edit.

## Final verdict

**APPROVE / READY.** The Task 3 delta resolves the reviewed no-overwrite,
duplicate-header, DNS/SSRF, redirect, timeout, redaction, dependency-scope, and
network-default defects without contradiction or an impossible-to-test
requirement.
