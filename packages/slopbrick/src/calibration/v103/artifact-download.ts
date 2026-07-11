/**
 * Acquires checksum-pinned calibration archives without trusting DNS, HTTP
 * metadata, or a shared cache pathname. The boundary is intentionally IPv4-
 * only and POSIX-only. It blocks cross-user cache tampering; same-UID races and
 * filesystem syscalls that never return remain explicit OS-level residuals.
 */
import { createHash, randomBytes } from 'node:crypto';
import { lookup as dnsLookup, type LookupAddress, type LookupAllOptions } from 'node:dns';
import { constants } from 'node:fs';
import { link, lstat, open, realpath, type FileHandle, unlink } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { inspect as nodeInspect } from 'node:util';

interface BigIntFileIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly size: bigint;
  isFile(): boolean;
}

// These are frozen acquisition-policy budgets, not performance tuning knobs.
const IDLE_TIMEOUT_MS = 30_000;
const TOTAL_TIMEOUT_MS = 300_000;
const MAX_REDIRECTS = 5;
const MAX_DNS_ANSWERS = 16;
const MAX_ARTIFACT_BYTES = 5 * 1024 ** 3;
const TEMP_ATTEMPTS = 8;
const READ_BUFFER_BYTES = 64 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface AcquireArtifactOptions {
  readonly assetUrl: string;
  readonly expectedSha256: string;
  readonly expectedBytes: number;
  readonly cacheDirectory: string;
  readonly network?: 'deny' | 'allow';
  readonly allowedHosts: readonly string[];
}

/** Raw headers and the connected peer stay visible so policy can detect
 * duplicate framing fields and DNS-to-socket address changes. */
export interface ArtifactTransportResponse {
  readonly status: number;
  readonly rawHeaders: readonly (readonly [name: string, value: string])[];
  readonly url: string;
  readonly remoteAddress: string | undefined;
  readonly body: AsyncIterable<Uint8Array>;
  readonly abort: () => void;
}

export interface ArtifactTransportRequest {
  readonly url: URL;
  readonly lookup: LookupFunction;
  readonly headers: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
  readonly agent: false;
}

export type ArtifactTransport = (request: ArtifactTransportRequest) => Promise<ArtifactTransportResponse>;

