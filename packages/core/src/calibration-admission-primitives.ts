/**
 * Small, dependency-free guards shared by the admission authority contracts.
 *
 * These helpers deliberately contain no schema or policy knowledge.  Keeping
 * the common shape checks in one place prevents validators from drifting while
 * leaving each authority module responsible for its own field semantics.
 */

export type JsonRecord = Record<string, unknown>;

const SHA256 = /^[a-f0-9]{64}$/;
const ADMISSION_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/;

export function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function exactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

export function isAdmissionId(value: unknown): value is string {
  return typeof value === 'string' && ADMISSION_ID.test(value);
}

/** Validate a sorted, duplicate-free list using a caller-owned element guard. */
export function sortedUniqueByPredicate(
  value: unknown,
  predicate: (entry: unknown) => boolean,
  allowEmpty = true,
): value is readonly string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || !value.every(predicate)) return false;
  for (let index = 1; index < value.length; index += 1) {
    if (String(value[index - 1]) >= String(value[index])) return false;
  }
  return true;
}

export function withoutJsonKey(value: unknown, key: string): JsonRecord {
  if (!isJsonRecord(value)) throw new TypeError('expected a JSON object');
  const result: JsonRecord = {};
  for (const [name, child] of Object.entries(value)) if (name !== key) result[name] = child;
  return result;
}

export function withoutJsonKeys(value: unknown, keys: readonly string[]): JsonRecord {
  if (!isJsonRecord(value)) throw new TypeError('expected a JSON object');
  const result: JsonRecord = {};
  for (const [name, child] of Object.entries(value)) if (!keys.includes(name)) result[name] = child;
  return result;
}
