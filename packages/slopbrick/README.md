# SlopBrick

**Find the visual, frontend, code, and repository-coherence problems that AI
coding workflows amplify.**

SlopBrick is the local scanner and front door to usebrick. It answers the
vibecoder's first question:

> It works—but is it actually well built?

It does **not** prove who wrote code. It finds explainable implementation
patterns: design-token bypasses, giant components, duplicated approaches,
weak state/error handling, accessibility problems, unsafe code, and drift from
the repository's declared conventions.

```bash
npm install -D slopbrick
npx slopbrick init
npx slopbrick scan
```

## Release status

| Surface | Current truth |
|---|---|
| npm | `slopbrick@0.43.0` is the latest published release |
| Published catalog | 103 generated rules in 22 generated categories |
| Workspace | `0.45.0` candidate with 119 generated rules in 27 categories; unreleased |
| Corpus v1 source use | pinned Mendeley v1, 5,000 publisher-labeled AI / 5,000 publisher-labeled Human rows, verified for internal origin measurement and calibration evaluation |
| Calibration | the 576,750-file v10.1 result is historical; it is not v10.3 admission evidence |
| v10.3 | no cohort is currently admitted for a release-calibration claim |

Some registry metadata for v0.43.0 says 24 categories; the tagged generated
catalog and exact npm tarball README record 22. The pinned receipt is
[`../website/src/data/published-release-receipt.json`](../website/src/data/published-release-receipt.json).
The metadata discrepancy must be corrected by a future release, not copied
into documentation.

See the root [roadmap](../../ROADMAP.md), [execution
ledger](../../docs/execution/README.md), and [changelog](./CHANGELOG.md) for
current delivery state.

## Corpus v1 evidence boundary

Corpus v1 currently uses the pinned Mendeley `HumanVSAI_CodeDataset` v1 for
publisher-attested internal origin analysis and calibration evaluation. Its
5,000 AI / 5,000 Human labels are publisher claims bound to exact local bytes,
family-safe splits, and collision checks; they are not witnessed authorship or
quality labels. The source is not approved for public redistribution, and its
use does not admit v10.3 data or activate a rule.

Source permitted use, v10.3 admission, redistribution approval, finding
usefulness, and rule application are separate decisions. The CAL-001 matrix
records `applied: false` and `admitted: false`; owner usefulness review belongs
to [`VAL-001`](../../docs/execution/plans/VAL-001-owner-validation.md). The
repository owner is the only current product tester, and no participant or
fixed pilot gate is active.

## What a scan returns

A scan produces findings with rule IDs, locations, severities, explanations,
and remediation advice. It also reports four independent headline scores:

| Score | Direction | Meaning |
|---|---|---|
| `aiSlopScore` | lower is cleaner | effective AI-associated implementation signals; this is not authorship proof |
| `engineeringHygiene` | higher is better | cleanliness across arch, logic, layout, visual, component, and test burdens |
| `security` | higher is better | score derived from retained security findings |
| `repositoryHealth` | higher is better | `0.4 × (100 − aiSlopScore) + 0.3 × engineeringHygiene + 0.2 × security + 0.1 × testQuality` |

Only valid, complete scan scores are safe for gating. The default
`meanSlop` gate passes when `aiSlopScore <= meanSlop`. Partial scans carry
accounting and diagnostics but are not release-grade threshold evidence;
empty or not-applicable scans omit canonical score fields.

For the full contract, see [scoring explained](./docs/scoring-explained.md) and
the [scoring runbook](./docs/scoring-runbook.md).

## Repository-owned artifacts

Unless `projectMemory: false` is configured, a valid scan writes three JSON
artifacts and one derived Markdown summary:

```text
.slopbrick/
├── inventory.json
├── constitution.json
├── health.json
└── structure.md
```

SlopBrick can also maintain a bounded legacy/local
`.slopbrick/structure.json` run-history log. It is not a fourth canonical
snapshot and does not implement core's `structure.schema.json` projection.

- `inventory.json` records detected patterns and component fingerprints.
- `constitution.json` mirrors declared repository policy.
- `health.json` records the score-bearing health snapshot when applicable.
- `structure.md` is a concise, agent-readable projection of the inventory and
  constitution.

These files are the first practical layer of the planned MemoryBrick
substrate. An AI tool does not discover them automatically: connect the MCP
server, use the managed instruction snippets created by `slopbrick init`, or
explicitly include the artifact in that tool's repository instructions.

See the [artifact contract](./docs/repository-structure.md).

## Quick start

