// v0.24.0 (Workstream C): default HTTP transport for the beacon.
//
// Pure-Node `http.request` / `https.request`, no new deps. The
// transport is fire-and-forget: `req.end()` returns immediately,
// the response (or error / timeout) is drained and ignored, and
// the returned Promise always resolves. This is a deliberate
// guarantee — the scan's exit code must NEVER depend on whether
// the beacon landed.
//
// Failure modes (all silent):
//   - invalid URL              → resolve()
//   - DNS failure              → resolve() (after `error` event)
//   - connection refused       → resolve() (after `error` event)
//   - non-2xx response         → resolve() (after `response` event)
//   - socket hangs past 5s     → resolve() (after timeout destroy)
//   - any other req error      → resolve() (after `error` event)
//
// No console output of any kind. The whole point is to be invisible.

import * as http from 'node:http';
import * as https from 'node:https';
import type { RequestOptions } from 'node:http';
import { URL } from 'node:url';

import type { BeaconPayload, BeaconTransport } from './types.js';

export const sendBeacon: BeaconTransport = (url, payload, timeoutMs) => {
  return new Promise<void>((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      // Malformed URL — silently bail. The CLI layer is the gate;
      // if `SLOPBRICK_TELEMETRY_ENDPOINT` is set to garbage, we
      // simply don't fire.
      resolve();
      return;
    }

    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const body = JSON.stringify(payload);
    const opts: RequestOptions = {
      method: 'POST',
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: `${parsed.pathname || '/'}${parsed.search || ''}`,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        'user-agent': `slopbrick/${payload.slopbrick_version}`,
      },
    };

    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };

    let req: http.ClientRequest;
    try {
      req = lib.request(opts, (res) => {
        // Drain + ignore the response body. We deliberately do not
        // even look at the status code — the contract is "fire and
        // forget, never block the caller on a 4xx/5xx".
        res.on('data', () => {});
        res.on('end', settle);
        res.on('error', settle);
      });
    } catch {
      // lib.request can throw synchronously on bogus options.
      settle();
      return;
    }

    req.on('error', settle);
    // Enforce the wall-clock timeout. `setTimeout` on the
    // request, not on the socket — covers the connect phase too.
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      settle();
    });

    try {
      req.end(body);
    } catch {
      // req.end can throw if the socket was already destroyed.
      settle();
    }
  });
};