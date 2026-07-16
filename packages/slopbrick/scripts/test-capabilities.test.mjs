import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyCapabilities } from './test-capabilities.mjs';

test('classifies a host with all required capabilities as ready', () => {
  assert.deepEqual(
    classifyCapabilities({
      loopback: { ok: true },
      descriptorHeadroom: { ok: true },
      specialFileModes: { ok: true },
    }),
    { status: 'ready', blockers: [] },
  );
});

test('reports every missing required capability without hiding the reason', () => {
  assert.deepEqual(
    classifyCapabilities({
      loopback: { ok: false, error: 'listen EPERM' },
      descriptorHeadroom: { ok: false, error: 'EMFILE' },
      specialFileModes: { ok: false, error: 'setuid bit stripped' },
    }),
    {
      status: 'environment_inconclusive',
      blockers: [
        'loopback: listen EPERM',
        'descriptorHeadroom: EMFILE',
        'specialFileModes: setuid bit stripped',
      ],
    },
  );
});

test('does not gate on optional recursive-watch support', () => {
  assert.deepEqual(
    classifyCapabilities({
      loopback: { ok: true },
      descriptorHeadroom: { ok: true },
      specialFileModes: { ok: true },
      recursiveWatch: { ok: false, error: 'EPERM' },
    }),
    { status: 'ready', blockers: [] },
  );
});
