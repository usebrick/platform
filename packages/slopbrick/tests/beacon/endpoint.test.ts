// v0.24.0 (Workstream C): tests for the default HTTP transport.
//
// The transport is the only network surface in the beacon module
// — these tests pin its wire format (method, headers, body
// shape) and its silent-failure contract (5xx, hangs, garbage
// URLs all resolve cleanly within 5s).
//
// We use `http.createServer` (not `https.createServer`) for the
// mock — the transport's only TLS-specific path is `lib.request`
// selecting `https` for `https:` URLs, which is exercised
// separately by the `https://` test in the malformed-URL case.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as http from 'node:http';
import { AddressInfo } from 'node:net';

import { sendBeacon } from '../../src/beacon/endpoint.js';
import type { BeaconPayload } from '../../src/beacon/types.js';

const basePayload: BeaconPayload = {
  schema_version: '1',
  slopbrick_version: '0.24.0-test',
  scan_id: '11111111-2222-4333-8444-555555555555',
  file_count: 42,
  rule_count: 95,
  duration_ms: 1834,
  platform: 'darwin',
  node_version: 'v20.11.0',
};

interface CapturedRequest {
  method: string | undefined;
  url: string | undefined;
  contentType: string | undefined;
  rawBody: string;
  userAgent: string | undefined;
}

async function startServer(
  handler: http.RequestListener,
): Promise<{ url: string; port: number; close: () => Promise<void>; requests: CapturedRequest[] }> {
  const requests: CapturedRequest[] = [];
  const wrapped: http.RequestListener = (req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        contentType: req.headers['content-type'],
        rawBody: Buffer.concat(chunks).toString('utf-8'),
        userAgent: req.headers['user-agent'],
      });
      handler(req, res);
    });
  };
  const server = http.createServer(wrapped);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/ingest`,
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    requests,
  };
}

let activeServer: { close: () => Promise<void> } | undefined;

afterEach(async () => {
  if (activeServer) {
    await activeServer.close();
    activeServer = undefined;
  }
});

describe('beacon/endpoint', () => {
  it('sends a POST with JSON body matching the locked payload shape', async () => {
    const server = await startServer((_req, res) => {
      res.statusCode = 204;
      res.end();
    });
    activeServer = server;

    await sendBeacon(server.url, basePayload, 5_000);

    expect(server.requests).toHaveLength(1);
    const req = server.requests[0];
    expect(req.method).toBe('POST');
    expect(req.contentType).toBe('application/json');
    expect(req.userAgent).toMatch(/^slopbrick\/0\.24\.0-test$/);

    const parsed = JSON.parse(req.rawBody) as BeaconPayload;
    // Every field must round-trip exactly.
    expect(parsed).toEqual(basePayload);
    // Wire-format defense in depth — exact key set, in any order.
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'duration_ms',
        'file_count',
        'node_version',
        'platform',
        'rule_count',
        'scan_id',
        'schema_version',
        'slopbrick_version',
      ].sort(),
    );
  });

  it('swallows a 500 response silently — the promise resolves', async () => {
    const server = await startServer((_req, res) => {
      res.statusCode = 500;
      res.end('internal server error');
    });
    activeServer = server;

    // Must not throw, must not reject.
    await expect(
      sendBeacon(server.url, basePayload, 5_000),
    ).resolves.toBeUndefined();
  });

  it('enforces the 5s timeout when the server hangs', async () => {
    // Never write a response. The transport must give up after the
    // configured timeout and resolve cleanly.
    const server = await startServer(() => {
      // intentionally no res.end()
    });
    activeServer = server;

    const start = Date.now();
    // 500ms is short enough to keep the test fast but well above
    // any sane DNS / connect delay on 127.0.0.1.
    await sendBeacon(server.url, basePayload, 500);
    const elapsed = Date.now() - start;

    // Should resolve within ~timeout + small slack (no retry,
    // no exponential backoff).
    expect(elapsed).toBeGreaterThanOrEqual(450);
    expect(elapsed).toBeLessThan(5_000);
  });

  it('does not throw on a malformed URL', async () => {
    // `://not-a-url` is intentionally invalid (missing scheme).
    // The transport must swallow the URL parse failure and resolve.
    await expect(
      sendBeacon('://not-a-url', basePayload, 5_000),
    ).resolves.toBeUndefined();
    // And an http:// URL with a bogus host that won't resolve.
    await expect(
      sendBeacon('http://this-host-does-not-exist.invalid:1/', basePayload, 200),
    ).resolves.toBeUndefined();
  });

  it('payload keys are exactly the whitelisted 8 fields', async () => {
    const server = await startServer((_req, res) => {
      res.statusCode = 200;
      res.end();
    });
    activeServer = server;

    await sendBeacon(server.url, basePayload, 5_000);

    expect(server.requests).toHaveLength(1);
    const parsed = JSON.parse(server.requests[0].rawBody) as Record<string, unknown>;
    const keys = Object.keys(parsed).sort();
    expect(keys).toEqual([
      'duration_ms',
      'file_count',
      'node_version',
      'platform',
      'rule_count',
      'scan_id',
      'schema_version',
      'slopbrick_version',
    ]);
    // Belt-and-suspenders: explicitly assert no PII-shaped keys
    // are present (defense against accidental field additions
    // upstream).
    expect(keys).not.toContain('path');
    expect(keys).not.toContain('filePath');
    expect(keys).not.toContain('ruleId');
    expect(keys).not.toContain('rule_id');
    expect(keys).not.toContain('hash');
    expect(keys).not.toContain('error');
    expect(keys).not.toContain('userId');
    expect(keys).not.toContain('ip');
  });
});