import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runDrift, formatDrift, driftExitCode } from '../../src/cli/drift';
import { DEFAULT_CONFIG } from '../../src/config';
import type { ResolvedConfig } from '../../src/types';

const execFileAsync = promisify(execFile);
const BIN = join(process.cwd(), 'bin', 'slopbrick.js');

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-drift-'));
}

function writeFile(dir: string, rel: string, content: string): string {
  const full = join(dir, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf-8');
  return full;
}

function configWith(include: string[], constitution?: ResolvedConfig['constitution']): ResolvedConfig {
  return {
    ...DEFAULT_CONFIG,
    include,
    exclude: [],
    ...(constitution ? { constitution } : {}),
  };
}

async function runBin(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [BIN, ...args], { cwd });
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('runDrift', () => {
  it('reports no violations when constitution is absent', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import { create } from 'redux';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts']));
      expect(result.totalViolations).toBe(0);
      expect(result.conventionSource).toBe('none');
      expect(result.scannedFiles).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports no violations when imports are conformant', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import { create } from 'zustand';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts'], { stateManagement: ['zustand'] }));
      expect(result.totalViolations).toBe(0);
      expect(result.conventionSource).toBe('declared');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a state-management violation', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import { createStore } from 'redux';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts'], { stateManagement: ['zustand'] }));
      expect(result.totalViolations).toBe(1);
      expect(result.filesWithViolations).toBe(1);
      expect(result.byCategory['stateManagement']).toBe(1);
      expect(result.byFile[0].import).toBe('redux');
      expect(result.byFile[0].declared).toEqual(['zustand']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('aggregates violations across multiple files and categories', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import { createStore } from 'redux';`);
      writeFile(dir, 'src/b.ts', `import { useQuery } from 'swr';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts'], {
        stateManagement: ['zustand'],
        dataFetching: ['react-query'],
      }));
      expect(result.totalViolations).toBe(2);
      expect(result.filesWithViolations).toBe(2);
      expect(result.byCategory['stateManagement']).toBe(1);
      expect(result.byCategory['dataFetching']).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('respects the maxFiles cap', async () => {
    const dir = freshDir();
    try {
      for (let i = 0; i < 5; i++) {
        writeFile(dir, `src/file${i}.ts`, `import x from 'redux';`);
      }
      const result = await runDrift(dir, configWith(['src/**/*.ts'], { stateManagement: ['zustand'] }), {
        maxFiles: 2,
      });
      expect(result.scannedFiles).toBe(2);
      expect(result.totalViolations).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips files that cannot be read', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import { createStore } from 'redux';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts', 'src/missing/**/*.ts'], {
        stateManagement: ['zustand'],
      }));
      // missing dir is discovered as zero matches; the existing file still scanned
      expect(result.scannedFiles).toBeGreaterThanOrEqual(1);
      expect(result.totalViolations).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('formatDrift', () => {
  it('renders a clean report when no violations exist', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import x from 'zustand';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts'], { stateManagement: ['zustand'] }));
      const out = formatDrift(result);
      expect(out).toContain('Constitution drift report');
      expect(out).toContain('No constitution violations');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('renders a violation report grouped by file and category', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import x from 'redux';`);
      writeFile(dir, 'src/b.ts', `import y from 'swr';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts'], {
        stateManagement: ['zustand'],
        dataFetching: ['react-query'],
      }));
      const out = formatDrift(result);
      expect(out).toContain('src/a.ts');
      expect(out).toContain('src/b.ts');
      expect(out).toContain('stateManagement');
      expect(out).toContain('dataFetching');
      expect(out).toContain('Constitution violation');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('suggests adding constitution when none are declared', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import x from 'redux';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts']));
      const out = formatDrift(result);
      expect(out).toContain('No constitution declared');
      expect(out).toContain('constitution');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits valid JSON when --format json is requested', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import x from 'redux';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts'], { stateManagement: ['zustand'] }));
      const out = formatDrift(result, { json: true });
      const parsed = JSON.parse(out) as {
        totalViolations: number;
        byCategory: Record<string, number>;
        conventionSource: string;
      };
      expect(parsed.totalViolations).toBe(1);
      expect(parsed.byCategory['stateManagement']).toBe(1);
      expect(parsed.conventionSource).toBe('declared');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('driftExitCode', () => {
  it('returns 1 when violations exist', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import x from 'redux';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts'], { stateManagement: ['zustand'] }));
      expect(driftExitCode(result)).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns 0 when no violations exist', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import x from 'zustand';`);
      const result = await runDrift(dir, configWith(['src/**/*.ts'], { stateManagement: ['zustand'] }));
      expect(driftExitCode(result)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('slopbrick drift (CLI)', () => {
  it('exits 0 and prints clean report when no violations', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import x from 'zustand';`);
      writeFile(dir, 'slopbrick.config.mjs', `export default { include: ['src/**/*.ts'], exclude: [], constitution: { stateManagement: ['zustand'] } };`);
      const { exitCode, stdout } = await runBin(['drift'], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No constitution violations');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('exits 1 when violations are found', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/bad.ts', `import x from 'redux';`);
      writeFile(dir, 'slopbrick.config.mjs', `export default { include: ['src/**/*.ts'], exclude: [], constitution: { stateManagement: ['zustand'] } };`);
      const { exitCode, stdout } = await runBin(['drift'], dir);
      expect(exitCode).toBe(1);
      expect(stdout).toContain('Constitution violation');
      expect(stdout).toContain('redux');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('emits JSON output with --format json', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/bad.ts', `import x from 'redux';`);
      writeFile(dir, 'slopbrick.config.mjs', `export default { include: ['src/**/*.ts'], exclude: [], constitution: { stateManagement: ['zustand'] } };`);
      const { exitCode, stdout } = await runBin(['drift', '--format', 'json'], dir);
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stdout) as { totalViolations: number; conventionSource: string };
      expect(parsed.totalViolations).toBe(1);
      expect(parsed.conventionSource).toBe('declared');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('shows "no constitution declared" when config omits the field', async () => {
    const dir = freshDir();
    try {
      writeFile(dir, 'src/a.ts', `import x from 'redux';`);
      writeFile(dir, 'slopbrick.config.mjs', `export default { include: ['src/**/*.ts'], exclude: [] };`);
      const { exitCode, stdout } = await runBin(['drift'], dir);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No constitution declared');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
