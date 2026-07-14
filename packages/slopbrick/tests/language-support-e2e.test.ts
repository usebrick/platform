import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

import { LANGUAGE_SUPPORT } from '../src/engine/language-support';
import { runScan } from '../src/cli/scan';
import { assertDistBuilt, assertDistSourceFresh, cleanupTempDir, createTmpDir, run, workerScript } from './helpers/cli';

const WITNESS_RULE_ID = 'typo/placeholder-text';

const LANGUAGE_SOURCES: Record<string, string> = {
  '.ts': 'export function answer(): number { return 42; }\n',
  '.js': 'export function answer() { return 42; }\n',
  '.jsx': 'export const Button = () => <button>Save</button>;\n',
  '.py': 'def answer():\n    return 42\n',
  '.go': 'package main\nfunc answer() int { return 42 }\n',
  '.rs': 'fn answer() -> i32 { 42 }\n',
  '.dart': 'int answer() => 42;\n',
  '.rb': 'def answer\n  42\nend\n',
  '.php': '<?php function answer(): int { return 42; }\n',
  '.cs': 'class Answer { public int Value() => 42; }\n',
  '.java': 'class Answer { int value() { return 42; } }\n',
  '.kt': 'fun answer(): Int = 42\n',
  '.kts': 'fun answer(): Int = 42\n',
  '.swift': 'func answer() -> Int { return 42 }\n',
  '.c': 'int answer(void) { return 42; }\n',
  '.h': 'int answer(void);\n',
  '.cc': 'int answer() { return 42; }\n',
  '.cpp': 'int answer() { return 42; }\n',
  '.cxx': 'int answer() { return 42; }\n',
  '.hpp': 'int answer();\n',
  '.hxx': 'int answer();\n',
  '.tsx': 'export const Button = () => <button>Save</button>;\n',
  '.vue': '<template><button>Save</button></template>\n<script setup lang="ts">const value = 1;</script>\n',
  '.svelte': '<script>const value = 1;</script>\n<button>Save</button>\n',
  '.astro': '---\nconst value = 1;\n---\n<button>Save</button>\n',
  '.html': '<!doctype html><button>Save</button>\n',
};

function addRuleWitness(extension: string, source: string): string {
  const marker = extension === '.py' || extension === '.rb'
    ? '# placeholder="TODO"'
    : extension === '.html' || extension === '.vue' || extension === '.svelte' || extension === '.astro'
      ? '<!-- placeholder="TODO" -->'
      : '// placeholder="TODO"';
  return `${source}${marker}\n`;
}

const dirs: string[] = [];

function createLanguageWorkspace(): { dir: string; expectedFiles: number; expectedPaths: string[]; expectedSources: Record<string, string> } {
  const dir = createTmpDir();
  dirs.push(dir);
  const sourceDir = join(dir, 'src');
  mkdirSync(sourceDir, { recursive: true });
  const expectedSources: Record<string, string> = {};

  const fixtures = LANGUAGE_SUPPORT.flatMap((entry) => {
    const prefix = entry.language.replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '').toLowerCase();
    return entry.extensions.map((extension) => ({ name: `${prefix}-${extension.slice(1)}`, extension }));
  });

  for (const fixture of fixtures) {
    const source = LANGUAGE_SOURCES[fixture.extension];
    if (!source) throw new Error(`Missing language fixture source for ${fixture.extension}`);
    const fullSource = addRuleWitness(fixture.extension, source);
    writeFileSync(join(sourceDir, `${fixture.name}${fixture.extension}`), fullSource);
    expectedSources[`src/${fixture.name}${fixture.extension}`] = fullSource;
  }
  return {
    dir,
    expectedFiles: fixtures.length,
    expectedPaths: fixtures.map(({ name, extension }) => `src/${name}${extension}`).sort(),
    expectedSources,
  };
}

afterEach(() => {
  while (dirs.length > 0) cleanupTempDir(dirs.pop()!);
});

