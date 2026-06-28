import { describe, expect, it } from 'vitest';
import { signalStrengthSchema } from '../src/signal-strength-schema';

describe('signal-strength schema', () => {
  it('accepts a valid entry', () => {
    const result = signalStrengthSchema.safeParse({
      'test/rule': {
        recall: 0.5,
        fpRate: 0.1,
        ratio: 5.0,
        precision: 0.83,
        lastCalibratedAt: '2026-06-27T12:00:00Z',
        verdict: 'USEFUL',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid verdict', () => {
    const result = signalStrengthSchema.safeParse({
      'test/rule': {
        recall: 0.5,
        fpRate: 0.1,
        ratio: 5.0,
        precision: 0.83,
        lastCalibratedAt: '2026-06-27T12:00:00Z',
        verdict: 'BOGUS_VERDICT',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects out-of-range recall', () => {
    const result = signalStrengthSchema.safeParse({
      'test/rule': {
        recall: 1.5, // invalid, must be 0..1
        fpRate: 0.1,
        ratio: 5.0,
        precision: 0.83,
        lastCalibratedAt: '2026-06-27T12:00:00Z',
        verdict: 'USEFUL',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required field', () => {
    const result = signalStrengthSchema.safeParse({
      'test/rule': {
        recall: 0.5,
        fpRate: 0.1,
        ratio: 5.0,
        // precision is missing
        lastCalibratedAt: '2026-06-27T12:00:00Z',
        verdict: 'USEFUL',
      },
    });
    expect(result.success).toBe(false);
  });
});
