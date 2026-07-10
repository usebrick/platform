import { describe, expect, it } from 'vitest';
import config from '../vitest.config';

describe('Vitest resource budget', () => {
  it('serializes test files so nested scan pools cannot multiply across workers', () => {
    expect(config).toHaveProperty('test.fileParallelism', false);
  });
});
