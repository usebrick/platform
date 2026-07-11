import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { canonicalJson } from '../../src/calibration/v103/canonical';
import {
  CACHE_REF_BYTES,
  MATERIALIZATION_RECEIPT_FILENAME,
  MAX_MATERIALIZATION_ENTRIES,
  MAX_MATERIALIZATION_FILE_BYTES,
  MAX_MATERIALIZATION_TOTAL_FILE_BYTES,
  MAX_MATERIALIZATION_TOTAL_PATH_BYTES,
  MAX_RECEIPT_BYTES,
  buildMaterializationCacheRefV1,
  buildMaterializationReceiptV1,
  isMaterializationCacheRefByteLengthV1,
  isMaterializationEntryCountV1,
  isMaterializationReceiptByteLengthV1,
  isMaterializationTotalFileBytesV1,
  isMaterializationTotalPathBytesV1,
  parseCanonicalMaterializationCacheRefV1,
  parseCanonicalMaterializationReceiptV1,
  renderMaterializationCacheRefV1,
  renderMaterializationReceiptV1,
  type MaterializationCodecResult,
  type MaterializationInventoryEntryV1,
  type MaterializationReceiptV1,
} from '../../src/calibration/v103/materialization-receipt';

const sha256 = (input: string): string => createHash('sha256').update(input, 'utf8').digest('hex');
const ASSET_SHA256 = 'a'.repeat(64);
const FILE_SHA256 = sha256('abc');
const TREE_BASENAME = `.v103-tree-${'c'.repeat(32)}`;
const MAX_PLUS_ONE_PATH = [
  ...Array.from({ length: 16 }, () => 'x'.repeat(240)),
  'x'.repeat(241),
].join('/');
const GOLDEN_INVENTORY_SHA256 = '3824d8c97c4d011e754c71f26c369aa3a695b3eddb1607bbccdfe294010769f6';
const GOLDEN_RECEIPT_SHA256 = 'c8669d3d2dc31f592a548a4ab07210a78c6152ee5dc65af704eb6f354c96e4d7';
const GOLDEN_REF_SHA256 = '828210afdee7ce467c8c9041327ee097f6adbd61463489deb2497802749d8433';

function file(
  path: string,
  bytes = 3,
  digest = FILE_SHA256,
): MaterializationInventoryEntryV1 {
  return { path, kind: 'file', bytes, sha256: digest };
}

function directory(path: string): MaterializationInventoryEntryV1 {
  return { path, kind: 'directory' };
}

function unwrap<T>(result: MaterializationCodecResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected a successful materialization codec result');
  return result.value;
}

function expectInvalid(result: MaterializationCodecResult<unknown>): void {
  expect(result).toEqual({ ok: false });
}

function runtimeValue<T>(value: unknown): T {
  return value as T;
}

function getterRecord<T>(getters: Readonly<Record<string, () => unknown>>): T {
  const target: Record<string, unknown> = {};
  for (const [key, getter] of Object.entries(getters)) {
    Object.defineProperty(target, key, { enumerable: true, configurable: true, get: getter });
  }
  return runtimeValue<T>(target);
}

function goldenReceipt(): MaterializationReceiptV1 {
  return unwrap(buildMaterializationReceiptV1({
    assetSha256: ASSET_SHA256,
    assetBytes: 123,
    entries: [file('src/a.ts'), directory('src')],
  }));
}

