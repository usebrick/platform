import { describe, expect, it } from 'vitest';
import { bucketForVerdict, type Bucket } from '../../src/report/buckets';
import type { Verdict } from '@usebrick/core';

describe('bucketForVerdict', () => {
  it('USEFUL → ai', () => expect(bucketForVerdict('USEFUL')).toBe('ai'));
  it('OK → ai', () => expect(bucketForVerdict('OK')).toBe('ai'));
  it('HYGIENE → hygiene', () => expect(bucketForVerdict('HYGIENE')).toBe('hygiene'));
  it('INVERTED → hygiene (per user: INVERTED is basically HYGIENE)', () => expect(bucketForVerdict('INVERTED')).toBe('hygiene'));
  it('NOISY → suppressed', () => expect(bucketForVerdict('NOISY')).toBe('suppressed'));
  it('DORMANT → suppressed', () => expect(bucketForVerdict('DORMANT')).toBe('suppressed'));
  it('exhaustively covers all 6 verdicts (TypeScript exhaustiveness check)', () => {
    const verdicts: Verdict[] = ['USEFUL', 'OK', 'NOISY', 'INVERTED', 'HYGIENE', 'DORMANT'];
    const buckets: Bucket[] = verdicts.map(bucketForVerdict);
    expect(buckets).toEqual(['ai', 'ai', 'suppressed', 'hygiene', 'hygiene', 'suppressed']);
  });
});