export type RawAddressLookup = (
  hostname: string,
  options: LookupAllOptions,
  callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

export type ArtifactOpenFile = (
  path: string,
  flags: string | number,
  mode?: number,
) => Promise<FileHandle>;

export type ArtifactLinkFile = (existingPath: string, newPath: string) => Promise<void>;
export type ArtifactRealpath = (path: string) => Promise<string>;
export type ArtifactLstat = typeof lstat;
export type ArtifactUnlinkFile = (path: string) => Promise<void>;

export interface ArtifactTimerScheduler {
  readonly setTimeout: (callback: () => void, milliseconds: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
}

export interface ArtifactFilesystemSecurityCapabilities {
  readonly noFollowFlag: number | undefined;
  readonly nonBlockingFlag: number | undefined;
  readonly effectiveUid: number | undefined;
}

export interface ArtifactDownloadDependencies {
  readonly transport?: ArtifactTransport;
  readonly rawLookup?: RawAddressLookup;
  readonly openFile?: ArtifactOpenFile;
  readonly linkFile?: ArtifactLinkFile;
  readonly realpathFile?: ArtifactRealpath;
  readonly lstatFile?: ArtifactLstat;
  readonly unlinkFile?: ArtifactUnlinkFile;
  readonly timerScheduler?: ArtifactTimerScheduler;
  readonly filesystemSecurity?: ArtifactFilesystemSecurityCapabilities;
}

export type ArtifactAcquisitionErrorCode =
  | 'ERR_ARTIFACT_ALLOWLIST_INVALID'
  | 'ERR_ARTIFACT_CACHE_INVALID'
  | 'ERR_ARTIFACT_CACHE_IO'
  | 'ERR_ARTIFACT_CACHE_UNTRUSTED'
  | 'ERR_ARTIFACT_DIGEST'
  | 'ERR_ARTIFACT_EXPECTED_BYTES'
  | 'ERR_ARTIFACT_EXPECTED_SHA'
  | 'ERR_ARTIFACT_HOST_FORBIDDEN'
  | 'ERR_ARTIFACT_HOST_NOT_ALLOWED'
  | 'ERR_ARTIFACT_IDLE_TIMEOUT'
  | 'ERR_ARTIFACT_LOCATION'
  | 'ERR_ARTIFACT_NETWORK'
  | 'ERR_ARTIFACT_NETWORK_DENIED'
  | 'ERR_ARTIFACT_PARTIAL_RESPONSE'
  | 'ERR_ARTIFACT_PROMOTION'
  | 'ERR_ARTIFACT_PROMOTION_CONFLICT'
  | 'ERR_ARTIFACT_REDIRECT_LIMIT'
  | 'ERR_ARTIFACT_REDIRECT_LOOP'
  | 'ERR_ARTIFACT_REMOTE_ADDRESS'
  | 'ERR_ARTIFACT_RESPONSE_HEADERS'
  | 'ERR_ARTIFACT_RESPONSE_LENGTH'
  | 'ERR_ARTIFACT_RESPONSE_URL'
  | 'ERR_ARTIFACT_STATUS'
  | 'ERR_ARTIFACT_STREAM'
  | 'ERR_ARTIFACT_TEMP'
  | 'ERR_ARTIFACT_TOTAL_TIMEOUT'
  | 'ERR_ARTIFACT_URL_CREDENTIALS'
  | 'ERR_ARTIFACT_URL_FRAGMENT'
  | 'ERR_ARTIFACT_URL_INVALID'
  | 'ERR_ARTIFACT_URL_PORT'
  | 'ERR_ARTIFACT_URL_SCHEME';

const ERROR_MESSAGES: Readonly<Record<ArtifactAcquisitionErrorCode, string>> = {
  ERR_ARTIFACT_ALLOWLIST_INVALID: 'Artifact acquisition failed: host allow-list is invalid',
  ERR_ARTIFACT_CACHE_INVALID: 'Artifact acquisition failed: cached archive failed verification',
  ERR_ARTIFACT_CACHE_IO: 'Artifact acquisition failed: cache is unavailable',
  ERR_ARTIFACT_CACHE_UNTRUSTED: 'Artifact acquisition failed: cache directory is not private',
  ERR_ARTIFACT_DIGEST: 'Artifact acquisition failed: archive digest did not match',
  ERR_ARTIFACT_EXPECTED_BYTES: 'Artifact acquisition failed: expected byte count is invalid',
  ERR_ARTIFACT_EXPECTED_SHA: 'Artifact acquisition failed: expected SHA-256 is invalid',
  ERR_ARTIFACT_HOST_FORBIDDEN: 'Artifact acquisition failed: host is forbidden',
  ERR_ARTIFACT_HOST_NOT_ALLOWED: 'Artifact acquisition failed: host is not allowed',
  ERR_ARTIFACT_IDLE_TIMEOUT: 'Artifact acquisition failed: idle deadline exceeded',
  ERR_ARTIFACT_LOCATION: 'Artifact acquisition failed: redirect Location is invalid',
  ERR_ARTIFACT_NETWORK: 'Artifact acquisition failed: network request failed',
  ERR_ARTIFACT_NETWORK_DENIED: 'Artifact acquisition failed: network access is denied',
  ERR_ARTIFACT_PARTIAL_RESPONSE: 'Artifact acquisition failed: partial response is forbidden',
  ERR_ARTIFACT_PROMOTION: 'Artifact acquisition failed: cache promotion failed',
  ERR_ARTIFACT_PROMOTION_CONFLICT: 'Artifact acquisition failed: cache promotion conflict failed verification',
  ERR_ARTIFACT_REDIRECT_LIMIT: 'Artifact acquisition failed: redirect limit exceeded',
  ERR_ARTIFACT_REDIRECT_LOOP: 'Artifact acquisition failed: redirect loop detected',
  ERR_ARTIFACT_REMOTE_ADDRESS: 'Artifact acquisition failed: connected address was not vetted',
  ERR_ARTIFACT_RESPONSE_HEADERS: 'Artifact acquisition failed: response headers are invalid',
  ERR_ARTIFACT_RESPONSE_LENGTH: 'Artifact acquisition failed: response length did not match',
  ERR_ARTIFACT_RESPONSE_URL: 'Artifact acquisition failed: transport changed the request URL',
  ERR_ARTIFACT_STATUS: 'Artifact acquisition failed: final response was not 200',
  ERR_ARTIFACT_STREAM: 'Artifact acquisition failed: archive stream failed',
  ERR_ARTIFACT_TEMP: 'Artifact acquisition failed: temporary archive could not be created',
  ERR_ARTIFACT_TOTAL_TIMEOUT: 'Artifact acquisition failed: total deadline exceeded',
  ERR_ARTIFACT_URL_CREDENTIALS: 'Artifact acquisition failed: URL credentials are not allowed',
  ERR_ARTIFACT_URL_FRAGMENT: 'Artifact acquisition failed: URL fragments are not allowed',
  ERR_ARTIFACT_URL_INVALID: 'Artifact acquisition failed: asset URL is invalid',
  ERR_ARTIFACT_URL_PORT: 'Artifact acquisition failed: default HTTPS port is required',
  ERR_ARTIFACT_URL_SCHEME: 'Artifact acquisition failed: HTTPS URL is required',
};

/** A deliberately constant, cause-free error safe to render in logs or JSON. */
export class ArtifactAcquisitionError extends Error {
  readonly code: ArtifactAcquisitionErrorCode;

  constructor(code: ArtifactAcquisitionErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'ArtifactAcquisitionError';
    this.code = code;
    this.stack = `${this.name} [${this.code}]: ${this.message}`;
  }

  toJSON(): { readonly name: string; readonly code: ArtifactAcquisitionErrorCode; readonly message: string } {
    return { name: this.name, code: this.code, message: this.message };
  }

  [nodeInspect.custom](): string {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}

function fail(code: ArtifactAcquisitionErrorCode): never {
  throw new ArtifactAcquisitionError(code);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function ipv4Bytes(address: string): readonly [number, number, number, number] | undefined {
  if (isIP(address) !== 4) return undefined;
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return undefined;
  return octets as unknown as readonly [number, number, number, number];
}

function ipv4Number(address: string): number | undefined {
  const octets = ipv4Bytes(address);
  if (!octets) return undefined;
  return (((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]) >>> 0;
}

const NON_PUBLIC_IPV4_CIDRS: readonly (readonly [network: number, prefix: number])[] = [
  [0x00000000, 8],
  [0x0a000000, 8],
  [0x64400000, 10],
  [0x7f000000, 8],
  [0xa9fe0000, 16],
  [0xac100000, 12],
  [0xc0000000, 24],
  [0xc0000200, 24],
  [0xc0586300, 24],
  [0xc0a80000, 16],
  [0xc6120000, 15],
  [0xc6336400, 24],
  [0xcb007100, 24],
  [0xe0000000, 4],
  [0xf0000000, 4],
];

function matchesIpv4Cidr(value: number, network: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) >>> 0 === (network & mask) >>> 0;
}

function isPublicIpv4(address: string): boolean {
  const value = ipv4Number(address);
  return value !== undefined && !NON_PUBLIC_IPV4_CIDRS.some(([network, prefix]) => matchesIpv4Cidr(value, network, prefix));
}

// Native IPv6 stays denied: an allocated GUA can be an RFC 6052 NAT64 prefix
// that translates to private IPv4, which cannot be inferred from the address.
function canonicalPublicAddress(address: string, expectedFamily?: number): string | undefined {
  const family = isIP(address);
  if (family !== 4 || (expectedFamily !== undefined && expectedFamily !== 4)) return undefined;
  const bytes = ipv4Bytes(address);
  if (!bytes || !isPublicIpv4(address)) return undefined;
  return `4:${bytes.join('.')}`;
}

function lookupPolicyError(): NodeJS.ErrnoException {
  const error = new Error('Artifact destination policy rejected the resolved address') as NodeJS.ErrnoException;
  error.code = 'EACCES';
  return error;
}

function policyLookup(rawLookup: RawAddressLookup, vetted: Set<string>): LookupFunction {
  // Resolve every A answer, reject the whole set if any address is unsafe, and
  // retain the set so the TLS socket peer must match an address actually vetted.
  return (hostname, options, callback) => {
    let settled = false;
    const reject = () => {
      if (settled) return;
      settled = true;
      callback(lookupPolicyError(), '');
    };
    try {
      rawLookup(hostname, {
        family: 4,
        hints: options.hints,
        all: true,
        verbatim: true,
      }, (error, addresses) => {
        if (settled) return;
        if (error || addresses.length === 0 || addresses.length > MAX_DNS_ANSWERS) {
          reject();
          return;
        }
        const canonical = addresses.map(({ address, family }) => canonicalPublicAddress(address, family));
        if (canonical.some((address) => address === undefined)) {
          reject();
          return;
        }
        for (const address of canonical) vetted.add(address!);
        settled = true;
        if (options.all) callback(null, addresses);
        else callback(null, addresses[0]!.address, addresses[0]!.family);
      });
    } catch {
      reject();
    }
  };
}

const defaultRawLookup: RawAddressLookup = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true, verbatim: true }, callback);
};

export function createNodeHttpsArtifactTransport(
  requestHttps: typeof httpsRequest = httpsRequest,
): ArtifactTransport {
  return ({ url, lookup, headers, signal }) => new Promise((resolve, reject) => {
    // Pin TLS and parser policy explicitly so process flags cannot weaken this
    // security boundary; a fresh agent also forces DNS/peer checks on every hop.
    const request = requestHttps(url, {
      method: 'GET',
      headers,
      lookup,
      agent: false,
      signal,
      servername: url.hostname,
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
      maxHeaderSize: 16 * 1024,
      insecureHTTPParser: false,
    }, (incoming) => {
      const distinctHeaders: [string, string][] = [];
      for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
        distinctHeaders.push([incoming.rawHeaders[index]!, incoming.rawHeaders[index + 1] ?? '']);
      }
      resolve({
        status: incoming.statusCode ?? 0,
        rawHeaders: distinctHeaders,
        url: url.href,
        remoteAddress: incoming.socket.remoteAddress,
        body: incoming,
        abort: () => {
          incoming.destroy();
          request.destroy();
        },
      });
    });
    request.once('error', reject);
    request.end();
  });
}