```bash
# Create slopbrick.config.mjs and managed agent-instruction snippets.
npx slopbrick init

# Scan the current repository.
npx slopbrick scan

# Explain the deterministic aggregate inputs.
npx slopbrick scan --explain-score

# Show only the compact result and gate.
npx slopbrick scan --brief

# Get remediation advice.
npx slopbrick scan --suggest

# Save a reviewed baseline.
npx slopbrick scan --baseline

# Fail CI only when stable finding identities exceed the reviewed debt baseline.
npx slopbrick ci --max-new-issues 0
```

Use `--workspace <path>` for another project and `slopbrick --help` for the
runtime-generated command reference. Do not rely on a hard-coded command count
in documentation.

### CI and local prevention primitives

```bash
npx slopbrick ci
npx slopbrick lock      # install the pre-commit gate
npx slopbrick watch
```

These are current SlopBrick capabilities. **LockBrick** is the planned paid
policy/governance layer; the name should not be used to imply that a separate
LockBrick product already ships.

`scan --baseline` writes the score baseline and a separate durable finding
baseline under `.slopbrick/cache/`. `ci --max-new-issues <n>` compares stable
finding identities with that reviewed debt baseline; it fails closed when the
debt baseline is missing or its config identity no longer matches.

For CI and monorepo configurations, see [EXAMPLES.md](./EXAMPLES.md) and the
[ready-to-copy examples](./examples/).

## MCP integration

Start the bundled stdio MCP server:

```bash
npx slopbrick mcp
```

Example client configuration:

```json
{
  "mcpServers": {
    "slopbrick": {
      "command": "npx",
      "args": ["slopbrick", "mcp"]
    }
  }
}
```

The MCP surface can scan a draft file, explain a rule, read repository
patterns, check declared policy, and find similar implementations. Exact tools
are generated from the runtime registry in [the MCP guide](./docs/MCP.md).

## Local history and outbound reporting

Two different mechanisms are intentionally separated:

### Local scan history: on by default

SlopBrick has two local history paths: the project-memory run log
`.slopbrick/structure.json`, and the richer flywheel log
`.slopbrick/flywheel/scans.jsonl`. The former follows `projectMemory`; the
latter supports trend/drift analysis and is disabled for a run with
`--no-telemetry` or in configuration with `telemetry: false`.

`--no-telemetry` does not disable the canonical repository snapshots or the
project-memory run log. Set `projectMemory: false` separately when those writes
are unwanted.

### Outbound usage beacon: off by default

No usage request is sent unless **both** conditions are present:

```bash
export SLOPBRICK_TELEMETRY_ENDPOINT="https://your-host.example/ingest"
npx slopbrick scan --report-usage
```

The current beacon JSON contains a bounded operational payload (schema and
SlopBrick versions, random scan ID, file/rule counts, duration, platform, and
Node version). It does not include source code, file paths, rule IDs, findings,
or user identifiers. As with any network request, the receiving infrastructure
can observe ordinary transport metadata such as the source IP; that metadata is
not a JSON payload field.

Beacon failures do not change the scan exit code. Review the implementation in
[`src/beacon/`](./src/beacon/) and its tests before changing the privacy
contract.

## Rule and language scope

The workspace [rule catalog](./docs/rule-catalog.md) and [language support
matrix](./docs/language-support-matrix.md) are generated artifacts. Discovery
of a file extension does not imply a complete language AST, a calibrated rule,
or an authorship verdict. Default-off and unavailable-calibration metadata
must stay visible.

New rules start default-off until they meet the current calibration and review
policy. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Documentation

| Need | Source |
|---|---|
| Product direction and sequencing | [root roadmap](../../ROADMAP.md) |
| Active plans and status | [execution ledger](../../docs/execution/README.md) |
| Configure scans and CI | [EXAMPLES.md](./EXAMPLES.md) |
| Add or change a rule | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| Understand scores | [scoring explained](./docs/scoring-explained.md) |
| Operate score gates | [scoring runbook](./docs/scoring-runbook.md) |
| Connect an MCP client | [MCP guide](./docs/MCP.md) |
| Read persisted artifacts | [repository structure](./docs/repository-structure.md) |
| Inspect current rules | [generated rule catalog](./docs/rule-catalog.md) |
| Inspect language scope | [generated language matrix](./docs/language-support-matrix.md) |
| Review calibration status | [calibration index](./docs/calibration/README.md) |
| Report a vulnerability | [SECURITY.md](./SECURITY.md) |

## Runtime and package

The unreleased workspace candidate supports Node.js 22 and 24
(`^22.0.0 || ^24.0.0`). The already-published `slopbrick@0.43.0` package
declared Node.js `>=20`; that historical metadata is not the v0.45.0
qualification target. The npm package ships the `slopbrick` CLI plus ESM,
CJS, and TypeScript library entry points.

Releases are published only through the repository's reviewed GitHub Release
and OIDC workflow. Maintainers must not run `pnpm publish` or `npm publish`
locally.

## License

[MIT](./LICENSE) © 2026 usebrick
