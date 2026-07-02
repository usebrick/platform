// v0.24.0 (Workstream C): tests for BeaconEmitter.
//
// The emitter is the public surface of the beacon module — these
// tests pin the opt-in contract (`flag && envEndpoint`) and
// assert the wire payload never carries PII even when the test
// fixture is hostile.
//
// We inject a transport (no real HTTP) so the tests are
// hermetic. The injected transport records every call.

import { describe, expect, it, vi } from 'vitest';

import { BeaconEmitter } from '../../src/beacon/index.js';
import type { BeaconStats, BeaconPayload, BeaconTransport } from '../../src/beacon/types.js';

const stats: BeaconStats = {
  scanId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  fileCount: 12,
  ruleCount: 95,
  durationMs: 987,
};

function makeRecordingTransport(): {
  transport: BeaconTransport;
  calls: Array<{ url: string; payload: BeaconPayload; timeoutMs: number }>;
} {
  const calls: Array<{ url: string; payload: BeaconPayload; timeoutMs: number }> = [];
  const transport: BeaconTransport = async (url, payload, timeoutMs) => {
    calls.push({ url, payload, timeoutMs });
  };
  return { transport, calls };
}

describe('beacon/emitter', () => {
  it('default state is OFF — neither flag nor env → no transport call', async () => {
    const { transport, calls } = makeRecordingTransport();
    const emitter = new BeaconEmitter({
      flag: false,
      envEndpoint: undefined,
      version: '0.24.0-test',
      transport,
    });

    expect(emitter.shouldFire()).toBe(false);
    await emitter.emit(stats);

    expect(calls).toHaveLength(0);
  });

  it('respects all four combinations of (flag × env)', async () => {
    const cases: Array<{
      name: string;
      flag: boolean;
      env: string | undefined;
      expectFire: boolean;
    }> = [
      { name: 'flag off, env unset → no fire', flag: false, env: undefined, expectFire: false },
      { name: 'flag on,  env unset → no fire', flag: true, env: undefined, expectFire: false },
      { name: 'flag off, env set   → no fire', flag: false, env: 'https://x.example/', expectFire: false },
      { name: 'flag on,  env set   → fires',   flag: true, env: 'https://x.example/', expectFire: true },
    ];

    for (const c of cases) {
      const { transport, calls } = makeRecordingTransport();
      const emitter = new BeaconEmitter({
        flag: c.flag,
        envEndpoint: c.env,
        version: '0.24.0-test',
        transport,
      });

      expect(emitter.shouldFire(), c.name).toBe(c.expectFire);
      await emitter.emit(stats);
      expect(calls.length, c.name).toBe(c.expectFire ? 1 : 0);
      if (c.expectFire) {
        expect(calls[0].url).toBe(c.env);
      }
    }
  });

  it('treats an empty-string endpoint the same as unset', async () => {
    const { transport, calls } = makeRecordingTransport();
    const emitter = new BeaconEmitter({
      flag: true,
      envEndpoint: '',
      version: '0.24.0-test',
      transport,
    });
    expect(emitter.shouldFire()).toBe(false);
    await emitter.emit(stats);
    expect(calls).toHaveLength(0);
  });

  it('payload shape contains no PII-shaped keys', async () => {
    const { transport, calls } = makeRecordingTransport();
    const emitter = new BeaconEmitter({
      flag: true,
      envEndpoint: 'https://x.example/ingest',
      version: '0.24.0-test',
      transport,
    });

    await emitter.emit({
      scanId: 'ffffffff-1111-4222-8333-444444444444',
      // Intentionally hostile values — if any of these leak into
      // the wire payload, the test fails.
      fileCount: 1,
      ruleCount: 1,
      durationMs: 1,
    });

    expect(calls).toHaveLength(1);
    const sent = calls[0].payload;
    const keys = Object.keys(sent).sort();

    // Exactly 8 fields, locked schema.
    expect(Object.keys(sent)).toEqual([
      'schema_version',
      'slopbrick_version',
      'scan_id',
      'file_count',
      'rule_count',
      'duration_ms',
      'platform',
      'node_version',
    ]);

    // No PII-shaped keys, even if future code paths accidentally
    // spread an object onto the payload.
    const forbidden = ['path', 'filePath', 'file_path', 'ruleId', 'rule_id', 'hash', 'error', 'userId', 'ip', 'hostname', 'repo', 'remote', 'token'];
    for (const key of forbidden) {
      expect(keys).not.toContain(key);
    }
    // Values are coerced from the BeaconStats input — no implicit
    // path / hash / etc. comes through `process.platform` or
    // `process.version` either.
    expect(typeof sent.platform).toBe('string');
    expect(typeof sent.node_version).toBe('string');
    expect(sent.scan_id).toMatch(/^[0-9a-f-]+$/);
  });

  it('is silent when endpoint is missing — no console output', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const { transport, calls } = makeRecordingTransport();
      const emitter = new BeaconEmitter({
        flag: true,
        envEndpoint: undefined,
        version: '0.24.0-test',
        transport,
      });

      await emitter.emit(stats);

      expect(calls).toHaveLength(0);
      expect(errSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});