const defaultTransport = createNodeHttpsArtifactTransport();

function validateAllowedHosts(input: readonly string[]): Set<string> {
  const hostPattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (input.length === 0 || input.some((host) => !hostPattern.test(host))) fail('ERR_ARTIFACT_ALLOWLIST_INVALID');
  return new Set(input);
}

function validateUrlSyntax(input: string): void {
  // WHATWG URL parsing erases empty `@` and `#` syntax, so reject those markers
  // before normalization rather than checking only parsed username/hash values.
  if (input.includes('#')) fail('ERR_ARTIFACT_URL_FRAGMENT');
  const authorityStart = input.startsWith('//')
    ? 2
    : (/^[a-z][a-z0-9+.-]*:\/\//i.exec(input)?.[0].length ?? -1);
  if (authorityStart >= 0) {
    const remainder = input.slice(authorityStart);
    const authorityEnd = remainder.search(/[/?#]/);
    const authority = authorityEnd < 0 ? remainder : remainder.slice(0, authorityEnd);
    if (authority.includes('@')) fail('ERR_ARTIFACT_URL_CREDENTIALS');
  }
}

function validateUrl(input: string, allowedHosts: ReadonlySet<string>): URL {
  validateUrlSyntax(input);
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    fail('ERR_ARTIFACT_URL_INVALID');
  }
  if (url.protocol !== 'https:') fail('ERR_ARTIFACT_URL_SCHEME');
  if (url.username !== '' || url.password !== '') fail('ERR_ARTIFACT_URL_CREDENTIALS');
  if (url.hash !== '') fail('ERR_ARTIFACT_URL_FRAGMENT');
  if (url.port !== '') fail('ERR_ARTIFACT_URL_PORT');
  const rawHostname = url.hostname;
  const hostname = rawHostname.startsWith('[') && rawHostname.endsWith(']') ? rawHostname.slice(1, -1) : rawHostname;
  if (
    rawHostname.endsWith('.')
    || isIP(hostname) !== 0
    || hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname === 'local'
    || hostname.endsWith('.local')
  ) fail('ERR_ARTIFACT_HOST_FORBIDDEN');
  if (!allowedHosts.has(hostname)) fail('ERR_ARTIFACT_HOST_NOT_ALLOWED');
  return url;
}

interface ParsedHeaders {
  readonly contentLength?: number;
  readonly location?: string;
}

function valuesFor(headers: ArtifactTransportResponse['rawHeaders'], target: string): string[] {
  const values: string[] = [];
  for (const pair of headers) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') {
      fail('ERR_ARTIFACT_RESPONSE_HEADERS');
    }
    if (pair[0].toLowerCase() === target) values.push(pair[1]);
  }
  return values;
}

