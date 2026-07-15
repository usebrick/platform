import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBulkPayload, runAudit, severityAtLeast } from './audit-npm-bulk.mjs';

test('buildBulkPayload excludes workspace links and keeps sorted unique production versions', () => {
  const payload = buildBulkPayload([
    {
      dependencies: {
        '@usebrick/core': { version: 'link:../core' },
        alpha: {
          version: '1.0.0',
          dependencies: {
            beta: { version: '2.0.0' },
            gamma: { version: '3.0.0', optionalDependencies: { delta: { version: '4.0.0' } } },
          },
        },
      },
      optionalDependencies: {
        alpha: { version: '1.0.0' },
        beta: { version: '2.1.0' },
      },
    },
  ]);

  assert.deepEqual(payload, {
    alpha: ['1.0.0'],
    beta: ['2.0.0', '2.1.0'],
    delta: ['4.0.0'],
    gamma: ['3.0.0'],
  });
});

test('severityAtLeast applies the requested threshold', () => {
  assert.equal(severityAtLeast('critical', 'high'), true);
  assert.equal(severityAtLeast('high', 'high'), true);
  assert.equal(severityAtLeast('moderate', 'high'), false);
});

test('runAudit parses the bulk response and reports only threshold failures', async () => {
  let request;
  const result = await runAudit({
    tree: [{ dependencies: { alpha: { version: '1.0.0' } } }],
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        alpha: [{ id: 101, severity: 'moderate', title: 'moderate issue', url: 'https://example.test/101' }],
        beta: [{ id: 102, severity: 'high', title: 'high issue', url: 'https://example.test/102' }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    threshold: 'high',
  });

  assert.equal(request.url, 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk');
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), { alpha: ['1.0.0'] });
  assert.equal(result.packageCount, 1);
  assert.equal(result.advisoryCount, 2);
  assert.deepEqual(result.failingAdvisories.map(({ id }) => id), [102]);
});
