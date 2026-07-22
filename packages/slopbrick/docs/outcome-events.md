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
| `observedOn` | `YYYY-MM-DD` | Keeps only the observation day; exact time is omitted. |
| `producerVersion` | Semver | Identifies the SlopBrick version that produced or accepted the observation. |
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
authorship. Action reasons are closed coarse enums, with no free-form text.

## Privacy boundary

Accepted events contain no:

- raw source, snippets, file contents, or finding messages;
- file or absolute paths;
- repository names, repository IDs, or remotes;
- user, account, device, or session IDs;
- exact timestamps; or
- free-form metadata.

The runtime validator and JSON Schema reject attempts to add those fields.
Validation errors identify an unknown-field violation without echoing its key
or value.
Malformed stored lines fail closed and are not extended by later appends.

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

appendOutcomeEventV1(store, event);
const events = readOutcomeEventsV1(store);
exportOutcomeEventsV1(store, './outcome-export.json');
deleteOutcomeEventsV1(store);
```

The caller supplies both paths. The writer creates owner-only directories and
forces the ledger and export to owner-only file permissions. Export produces a
deterministic `slopbrick-outcome-export-v1` document and does not mutate the
ledger. Delete removes only the selected ledger and is safe to repeat.

These events cannot activate, retire, recalibrate, or change the severity of a
rule. Repository policy remains authoritative over any future global prior.
