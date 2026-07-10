import { describe, expect, it } from 'vitest';
import { parseExample } from '../examples/pure-parse';
import { signatureExample } from '../examples/pure-signatures';
import { likelihoodExample } from '../examples/pure-likelihood';

describe('documented pure API examples', () => {
  it('execute against the pure entrypoint', () => {
    expect(parseExample()).toBe(1);
    expect(signatureExample()).toBe(1);
    expect(likelihoodExample()).toBeGreaterThan(0.5);
  });
});
