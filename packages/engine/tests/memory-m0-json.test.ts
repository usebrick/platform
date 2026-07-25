import { describe, expect, it } from 'vitest';
import {
  MEMORY_M0_PROFILE,
  type MemoryM0Request,
} from '../../core/src/memory-m0';
import { parseMemoryM0Request } from '../src/memory-m0';

const encoder = new TextEncoder();

function requestWithRoot(bytes: Uint8Array): MemoryM0Request {
  return {
    profile: MEMORY_M0_PROFILE,
    sources: [{ kind: 'root-package-json', path: 'package.json', bytes }],
  };
}

function parseRootJson(json: string) {
  return parseMemoryM0Request(requestWithRoot(encoder.encode(json)));
}

describe('MemoryBrick M0 bounded JSON', () => {
  it('parses one JSON object from the private defensive byte copy', () => {
    const result = parseRootJson('{"name":"root","private":true}');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]!.value.get('name')).toBe('root');
    expect(result.sources[0]!.value.get('private')).toBe(true);
  });

  it.each([
    ['UTF-8 BOM', new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]), 'bom'],
    ['overlong UTF-8', new Uint8Array([0xc0, 0xaf]), 'utf8'],
    ['truncated UTF-8', new Uint8Array([0xe2, 0x82]), 'utf8'],
  ])('rejects %s without replacement decoding', (_label, bytes, reason) => {
    expect(parseMemoryM0Request(requestWithRoot(bytes))).toMatchObject({
      ok: false,
      error: 'parse-failed',
      reason,
      sourcePath: 'package.json',
    });
  });

  it.each(['[]', 'null', 'true', '0', '"text"'])('rejects non-object JSON root %s', (json) => {
    expect(parseRootJson(json)).toMatchObject({
      ok: false,
      error: 'parse-failed',
      reason: 'root',
    });
  });

  it('rejects duplicate decoded member names at every depth', () => {
    expect(parseRootJson('{"a":1,"\\u0061":2}')).toMatchObject({
      ok: false,
      error: 'parse-failed',
      reason: 'duplicate-key',
    });
    expect(parseRootJson('{"nested":{"x":1,"x":2}}')).toMatchObject({
      ok: false,
      error: 'parse-failed',
      reason: 'duplicate-key',
    });
  });

  it('treats prototype-like names as ordinary own JSON members', () => {
    const result = parseRootJson(
      '{"__proto__":1,"constructor":2,"prototype":3,"emoji":"\\uD83D\\uDE00"}',
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const value = result.sources[0]!.value;
    expect(value.get('__proto__')).toBe(1);
    expect(value.get('constructor')).toBe(2);
    expect(value.get('prototype')).toBe(3);
    expect(value.get('emoji')).toBe('😀');
  });

  it.each([
    '',
    '{} trailing',
    '{}{}',
    '{"a":01}',
    '{"a":1,}',
    '{"a":[1,]}',
    '{"a":Infinity}',
    '{"a":1e9999}',
    '{"a":"\\uD800"}',
    '{"a":"\\uDC00"}',
    '{"a":"line\nbreak"}',
  ])('rejects malformed or trailing JSON %j', (json) => {
    expect(parseRootJson(json)).toMatchObject({
      ok: false,
      error: 'parse-failed',
    });
  });

  it('admits depth 32 and rejects the first depth-33 container', () => {
    const exact = `{"x":${'['.repeat(31)}0${']'.repeat(31)}}`;
    const overflow = `{"x":${'['.repeat(32)}0${']'.repeat(32)}}`;

    expect(parseRootJson(exact)).toMatchObject({ ok: true });
    expect(parseRootJson(overflow)).toMatchObject({
      ok: false,
      error: 'parse-failed',
      reason: 'depth',
    });
  });

  it('admits the largest complete object below the token cap and rejects token 16,385', () => {
    const entries = Array.from({ length: 4_095 }, (_, index) => `"k${index}":0`).join(',');
    const completeAt16_381 = `{${entries}}`;
    const incompleteAt16_384 = `{${entries},"tail":[`;
    const firstOverflow = `${incompleteAt16_384}0`;

    expect(parseRootJson(completeAt16_381)).toMatchObject({ ok: true });
    expect(parseRootJson(incompleteAt16_384)).toMatchObject({
      ok: false,
      error: 'parse-failed',
      reason: 'json',
    });
    expect(parseRootJson(firstOverflow)).toMatchObject({
      ok: false,
      error: 'parse-failed',
      reason: 'tokens',
    });
  });

  it('applies byte admission before attempting JSON decoding', () => {
    expect(parseMemoryM0Request(requestWithRoot(new Uint8Array(262_145)))).toMatchObject({
      ok: false,
      error: 'source-limit',
      reason: 'source-bytes',
    });
  });
});
