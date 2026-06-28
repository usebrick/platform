# Security Policy

## Supported versions

| Version | Supported          |
|---------|--------------------|
| 0.14.x  | ✅ Current release (active development) |
| 0.13.x  | ⚠️ Critical fixes only (security + data loss) |
| 0.12.x  | ❌ End of life (Aug 2026) |
| < 0.12  | ❌ Not supported |

The 0.9.x → 0.10.x → 0.14.x line is the **calibration era** — every
release refines the rule set. Security fixes are merged into the
latest 0.14.x and backported to 0.13.x for critical issues only.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Email: **security@usebrick.dev**

For non-critical issues (e.g. an npm package that slopbrick is
unnecessarily pulling in), open a public issue.

### What to include

1. **The vulnerability** — what is the attack vector? (e.g. "the
   `slop_suggest` MCP tool returns unsanitized file content to the
   LLM, which can be tricked into exfiltrating environment
   variables")
2. **The slopbrick version** (`npx slopbrick --version`)
3. **A reproducer** — the minimum commands + a sample file (if
   the issue requires input)
4. **The impact** — what can an attacker achieve? (info leak,
   RCE, slopbrick-cli user compromise, etc.)
5. **Your assessment** — is it a dependency issue? a tool
   behavior issue? a config issue?

### Response timeline

| Stage | When |
|-------|------|
| **Initial acknowledgement** | within 48 hours |
| **Triage** (severity, scope) | within 7 days |
| **Patch release** for HIGH/CRITICAL | within 14 days |
| **Patch release** for MEDIUM/LOW | bundled with next release |

Critical issues (RCE, package install compromise) get a patch
within 14 days and a public advisory after the fix ships.

## Security best practices for slopbrick users

The `.slopbrick/memory.md` and `.slopbrick/inventory.json` files
contain **codebase metadata** — file paths, library versions,
patterns. They do NOT contain secrets by design (slopbrick redacts
common secret patterns at scan time). But:

1. **Don't commit `.slopbrick/` to public repos** unless you
   intend to share the metadata publicly. The `health.json`
   contains scores that could leak information about your
   codebase's structure.
2. **If you opt in to the MCP server** (`slopbrick mcp`),
   configure it to only connect to trusted AI agents. The MCP
   server speaks JSON-RPC 2.0 over stdio — any process that can
   read the agent's stdin can call `slop_suggest` and read
   `.slopbrick/memory.md`.
3. **Watch for false positives in `security/*` rules.** slopbrick
   catches secrets, XSS, and SQL injection patterns. If you have
   a known-safe file that fires (e.g. a test fixture), add it
   to `exclude` in `slopbrick.config.mjs` rather than disabling
   the rule globally.
4. **The `ai/security-risk` band in self-scans** is a heuristic
   based on rule fire patterns, not a real SAST. Don't rely on
   it for production security review.

## Out-of-scope

The following are NOT security issues and should be filed as
regular issues:

- "The `slop_check_constitution` tool returns paths that don't
  exist" — bug report
- "The `slop_suggest_with_memory` doesn't include my new rule" —
  bug report
- "I'd like a rule that catches X" — feature request
- "False positive: rule Y fired on Z" — calibration feedback

## Acknowledgements

We follow [GitHub's security advisory process](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
for disclosure. Reporters are credited in the release notes
unless they prefer anonymity.

## Out-of-band

For issues that don't fit this policy (e.g. license compliance,
trademark, or terms-of-service questions), contact
**legal@usebrick.dev**.
