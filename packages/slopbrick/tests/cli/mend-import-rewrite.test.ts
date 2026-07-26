import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertDistBuilt,
  assertDistSourceFresh,
  cleanupTempDir,
  createTmpDir,
  run,
} from '../helpers/cli';

describe('MEND-001 exact import rewrite CLI proof', () => {
  const workspaces: string[] = [];

  beforeAll(() => {
    assertDistBuilt();
    assertDistSourceFresh();
  });

  afterEach(() => {
    while (workspaces.length > 0) cleanupTempDir(workspaces.pop()!);
  });

  function createWorkspace(): {
    workspace: string;
    sourcePath: string;
    before: Buffer;
    after: Buffer;
  } {
    const workspace = createTmpDir();
    workspaces.push(workspace);
    mkdirSync(join(workspace, 'src'), { recursive: true });

    const sourcePath = join(workspace, 'src', 'Button.tsx');
    const before = Buffer.from(
      'import { Button } from "@/legacy/Button";\r\n\r\nexport { Button };\r\n',
      'utf8',
    );
    const after = Buffer.from(
      'import { Button } from "@/components/ui/Button";\r\n\r\nexport { Button };\r\n',
      'utf8',
    );
    writeFileSync(sourcePath, before);
    writeFileSync(
      join(workspace, 'slopbrick.config.cjs'),
      `module.exports = ${JSON.stringify({
        include: ['src/**/*.{ts,tsx}'],
        allowedImports: ['@/components/ui/'],
        mend: {
          importRewrites: {
            '@/legacy/Button': '@/components/ui/Button',
          },
        },
        thresholds: {
          meanSlop: 100,
          p90Slop: 100,
          individualSlopThreshold: 100,
        },
      }, null, 2)};\n`,
      'utf8',
    );

    return { workspace, sourcePath, before, after };
  }

  it('previews without mutation, applies once, rescans cleanly, and then becomes a no-op', async () => {
    const fixture = createWorkspace();
    const common = [
      'scan',
      '--workspace', fixture.workspace,
      '--rule', 'context/import-path-mismatch',
      '--threads', '1',
      '--no-telemetry',
      '--no-color',
    ];

    const preview = await run([...common, '--fix', '--dry-run']);
    expect(preview.stdout).toContain('Suggested patches');
    expect(preview.stdout).toContain('--- a/src/Button.tsx');
    expect(preview.stdout).toContain('-import { Button } from "@/legacy/Button";');
    expect(preview.stdout).toContain('+import { Button } from "@/components/ui/Button";');
    expect(preview.stdout).toContain('--dry-run: skipping apply step');
    expect(readFileSync(fixture.sourcePath)).toEqual(fixture.before);

    const scanSuggest = await run([...common, '--suggest']);
    expect(scanSuggest.stdout).toContain('Suggested patches');
    expect(scanSuggest.stdout).toContain('+import { Button } from "@/components/ui/Button";');

    const standaloneSuggest = await run([
      'suggest',
      '--workspace', fixture.workspace,
    ]);
    expect(standaloneSuggest.stdout).toContain('Suggested patches');
    expect(standaloneSuggest.stdout).toContain('+import { Button } from "@/components/ui/Button";');

    const apply = await run([...common, '--fix']);
    expect(apply.stdout).toContain('Fixes applied: 1, skipped: 0');
    expect(readFileSync(fixture.sourcePath)).toEqual(fixture.after);

    const rescan = await run([...common, '--format', 'json']);
    const report = JSON.parse(rescan.stdout) as {
      issues: Array<{ ruleId: string }>;
    };
    expect(report.issues.some((issue) => issue.ruleId === 'context/import-path-mismatch')).toBe(false);

    const secondApply = await run([...common, '--fix']);
    expect(secondApply.stdout).toContain('Fixes applied: 0, skipped: 0');
    expect(readFileSync(fixture.sourcePath)).toEqual(fixture.after);
  });

  it('rewrites the module source rather than matching quoted comments or import names', async () => {
    const fixture = createWorkspace();
    const before = Buffer.from(
      'import /* "@/legacy/Button" */ { "@/legacy/Button" as Button } from "@/legacy/Button";\r\n\r\nexport { Button };\r\n',
      'utf8',
    );
    const after = Buffer.from(
      'import /* "@/legacy/Button" */ { "@/legacy/Button" as Button } from "@/components/ui/Button";\r\n\r\nexport { Button };\r\n',
      'utf8',
    );
    writeFileSync(fixture.sourcePath, before);

    const common = [
      'scan',
      '--workspace', fixture.workspace,
      '--rule', 'context/import-path-mismatch',
      '--threads', '1',
      '--no-telemetry',
      '--no-color',
    ];

    const preview = await run([...common, '--fix', '--dry-run']);
    expect(preview.stdout).toContain(
      '+import /* "@/legacy/Button" */ { "@/legacy/Button" as Button } from "@/components/ui/Button";',
    );
    expect(readFileSync(fixture.sourcePath)).toEqual(before);

    const apply = await run([...common, '--fix']);
    expect(apply.stdout).toContain('Fixes applied: 1, skipped: 0');
    expect(readFileSync(fixture.sourcePath)).toEqual(after);

    const rescan = await run([...common, '--format', 'json']);
    const report = JSON.parse(rescan.stdout) as {
      issues: Array<{ ruleId: string }>;
    };
    expect(report.issues.some((issue) => issue.ruleId === 'context/import-path-mismatch')).toBe(false);
  });
});
