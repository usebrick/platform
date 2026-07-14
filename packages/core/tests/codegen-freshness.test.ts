import { describe, expect, it } from 'vitest';
import {
  findSchemaGenerationGaps,
  mergeCodegenChangePaths,
} from '../scripts/codegen-status';

describe('codegen freshness status helpers', () => {
  it('reports tracked, staged, and untracked changes without duplicates', () => {
    expect(mergeCodegenChangePaths(
      ['packages/core/src/generated/a.ts', 'packages/core/src/generated/b.ts'],
      ['packages/core/src/generated/b.ts'],
      ['src/generated/c.ts'],
    )).toEqual([
      'packages/core/src/generated/a.ts',
      'packages/core/src/generated/b.ts',
      'src/generated/c.ts',
    ]);
  });

  it('reports missing and orphaned schema peers', () => {
    expect(findSchemaGenerationGaps(
      ['a.schema.json', 'b.schema.json'],
      ['a.ts', 'orphan.ts'],
    )).toEqual({ missing: ['b.ts'], orphaned: ['orphan.ts'] });
  });
});
