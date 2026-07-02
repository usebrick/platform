// v0.24.0 (Workstream C): opt-in network beacon.
//
// The beacon is the v9 corpus CI / self-hosted use case's
// lightweight "I ran a scan" signal. It is opt-in (default OFF),
// fires once per `slopbrick scan` invocation at the very end, and
// carries a frozen 8-field payload (no paths, no rule ids, no
// file contents, no user identifiers). See
// `docs/research/beacon-design.md` for the threat model and
// rejection criteria.
//
// Transport is injected so tests can assert on the wire format
// without spinning up a real HTTP listener. The default
// implementation lives in `./endpoint.ts` (Node `http`/`https`,
// fire-and-forget, 5s timeout, errors swallowed).

export interface BeaconStats {
  /** UUID v4 generated at the start of the scan (correlates with
   *  local flywheel rows without leaving the host). */
  scanId: string;
  /** Number of files that ran through the worker pool / inline
   *  path. Excludes files skipped by the incremental cache. */
  fileCount: number;
  /** Number of registered rules for this run (builtin count, or 1
   *  when `--rule <id>` is in effect). */
  ruleCount: number;
  /** Wall-clock scan duration in milliseconds, measured from
   *  `runScan` entry to `runScan` return. */
  durationMs: number;
}

/**
 * The on-the-wire payload. The shape is LOCKED — every field is
 * intentional, and adding a new one is a breaking change for
 * v9-corpus receivers (see `docs/research/beacon-design.md`).
 */
export interface BeaconPayload {
  schema_version: '1';
  slopbrick_version: string;
  scan_id: string;
  file_count: number;
  rule_count: number;
  duration_ms: number;
  platform: NodeJS.Platform;
  node_version: string;
}

/**
 * Transport injection point. Implementations MUST:
 *   - resolve (never reject) on transport-level failure
 *   - resolve (never reject) on non-2xx HTTP response
 *   - enforce the timeout (resolve when it elapses)
 *   - not log to stdout
 */
export type BeaconTransport = (
  url: string,
  payload: BeaconPayload,
  timeoutMs: number,
) => Promise<void>;