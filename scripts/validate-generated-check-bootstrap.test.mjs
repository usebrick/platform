import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const ciWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const prePushHook = readFileSync(
  new URL('../packages/slopbrick/scripts/pre-push', import.meta.url),
  'utf8',
);

test('generated checks share one clean-checkout bootstrap contract', () => {
  const command = packageJson.scripts?.['generated:check'];
  assert.equal(typeof command, 'string', 'root package must expose generated:check');

  const coreBuild = command.indexOf("pnpm --filter '@usebrick/core' build");
  const downstreamCheck = command.indexOf('generate-rule-registry.ts');
  assert.ok(coreBuild >= 0, 'generated:check must build the private Core workspace package');
  assert.ok(downstreamCheck > coreBuild, 'Core must be built before SlopBrick generators load');

  assert.match(ciWorkflow, /Check generated documentation and registries before build[\s\S]*?run: pnpm generated:check/);
  assert.match(prePushHook, /"\$\{PNPM\[@\]\}" generated:check/);
});
