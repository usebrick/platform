import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const extractFactsCalls = vi.hoisted(() => vi.fn());

vi.mock('../../src/engine/visitor.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/engine/visitor.js')>();
  return {
    ...actual,
    extractFacts: (...args: Parameters<typeof actual.extractFacts>) => {
      extractFactsCalls(...args);
      return actual.extractFacts(...args);
    },
  };
});

import { buildArchitectureScore } from '../../src/engine/architecture-score';
import { scanFile } from '../../src/engine/worker';
import { RuleRegistry } from '../../src/rules/registry';
import { DEFAULT_CONFIG } from '../../src/config';
import type { ResolvedConfig } from '../../src/types';

const dirs: string[] = [];

afterEach(() => {
  extractFactsCalls.mockClear();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('cached architecture fact extraction', () => {
  it('matches fresh worker facts under non-default framework configuration', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slopbrick-architecture-cache-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'src'));
    const filePath = join(dir, 'src', 'Panel.tsx');
    const source = '<div className="p-[13px] m-[13px] gap-[13px] px-[13px] py-[13px]" />;';
    writeFileSync(filePath, source);
    const config: ResolvedConfig = {
      ...DEFAULT_CONFIG,
      include: ['src/**/*.tsx'],
      exclude: [],
      framework: 'vue',
      supportsRsc: false,
      allowedImports: ['@project/allowed'],
      spacingScale: [0, 1],
      radiusScale: [],
    };
    const registry = new RuleRegistry();
    registry.loadBuiltins();
    const freshResult = await scanFile(filePath, config, registry, dir);
    const fresh = await buildArchitectureScore(dir, config, 100, [freshResult], [filePath]);

    extractFactsCalls.mockClear();
    const cached = await buildArchitectureScore(dir, config, 100, [], [filePath]);

    expect(cached).toEqual(fresh);
    expect(extractFactsCalls).toHaveBeenCalledTimes(1);
    expect(extractFactsCalls).toHaveBeenCalledWith(
      filePath,
      expect.anything(),
      readFileSync(filePath, 'utf8'),
      false,
      'vue',
      config,
    );
  });
});
