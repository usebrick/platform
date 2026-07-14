import { describe, expect, it } from 'vitest';

import {
  exactKeys,
  isAdmissionId,
  isJsonRecord,
  isSha256,
  sortedUniqueByPredicate,
  withoutJsonKey,
  withoutJsonKeys,
} from '../src/calibration-admission-primitives';

describe('shared calibration-admission validation primitives', () => {
  it('keeps object and exact-key guards strict and order-independent', () => {
    expect(isJsonRecord({ a: 1 })).toBe(true);
    expect(isJsonRecord(null)).toBe(false);
    expect(isJsonRecord([])).toBe(false);
    expect(exactKeys({ b: 2, a: 1 }, ['a', 'b'])).toBe(true);
    expect(exactKeys({ a: 1, b: 2, c: 3 }, ['a', 'b'])).toBe(false);
  });

  it('preserves admission hash/id boundaries', () => {
    expect(isSha256('a'.repeat(64))).toBe(true);
    expect(isSha256('A'.repeat(64))).toBe(false);
    expect(isSha256('a'.repeat(63))).toBe(false);
    expect(isAdmissionId('source-a:1')).toBe(true);
    expect(isAdmissionId('Source-A')).toBe(false);
    expect(isAdmissionId('')).toBe(false);
  });

  it('enforces sorted uniqueness with explicit empty-list policy', () => {
    const id = (value: unknown): value is string => isAdmissionId(value);
    expect(sortedUniqueByPredicate([], id)).toBe(true);
    expect(sortedUniqueByPredicate([], id, false)).toBe(false);
    expect(sortedUniqueByPredicate(['a', 'b'], id)).toBe(true);
    expect(sortedUniqueByPredicate(['b', 'a'], id)).toBe(false);
    expect(sortedUniqueByPredicate(['a', 'a'], id)).toBe(false);
  });

  it('omits only requested keys and rejects non-objects', () => {
    expect(withoutJsonKey({ a: 1, b: 2 }, 'a')).toEqual({ b: 2 });
    expect(withoutJsonKeys({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ b: 2 });
    expect(() => withoutJsonKey(null, 'a')).toThrow(TypeError);
    expect(() => withoutJsonKeys([], ['a'])).toThrow(TypeError);
  });
});
