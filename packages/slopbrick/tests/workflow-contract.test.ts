import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = (name: string): string => readFileSync(
  resolve(process.cwd(), '../../.github/workflows', name),
  'utf8',
);

function actionRefs(source: string): Array<{ action: string; ref: string }> {
  return [...source.matchAll(/^\s+uses:\s+([^@\s]+)@([^\s#]+)\s*$/gm)]
    .map((match) => ({ action: match[1]!, ref: match[2]! }));
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