describe('advertised language support CLI contract', () => {
  beforeAll(() => {
    assertDistBuilt();
    assertDistSourceFresh();
  });

  it('routes every advertised extension through the full CLI', async () => {
    const { dir, expectedFiles, expectedPaths, expectedSources } = createLanguageWorkspace();
    const direct = await runScan({
      workspace: dir,
      include: ['**/*'],
      includeRules: [WITNESS_RULE_ID],
      quiet: true,
      telemetry: false,
      threadCount: 1,
      workerScript,
    });
    expect(direct.scanStats).toMatchObject({
      status: 'complete',
      requested: expectedFiles,
      analyzed: expectedFiles,
      failed: 0,
      skipped: 0,
      scanAccounting: {
        selected: expectedFiles,
        analyzed: expectedFiles,
        parseFailed: 0,
        timedOut: 0,
        crashed: 0,
        internalFailed: 0,
      },
    });
    expect(direct.results.map(({ filePath }) => relative(dir, filePath).replaceAll('\\', '/')).sort()).toEqual(expectedPaths);
    expect(direct.results.every(({ filePath, facts }) => facts?.filePath === filePath && typeof facts.v2?._source === 'string')).toBe(true);
    for (const result of direct.results) {
      const relPath = relative(dir, result.filePath).replaceAll('\\', '/');
      expect(result.facts?.v2?._source).toBe(expectedSources[relPath]);
      expect(result.facts?.v2?.file).toMatchObject({
        path: result.filePath,
        extension: extname(result.filePath).toLowerCase(),
      });
    }
    const rustResult = direct.results.find(({ filePath }) => filePath.endsWith('.rs'));
    expect(rustResult?.facts?.v2?.rustFile?.functions.some(({ name }) => name === 'answer')).toBe(true);
    const tsxResult = direct.results.find(({ filePath }) => filePath.endsWith('.tsx'));
    expect(tsxResult?.facts?.v2?.jsx.elements.some(({ tag }) => tag === 'button')).toBe(true);
    expect(direct.results.flatMap(({ issues }) => issues).filter(({ ruleId }) => ruleId === WITNESS_RULE_ID)).toHaveLength(expectedFiles);
    const directWitnessPaths = direct.results
      .flatMap(({ issues }) => issues)
      .filter(({ ruleId }) => ruleId === WITNESS_RULE_ID)
      .map(({ filePath }) => filePath ? relative(dir, resolve(dir, filePath)).replaceAll('\\', '/') : '<missing-file-path>')
      .sort();
    expect(directWitnessPaths).toEqual(expectedPaths);

    const result = await run([
      '--workspace', dir,
      '--include', '**/*',
      '--format', 'json',
      '--threads', '1',
      '--include-rule', WITNESS_RULE_ID,
      '--no-telemetry',
      '--no-color',
    ]);

    expect(result.exitCode).toBeGreaterThanOrEqual(0);
    expect(result.exitCode).toBeLessThanOrEqual(1);
    expect(result.stderr).not.toMatch(/Unexpected error|TypeError|worker failed/i);

    const report = JSON.parse(result.stdout) as {
      completionStatus?: string;
      scoreValidity?: string;
      requested?: number;
      analyzed?: number;
      failed?: number;
      skipped?: number;
      scanAccounting?: { parseFailed?: number; timedOut?: number; crashed?: number; internalFailed?: number };
      issues?: Array<{ ruleId: string; filePath?: string }>;
    };
    expect(report).toMatchObject({
      completionStatus: 'complete',
      scoreValidity: 'valid',
      requested: expectedFiles,
      analyzed: expectedFiles,
      failed: 0,
      skipped: 0,
      scanAccounting: {
        parseFailed: 0,
        timedOut: 0,
        crashed: 0,
        internalFailed: 0,
      },
    });
    const witnessPaths = report.issues
      ?.filter(({ ruleId }) => ruleId === WITNESS_RULE_ID)
      .map(({ filePath }) => filePath ? relative(dir, resolve(dir, filePath)).replaceAll('\\', '/') : '<missing-file-path>')
      .sort();
    expect(witnessPaths).toEqual(expectedPaths);
  });
});
