import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const ciWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const publishWorkflow = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');
const prePushHook = readFileSync(
  new URL('../packages/slopbrick/scripts/pre-push', import.meta.url),
  'utf8',
);

function namedWorkflowStep(workflow, name) {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, `workflow must contain the ${name} step`);
  const next = workflow.indexOf('\n      - name:', start + marker.length);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

test('generated checks share one clean-checkout bootstrap contract', () => {
  const command = packageJson.scripts?.['generated:check'];
  assert.equal(typeof command, 'string', 'root package must expose generated:check');

  const coreBuild = command.search(/pnpm --filter ['"]?@usebrick\/core['"]? build/);
  assert.ok(coreBuild >= 0, 'generated:check must build the private Core workspace package');
  for (const generator of [
    'generate-rule-registry.ts',
    'generate-rule-catalog.ts',
    'generate-language-support-matrix.ts',
    'generate-mcp-docs.ts',
  ]) {
    const matches = command.split(generator).length - 1;
    assert.equal(matches, 1, `generated:check must invoke ${generator} exactly once`);
    assert.ok(command.indexOf(generator) > coreBuild, `${generator} must run after Core is built`);
  }

  const ciGeneratedStep = namedWorkflowStep(ciWorkflow, 'Check generated documentation and registries before build');
  assert.match(ciGeneratedStep, /\n\s+run: pnpm generated:check\s*$/);

  const publishGateStep = namedWorkflowStep(publishWorkflow, 'Run release quality gates');
  const publishGeneratedCheck = publishGateStep.indexOf('corepack pnpm generated:check');
  assert.ok(publishGeneratedCheck >= 0, 'publish must delegate to generated:check');
  for (const laterGate of ['-r typecheck', '-r test', '-r build']) {
    assert.ok(publishGateStep.indexOf(laterGate) > publishGeneratedCheck, `${laterGate} must follow generated:check`);
  }

  const prePushGeneratedCheck = prePushHook.indexOf('"${PNPM[@]}" generated:check');
  assert.ok(prePushGeneratedCheck >= 0, 'pre-push must delegate to generated:check');
  for (const laterGate of ['-r typecheck', '-r test', '-r build']) {
    assert.ok(prePushHook.indexOf(laterGate) > prePushGeneratedCheck, `${laterGate} must follow the pre-push freshness check`);
  }
});
