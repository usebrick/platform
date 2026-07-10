import { availableParallelism } from 'node:os';
import { describe, expect, it } from 'vitest';
import config from '../vitest.config';

describe('Vitest resource budget', () => {
  it('reserves CPU capacity for test-owned workers and subprocesses', () => {
    const expectedMaxWorkers = Math.max(
      1,
      Math.min(4, Math.floor(availableParallelism() / 2)),
    );

    expect(config).toHaveProperty('test.maxWorkers', expectedMaxWorkers);
    expect(config).toHaveProperty('test.minWorkers', 1);
  });
});
