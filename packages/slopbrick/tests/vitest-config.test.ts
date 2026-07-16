import { availableParallelism } from 'node:os';
import { describe, expect, it } from 'vitest';
import config, { resolveTestWorkers } from '../vitest.config';

describe('Vitest resource budget', () => {
  it('reserves CPU capacity for test-owned workers and subprocesses', () => {
    const expectedMaxWorkers = resolveTestWorkers(availableParallelism());

    expect(config).toHaveProperty('test.maxWorkers', expectedMaxWorkers);
    expect(config).toHaveProperty('test.minWorkers', 1);
  });

  it('honors an explicit bounded worker budget for CI and pre-push runs', () => {
    expect(resolveTestWorkers(16, '1')).toBe(1);
    expect(resolveTestWorkers(16, '2')).toBe(2);
    expect(resolveTestWorkers(16, '99')).toBe(4);
    expect(resolveTestWorkers(16, 'not-a-number')).toBe(4);
  });

  it('keeps the Node-only host preflight contract out of Vitest discovery', () => {
    expect(config.test?.exclude).toContain('scripts/test-capabilities.test.mjs');
  });
});
