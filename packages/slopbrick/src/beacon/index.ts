// v0.24.0 (Workstream C): BeaconEmitter — the public surface of
// the beacon module.
//
// `BeaconEmitter.emit(stats)` is called from `program.ts` AFTER
// `runScan` returns. It builds the wire payload from the
// `BeaconStats` collected during the scan, hands it to the
// injected transport, and swallows any error. It is the only
// caller-facing API — `runScan` itself is network-free so
// library users (`scanProject`) and the `watch` / `ci` commands
// stay unaffected.
//
// Opt-in contract:
//   shouldFire() returns true ONLY when BOTH the user passed
//   `--report-usage` AND `SLOPBRICK_TELEMETRY_ENDPOINT` is set
//   in the environment. Either missing → no-op, no warnings, no
//   logs. The CLI sets both via the same `void` call, but the
//   emitter is the source of truth so tests can exercise each
//   branch in isolation.

import type { BeaconStats, BeaconPayload, BeaconTransport } from './types.js';
import { sendBeacon as defaultTransport } from './endpoint.js';

export interface BeaconOptions {
  /** True iff the user passed `--report-usage` on the CLI. */
  flag: boolean;
  /** `process.env.SLOPBRICK_TELEMETRY_ENDPOINT` (undefined when unset). */
  envEndpoint: string | undefined;
  /** `package.json#version` — pulled from `VERSION` in the CLI. */
  version: string;
  /** Test injection point. Defaults to the Node `http`/`https`
   *  transport in `./endpoint.ts`. */
  transport?: BeaconTransport;
}

const BEACON_TIMEOUT_MS = 5_000;

export class BeaconEmitter {
  private readonly flag: boolean;
  private readonly envEndpoint: string | undefined;
  private readonly version: string;
  private readonly transport: BeaconTransport;

  constructor(opts: BeaconOptions) {
    this.flag = opts.flag;
    this.envEndpoint = opts.envEndpoint;
    this.version = opts.version;
    this.transport = opts.transport ?? defaultTransport;
  }

  /**
   * The two-gate opt-in. Returns true only when the user opted in
   * AND the endpoint env var is present and non-empty. Empty
   * string is treated as unset.
   */
  shouldFire(): boolean {
    return this.flag && !!this.envEndpoint && this.envEndpoint.length > 0;
  }

  /**
   * Build the locked 8-field payload and hand it to the transport.
   * Never throws. The returned Promise resolves when the transport
   * resolves — which is always, by contract.
   */
  async emit(stats: BeaconStats): Promise<void> {
    if (!this.shouldFire()) return;

    const payload: BeaconPayload = {
      schema_version: '1',
      slopbrick_version: this.version,
      scan_id: stats.scanId,
      file_count: stats.fileCount,
      rule_count: stats.ruleCount,
      duration_ms: stats.durationMs,
      platform: process.platform,
      node_version: process.version,
    };

    try {
      await this.transport(this.envEndpoint as string, payload, BEACON_TIMEOUT_MS);
    } catch {
      // Defensive: the default transport promises it never rejects,
      // but an injected transport in tests might. Never propagate.
    }
  }
}

export type { BeaconStats, BeaconPayload, BeaconTransport } from './types.js';
export { sendBeacon } from './endpoint.js';