describe('v10.3 canonical materialization receipt', () => {
  it('freezes the reserved filename and descriptor bounds', () => {
    expect(MATERIALIZATION_RECEIPT_FILENAME).toBe('.slopbrick-materialization-receipt.v1.json');
    expect(MAX_MATERIALIZATION_ENTRIES).toBe(100_000);
    expect(MAX_MATERIALIZATION_FILE_BYTES).toBe(32 * 1024 * 1024);
    expect(MAX_MATERIALIZATION_TOTAL_FILE_BYTES).toBe(1024 * 1024 * 1024);
    expect(MAX_MATERIALIZATION_TOTAL_PATH_BYTES).toBe(64 * 1024 * 1024);
    expect(MAX_RECEIPT_BYTES).toBe(
      260 + 100_000 * 118 + 99_999 + 2 * 64 * 1024 * 1024,
    );
    expect(MAX_RECEIPT_BYTES).toBe(146_117_987);
    expect(CACHE_REF_BYTES).toBe(161);
    expect(Buffer.byteLength(MAX_PLUS_ONE_PATH, 'ascii')).toBe(4097);
    expect(isMaterializationReceiptByteLengthV1(1n)).toBe(true);
    expect(isMaterializationReceiptByteLengthV1(BigInt(MAX_RECEIPT_BYTES))).toBe(true);
    expect(isMaterializationReceiptByteLengthV1(BigInt(MAX_RECEIPT_BYTES) + 1n)).toBe(false);
    expect(isMaterializationReceiptByteLengthV1(0n)).toBe(false);
    expect(isMaterializationCacheRefByteLengthV1(160n)).toBe(false);
    expect(isMaterializationCacheRefByteLengthV1(161n)).toBe(true);
    expect(isMaterializationCacheRefByteLengthV1(162n)).toBe(false);
    expect(isMaterializationEntryCountV1(BigInt(MAX_MATERIALIZATION_ENTRIES))).toBe(true);
    expect(isMaterializationEntryCountV1(BigInt(MAX_MATERIALIZATION_ENTRIES) + 1n)).toBe(false);
    expect(isMaterializationTotalPathBytesV1(BigInt(MAX_MATERIALIZATION_TOTAL_PATH_BYTES))).toBe(true);
    expect(isMaterializationTotalPathBytesV1(BigInt(MAX_MATERIALIZATION_TOTAL_PATH_BYTES) + 1n)).toBe(false);
    expect(isMaterializationTotalFileBytesV1(BigInt(MAX_MATERIALIZATION_TOTAL_FILE_BYTES))).toBe(true);
    expect(isMaterializationTotalFileBytesV1(BigInt(MAX_MATERIALIZATION_TOTAL_FILE_BYTES) + 1n)).toBe(false);
  });

  it('freezes the golden inventory hash, exact receipt bytes, and receipt-byte hash', () => {
    const receipt = goldenReceipt();
    expect(receipt).toEqual({
      receiptVersion: 'v1',
      extractionPolicy: 'safe-zip-v1',
      assetSha256: ASSET_SHA256,
      assetBytes: 123,
      inventorySha256: GOLDEN_INVENTORY_SHA256,
      entries: [
        { path: 'src', kind: 'directory' },
        { path: 'src/a.ts', kind: 'file', bytes: 3, sha256: FILE_SHA256 },
      ],
    });

    const rendered = unwrap(renderMaterializationReceiptV1(receipt));
    const expected = `{"assetBytes":123,"assetSha256":"${ASSET_SHA256}","entries":[{"kind":"directory","path":"src"},{"bytes":3,"kind":"file","path":"src/a.ts","sha256":"${FILE_SHA256}"}],"extractionPolicy":"safe-zip-v1","inventorySha256":"${GOLDEN_INVENTORY_SHA256}","receiptVersion":"v1"}\n`;
    expect(rendered.text).toBe(expected);
    expect(rendered.byteLength).toBe(406);
    expect(rendered.sha256).toBe(GOLDEN_RECEIPT_SHA256);
    expect(sha256(canonicalJson(receipt.entries))).toBe(GOLDEN_INVENTORY_SHA256);
    expect(sha256(`${canonicalJson(receipt.entries)}\n`)).not.toBe(GOLDEN_INVENTORY_SHA256);
    expect(sha256(rendered.text.slice(0, -1))).not.toBe(rendered.sha256);
    expect(rendered.text).not.toMatch(/mode|uid|gid|nlink|mtime|timestamp|\/Users\/|\/tmp\//);
  });

  it('sorts by raw ASCII bytes, infers parents, and deduplicates explicit and implicit directories', () => {
    const supplied = [
      file('a'),
      file('_'),
      directory('src'),
      file('src/a.ts'),
      directory('src'),
      file('['),
      file('B'),
    ];
    const snapshot = structuredClone(supplied);
    const first = unwrap(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 123,
      entries: supplied,
    }));
    const second = unwrap(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 123,
      entries: [...supplied].reverse(),
    }));

    expect(first).toEqual(second);
    expect(supplied).toEqual(snapshot);
    expect(first.entries.map((entry) => entry.path)).toEqual(['B', '[', '_', 'a', 'src', 'src/a.ts']);
    expect(first.entries.filter((entry) => entry.path === 'src')).toEqual([directory('src')]);

    const inferred = unwrap(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 123,
      entries: [file('one/two/three.ts')],
    }));
    expect(inferred.entries.map((entry) => [entry.path, entry.kind])).toEqual([
      ['one', 'directory'],
      ['one/two', 'directory'],
      ['one/two/three.ts', 'file'],
    ]);

    const maxPath = Array.from({ length: 17 }, () => 'x'.repeat(240)).join('/');
    expect(maxPath).toHaveLength(4096);
    expect(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: [
        file('s'.repeat(255)),
        file(Array.from({ length: 64 }, () => 'd').join('/')),
        file(maxPath),
      ],
    }).ok).toBe(true);
  });

  it.each([
    MATERIALIZATION_RECEIPT_FILENAME,
    MATERIALIZATION_RECEIPT_FILENAME.toUpperCase(),
    `${MATERIALIZATION_RECEIPT_FILENAME}/child`,
    '../escape',
    '/absolute',
    'C:/drive',
    'C:drive',
    'back\\slash',
    'repeat//slash',
    'dot/./segment',
    'dotdot/../segment',
    'trailing/',
    'nul\0byte',
    'line\nbreak',
    'café',
    'x'.repeat(256),
    Array.from({ length: 65 }, () => 'x').join('/'),
    MAX_PLUS_ONE_PATH,
    Array.from({ length: 17 }, () => 'x'.repeat(250)).join('/'),
  ])('rejects unsafe or reserved inventory path %j', (path) => {
    expectInvalid(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 123,
      entries: [file(path)],
    }));
  });

  it('rejects duplicate files, file/directory replacement, and ASCII-fold leaf or parent collisions', () => {
    const cases: readonly (readonly MaterializationInventoryEntryV1[])[] = [
      [file('same'), file('same')],
      [file('same'), directory('same')],
      [file('A.ts'), file('a.ts')],
      [file('A/x.ts'), file('a/y.ts')],
      [file('parent'), file('parent/child.ts')],
    ];
    for (const entries of cases) {
      expectInvalid(buildMaterializationReceiptV1({
        assetSha256: ASSET_SHA256,
        assetBytes: 123,
        entries,
      }));
    }
  });

  it.each([0, -1, 5 * 1024 ** 3 + 1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid asset byte count %s',
    (assetBytes) => {
      expectInvalid(buildMaterializationReceiptV1({
        assetSha256: ASSET_SHA256,
        assetBytes,
        entries: [file('a')],
      }));
    },
  );

  it('accepts exact asset/file boundaries and rejects their maximum plus one', () => {
    expect(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 5 * 1024 ** 3,
      entries: [file('a', MAX_MATERIALIZATION_FILE_BYTES)],
    }).ok).toBe(true);
    expectInvalid(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: [file('a', MAX_MATERIALIZATION_FILE_BYTES + 1)],
    }));
    expectInvalid(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: [file('a', -1)],
    }));
    expectInvalid(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: [file('a', 0.5)],
    }));
    expect(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: Array.from({ length: 32 }, (_, index) => file(`f${index}`, MAX_MATERIALIZATION_FILE_BYTES)),
    }).ok).toBe(true);
    expectInvalid(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: Array.from({ length: 33 }, (_, index) => file(`f${index}`, MAX_MATERIALIZATION_FILE_BYTES)),
    }));
  });

  it('accepts the exact materialized-entry ceiling including implicit parents', () => {
    const result = buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: Array.from(
        { length: MAX_MATERIALIZATION_ENTRIES / 2 },
        (_, index) => file(`p${index}/f`, 0),
      ),
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.entries).toHaveLength(MAX_MATERIALIZATION_ENTRIES);
  });

  it('stops reading candidates as soon as count or file-byte budgets are exceeded', () => {
    function generatedEntries(
      entryAt: (index: number) => MaterializationInventoryEntryV1,
    ): { readonly entries: MaterializationInventoryEntryV1[]; readonly reads: () => number } {
      let readCount = 0;
      const backing = Array<MaterializationInventoryEntryV1>(MAX_MATERIALIZATION_ENTRIES)
        .fill(file('placeholder'));
      const entries = new Proxy(backing, {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^(0|[1-9][0-9]*)$/.test(property)) {
            readCount += 1;
            return entryAt(Number(property));
          }
          return Reflect.get(target, property, receiver);
        },
      });
      return { entries, reads: () => readCount };
    }

    const countLimited = generatedEntries((index) => file(`p${index}/f`, 0));
    expectInvalid(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: countLimited.entries,
    }));
    expect(countLimited.reads()).toBe((MAX_MATERIALIZATION_ENTRIES / 2) + 1);

    const bytesLimited = generatedEntries((index) => file(`f${index}`, MAX_MATERIALIZATION_FILE_BYTES));
    expectInvalid(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: bytesLimited.entries,
    }));
    expect(bytesLimited.reads()).toBe(33);
  });

  it('rejects malformed shapes, bad digests, directories-only inventories, and count overflow early', () => {
    const sparseEntries = Array<MaterializationInventoryEntryV1>(2);
    sparseEntries[1] = file('a');
    const symbolicLength = new Proxy([file('a')], {
      get(target, property, receiver) {
        return property === 'length' ? Symbol('hostile length') : Reflect.get(target, property, receiver);
      },
    });

    expectInvalid(buildMaterializationReceiptV1({
      assetSha256: runtimeValue<string>(7),
      assetBytes: 1,
      entries: [file('a')],
    }));
    expectInvalid(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256.toUpperCase(),
      assetBytes: 1,
      entries: [file('a')],
    }));
    expectInvalid(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: [file('a', 1, FILE_SHA256.toUpperCase())],
    }));
    expectInvalid(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: [directory('empty')],
    }));
    expectInvalid(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: Array.from({ length: MAX_MATERIALIZATION_ENTRIES + 1 }, () => directory('duplicate')),
    }));
    expectInvalid(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: [runtimeValue<MaterializationInventoryEntryV1>({ path: 'a', kind: 'directory', bytes: 1 }), file('b')],
    }));
    expectInvalid(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: [runtimeValue<MaterializationInventoryEntryV1>({ path: 'a', kind: 'file', bytes: 1 })],
    }));
    expectInvalid(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: sparseEntries,
    }));
    expect(() => buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: symbolicLength,
    })).not.toThrow();
    expectInvalid(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: symbolicLength,
    }));
  });

  it('parses only the exact canonical receipt bytes', () => {
    const receipt = goldenReceipt();
    const rendered = unwrap(renderMaterializationReceiptV1(receipt));
    const parsed = unwrap(parseCanonicalMaterializationReceiptV1(Buffer.from(rendered.text, 'utf8')));
    expect(parsed).toEqual(rendered);

    const unsortedEntries = [...receipt.entries].reverse();
    const unsorted = {
      ...receipt,
      entries: unsortedEntries,
      inventorySha256: sha256(canonicalJson(unsortedEntries)),
    };
    const noncanonicalObjects: unknown[] = [
      { ...receipt, receiptVersion: 'v2' },
      { ...receipt, extractionPolicy: 'safe-zip-v2' },
      { ...receipt, assetSha256: ASSET_SHA256.toUpperCase() },
      { ...receipt, inventorySha256: '0'.repeat(64) },
      { ...receipt, unknown: true },
      { ...receipt, entries: [{ ...receipt.entries[0], unknown: true }, receipt.entries[1]] },
      unsorted,
      {
        ...receipt,
        entries: [receipt.entries[0], receipt.entries[0], receipt.entries[1]],
        inventorySha256: sha256(canonicalJson([
          receipt.entries[0], receipt.entries[0], receipt.entries[1],
        ])),
      },
      null,
      [],
    ];
    for (const value of noncanonicalObjects) {
      expectInvalid(parseCanonicalMaterializationReceiptV1(
        Buffer.from(`${canonicalJson(value)}\n`, 'utf8'),
      ));
    }

    const alternateKeyOrder = `${JSON.stringify(receipt)}\n`;
    const exactTextVariants = [
      rendered.text.slice(0, -1),
      `${rendered.text.slice(0, -1)}\r\n`,
      `${rendered.text}\n`,
      ` ${rendered.text}`,
      alternateKeyOrder,
      rendered.text.replace('{', `{"assetBytes":123,`),
    ];
    for (const text of exactTextVariants) {
      expectInvalid(parseCanonicalMaterializationReceiptV1(Buffer.from(text, 'utf8')));
    }
    expectInvalid(parseCanonicalMaterializationReceiptV1(Uint8Array.from([0xff, 0x0a])));
    expectInvalid(parseCanonicalMaterializationReceiptV1(Buffer.from('{\n', 'utf8')));
    expectInvalid(parseCanonicalMaterializationReceiptV1(runtimeValue<Uint8Array>(null)));
    expectInvalid(parseCanonicalMaterializationReceiptV1(Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(rendered.text, 'utf8'),
    ])));
    const proxiedBytes = new Proxy(Buffer.from(rendered.text, 'utf8'), {});
    expect(() => parseCanonicalMaterializationReceiptV1(proxiedBytes)).not.toThrow();
    expectInvalid(parseCanonicalMaterializationReceiptV1(proxiedBytes));
    const revoked = Proxy.revocable(Buffer.from(rendered.text, 'utf8'), {});
    revoked.revoke();
    expect(() => parseCanonicalMaterializationReceiptV1(revoked.proxy)).not.toThrow();
    expectInvalid(parseCanonicalMaterializationReceiptV1(revoked.proxy));
  });

  it('rendering refuses to repair an unsorted or otherwise invalid typed receipt', () => {
    const receipt = goldenReceipt();
    const unsortedEntries = [...receipt.entries].reverse();
    expectInvalid(renderMaterializationReceiptV1({
      ...receipt,
      entries: unsortedEntries,
      inventorySha256: sha256(canonicalJson(unsortedEntries)),
    }));
    expectInvalid(renderMaterializationReceiptV1({
      ...receipt,
      entries: [{ path: 'src/a.ts', kind: 'file', bytes: 3, sha256: FILE_SHA256 }],
      inventorySha256: sha256(canonicalJson([{ path: 'src/a.ts', kind: 'file', bytes: 3, sha256: FILE_SHA256 }])),
    }));
  });

  it('snapshots accessor-backed receipt input once and contains throwing getters', () => {
    const receipt = goldenReceipt();
    let digestReads = 0;
    const changing = getterRecord<MaterializationReceiptV1>({
      receiptVersion: () => receipt.receiptVersion,
      extractionPolicy: () => receipt.extractionPolicy,
      assetSha256: () => (++digestReads === 1 ? receipt.assetSha256 : receipt.assetSha256.toUpperCase()),
      assetBytes: () => receipt.assetBytes,
      inventorySha256: () => receipt.inventorySha256,
      entries: () => receipt.entries,
    });

    const rendered = unwrap(renderMaterializationReceiptV1(changing));
    expect(digestReads).toBe(1);
    expect(parseCanonicalMaterializationReceiptV1(Buffer.from(rendered.text, 'utf8')).ok).toBe(true);

    const throwing = getterRecord<MaterializationReceiptV1>({
      receiptVersion: () => receipt.receiptVersion,
      extractionPolicy: () => receipt.extractionPolicy,
      assetSha256: () => { throw new Error('private receipt getter'); },
      assetBytes: () => receipt.assetBytes,
      inventorySha256: () => receipt.inventorySha256,
      entries: () => receipt.entries,
    });
    expect(() => renderMaterializationReceiptV1(throwing)).not.toThrow();
    expectInvalid(renderMaterializationReceiptV1(throwing));
    const throwingBuildInput = getterRecord<Parameters<typeof buildMaterializationReceiptV1>[0]>({
      assetSha256: () => { throw new Error('private build getter'); },
      assetBytes: () => 1,
      entries: () => [file('a')],
    });
    expect(() => buildMaterializationReceiptV1(throwingBuildInput)).not.toThrow();
    expectInvalid(buildMaterializationReceiptV1(throwingBuildInput));

    let entryDigestReads = 0;
    const changingEntry = getterRecord<MaterializationInventoryEntryV1>({
      path: () => 'a',
      kind: () => 'file',
      bytes: () => 1,
      sha256: () => (++entryDigestReads === 1 ? FILE_SHA256 : FILE_SHA256.toUpperCase()),
    });
    const built = unwrap(buildMaterializationReceiptV1({
      assetSha256: ASSET_SHA256,
      assetBytes: 1,
      entries: [changingEntry],
    }));
    expect(entryDigestReads).toBe(1);
    expect(parseCanonicalMaterializationReceiptV1(Buffer.from(
      unwrap(renderMaterializationReceiptV1(built)).text,
      'utf8',
    )).ok).toBe(true);
  });
});