function parseResponseHeaders(response: ArtifactTransportResponse): ParsedHeaders {
  // Raw occurrences are required here: collapsed headers hide duplicate
  // Content-Length/Location and Content-Length plus Transfer-Encoding ambiguity.
  if (!Array.isArray(response.rawHeaders)) fail('ERR_ARTIFACT_RESPONSE_HEADERS');
  const contentLengths = valuesFor(response.rawHeaders, 'content-length');
  const transferEncodings = valuesFor(response.rawHeaders, 'transfer-encoding');
  const contentEncodings = valuesFor(response.rawHeaders, 'content-encoding');
  const locations = valuesFor(response.rawHeaders, 'location');
  if (
    contentLengths.length > 1
    || transferEncodings.length > 1
    || contentEncodings.length > 1
    || (contentLengths.length === 1 && transferEncodings.length === 1)
  ) fail('ERR_ARTIFACT_RESPONSE_HEADERS');
  if (transferEncodings.length === 1 && transferEncodings[0]!.trim().toLowerCase() !== 'chunked') {
    fail('ERR_ARTIFACT_RESPONSE_HEADERS');
  }
  if (contentEncodings.length === 1 && contentEncodings[0]!.trim().toLowerCase() !== 'identity') {
    fail('ERR_ARTIFACT_RESPONSE_HEADERS');
  }
  if (locations.length > 1) fail('ERR_ARTIFACT_LOCATION');
  let contentLength: number | undefined;
  if (contentLengths.length === 1) {
    const value = contentLengths[0]!;
    if (!/^(?:0|[1-9][0-9]*)$/.test(value)) fail('ERR_ARTIFACT_RESPONSE_HEADERS');
    contentLength = Number(value);
    if (!Number.isSafeInteger(contentLength)) fail('ERR_ARTIFACT_RESPONSE_HEADERS');
  }
  return {
    ...(contentLength === undefined ? {} : { contentLength }),
    ...(locations.length === 0 ? {} : { location: locations[0] }),
  };
}

