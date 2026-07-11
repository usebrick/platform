import { Readable } from 'node:stream';
import { deflateRawSync } from 'node:zlib';
import { ZipFile as YazlZipFile } from 'yazl';

/** Test-only CRC implementation kept independent from the safe ZIP module. */
function fixtureCrc32(bytes: Uint8Array): number {
  let state = 0xffff_ffff;
  for (const byte of bytes) {
    state ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      state = (state >>> 1) ^ (state & 1 ? 0xedb8_8320 : 0);
    }
  }
  return (state ^ 0xffff_ffff) >>> 0;
}

export interface YazlFixtureEntry {
  readonly path: string;
  readonly data?: Buffer;
  readonly kind?: 'file' | 'directory';
  readonly compress?: boolean;
}

export async function buildYazlZipFixture(entries: readonly YazlFixtureEntry[]): Promise<Buffer> {
  const zip = new YazlZipFile();
  const mtime = new Date('2020-01-02T03:04:06Z');
  for (const entry of entries) {
    if (entry.kind === 'directory') {
      zip.addEmptyDirectory(entry.path, { mtime, mode: 0o40700, forceDosTimestamp: true });
    } else {
      zip.addBuffer(entry.data ?? Buffer.alloc(0), entry.path, {
        mtime,
        mode: 0o100600,
        compress: entry.compress ?? true,
        forceDosTimestamp: true,
      });
    }
  }
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream as Readable) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export interface RawZipEntrySpec {
  readonly name: string | Buffer;
  readonly localName?: string | Buffer;
  readonly data?: Buffer;
  readonly compressedData?: Buffer;
  readonly method?: 0 | 8 | number;
  readonly flags?: number;
  readonly versionMadeBy?: number;
  readonly versionNeeded?: number;
  readonly centralCrc32?: number;
  readonly localCrc32?: number;
  readonly centralCompressedBytes?: number;
  readonly localCompressedBytes?: number;
  readonly centralUncompressedBytes?: number;
  readonly localUncompressedBytes?: number;
  readonly centralExtra?: Buffer;
  readonly localExtra?: Buffer;
  readonly externalAttributes?: number;
  readonly internalAttributes?: number;
  readonly diskStart?: number;
  readonly descriptor?: 'none' | 'signed' | 'unsigned' | 'zip64';
  readonly descriptorCrc32?: number;
  readonly descriptorCompressedBytes?: number;
  readonly descriptorUncompressedBytes?: number;
  readonly centralLocalOffset?: number;
  readonly gapBefore?: Buffer;
}

export interface RawZipFixtureOptions {
  readonly entries: readonly RawZipEntrySpec[];
  readonly leadingBytes?: Buffer;
  readonly centralJunk?: Buffer;
  readonly trailingBytes?: Buffer;
  readonly comment?: Buffer;
  readonly forceZip64?: boolean;
}

export interface RawZipEntryLayout {
  readonly localHeader: number;
  readonly localName: number;
  readonly localExtra: number;
  readonly data: number;
  readonly descriptor: number | undefined;
  readonly localEnd: number;
  readonly centralHeader: number;
  readonly centralName: number;
  readonly centralExtra: number;
  readonly centralEnd: number;
}

export interface RawZipLayout {
  readonly entries: readonly RawZipEntryLayout[];
  readonly centralStart: number;
  readonly centralEnd: number;
  readonly zip64Eocd: number | undefined;
  readonly zip64Locator: number | undefined;
  readonly eocd: number;
}

export interface RawZipFixture {
  readonly bytes: Buffer;
  readonly layout: RawZipLayout;
}

function rawName(value: string | Buffer): Buffer {
  return typeof value === 'string' ? Buffer.from(value, 'ascii') : Buffer.from(value);
}

function localHeader(fields: {
  readonly versionNeeded: number;
  readonly flags: number;
  readonly method: number;
  readonly crc32: number;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
  readonly nameBytes: number;
  readonly extraBytes: number;
}): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(fields.versionNeeded, 4);
  header.writeUInt16LE(fields.flags, 6);
  header.writeUInt16LE(fields.method, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(fields.crc32 >>> 0, 14);
  header.writeUInt32LE(fields.compressedBytes >>> 0, 18);
  header.writeUInt32LE(fields.uncompressedBytes >>> 0, 22);
  header.writeUInt16LE(fields.nameBytes, 26);
  header.writeUInt16LE(fields.extraBytes, 28);
  return header;
}