describe('v10.3 canonical materialization cache reference', () => {
  it('freezes the exact 161-byte golden reference and its hash', () => {
    const ref = unwrap(buildMaterializationCacheRefV1({
      treeBasename: TREE_BASENAME,
      receiptSha256: GOLDEN_RECEIPT_SHA256,
    }));
    expect(ref).toEqual({
      version: 'v1',
      treeBasename: TREE_BASENAME,
      receiptSha256: GOLDEN_RECEIPT_SHA256,
    });
    const rendered = unwrap(renderMaterializationCacheRefV1(ref));
    const expected = `{"receiptSha256":"${GOLDEN_RECEIPT_SHA256}","treeBasename":"${TREE_BASENAME}","version":"v1"}\n`;
    expect(rendered.text).toBe(expected);
    expect(rendered.byteLength).toBe(CACHE_REF_BYTES);
    expect(rendered.sha256).toBe(GOLDEN_REF_SHA256);
    expect(unwrap(parseCanonicalMaterializationCacheRefV1(Buffer.from(expected, 'utf8')))).toEqual(rendered);
  });

  it.each([
    '.v103-tree-short',
    `.v103-tree-${'A'.repeat(32)}`,
    `.v103-tree-${'a'.repeat(31)}`,
    `.v103-tree-${'a'.repeat(33)}`,
    `nested/.v103-tree-${'a'.repeat(32)}`,
    `../.v103-tree-${'a'.repeat(32)}`,
  ])('rejects invalid tree basename %j', (treeBasename) => {
    expectInvalid(buildMaterializationCacheRefV1({
      treeBasename,
      receiptSha256: GOLDEN_RECEIPT_SHA256,
    }));
  });

  it('rejects malformed hashes, shapes, lengths, and noncanonical bytes', () => {
    expectInvalid(buildMaterializationCacheRefV1({
      treeBasename: TREE_BASENAME,
      receiptSha256: GOLDEN_RECEIPT_SHA256.toUpperCase(),
    }));
    const ref = unwrap(buildMaterializationCacheRefV1({
      treeBasename: TREE_BASENAME,
      receiptSha256: GOLDEN_RECEIPT_SHA256,
    }));
    expectInvalid(renderMaterializationCacheRefV1(runtimeValue<typeof ref>({ ...ref, version: 'v2' })));
    expectInvalid(renderMaterializationCacheRefV1(runtimeValue<typeof ref>({ ...ref, extra: true })));
    expectInvalid(parseCanonicalMaterializationCacheRefV1(new Uint8Array(CACHE_REF_BYTES - 1)));
    expectInvalid(parseCanonicalMaterializationCacheRefV1(new Uint8Array(CACHE_REF_BYTES + 1)));
    expectInvalid(parseCanonicalMaterializationCacheRefV1(runtimeValue<Uint8Array>(null)));
    expectInvalid(parseCanonicalMaterializationCacheRefV1(
      Buffer.from(`${JSON.stringify(ref)}\n`, 'utf8'),
    ));
    const canonical = unwrap(renderMaterializationCacheRefV1(ref)).text;
    expectInvalid(parseCanonicalMaterializationCacheRefV1(Buffer.from(
      canonical.replace(GOLDEN_RECEIPT_SHA256, GOLDEN_RECEIPT_SHA256.toUpperCase()),
      'utf8',
    )));
    const proxiedBytes = new Proxy(Buffer.from(canonical, 'utf8'), {});
    expect(() => parseCanonicalMaterializationCacheRefV1(proxiedBytes)).not.toThrow();
    expectInvalid(parseCanonicalMaterializationCacheRefV1(proxiedBytes));
  });

  it('snapshots accessor-backed references once and contains throwing getters', () => {
    const reference = unwrap(buildMaterializationCacheRefV1({
      treeBasename: TREE_BASENAME,
      receiptSha256: GOLDEN_RECEIPT_SHA256,
    }));
    let digestReads = 0;
    const changing = getterRecord<typeof reference>({
      version: () => reference.version,
      treeBasename: () => reference.treeBasename,
      receiptSha256: () => (++digestReads === 1
        ? reference.receiptSha256
        : reference.receiptSha256.toUpperCase()),
    });
    const rendered = unwrap(renderMaterializationCacheRefV1(changing));
    expect(digestReads).toBe(1);
    expect(parseCanonicalMaterializationCacheRefV1(Buffer.from(rendered.text, 'utf8')).ok).toBe(true);

    const throwing = getterRecord<typeof reference>({
      version: () => reference.version,
      treeBasename: () => { throw new Error('private reference getter'); },
      receiptSha256: () => reference.receiptSha256,
    });
    expect(() => renderMaterializationCacheRefV1(throwing)).not.toThrow();
    expectInvalid(renderMaterializationCacheRefV1(throwing));
  });
});
