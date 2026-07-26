import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = (name: string): string => readFileSync(
  resolve(process.cwd(), '../../.github/workflows', name),
  'utf8',
);

const repoFile = (path: string): string => readFileSync(
  resolve(process.cwd(), '../..', path),
  'utf8',
);

function actionRefs(source: string): Array<{ action: string; ref: string }> {
  return [...source.matchAll(/^\s+uses:\s+([^@\s]+)@([^\s#]+)\s*$/gm)]
    .map((match) => ({ action: match[1]!, ref: match[2]! }));
}

function namedStep(source: string, name: string): string {
  const marker = `      - name: ${name}`;
  const start = source.indexOf(marker);
  expect(start, `missing workflow step: ${name}`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf('\n      - name:', start + marker.length);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('release workflow contracts', () => {
  it('pins every third-party action in the reviewed workflows', () => {
    const refs = [
      ...actionRefs(workflow('deploy-website.yml')),
      ...actionRefs(workflow('slopbrick-review.yml')),
      ...actionRefs(workflow('publish.yml')),
    ];

    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every(({ ref }) => /^[0-9a-f]{40}$/.test(ref))).toBe(true);
  });

  it('keeps the monorepo CI matrix on reviewed immutable action refs', () => {
    const refs = actionRefs(workflow('ci.yml'));
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.every(({ ref }) => /^[0-9a-f]{40}$/.test(ref))).toBe(true);
  });

  it('uses the repository packageManager instead of a floating pnpm major', () => {
    const sources = ['ci.yml', 'slopbrick-review.yml', 'publish.yml', 'deploy-website.yml']
      .map(workflow);
    for (const source of sources) {
      expect(source).not.toMatch(/uses:\s+pnpm\/action-setup@[\da-f]+[\s\S]{0,180}version:\s*9\b/);
    }
  });

  it('keeps hosted full-suite worker budgets aligned with the release pre-push gate', () => {
    for (const [workflowName, stepName] of [
      ['ci.yml', 'Test all packages'],
      ['publish.yml', 'Run release quality gates'],
    ] as const) {
      const step = namedStep(workflow(workflowName), stepName);
      expect(step).toMatch(/env:\s*\n\s+SLOPBRICK_VITEST_WORKERS:\s*['"]?1['"]?/);
    }
  });

  it('fails closed before any website deployment without exact-SHA owner authorization', () => {
    const source = workflow('deploy-website.yml');
    const setup = repoFile('packages/website/README.md');

    expect(source).toContain('commit_sha:');
    expect(source).toContain("vars.WEBSITE_DEPLOY_SHA == github.event.workflow_run.head_sha");
    expect(source).toContain("vars.WEBSITE_DEPLOY_SHA != ''");
    expect(namedStep(source, 'Verify exact owner-authorized deployment SHA')).toContain(
      'TARGET_SHA" =~ ^[0-9a-f]{40}$',
    );
    expect(namedStep(source, 'Verify Cloudflare deployment credentials')).toContain(
      'CLOUDFLARE_PAGES_PROJECT_NAME',
    );

    const deployStep = namedStep(source, 'Deploy to Cloudflare Pages');
    expect(deployStep).toContain(
      'uses: cloudflare/wrangler-action@ebbaa1584979971c8614a24965b4405ff95890e0',
    );
    expect(deployStep).toContain('wranglerVersion: 4.114.0');
    expect(deployStep).toContain('packageManager: npm');

    expect(setup).toContain('WEBSITE_DEPLOY_SHA');
    expect(setup).toContain('exact 40-character commit SHA');
    expect(setup).not.toContain('triggers on `push: branches: [main]` with a path filter');
  });

  it('keeps manual PR review inputs and threshold/runtime exit semantics explicit', () => {
    const source = workflow('slopbrick-review.yml');

    expect(source).toContain('workflow_dispatch:');
    expect(source).toContain('pr_number:');
    expect(source).toContain('base_ref:');
    expect(source).toContain('head_sha:');
    expect(source).toContain('summary<<SLOPBRICK_SUMMARY');
    expect(source).toContain('if [ "$EXITCODE" -ge 2 ]');
    expect(source).toContain("steps.scan.outputs.exitcode == '1'");
    expect(source).toContain('git check-ref-format --branch "$BASE_REF"');
    expect(source).toContain('HEAD_SHA" =~ ^[0-9a-fA-F]{40,64}$');
  });

  it('binds publication to the exact release tag and uploaded artifact', () => {
    const source = workflow('publish.yml');

    expect(source).toContain('refs/tags/$TAG^{commit}');
    expect(source).toContain('^v[0-9]+\\.[0-9]+\\.[0-9]+$');
    expect(source).toContain('TAG_COMMIT');
    expect(source).toContain('id-token: write');
    expect(source).toContain('Upload checksum-bound release artifact');
    expect(source).toContain('Verify artifact receipt and checksum');
    expect(source).toContain('npm publish "$RUNNER_TEMP/slopbrick-release/slopbrick-$VERSION.tgz"');
    expect(source).toContain('publish_required=false');
  });
});