function centralHeader(fields: {
  readonly versionMadeBy: number;
  readonly versionNeeded: number;
  readonly flags: number;
  readonly method: number;
  readonly crc32: number;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
  readonly nameBytes: number;
  readonly extraBytes: number;
  readonly diskStart: number;
  readonly internalAttributes: number;
  readonly externalAttributes: number;
  readonly localOffset: number;
}): Buffer {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(fields.versionMadeBy, 4);
  header.writeUInt16LE(fields.versionNeeded, 6);
  header.writeUInt16LE(fields.flags, 8);
  header.writeUInt16LE(fields.method, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(0, 14);
  header.writeUInt32LE(fields.crc32 >>> 0, 16);
  header.writeUInt32LE(fields.compressedBytes >>> 0, 20);
  header.writeUInt32LE(fields.uncompressedBytes >>> 0, 24);
  header.writeUInt16LE(fields.nameBytes, 28);
  header.writeUInt16LE(fields.extraBytes, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(fields.diskStart, 34);
  header.writeUInt16LE(fields.internalAttributes, 36);
  header.writeUInt32LE(fields.externalAttributes >>> 0, 38);
  header.writeUInt32LE(fields.localOffset >>> 0, 42);
  return header;
}

function dataDescriptor(
  kind: Exclude<RawZipEntrySpec['descriptor'], 'none' | undefined>,
  crc32: number,
  compressedBytes: number,
  uncompressedBytes: number,
): Buffer {
  const signed = kind !== 'unsigned';
  const zip64 = kind === 'zip64';
  const descriptor = Buffer.alloc((signed ? 4 : 0) + 4 + (zip64 ? 16 : 8));
  let offset = 0;
  if (signed) {
    descriptor.writeUInt32LE(0x08074b50, offset);
    offset += 4;
  }
  descriptor.writeUInt32LE(crc32 >>> 0, offset);
  offset += 4;
  if (zip64) {
    descriptor.writeBigUInt64LE(BigInt(compressedBytes), offset);
    descriptor.writeBigUInt64LE(BigInt(uncompressedBytes), offset + 8);
  } else {
    descriptor.writeUInt32LE(compressedBytes >>> 0, offset);
    descriptor.writeUInt32LE(uncompressedBytes >>> 0, offset + 4);
  }
  return descriptor;
}

export function buildRawZipFixture(options: RawZipFixtureOptions): RawZipFixture {
  const localChunks: Buffer[] = [options.leadingBytes ?? Buffer.alloc(0)];
  const centralSpecs: {
    readonly spec: RawZipEntrySpec;
    readonly centralName: Buffer;
    readonly centralExtra: Buffer;
    readonly localOffset: number;
    readonly compressedBytes: number;
    readonly uncompressedBytes: number;
    readonly crc32: number;
  }[] = [];
  const partialLayouts: Omit<RawZipEntryLayout, 'centralHeader' | 'centralName' | 'centralExtra' | 'centralEnd'>[] = [];
  let cursor = localChunks[0]!.byteLength;

  for (const spec of options.entries) {
    const gap = spec.gapBefore ?? Buffer.alloc(0);
    localChunks.push(gap);
    cursor += gap.byteLength;
    const centralName = rawName(spec.name);
    const localName = rawName(spec.localName ?? spec.name);
    const centralExtra = spec.centralExtra ?? Buffer.alloc(0);
    const localExtra = spec.localExtra ?? Buffer.alloc(0);
    const method = spec.method ?? 0;
    const uncompressed = spec.data ?? Buffer.alloc(0);
    const compressed = spec.compressedData ?? (method === 8 ? deflateRawSync(uncompressed) : uncompressed);
    const crc32 = fixtureCrc32(uncompressed);
    const centralCrc32 = spec.centralCrc32 ?? crc32;
    const centralCompressedBytes = spec.centralCompressedBytes ?? compressed.byteLength;
    const centralUncompressedBytes = spec.centralUncompressedBytes ?? uncompressed.byteLength;
    const descriptorKind = spec.descriptor ?? 'none';
    const flags = spec.flags ?? (0x0800 | (descriptorKind === 'none' ? 0 : 0x0008));
    const localOffset = cursor;
    const local = localHeader({
      versionNeeded: spec.versionNeeded ?? 20,
      flags,
      method,
      crc32: spec.localCrc32 ?? (descriptorKind === 'none' ? centralCrc32 : 0),
      compressedBytes: spec.localCompressedBytes ?? (descriptorKind === 'none' ? centralCompressedBytes : 0),
      uncompressedBytes: spec.localUncompressedBytes ?? (descriptorKind === 'none' ? centralUncompressedBytes : 0),
      nameBytes: localName.byteLength,
      extraBytes: localExtra.byteLength,
    });
    const descriptor = descriptorKind === 'none' ? undefined : dataDescriptor(
      descriptorKind,
      spec.descriptorCrc32 ?? centralCrc32,
      spec.descriptorCompressedBytes ?? centralCompressedBytes,
      spec.descriptorUncompressedBytes ?? centralUncompressedBytes,
    );
    const dataStart = localOffset + local.byteLength + localName.byteLength + localExtra.byteLength;
    const descriptorStart = descriptor ? dataStart + compressed.byteLength : undefined;
    localChunks.push(local, localName, localExtra, compressed, ...(descriptor ? [descriptor] : []));
    cursor = dataStart + compressed.byteLength + (descriptor?.byteLength ?? 0);
    partialLayouts.push({
      localHeader: localOffset,
      localName: localOffset + local.byteLength,
      localExtra: localOffset + local.byteLength + localName.byteLength,
      data: dataStart,
      descriptor: descriptorStart,
      localEnd: cursor,
    });
    centralSpecs.push({
      spec,
      centralName,
      centralExtra,
      localOffset,
      compressedBytes: centralCompressedBytes,
      uncompressedBytes: centralUncompressedBytes,
      crc32: centralCrc32,
    });
  }

  const centralStart = cursor;
  const centralChunks: Buffer[] = [];
  const layouts: RawZipEntryLayout[] = [];
  for (let index = 0; index < centralSpecs.length; index += 1) {
    const current = centralSpecs[index]!;
    const spec = current.spec;
    const method = spec.method ?? 0;
    const descriptorKind = spec.descriptor ?? 'none';
    const flags = spec.flags ?? (0x0800 | (descriptorKind === 'none' ? 0 : 0x0008));
    const name = current.centralName;
    const extra = current.centralExtra;
    const headerOffset = cursor;
    const nameOffset = headerOffset + 46;
    const extraOffset = nameOffset + name.byteLength;
    const header = centralHeader({
      versionMadeBy: spec.versionMadeBy ?? ((3 << 8) | 20),
      versionNeeded: spec.versionNeeded ?? 20,
      flags,
      method,
      crc32: current.crc32,
      compressedBytes: current.compressedBytes,
      uncompressedBytes: current.uncompressedBytes,
      nameBytes: name.byteLength,
      extraBytes: extra.byteLength,
      diskStart: spec.diskStart ?? 0,
      internalAttributes: spec.internalAttributes ?? 0,
      externalAttributes: spec.externalAttributes ?? (name.at(-1) === 0x2f ? (0o40700 << 16) >>> 0 : (0o100600 << 16) >>> 0),
      localOffset: spec.centralLocalOffset ?? current.localOffset,
    });
    centralChunks.push(header, name, extra);
    cursor = extraOffset + extra.byteLength;
    layouts.push({ ...partialLayouts[index]!, centralHeader: headerOffset, centralName: nameOffset, centralExtra: extraOffset, centralEnd: cursor });
  }
  const centralJunk = options.centralJunk ?? Buffer.alloc(0);
  centralChunks.push(centralJunk);
  cursor += centralJunk.byteLength;
  const centralEnd = cursor;
  const centralSize = centralEnd - centralStart;

  let zip64Eocd: number | undefined;
  let zip64Locator: number | undefined;
  const endingChunks: Buffer[] = [];
  if (options.forceZip64) {
    zip64Eocd = cursor;
    const record = Buffer.alloc(56);
    record.writeUInt32LE(0x06064b50, 0);
    record.writeBigUInt64LE(44n, 4);
    record.writeUInt16LE((3 << 8) | 45, 12);
    record.writeUInt16LE(45, 14);
    record.writeUInt32LE(0, 16);
    record.writeUInt32LE(0, 20);
    record.writeBigUInt64LE(BigInt(options.entries.length), 24);
    record.writeBigUInt64LE(BigInt(options.entries.length), 32);
    record.writeBigUInt64LE(BigInt(centralSize), 40);
    record.writeBigUInt64LE(BigInt(centralStart), 48);
    endingChunks.push(record);
    cursor += record.byteLength;
    zip64Locator = cursor;
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50, 0);
    locator.writeUInt32LE(0, 4);
    locator.writeBigUInt64LE(BigInt(zip64Eocd), 8);
    locator.writeUInt32LE(1, 16);
    endingChunks.push(locator);
    cursor += locator.byteLength;
  }

  const eocd = cursor;
  const comment = options.comment ?? Buffer.alloc(0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(options.forceZip64 ? 0xffff : options.entries.length, 8);
  end.writeUInt16LE(options.forceZip64 ? 0xffff : options.entries.length, 10);
  end.writeUInt32LE(options.forceZip64 ? 0xffff_ffff : centralSize, 12);
  end.writeUInt32LE(options.forceZip64 ? 0xffff_ffff : centralStart, 16);
  end.writeUInt16LE(comment.byteLength, 20);
  endingChunks.push(end, comment, options.trailingBytes ?? Buffer.alloc(0));

  return {
    bytes: Buffer.concat([...localChunks, ...centralChunks, ...endingChunks]),
    layout: { entries: layouts, centralStart, centralEnd, zip64Eocd, zip64Locator, eocd },
  };
}

export function patchRawZipFixture(
  fixture: RawZipFixture,
  patch: (bytes: Buffer, layout: RawZipLayout) => void,
): RawZipFixture {
  const bytes = Buffer.from(fixture.bytes);
  patch(bytes, fixture.layout);
  return { bytes, layout: fixture.layout };
}

export function encodeExtraFields(
  fields: readonly { readonly id: number; readonly data: Buffer }[],
): Buffer {
  return Buffer.concat(fields.map(({ id, data }) => {
    const header = Buffer.alloc(4);
    header.writeUInt16LE(id, 0);
    header.writeUInt16LE(data.byteLength, 2);
    return Buffer.concat([header, data]);
  }));
}
