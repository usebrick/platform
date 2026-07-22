# Local outcome events

The unreleased `slopbrick@0.45.0` workspace candidate includes a versioned,
privacy-bounded local outcome-event API. It can record whether a scan
completed, whether the first prioritized finding was useful, whether a bounded
action was applied or declined, whether a rescan changed the result, and
whether the user returned inside a coarse observation window.

This is a library contract, not automatic collection. A normal `slopbrick
scan` does not write outcome events. The caller chooses the local JSONL path
and explicitly calls the writer. No outcome-event network transport or hosted
ingestion path exists in v1.

## Wire contract

Every event uses `version: "slopbrick-outcome-event-v1"`. The exported
`OUTCOME_EVENT_SCHEMA_V1` is a strict Draft 2020-12 JSON Schema. It rejects
unknown fields at the event and context levels.

### Common fields

| Field | Values | Purpose |
| --- | --- | --- |
| `version` | `slopbrick-outcome-event-v1` | Closes the event wire version. |
| `event` | One of the four event names below | Selects the event-specific fields. |
| `observedOn` | Valid `YYYY-MM-DD` UTC calendar date | Keeps only the observation day; exact time is omitted. |
| `producerVersion` | Public `major.minor.patch`, with each component `0`–`999` | Identifies the SlopBrick release without prerelease/build text that could carry private identifiers. |
| `context.framework` | `react`, `vue`, `svelte`, `other-web`, `non-web`, `mixed`, or `unknown` | Coarse framework family, not a package fingerprint. |
| `context.repositorySize` | `1-20`, `21-100`, `101-500`, `501-2000`, `2001+`, or `unknown` | Bucket for selected files, not an exact count. |

### Event-specific fields

| Event | Required fields | Meaning |
| --- | --- | --- |
| `scan-completed` | `scanKind`, `status`, `comparison` | Initial scan or rescan completion with a coarse comparison state. |
| `first-finding-assessed` | `detectorId`, `evidenceTier`, `assessment` | Utility assessment for the first prioritized public SlopBrick detector. |
| `action-decided` | `detectorId`, `decision`, `reason` | Applied finding-bound repair, declined action, or deferred review. |
| `return-observed` | `window` | Return within 1, 7, 30, or 90 days without a persistent user or repository ID. |

`assessment` records review utility; it is not a calibration label.
`evidenceTier` is the first-scan evidence boundary; it is not proof of AI
authorship. `detectorId` must be one of the 119 IDs in the immutable v1 public
detector allowlist. Action reasons are closed coarse enums, with no free-form
text.

Scan comparison states are also closed: an initial scan uses
`not-evaluated`; a complete rescan uses `unchanged` or `changed`; and an
incomplete or not-applicable rescan uses `unavailable`.

## Privacy boundary

Accepted events contain no:

- raw source, snippets, file contents, or finding messages;
- file or absolute paths;
- repository names, repository IDs, or remotes;
- user, account, device, or session IDs;
- exact timestamps; or
- free-form metadata.

The runtime validator captures data descriptors into a fixed-key,
null-prototype snapshot before validation. Storage serializes only that
snapshot, never the caller's object, so inherited, proxy-provided, and own
serialization hooks cannot replace a validated event. The JSON Schema rejects
the same ordinary JSON value violations. Validation errors identify an
unknown-field violation without echoing its key or value.

Malformed stored lines—including blank interior lines and a missing final
JSONL newline—fail closed and are not extended by later appends. V1 also caps
one event at 4 KiB and one ledger at 1 MiB or 4,096 events, whichever is
reached first. These bounds keep corruption checks and memory use finite.

The existing one-shot usage beacon is a different mechanism. It remains off
unless both `--report-usage` and `SLOPBRICK_TELEMETRY_ENDPOINT` are supplied,
and its locked payload does not include outcome events. Future outbound use of
outcome events requires a separate reviewed privacy and authorization gate.

## Local lifecycle API

```ts
import {
  appendOutcomeEventV1,
  deleteOutcomeEventsV1,
  exportOutcomeEventsV1,
  readOutcomeEventsV1,
} from 'slopbrick';

const store = '.slopbrick/outcomes/events-v1.jsonl';
const exportPath = '.slopbrick/outcomes/export-v1.json';

appendOutcomeEventV1(store, event);
const events = readOutcomeEventsV1(store);
exportOutcomeEventsV1(store, exportPath);
deleteOutcomeEventsV1(store);
```

The caller supplies both paths. On POSIX, the writer creates missing direct
parent directories with owner-only permissions and requires an existing direct
parent to already be owner-owned and owner-only. Every path component must be
canonical and free of symbolic links; ledgers, locks, and existing export
targets with hard-link aliases are rejected. Platforms without reliable
no-follow semantics fail closed rather than claiming the same guarantee.

Append holds an exclusive sibling lock and validates and writes through the
same open file descriptor. Export writes a private exclusive temporary file
and atomically renames it, producing canonical
`slopbrick-outcome-export-v1` bytes without mutating the ledger. Delete checks
the selected ledger's regular-file, single-link, and device/inode identity
before unlinking it. It is safe to repeat after a successful deletion; alias
paths are rejected rather than reported as deleted.

The sibling lock coordinates callers that use this API. Identity checks are
repeated immediately before lock release and deletion, but v1 does not claim
to withstand a different process running as the same operating-system user
that deliberately swaps directory entries outside the API while an operation
is in progress. Such a process already has access to the owner-private event
data. Non-regular paths such as FIFOs are opened non-blocking and rejected.

These events cannot activate, retire, recalibrate, or change the severity of a
rule. Repository policy remains authoritative over any future global prior.