/**
 * Bind pathname and content through lstat -> open -> fstat -> hash -> fstat ->
 * close -> lstat. BigInt dev/ino comparisons reject replacements that retain
 * the expected size or leave the already-open handle pointing at valid bytes.
 */
async function verifyRegularArchive(
  path: string,
  expectedBytes: number,
  expectedSha256: string,
  openFile: ArtifactOpenFile,
  checkDeadline: () => void = () => undefined,
  openFlags: number = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  lstatFile: ArtifactLstat = lstat,
): Promise<'missing' | 'valid' | 'invalid'> {
  const expectedSize = BigInt(expectedBytes);
  let pathBeforeOpen: BigIntFileIdentity;
  try {
    checkDeadline();
    pathBeforeOpen = await lstatFile(path, { bigint: true });
    checkDeadline();
  } catch (error) {
    if (error instanceof ArtifactAcquisitionError) throw error;
    checkDeadline();
    return errorCode(error) === 'ENOENT' ? 'missing' : 'invalid';
  }
  if (!pathBeforeOpen.isFile() || pathBeforeOpen.size !== expectedSize) return 'invalid';

  let handle: FileHandle | undefined;
  try {
    checkDeadline();
    handle = await openFile(path, openFlags);
    checkDeadline();
  } catch (error) {
    if (error instanceof ArtifactAcquisitionError) throw error;
    checkDeadline();
    return 'invalid';
  }
  let valid = false;
  let finalHandleIdentity: BigIntFileIdentity | undefined;
  try {
    const metadata = await handle.stat({ bigint: true });
    checkDeadline();
    if (
      metadata.isFile()
      && metadata.size === expectedSize
      && metadata.dev === pathBeforeOpen.dev
      && metadata.ino === pathBeforeOpen.ino
    ) {
      const hash = createHash('sha256');
      const buffer = Buffer.allocUnsafe(Math.min(READ_BUFFER_BYTES, expectedBytes));
      let position = 0;
      while (position < expectedBytes) {
        const length = Math.min(buffer.byteLength, expectedBytes - position);
        const { bytesRead } = await handle.read(buffer, 0, length, position);
        checkDeadline();
        if (bytesRead === 0) break;
        hash.update(buffer.subarray(0, bytesRead));
        position += bytesRead;
      }
      const finalMetadata = await handle.stat({ bigint: true });
      checkDeadline();
      finalHandleIdentity = finalMetadata;
      valid = finalMetadata.isFile()
        && finalMetadata.size === expectedSize
        && finalMetadata.dev === pathBeforeOpen.dev
        && finalMetadata.ino === pathBeforeOpen.ino
        && finalMetadata.dev === metadata.dev
        && finalMetadata.ino === metadata.ino
        && position === expectedBytes
        && hash.digest('hex') === expectedSha256;
    }
  } catch (error) {
    if (error instanceof ArtifactAcquisitionError) throw error;
    valid = false;
  } finally {
    try {
      await handle.close();
    } catch {
      valid = false;
    }
  }
  checkDeadline();
  if (!valid || !finalHandleIdentity) return 'invalid';
  try {
    const pathAfterClose = await lstatFile(path, { bigint: true });
    checkDeadline();
    return pathAfterClose.isFile()
      && pathAfterClose.size === expectedSize
      && pathAfterClose.dev === pathBeforeOpen.dev
      && pathAfterClose.ino === pathBeforeOpen.ino
      && pathAfterClose.dev === finalHandleIdentity.dev
      && pathAfterClose.ino === finalHandleIdentity.ino
      ? 'valid'
      : 'invalid';
  } catch (error) {
    if (error instanceof ArtifactAcquisitionError) throw error;
    checkDeadline();
    return 'invalid';
  }
}

function requireFilesystemSecurity(
  capabilities: ArtifactFilesystemSecurityCapabilities,
): { readonly noFollowFlag: number; readonly nonBlockingFlag: number; readonly effectiveUid: number } {
  // Windows reparse points/ACLs do not satisfy these POSIX invariants. Missing
  // no-follow, nonblocking, or effective-UID primitives therefore fails closed.
  if (
    !Number.isInteger(capabilities.noFollowFlag)
    || capabilities.noFollowFlag! <= 0
    || !Number.isInteger(capabilities.nonBlockingFlag)
    || capabilities.nonBlockingFlag! <= 0
    || !Number.isInteger(capabilities.effectiveUid)
    || capabilities.effectiveUid! < 0
  ) fail('ERR_ARTIFACT_CACHE_UNTRUSTED');
  return capabilities as { readonly noFollowFlag: number; readonly nonBlockingFlag: number; readonly effectiveUid: number };
}

