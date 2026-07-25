/** Package-private RFC 8785 and SHA-256 helpers for MemoryBrick M0 values. */

import { createHash } from 'node:crypto';

const encoder = new TextEncoder();

function jcsPropertyCompare(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

export function memoryM0AsciiCompare(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

export function memoryM0Utf8Compare(left: string, right: string): number {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.min(leftBytes.byteLength, rightBytes.byteLength);
  for (let index = 0; index < length; index += 1) {
    const difference = leftBytes[index]! - rightBytes[index]!;
    if (difference !== 0) return difference;
  }
  return leftBytes.byteLength - rightBytes.byteLength;
}

export function memoryM0Utf8ByteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

export function canonicalizeMemoryM0Json(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeMemoryM0Json(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const members = Object.keys(record).sort(jcsPropertyCompare).map((key) => (
      `${JSON.stringify(key)}:${canonicalizeMemoryM0Json(record[key])}`
    ));
    return `{${members.join(',')}}`;
  }
  throw new TypeError('Memory M0 canonicalization received a non-JSON value');
}

export function memoryM0Sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function memoryM0DomainSha256(domain: string, canonicalJson: string): string {
  return createHash('sha256')
    .update(domain, 'utf8')
    .update(new Uint8Array([0]))
    .update(canonicalJson, 'utf8')
    .digest('hex');
}
