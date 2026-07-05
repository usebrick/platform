// v0.42.0 tests for the docs/stale-package-reference JSDoc filtering.
// Verifies that inline-code spans inside /* ... */ block comments
// and // line comments are NOT flagged as stale package references.
// The pre-v0.42.0 rule fired twice during self-scan on real slopbrick
// code — both were `// from 'slopbrick'` and `// export * from '@usebrick/engine'`
// comments at the top of src/index.ts (re-export documentation).
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stalePackageReferenceRule } from '../../src/rules/docs/stale-package-reference';
import type { RuleContext, ScanFacts } from '../../src/types';

function makeCtx(cwd: string, filePath: string): RuleContext {
  return {
    cwd,
    filePath,
    config: {} as RuleContext['config'],
    framework: '',
    uiLibraries: [],
    hasTailwind: false,
    supportsRsc: false,
    hotspotIssues: [],
  };
}

function makeFacts(source: string): ScanFacts {
  return { v2: { _source: source } } as unknown as ScanFacts;
}

describe('docs/stale-package-reference — v0.42.0 inComment filter', () => {
  it('does not fire for from-references inside // line comments', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'spr-test-'));
    try {
      const filePath = join(tmp, 'doc.ts');
      // Mirrors the actual v0.42.0 self-scan FP at src/index.ts:17.
      const source = "// use the engine functions via from 'slopbrick'.\nexport const x = 1;";
      const issues = stalePackageReferenceRule.analyze(
        makeCtx(tmp, filePath),
        makeFacts(source),
      );
      expect(issues).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not fire for from-references inside /* ... */ block comments', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'spr-test-'));
    try {
      const filePath = join(tmp, 'doc.ts');
      const source = "/**\n * Re-export: `export * from '@usebrick/engine'`.\n */\nconst x = 1;";
      const issues = stalePackageReferenceRule.analyze(
        makeCtx(tmp, filePath),
        makeFacts(source),
      );
      expect(issues).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('fires on a backticked install command referencing an unknown package', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'spr-test-'));
    try {
      // The rule's create() reads package.json from cwd to populate
      // the allowed-packages set. The test fixture mirrors a real
      // workspace: a minimal package.json declaring only the rule's
      // own package name.
      writeFileSync(
        join(tmp, 'package.json'),
        JSON.stringify({ name: 'spr-test', version: '0.0.0' }),
      );
      const filePath = join(tmp, 'doc.ts');
      // The rule fires on inline-code spans (backticks) that look
      // like install/import/require commands referencing a package
      // that isn't in package.json. Real bare `import x from 'foo'`
      // statements don't trigger this rule (they're handled by
      // `ai/compression-profile` etc. instead).
      const source = 'Run `npm install not-in-package-json` to set up.';
      // The rule needs create() output (with the populated `packages`
      // set) — invoke create() explicitly so the analyze() call
      // doesn't crash on the missing field.
      const createOut = stalePackageReferenceRule.create(makeCtx(tmp, filePath));
      const issues = stalePackageReferenceRule.analyze(
        createOut as RuleContext,
        makeFacts(source),
      );
      expect(issues.length).toBe(1);
      expect(issues[0]?.extras?.package).toBe('not-in-package-json');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not fire when the package IS in package.json', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'spr-test-'));
    try {
      writeFileSync(
        join(tmp, 'package.json'),
        JSON.stringify({
          name: 'spr-test',
          version: '0.0.0',
          dependencies: { 'is-in-package-json': '*' },
        }),
      );
      const filePath = join(tmp, 'doc.ts');
      const source = 'Run `npm install is-in-package-json` to set up.';
      const createOut = stalePackageReferenceRule.create(makeCtx(tmp, filePath));
      const issues = stalePackageReferenceRule.analyze(
        createOut as RuleContext,
        makeFacts(source),
      );
      expect(issues).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