async function trustedCanonicalCacheDirectory(
  cacheDirectory: string,
  effectiveUid: number,
  realpathFile: ArtifactRealpath,
  lstatFile: ArtifactLstat,
  checkDeadline: () => void,
): Promise<string> {
  // Every ancestor must be controlled by root or this euid. Root-owned sticky
  // directories (for example /tmp) are the sole writable-ancestor exception.
  try {
    const absolute = resolve(cacheDirectory);
    checkDeadline();
    const canonical = await realpathFile(absolute);
    checkDeadline();
    if (canonical !== absolute) fail('ERR_ARTIFACT_CACHE_UNTRUSTED');
    let current = canonical;
    while (true) {
      checkDeadline();
      const metadata = await lstatFile(current);
      checkDeadline();
      const writableByOthers = (metadata.mode & 0o022) !== 0;
      const rootOwnedSticky = metadata.uid === 0 && (metadata.mode & 0o1000) !== 0;
      if (
        !metadata.isDirectory()
        || (metadata.uid !== 0 && metadata.uid !== effectiveUid)
        || (writableByOthers && !rootOwnedSticky)
        || (current === canonical && (metadata.uid !== effectiveUid || (metadata.mode & 0o077) !== 0))
      ) fail('ERR_ARTIFACT_CACHE_UNTRUSTED');
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return canonical;
  } catch (error) {
    if (error instanceof ArtifactAcquisitionError) throw error;
    checkDeadline();
    fail('ERR_ARTIFACT_CACHE_IO');
  }
}

async function createTemporaryArchive(
  cacheDirectory: string,
  expectedSha256: string,
  openFile: ArtifactOpenFile,
  checkDeadline: () => void,
): Promise<{ readonly path: string; readonly handle: FileHandle }> {
  // Same-directory random names plus `wx` prevent predictable-temp clobbering
  // and keep the later hard link on the cache filesystem.
  for (let attempt = 0; attempt < TEMP_ATTEMPTS; attempt += 1) {
    const path = join(cacheDirectory, `.${expectedSha256}.${randomBytes(16).toString('hex')}.tmp`);
    try {
      return { path, handle: await openFile(path, 'wx', 0o600) };
    } catch (error) {
      checkDeadline();
      if (errorCode(error) !== 'EEXIST') fail('ERR_ARTIFACT_TEMP');
    }
  }
  fail('ERR_ARTIFACT_TEMP');
}

function safeAbort(response: ArtifactTransportResponse | undefined): void {
  try {
    response?.abort();
  } catch {
    // Abort failures are deliberately suppressed so untrusted transport errors cannot escape.
  }
}

async function writeAll(handle: FileHandle, chunk: Uint8Array, checkDeadline: () => void): Promise<void> {
  const buffer = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  let offset = 0;
  while (offset < buffer.byteLength) {
    const { bytesWritten } = await handle.write(buffer, offset, buffer.byteLength - offset);
    checkDeadline();
    if (bytesWritten <= 0) fail('ERR_ARTIFACT_STREAM');
    offset += bytesWritten;
  }
}

export async function acquireArtifact(
  options: AcquireArtifactOptions,
  dependencies: ArtifactDownloadDependencies = {},
): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(options.expectedSha256)) fail('ERR_ARTIFACT_EXPECTED_SHA');
  if (
    !Number.isSafeInteger(options.expectedBytes)
    || options.expectedBytes < 1
    || options.expectedBytes > MAX_ARTIFACT_BYTES
  ) fail('ERR_ARTIFACT_EXPECTED_BYTES');
  const allowedHosts = validateAllowedHosts(options.allowedHosts);
  let currentUrl = validateUrl(options.assetUrl, allowedHosts);
  let cacheDirectory = resolve(options.cacheDirectory);
  let destination = join(cacheDirectory, `${options.expectedSha256}.zip`);
  const transport = dependencies.transport ?? defaultTransport;
  const rawLookup = dependencies.rawLookup ?? defaultRawLookup;
  const openFile = dependencies.openFile ?? open;
  const linkFile = dependencies.linkFile ?? link;
  const realpathFile = dependencies.realpathFile ?? (realpath as ArtifactRealpath);
  const lstatFile = dependencies.lstatFile ?? lstat;
  const unlinkFile = dependencies.unlinkFile ?? unlink;
  const timerScheduler: ArtifactTimerScheduler = dependencies.timerScheduler ?? {
    setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
  const filesystemSecurity = requireFilesystemSecurity(dependencies.filesystemSecurity ?? {
    noFollowFlag: constants.O_NOFOLLOW,
    nonBlockingFlag: constants.O_NONBLOCK,
    effectiveUid: typeof process.geteuid === 'function' ? process.geteuid() : undefined,
  });
  const regularOpenFlags = constants.O_RDONLY | filesystemSecurity.noFollowFlag | filesystemSecurity.nonBlockingFlag;
  const operationController = new AbortController();
  let deadline: 'ERR_ARTIFACT_IDLE_TIMEOUT' | 'ERR_ARTIFACT_TOTAL_TIMEOUT' | undefined;
  let activeResponse: ArtifactTransportResponse | undefined;
  let idleTimer: unknown;
  let tempPath: string | undefined;
  let tempHandle: FileHandle | undefined;
  let publishedByInvocation = false;
  let publicationAccepted = false;
  const triggerDeadline = (code: 'ERR_ARTIFACT_IDLE_TIMEOUT' | 'ERR_ARTIFACT_TOTAL_TIMEOUT') => {
    if (deadline) return;
    deadline = code;
    safeAbort(activeResponse);
    operationController.abort();
  };
  // Network work is abortable. Local filesystem calls are not, so their
  // deadline is cooperative and becomes authoritative immediately after await.
  const totalTimer = timerScheduler.setTimeout(() => triggerDeadline('ERR_ARTIFACT_TOTAL_TIMEOUT'), TOTAL_TIMEOUT_MS);
  const resetIdleTimer = () => {
    if (idleTimer !== undefined) timerScheduler.clearTimeout(idleTimer);
    idleTimer = timerScheduler.setTimeout(() => triggerDeadline('ERR_ARTIFACT_IDLE_TIMEOUT'), IDLE_TIMEOUT_MS);
  };
  const throwDeadline = () => {
    if (deadline) fail(deadline);
  };

  try {
    cacheDirectory = await trustedCanonicalCacheDirectory(
      cacheDirectory,
      filesystemSecurity.effectiveUid,
      realpathFile,
      lstatFile,
      throwDeadline,
    );
    destination = join(cacheDirectory, `${options.expectedSha256}.zip`);
    throwDeadline();
    const cached = await verifyRegularArchive(
      destination,
      options.expectedBytes,
      options.expectedSha256,
      openFile,
      throwDeadline,
      regularOpenFlags,
      lstatFile,
    );
    throwDeadline();
    if (cached === 'valid') return destination;
    if (cached === 'invalid') fail('ERR_ARTIFACT_CACHE_INVALID');
    if ((options.network ?? 'deny') !== 'allow') fail('ERR_ARTIFACT_NETWORK_DENIED');

    const visited = new Set<string>([currentUrl.href]);
    let redirects = 0;
    while (true) {
      const vetted = new Set<string>();
      resetIdleTimer();
      try {
        activeResponse = await transport({
          url: currentUrl,
          lookup: policyLookup(rawLookup, vetted),
          headers: { Accept: 'application/zip', 'Accept-Encoding': 'identity' },
          signal: operationController.signal,
          agent: false,
        });
      } catch {
        throwDeadline();
        fail('ERR_ARTIFACT_NETWORK');
      }
      throwDeadline();
      resetIdleTimer();

      let responseUrl: string;
      try {
        responseUrl = new URL(activeResponse.url).href;
      } catch {
        fail('ERR_ARTIFACT_RESPONSE_URL');
      }
      if (responseUrl !== currentUrl.href) fail('ERR_ARTIFACT_RESPONSE_URL');
      const remoteAddress = activeResponse.remoteAddress;
      const canonicalRemote = typeof remoteAddress === 'string' ? canonicalPublicAddress(remoteAddress) : undefined;
      if (!canonicalRemote || !vetted.has(canonicalRemote)) fail('ERR_ARTIFACT_REMOTE_ADDRESS');
      const headers = parseResponseHeaders(activeResponse);

      if (REDIRECT_STATUSES.has(activeResponse.status)) {
        // Redirects are locators, not trust carry-over: URL, host, DNS, TLS,
        // connected peer, and raw response headers are revalidated on each hop.
        if (!headers.location || headers.location.trim() === '') fail('ERR_ARTIFACT_LOCATION');
        if (redirects >= MAX_REDIRECTS) fail('ERR_ARTIFACT_REDIRECT_LIMIT');
        let redirected: URL;
        try {
          validateUrlSyntax(headers.location);
          redirected = validateUrl(new URL(headers.location, currentUrl).href, allowedHosts);
        } catch (error) {
          if (error instanceof ArtifactAcquisitionError) throw error;
          fail('ERR_ARTIFACT_LOCATION');
        }
        if (visited.has(redirected.href)) fail('ERR_ARTIFACT_REDIRECT_LOOP');
        visited.add(redirected.href);
        redirects += 1;
        safeAbort(activeResponse);
        activeResponse = undefined;
        currentUrl = redirected;
        continue;
      }
      if (activeResponse.status === 206) fail('ERR_ARTIFACT_PARTIAL_RESPONSE');
      if (activeResponse.status !== 200) fail('ERR_ARTIFACT_STATUS');
      if (headers.contentLength !== undefined && headers.contentLength !== options.expectedBytes) {
        fail('ERR_ARTIFACT_RESPONSE_LENGTH');
      }
      break;
    }

    const temporary = await createTemporaryArchive(cacheDirectory, options.expectedSha256, openFile, throwDeadline);
    tempPath = temporary.path;
    tempHandle = temporary.handle;
    throwDeadline();
    const hash = createHash('sha256');
    let received = 0;
    try {
      for await (const chunk of activeResponse.body) {
        throwDeadline();
        resetIdleTimer();
        if (!(chunk instanceof Uint8Array)) fail('ERR_ARTIFACT_STREAM');
        // Refuse the over-limit chunk before writing any of its bytes to disk.
        if (chunk.byteLength > options.expectedBytes - received) fail('ERR_ARTIFACT_RESPONSE_LENGTH');
        await writeAll(tempHandle, chunk, throwDeadline);
        hash.update(chunk);
        received += chunk.byteLength;
      }
    } catch (error) {
      if (error instanceof ArtifactAcquisitionError) throw error;
      throwDeadline();
      fail('ERR_ARTIFACT_STREAM');
    }
    throwDeadline();
    if (idleTimer !== undefined) {
      timerScheduler.clearTimeout(idleTimer);
      idleTimer = undefined;
    }
    if (received !== options.expectedBytes) fail('ERR_ARTIFACT_RESPONSE_LENGTH');
    if (hash.digest('hex') !== options.expectedSha256) fail('ERR_ARTIFACT_DIGEST');
    try {
      await tempHandle.sync();
      throwDeadline();
      await tempHandle.close();
      throwDeadline();
      tempHandle = undefined;
    } catch (error) {
      if (error instanceof ArtifactAcquisitionError) throw error;
      throwDeadline();
      fail('ERR_ARTIFACT_TEMP');
    }
    activeResponse = undefined;
    throwDeadline();

    // `link` publishes without POSIX rename-overwrite semantics. A competing
    // winner is acceptable only after the same identity-and-hash verification.
    try {
      await linkFile(tempPath, destination);
      publishedByInvocation = true;
      throwDeadline();
      const publication = await verifyRegularArchive(
        destination,
        options.expectedBytes,
        options.expectedSha256,
        openFile,
        throwDeadline,
        regularOpenFlags,
        lstatFile,
      );
      if (publication !== 'valid') fail('ERR_ARTIFACT_PROMOTION');
    } catch (error) {
      if (error instanceof ArtifactAcquisitionError) throw error;
      throwDeadline();
      if (errorCode(error) !== 'EEXIST') fail('ERR_ARTIFACT_PROMOTION');
      const winner = await verifyRegularArchive(
        destination,
        options.expectedBytes,
        options.expectedSha256,
        openFile,
        throwDeadline,
        regularOpenFlags,
        lstatFile,
      );
      if (winner !== 'valid') fail('ERR_ARTIFACT_PROMOTION_CONFLICT');
    }
    throwDeadline();
    try {
      await unlinkFile(tempPath);
      tempPath = undefined;
    } catch {
      throwDeadline();
      fail('ERR_ARTIFACT_PROMOTION');
    }
    throwDeadline();
    publicationAccepted = true;
    return destination;
  } finally {
    timerScheduler.clearTimeout(totalTimer);
    if (idleTimer !== undefined) timerScheduler.clearTimeout(idleTimer);
    safeAbort(activeResponse);
    // Cleanup is limited to this invocation's random temp and any hard link it
    // created but did not accept; unrelated cache entries are never removed.
    if (tempHandle) {
      try {
        await tempHandle.close();
      } catch {
        // The stable acquisition error, if any, remains authoritative.
      }
    }
    if (tempPath) {
      try {
        await unlinkFile(tempPath);
      } catch {
        // Only this invocation's unpredictable temp is considered for cleanup.
      }
    }
    if (publishedByInvocation && !publicationAccepted) {
      try {
        await unlinkFile(destination);
      } catch {
        // A concurrently replaced path is never treated as an accepted result.
      }
    }
  }
}
