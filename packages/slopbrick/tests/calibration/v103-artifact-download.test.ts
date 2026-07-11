import { createHash } from 'node:crypto';
import { constants, existsSync } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireArtifact,
  ArtifactAcquisitionError,
  createNodeHttpsArtifactTransport,
  type AcquireArtifactOptions,
  type ArtifactDownloadDependencies,
  type ArtifactFilesystemSecurityCapabilities,
  type ArtifactLstat,
  type ArtifactLinkFile,
  type ArtifactOpenFile,
  type ArtifactRealpath,
  type ArtifactTimerScheduler,
  type ArtifactTransport,
  type ArtifactTransportRequest,
  type ArtifactTransportResponse,
  type ArtifactUnlinkFile,
  type RawAddressLookup,
} from '../../src/calibration/v103/artifact-download';

const CONTENT = Buffer.from('immutable calibration archive bytes');
const SHA256 = createHash('sha256').update(CONTENT).digest('hex');
const HOST = 'download.example';
const ASSET_URL = `https://${HOST}/release/archive.zip`;
const PUBLIC_V4 = '8.8.8.8';
const MAX_ARTIFACT_BYTES = 5 * 1024 ** 3;

function bytes(...chunks: readonly (string | Buffer)[]): AsyncIterable<Uint8Array> {
  return (async function* () {
    for (const chunk of chunks) yield typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
  })();
}

function rawHeaders(...pairs: readonly (readonly [string, string])[]): readonly (readonly [string, string])[] {
  return pairs;
}

function response(
  body: AsyncIterable<Uint8Array> = bytes(CONTENT),
  overrides: Partial<ArtifactTransportResponse> = {},
): ArtifactTransportResponse {
  return {
    status: 200,
    rawHeaders: [],
    url: ASSET_URL,
    remoteAddress: PUBLIC_V4,
    body,
    abort: vi.fn(),
    ...overrides,
  };
}

function lookupReturning(addresses: readonly { readonly address: string; readonly family: number }[]): RawAddressLookup {
  return (_hostname, _options, callback) => callback(null, [...addresses]);
}

function publicLookup(address = PUBLIC_V4): RawAddressLookup {
  return lookupReturning([{ address, family: address.includes(':') ? 6 : 4 }]);
}

async function invokeLookup(request: ArtifactTransportRequest): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    request.lookup(request.url.hostname, { all: true }, (error) => error ? reject(error) : resolve());
  });
}

function transportReturning(
  value: ArtifactTransportResponse | ((request: ArtifactTransportRequest) => ArtifactTransportResponse | Promise<ArtifactTransportResponse>),
): { readonly transport: ArtifactTransport; readonly requests: ArtifactTransportRequest[] } {
  const requests: ArtifactTransportRequest[] = [];
  return {
    requests,
    transport: async (request) => {
      requests.push(request);
      await invokeLookup(request);
      return typeof value === 'function' ? value(request) : value;
    },
  };
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

class ManualTimerScheduler implements ArtifactTimerScheduler {
  #now = 0;
  #nextId = 1;
  readonly #tasks = new Map<number, { readonly at: number; readonly callback: () => void }>();

  readonly setTimeout = (callback: () => void, milliseconds: number): number => {
    const id = this.#nextId++;
    this.#tasks.set(id, { at: this.#now + milliseconds, callback });
    return id;
  };

  readonly clearTimeout = (handle: unknown): void => {
    if (typeof handle === 'number') this.#tasks.delete(handle);
  };

  advance(milliseconds: number): void {
    const target = this.#now + milliseconds;
    while (true) {
      const next = [...this.#tasks.entries()]
        .filter(([, task]) => task.at <= target)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      const [id, task] = next;
      this.#tasks.delete(id);
      this.#now = task.at;
      task.callback();
    }
    this.#now = target;
  }

  fireDelay(milliseconds: number): void {
    const next = [...this.#tasks.entries()].find(([, task]) => task.at - this.#now === milliseconds);
    expect(next).toBeDefined();
    const [id, task] = next!;
    this.#tasks.delete(id);
    task.callback();
  }
}

async function expectStartedBeforeSettlement(started: Promise<void>, operation: Promise<string>): Promise<void> {
  const startedFirst = await Promise.race([
    started.then(() => true),
    operation.then(() => false, () => false),
  ]);
  expect(startedFirst).toBe(true);
}

describe('v10.3 bounded artifact acquisition', () => {
  let cacheDirectory: string;

  beforeEach(async () => {
    cacheDirectory = await realpath(await mkdtemp(join(tmpdir(), 'slopbrick-v103-download-')));
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await rm(cacheDirectory, { recursive: true, force: true });
  });

  function options(overrides: Partial<AcquireArtifactOptions> = {}): AcquireArtifactOptions {
    return {
      assetUrl: ASSET_URL,
      expectedSha256: SHA256,
      expectedBytes: CONTENT.byteLength,
      cacheDirectory,
      network: 'allow',
      allowedHosts: [HOST],
      ...overrides,
    };
  }

  function dependencies(
    transport: ArtifactTransport,
    rawLookup: RawAddressLookup = publicLookup(),
    extra: Partial<ArtifactDownloadDependencies> = {},
  ): ArtifactDownloadDependencies {
    return { transport, rawLookup, ...extra };
  }

  function destination(): string {
    return join(cacheDirectory, `${SHA256}.zip`);
  }

  it('defaults network access to denied when no verified cache entry exists', async () => {
    const fake = transportReturning(response());
    const { network: _network, ...input } = options();

    await expect(acquireArtifact(input, dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_NETWORK_DENIED' });
    expect(fake.requests).toHaveLength(0);
  });

  it('rehashes and reuses a valid cached archive while offline', async () => {
    await writeFile(destination(), CONTENT);
    const fake = transportReturning(response());

    await expect(acquireArtifact(options({ network: 'deny' }), dependencies(fake.transport))).resolves.toBe(destination());
    expect(fake.requests).toHaveLength(0);
  });

  it.each([
    ['corrupt', Buffer.from('x'.repeat(CONTENT.byteLength))],
    ['short', CONTENT.subarray(0, CONTENT.byteLength - 1)],
    ['long', Buffer.concat([CONTENT, Buffer.from('x')])],
  ])('never accepts, deletes, or replaces a %s cached archive', async (_name, cachedBytes) => {
    await writeFile(destination(), cachedBytes);
    const fake = transportReturning(response());

    await expect(acquireArtifact(options(), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_CACHE_INVALID' });
    await expect(readFile(destination())).resolves.toEqual(cachedBytes);
    expect(fake.requests).toHaveLength(0);
  });

  it('rejects an existing symlink even when its target has valid bytes', async () => {
    const target = join(cacheDirectory, 'outside-valid.zip');
    await writeFile(target, CONTENT);
    await symlink(target, destination());
    const fake = transportReturning(response());

    await expect(acquireArtifact(options(), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_CACHE_INVALID' });
    expect((await lstat(destination())).isSymbolicLink()).toBe(true);
    await expect(readFile(target)).resolves.toEqual(CONTENT);
    expect(fake.requests).toHaveLength(0);
  });

  it('rejects an existing non-regular digest path without deleting it', async () => {
    await mkdir(destination());
    const fake = transportReturning(response());

    await expect(acquireArtifact(options(), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_CACHE_INVALID' });
    expect((await lstat(destination())).isDirectory()).toBe(true);
    expect(fake.requests).toHaveLength(0);
  });

  it('opens an existing digest path with no-follow and nonblocking flags before fstat', async () => {
    await writeFile(destination(), CONTENT);
    let observedFlags: string | number | undefined;
    const openFile: ArtifactOpenFile = async (_path, flags) => {
      observedFlags = flags;
      throw Object.assign(new Error('simulated FIFO must not block'), { code: 'ENXIO' });
    };
    const fake = transportReturning(response());

    await expect(acquireArtifact(options({ network: 'deny' }), dependencies(fake.transport, publicLookup(), { openFile }))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_CACHE_INVALID' });
    expect(typeof observedFlags).toBe('number');
    expect((observedFlags as number) & constants.O_NOFOLLOW).toBe(constants.O_NOFOLLOW);
    expect((observedFlags as number) & constants.O_NONBLOCK).toBe(constants.O_NONBLOCK);
    expect(fake.requests).toHaveLength(0);
  });

  it.each([0o755, 0o711])('rejects cache-root mode %o before cache or network access', async (mode) => {
    await chmod(cacheDirectory, mode);
    let opened = false;
    const openFile: ArtifactOpenFile = async (path, flags, fileMode) => {
      opened = true;
      return open(path, flags, fileMode);
    };
    const fake = transportReturning(response());

    await expect(acquireArtifact(options(), dependencies(fake.transport, publicLookup(), { openFile }))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_CACHE_UNTRUSTED' });
    expect(opened).toBe(false);
    expect(fake.requests).toHaveLength(0);
  });

  it('rejects a symlinked cache directory before reading or writing through it', async () => {
    const realCache = join(cacheDirectory, 'real-cache');
    const cacheLink = join(cacheDirectory, 'cache-link');
    await mkdir(realCache, { mode: 0o700 });
    await symlink(realCache, cacheLink);
    const fake = transportReturning(response());

    await expect(acquireArtifact(options({ cacheDirectory: cacheLink }), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_CACHE_UNTRUSTED' });
    expect(await readdir(realCache)).toEqual([]);
    expect(fake.requests).toHaveLength(0);
  });

  it('requires a pre-existing cache directory and creates nothing for a missing root', async () => {
    const missingCache = join(cacheDirectory, 'missing-cache');
    const fake = transportReturning(response());

    await expect(acquireArtifact(options({ cacheDirectory: missingCache }), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_CACHE_IO' });
    expect(existsSync(missingCache)).toBe(false);
    expect(fake.requests).toHaveLength(0);
  });

  it('creates nothing through a symlinked parent when the requested cache child is missing', async () => {
    const target = join(cacheDirectory, 'symlink-target');
    const link = join(cacheDirectory, 'symlink-parent');
    const requestedCache = join(link, 'must-not-be-created');
    await mkdir(target, { mode: 0o700 });
    await symlink(target, link);
    const fake = transportReturning(response());

    await expect(acquireArtifact(options({ cacheDirectory: requestedCache }), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_CACHE_IO' });
    expect(existsSync(join(target, 'must-not-be-created'))).toBe(false);
    expect(fake.requests).toHaveLength(0);
  });

  it('rejects a group- or world-writable cache directory', async () => {
    await chmod(cacheDirectory, 0o777);
    const fake = transportReturning(response());

    await expect(acquireArtifact(options(), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_CACHE_UNTRUSTED' });
    expect(fake.requests).toHaveLength(0);
  });

  it('rejects a private cache directory beneath a non-sticky world-writable parent', async () => {
    const sharedParent = join(cacheDirectory, 'shared-parent');
    const privateChild = join(sharedParent, 'private-cache');
    await mkdir(privateChild, { recursive: true, mode: 0o700 });
    await chmod(sharedParent, 0o777);
    const fake = transportReturning(response());

    await expect(acquireArtifact(options({ cacheDirectory: privateChild }), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_CACHE_UNTRUSTED' });
    expect(await readdir(privateChild)).toEqual([]);
    expect(fake.requests).toHaveLength(0);
  });

  it.each([
    ['no no-follow primitive', { noFollowFlag: undefined, nonBlockingFlag: constants.O_NONBLOCK, effectiveUid: process.geteuid?.() }],
    ['no nonblocking primitive', { noFollowFlag: constants.O_NOFOLLOW, nonBlockingFlag: undefined, effectiveUid: process.geteuid?.() }],
    ['no effective UID', { noFollowFlag: constants.O_NOFOLLOW, nonBlockingFlag: constants.O_NONBLOCK, effectiveUid: undefined }],
  ] satisfies readonly (readonly [string, ArtifactFilesystemSecurityCapabilities])[])(
    'fails closed when the platform has %s',
    async (_name, filesystemSecurity) => {
      const fake = transportReturning(response());
      await expect(acquireArtifact(options(), dependencies(fake.transport, publicLookup(), { filesystemSecurity }))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_CACHE_UNTRUSTED' });
      expect(fake.requests).toHaveLength(0);
    },
  );

  it('rejects a cached file whose opened inode changes size while it is being hashed', async () => {
    await writeFile(destination(), CONTENT);
    let mutated = false;
    const openFile: ArtifactOpenFile = async (path, flags, mode) => {
      const handle = await open(path, flags, mode);
      if (path !== destination()) return handle;
      return new Proxy(handle, {
        get(target, property) {
          if (property === 'stat') return async () => {
            const metadata = await target.stat();
            if (!mutated) {
              mutated = true;
              await writeFile(destination(), Buffer.concat([CONTENT, Buffer.from('appended-during-hash')]));
            }
            return metadata;
          };
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
    const fake = transportReturning(response());

    await expect(acquireArtifact(options({ network: 'deny' }), dependencies(fake.transport, publicLookup(), { openFile }))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_CACHE_INVALID' });
    expect(mutated).toBe(true);
    await expect(readFile(destination())).resolves.toEqual(Buffer.concat([CONTENT, Buffer.from('appended-during-hash')]));
    expect(fake.requests).toHaveLength(0);
  });

  it('rejects a digest pathname swapped to a corrupt inode while its opened handle still hashes valid', async () => {
    const displaced = join(cacheDirectory, 'displaced-valid.zip');
    const corrupt = Buffer.from('x'.repeat(CONTENT.byteLength));
    await writeFile(destination(), CONTENT);
    let swapped = false;
    const openFile: ArtifactOpenFile = async (path, flags, mode) => {
      const handle = await open(path, flags, mode);
      if (path === destination() && !swapped) {
        await rename(path, displaced);
        await writeFile(path, corrupt);
        swapped = true;
      }
      return handle;
    };
    const fake = transportReturning(response());

    await expect(acquireArtifact(options({ network: 'deny' }), dependencies(fake.transport, publicLookup(), { openFile }))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_CACHE_INVALID' });
    expect(swapped).toBe(true);
    await expect(readFile(destination())).resolves.toEqual(corrupt);
    await expect(readFile(displaced)).resolves.toEqual(CONTENT);
    expect(fake.requests).toHaveLength(0);
  });

  it('applies the whole-operation deadline cooperatively while rehashing an existing cache entry', async () => {
    await writeFile(destination(), CONTENT);
    const timerScheduler = new ManualTimerScheduler();
    let advanced = false;
    const openFile: ArtifactOpenFile = async (path, flags, mode) => {
      const handle = await open(path, flags, mode);
      if (path !== destination()) return handle;
      return new Proxy(handle, {
        get(target, property) {
          if (property === 'read') return async (...args: Parameters<typeof target.read>) => {
            const result = await target.read(...args);
            if (!advanced) {
              advanced = true;
              timerScheduler.advance(300_000);
            }
            return result;
          };
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
    const fake = transportReturning(response());

    await expect(acquireArtifact(options({ network: 'deny' }), dependencies(fake.transport, publicLookup(), { openFile, timerScheduler }))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_TOTAL_TIMEOUT' });
    expect(advanced).toBe(true);
    await expect(readFile(destination())).resolves.toEqual(CONTENT);
    expect(fake.requests).toHaveLength(0);
  });

  it('streams a 200 response into a same-directory mode-0600 wx temp and syncs it before promotion', async () => {
    const observedTempPaths: string[] = [];
    const openCalls: { flags: string | number; mode?: number }[] = [];
    let syncCalls = 0;
    let closeCalls = 0;
    const openFile: ArtifactOpenFile = async (path, flags, mode) => {
      openCalls.push({ flags, mode });
      const handle = await open(path, flags, mode);
      return new Proxy(handle, {
        get(target, property) {
          if (property === 'sync') return async () => { syncCalls += 1; await target.sync(); };
          if (property === 'close') return async () => { closeCalls += 1; await target.close(); };
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
    const body = (async function* () {
      const names = (await readdir(cacheDirectory)).filter((name) => name.endsWith('.tmp'));
      expect(names).toHaveLength(1);
      observedTempPaths.push(join(cacheDirectory, names[0]!));
      expect((await lstat(observedTempPaths[0]!)).mode & 0o777).toBe(0o600);
      yield CONTENT.subarray(0, 8);
      yield CONTENT.subarray(8);
    })();
    const fake = transportReturning(response(body));

    await expect(acquireArtifact(options(), dependencies(fake.transport, publicLookup(), { openFile }))).resolves.toBe(destination());
    expect(openCalls.some((call) => call.flags === 'wx' && call.mode === 0o600)).toBe(true);
    expect(syncCalls).toBe(1);
    expect(closeCalls).toBeGreaterThanOrEqual(1);
    expect(observedTempPaths[0] && basename(observedTempPaths[0])).toMatch(new RegExp(`^\\.${SHA256}\\.[0-9a-f]{32}\\.tmp$`));
    expect((await lstat(destination())).mode & 0o777).toBe(0o600);
    await expect(readFile(destination())).resolves.toEqual(CONTENT);
    expect(await readdir(cacheDirectory)).toEqual([`${SHA256}.zip`]);
  });

  it('sends identity encoding, disables connection pooling, and exposes no authorization header', async () => {
    const fake = transportReturning((request) => response(bytes(CONTENT), { url: request.url.href }));

    await expect(acquireArtifact(options(), dependencies(fake.transport))).resolves.toBe(destination());
    expect(fake.requests[0]).toMatchObject({ agent: false });
    expect(fake.requests[0]!.headers).toEqual({ Accept: 'application/zip', 'Accept-Encoding': 'identity' });
  });

  it('rejects a declared Content-Length mismatch before consuming the body and aborts it', async () => {
    let consumed = false;
    const abort = vi.fn();
    const body = (async function* () {
      consumed = true;
      yield CONTENT;
    })();
    const fake = transportReturning(response(body, {
      rawHeaders: rawHeaders(['Content-Length', String(CONTENT.byteLength + 1)]),
      abort,
    }));

    await expect(acquireArtifact(options(), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_RESPONSE_LENGTH' });
    expect(consumed).toBe(false);
    expect(abort).toHaveBeenCalledOnce();
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it('accepts an exact raw Content-Length', async () => {
    const fake = transportReturning(response(bytes(CONTENT), {
      rawHeaders: rawHeaders(['Content-Length', String(CONTENT.byteLength)]),
    }));
    await expect(acquireArtifact(options(), dependencies(fake.transport))).resolves.toBe(destination());
  });

  it('accepts chunked bytes only when the final count is exact', async () => {
    const fake = transportReturning(response(bytes(CONTENT.subarray(0, 3), CONTENT.subarray(3)), {
      rawHeaders: rawHeaders(['Transfer-Encoding', 'chunked']),
    }));
    await expect(acquireArtifact(options(), dependencies(fake.transport))).resolves.toBe(destination());
  });

  it.each([
    ['short', CONTENT.subarray(0, CONTENT.byteLength - 1)],
    ['long', Buffer.concat([CONTENT, Buffer.from('x')])],
  ])('rejects a %s chunked body at the exact hard byte cap', async (_name, streamed) => {
    const fake = transportReturning(response(bytes(streamed), {
      rawHeaders: rawHeaders(['Transfer-Encoding', 'chunked']),
    }));
    await expect(acquireArtifact(options(), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_RESPONSE_LENGTH' });
    expect(existsSync(destination())).toBe(false);
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it.each([
    ['duplicate Content-Length', rawHeaders(['Content-Length', '1'], ['content-length', '1'])],
    ['invalid Content-Length', rawHeaders(['Content-Length', 'not-a-number'])],
    ['conflicting framing', rawHeaders(['Content-Length', String(CONTENT.byteLength)], ['Transfer-Encoding', 'chunked'])],
    ['duplicate Transfer-Encoding', rawHeaders(['Transfer-Encoding', 'chunked'], ['transfer-encoding', 'chunked'])],
    ['non-identity content encoding', rawHeaders(['Content-Encoding', 'gzip'])],
    ['duplicate content encoding', rawHeaders(['Content-Encoding', 'identity'], ['content-encoding', 'identity'])],
  ])('fails closed on %s before consuming the body', async (_name, headers) => {
    let consumed = false;
    const body = (async function* () { consumed = true; yield CONTENT; })();
    const fake = transportReturning(response(body, { rawHeaders: headers }));

    await expect(acquireArtifact(options(), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_RESPONSE_HEADERS' });
    expect(consumed).toBe(false);
  });

  it('rejects partial status 206 even if its body and hash match', async () => {
    const fake = transportReturning(response(bytes(CONTENT), { status: 206 }));
    await expect(acquireArtifact(options(), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_PARTIAL_RESPONSE' });
    expect(existsSync(destination())).toBe(false);
  });

  it.each(['http://download.example/a.zip', 'file:///tmp/a.zip', 'ftp://download.example/a.zip'])('rejects non-HTTPS URL %s before transport', async (assetUrl) => {
    const fake = transportReturning(response());
    await expect(acquireArtifact(options({ assetUrl }), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_URL_SCHEME' });
    expect(fake.requests).toHaveLength(0);
  });

  it.each([
    ['non-default port', `https://${HOST}:444/a.zip`, 'ERR_ARTIFACT_URL_PORT'],
    ['userinfo', `https://user:password-secret@${HOST}/a.zip`, 'ERR_ARTIFACT_URL_CREDENTIALS'],
    ['empty userinfo', `https://@${HOST}/a.zip`, 'ERR_ARTIFACT_URL_CREDENTIALS'],
    ['empty username and password', `https://:@${HOST}/a.zip`, 'ERR_ARTIFACT_URL_CREDENTIALS'],
    ['fragment', `https://${HOST}/a.zip#secret-fragment`, 'ERR_ARTIFACT_URL_FRAGMENT'],
    ['empty fragment', `https://${HOST}/a.zip#`, 'ERR_ARTIFACT_URL_FRAGMENT'],
    ['trailing dot', `https://${HOST}./a.zip`, 'ERR_ARTIFACT_HOST_FORBIDDEN'],
    ['unapproved suffix', `https://${HOST}.evil.invalid/a.zip`, 'ERR_ARTIFACT_HOST_NOT_ALLOWED'],
  ])('rejects a %s URL before transport', async (_name, assetUrl, code) => {
    const fake = transportReturning(response());
    await expect(acquireArtifact(options({ assetUrl }), dependencies(fake.transport))).rejects.toMatchObject({ code });
    expect(fake.requests).toHaveLength(0);
  });

  it.each([
    'https://127.0.0.1/a.zip',
    'https://[::1]/a.zip',
    'https://2130706433/a.zip',
    'https://0x7f000001/a.zip',
    'https://0177.0.0.1/a.zip',
    'https://localhost/a.zip',
    'https://api.localhost/a.zip',
    'https://local/a.zip',
    'https://worker.local/a.zip',
  ])('rejects forbidden local or numeric host before allow-list membership: %s', async (assetUrl) => {
    const fake = transportReturning(response());
    await expect(acquireArtifact(options({ assetUrl }), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_HOST_FORBIDDEN' });
    expect(fake.requests).toHaveLength(0);
  });

  it('accepts an explicit default port and canonical lower-case Punycode allowlist', async () => {
    const punycodeHost = 'xn--bcher-kva.example';
    const fake = transportReturning((request) => response(bytes(CONTENT), { url: request.url.href }));

    await expect(acquireArtifact(options({
      assetUrl: 'https://b\u00fccher.example:443/archive.zip',
      allowedHosts: [punycodeHost],
    }), dependencies(fake.transport))).resolves.toBe(destination());
    expect(fake.requests[0]!.url.hostname).toBe(punycodeHost);
  });

  it.each([
    ['upper case', ['Download.Example']],
    ['Unicode', ['b\u00fccher.example']],
    ['trailing dot', ['download.example.']],
    ['wildcard', ['*.example']],
  ])('rejects a non-canonical %s allowlist', async (_name, allowedHosts) => {
    const fake = transportReturning(response());
    await expect(acquireArtifact(options({ allowedHosts }), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_ALLOWLIST_INVALID' });
    expect(fake.requests).toHaveLength(0);
  });

  it.each([301, 302, 303, 307, 308])('manually follows supported redirect status %i', async (status) => {
    let call = 0;
    const fake = transportReturning((request) => call++ === 0
      ? response(bytes(), { status, rawHeaders: rawHeaders(['Location', '/final.zip']), url: request.url.href })
      : response(bytes(CONTENT), { url: request.url.href }));

    await expect(acquireArtifact(options(), dependencies(fake.transport))).resolves.toBe(destination());
    expect(fake.requests).toHaveLength(2);
    expect(fake.requests.every((request) => request.agent === false)).toBe(true);
  });

  it.each([300, 304, 305, 306])('does not follow unsupported 3xx status %i', async (status) => {
    const fake = transportReturning((request) => response(bytes(), {
      status,
      rawHeaders: rawHeaders(['Location', '/must-not-follow']),
      url: request.url.href,
    }));
    await expect(acquireArtifact(options(), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_STATUS' });
    expect(fake.requests).toHaveLength(1);
  });

  it('revalidates host, DNS, remote address, and headers on every redirect hop', async () => {
    const cdnHost = 'cdn.example';
    const resolvedHosts: string[] = [];
    const rawLookup: RawAddressLookup = (hostname, _options, callback) => {
      resolvedHosts.push(hostname);
      callback(null, [{ address: PUBLIC_V4, family: 4 }]);
    };
    let call = 0;
    const fake = transportReturning((request) => call++ === 0
      ? response(bytes(), {
        status: 302,
        rawHeaders: rawHeaders(['Location', `https://${cdnHost}/asset.zip?token=hidden`]),
        url: request.url.href,
      })
      : response(bytes(CONTENT), { url: request.url.href }));

    await expect(acquireArtifact(options({ allowedHosts: [HOST, cdnHost] }), dependencies(fake.transport, rawLookup))).resolves.toBe(destination());
    expect(fake.requests.map((request) => request.url.hostname)).toEqual([HOST, cdnHost]);
    expect(resolvedHosts).toEqual([HOST, cdnHost]);
  });

  it.each([
    ['non-HTTPS', 'http://download.example/next.zip', 'ERR_ARTIFACT_URL_SCHEME'],
    ['non-default port', `https://${HOST}:444/next.zip`, 'ERR_ARTIFACT_URL_PORT'],
    ['fragment', `https://${HOST}/next.zip#secret`, 'ERR_ARTIFACT_URL_FRAGMENT'],
    ['empty fragment', `/next.zip#`, 'ERR_ARTIFACT_URL_FRAGMENT'],
    ['empty userinfo', `https://@${HOST}/next.zip`, 'ERR_ARTIFACT_URL_CREDENTIALS'],
    ['empty username and password', `https://:@${HOST}/next.zip`, 'ERR_ARTIFACT_URL_CREDENTIALS'],
    ['unapproved', 'https://evil.invalid/next.zip', 'ERR_ARTIFACT_HOST_NOT_ALLOWED'],
    ['IP literal', 'https://127.0.0.1/next.zip', 'ERR_ARTIFACT_HOST_FORBIDDEN'],
    ['localhost', 'https://localhost/next.zip', 'ERR_ARTIFACT_HOST_FORBIDDEN'],
    ['local suffix', 'https://worker.local/next.zip', 'ERR_ARTIFACT_HOST_FORBIDDEN'],
  ])('rejects a %s redirect target before the next request', async (_name, location, code) => {
    const fake = transportReturning((request) => response(bytes(), {
      status: 302,
      rawHeaders: rawHeaders(['Location', location]),
      url: request.url.href,
    }));
    await expect(acquireArtifact(options(), dependencies(fake.transport))).rejects.toMatchObject({ code });
    expect(fake.requests).toHaveLength(1);
  });

  it('accepts five followed redirects and rejects a sixth', async () => {
    let index = 0;
    const five = transportReturning((request) => index++ < 5
      ? response(bytes(), { status: 302, rawHeaders: rawHeaders(['Location', `/hop-${index}`]), url: request.url.href })
      : response(bytes(CONTENT), { url: request.url.href }));
    await expect(acquireArtifact(options(), dependencies(five.transport))).resolves.toBe(destination());
    expect(five.requests).toHaveLength(6);

    await rm(destination());
    index = 0;
    const six = transportReturning((request) => response(bytes(), {
      status: 302,
      rawHeaders: rawHeaders(['Location', `/hop-${++index}`]),
      url: request.url.href,
    }));
    await expect(acquireArtifact(options(), dependencies(six.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_REDIRECT_LIMIT' });
    expect(six.requests).toHaveLength(6);
  });

  it('rejects redirect loops, missing Location, and duplicate Location', async () => {
    const loop = transportReturning((request) => response(bytes(), {
      status: 302,
      rawHeaders: rawHeaders(['Location', request.url.pathname === '/a' ? '/b' : '/a']),
      url: request.url.href,
    }));
    await expect(acquireArtifact(options({ assetUrl: `https://${HOST}/a` }), dependencies(loop.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_REDIRECT_LOOP' });
    expect(loop.requests).toHaveLength(2);

    const missing = transportReturning((request) => response(bytes(), { status: 302, rawHeaders: [], url: request.url.href }));
    await expect(acquireArtifact(options(), dependencies(missing.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_LOCATION' });

    const duplicate = transportReturning((request) => response(bytes(), {
      status: 302,
      rawHeaders: rawHeaders(['Location', '/a'], ['location', '/b']),
      url: request.url.href,
    }));
    await expect(acquireArtifact(options(), dependencies(duplicate.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_LOCATION' });
  });

  it.each([201, 204, 404, 500])('rejects non-200 final status %i without consuming its body', async (status) => {
    let consumed = false;
    const body = (async function* () { consumed = true; yield Buffer.from('sensitive body'); })();
    const fake = transportReturning(response(body, { status }));
    await expect(acquireArtifact(options(), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_STATUS' });
    expect(consumed).toBe(false);
  });

  it('rejects a transport that reports a different response URL', async () => {
    const fake = transportReturning(response(bytes(CONTENT), { url: 'https://other.example/asset.zip' }));
    await expect(acquireArtifact(options(), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_RESPONSE_URL' });
  });

  it('forces the OS resolver into all-address verbatim mode', async () => {
    let lookupOptions: unknown;
    const rawLookup: RawAddressLookup = (_hostname, receivedOptions, callback) => {
      lookupOptions = receivedOptions;
      callback(null, [{ address: PUBLIC_V4, family: 4 }]);
    };
    const fake = transportReturning((request) => response(bytes(CONTENT), { url: request.url.href }));

    await expect(acquireArtifact(options(), dependencies(fake.transport, rawLookup))).resolves.toBe(destination());
    expect(lookupOptions).toMatchObject({ family: 4, all: true, verbatim: true });
  });

  it('configures the Node HTTPS adapter without pooling and preserves raw headers and SNI hostname', async () => {
    const incoming = Readable.from([CONTENT]);
    const destroyIncoming = vi.spyOn(incoming, 'destroy');
    Object.defineProperties(incoming, {
      statusCode: { value: 200 },
      rawHeaders: { value: ['X-Test', 'one', 'x-test', 'two'] },
      socket: { value: { remoteAddress: PUBLIC_V4 } },
    });
    const requestStub = {
      once: vi.fn().mockReturnThis(),
      end: vi.fn(),
      destroy: vi.fn(),
    };
    let capturedUrl: URL | undefined;
    let capturedOptions: Record<string, unknown> | undefined;
    const fakeHttpsRequest = ((url: URL, requestOptions: Record<string, unknown>, callback: (message: unknown) => void) => {
      capturedUrl = url;
      capturedOptions = requestOptions;
      queueMicrotask(() => callback(incoming));
      return requestStub;
    }) as unknown as typeof import('node:https').request;
    const transport = createNodeHttpsArtifactTransport(fakeHttpsRequest);
    const lookup = vi.fn() as unknown as ArtifactTransportRequest['lookup'];
    const controller = new AbortController();

    const received = await transport({
      url: new URL(ASSET_URL),
      lookup,
      headers: { Accept: 'application/zip', 'Accept-Encoding': 'identity' },
      signal: controller.signal,
      agent: false,
    });

    expect(capturedUrl?.hostname).toBe(HOST);
    expect(capturedOptions).toMatchObject({
      method: 'GET',
      agent: false,
      headers: { Accept: 'application/zip', 'Accept-Encoding': 'identity' },
      lookup,
      signal: controller.signal,
      servername: HOST,
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
      maxHeaderSize: 16 * 1024,
      insecureHTTPParser: false,
    });
    expect(received.rawHeaders).toEqual(rawHeaders(['X-Test', 'one'], ['x-test', 'two']));
    expect(received.remoteAddress).toBe(PUBLIC_V4);
    received.abort();
    expect(destroyIncoming).toHaveBeenCalled();
    expect(requestStub.destroy).toHaveBeenCalled();
  });

  const nonPublicAddresses = [
    '0.0.0.0', '0.255.255.255', '10.0.0.1', '100.64.0.1', '100.127.255.255', '127.0.0.1',
    '169.254.1.1', '172.16.0.1', '172.31.255.255', '192.0.0.1', '192.0.2.1', '192.88.99.1',
    '192.168.1.1', '198.18.0.1', '198.19.255.255', '198.51.100.1', '203.0.113.1',
    '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255',
    '::', '::1', '::ffff:8.8.8.8', '64:ff9b::808:808', '64:ff9b:1::1', '100::1',
    '2001::1', '2001:1000::1', '2001:db8::1', '2002::1', '2d00::1', '3000::1', '3ffe::1',
    '3fff::1', 'fc00::1', 'fd00::1', 'fe80::1', 'ff00::1',
  ];

  it.each(nonPublicAddresses)('rejects IANA non-public address %s before connection', async (address) => {
    let connected = false;
    const transport: ArtifactTransport = async (request) => {
      await invokeLookup(request);
      connected = true;
      return response(bytes(CONTENT), { url: request.url.href, remoteAddress: address });
    };
    await expect(acquireArtifact(options(), dependencies(transport, publicLookup(address)))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_NETWORK' });
    expect(connected).toBe(false);
  });

  it.each([
    '1.0.0.1', '9.255.255.255', '11.0.0.1', '100.63.255.255', '100.128.0.1',
    '172.15.255.255', '172.32.0.1', '192.167.255.255', '192.169.0.1',
    '198.17.255.255', '198.20.0.1', '223.255.255.254',
  ])('permits a public address at registry boundaries: %s', async (address) => {
    const transport: ArtifactTransport = async (request) => {
      await invokeLookup(request);
      return response(bytes(CONTENT), { url: request.url.href, remoteAddress: address });
    };
    await expect(acquireArtifact(options(), dependencies(transport, publicLookup(address)))).resolves.toBe(destination());
  });

  it.each([
    '2001:200::1', '2001:4860:4860::8888', '2003::1', '2410::1',
    '2606:4700:4700::1111', '2630::1', '2a10::1', '2c00::1',
  ])('fails closed on native public IPv6 until an explicit trusted-prefix policy exists: %s', async (address) => {
    let connected = false;
    const transport: ArtifactTransport = async (request) => {
      await invokeLookup(request);
      connected = true;
      return response(bytes(CONTENT), { url: request.url.href, remoteAddress: address });
    };
    await expect(acquireArtifact(options(), dependencies(transport, publicLookup(address)))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_NETWORK' });
    expect(connected).toBe(false);
  });

  it.each([
    [['8.8.8.8', '127.0.0.1']],
    [['127.0.0.1', '8.8.8.8']],
  ])('rejects mixed public/private DNS answers in either order: %j', async (addresses) => {
    let connected = false;
    const rawLookup = lookupReturning(addresses.map((address) => ({ address, family: 4 })));
    const transport: ArtifactTransport = async (request) => {
      await invokeLookup(request);
      connected = true;
      return response(bytes(CONTENT), { url: request.url.href });
    };
    await expect(acquireArtifact(options(), dependencies(transport, rawLookup))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_NETWORK' });
    expect(connected).toBe(false);
  });

  it.each([
    ['empty answer set', []],
    ['excessive answer set', Array.from({ length: 17 }, (_, index) => ({ address: `8.8.8.${index + 1}`, family: 4 }))],
    ['unknown family', [{ address: '8.8.8.8', family: 0 }]],
    ['malformed address', [{ address: 'not-an-address', family: 4 }]],
    ['family mismatch', [{ address: '8.8.8.8', family: 6 }]],
    ['mapped public IPv6', [{ address: '::ffff:8.8.8.8', family: 6 }]],
  ])('rejects %s from the resolver', async (_name, addresses) => {
    const rawLookup = lookupReturning(addresses);
    const transport: ArtifactTransport = async (request) => {
      await invokeLookup(request);
      return response(bytes(CONTENT), { url: request.url.href });
    };
    await expect(acquireArtifact(options(), dependencies(transport, rawLookup))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_NETWORK' });
  });

  it('rejects a connected remote address absent from the vetted answer set', async () => {
    const fake = transportReturning((request) => response(bytes(CONTENT), {
      url: request.url.href,
      remoteAddress: '1.1.1.1',
    }));
    await expect(acquireArtifact(options(), dependencies(fake.transport, publicLookup('8.8.8.8')))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_REMOTE_ADDRESS' });
  });

  it('rejects a missing connected remote address', async () => {
    const fake = transportReturning((request) => response(bytes(CONTENT), {
      url: request.url.href,
      remoteAddress: undefined,
    }));
    await expect(acquireArtifact(options(), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_REMOTE_ADDRESS' });
  });

  it('does not accept equivalent IPv6 text forms as a way around IPv4-only policy', async () => {
    const expanded = '2606:4700:4700:0000:0000:0000:0000:1111';
    const compressed = '2606:4700:4700::1111';
    let connected = false;
    const transport: ArtifactTransport = async (request) => {
      await invokeLookup(request);
      connected = true;
      return response(bytes(CONTENT), { url: request.url.href, remoteAddress: compressed });
    };
    await expect(acquireArtifact(options(), dependencies(transport, publicLookup(expanded)))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_NETWORK' });
    expect(connected).toBe(false);
  });

  it('cleans only its own temp after a partial stream error', async () => {
    const unrelated = join(cacheDirectory, 'unrelated.tmp');
    const foreign = join(cacheDirectory, `.${SHA256}.foreign.tmp`);
    await writeFile(unrelated, 'keep');
    await writeFile(foreign, 'keep');
    const body = (async function* () {
      yield CONTENT.subarray(0, 5);
      throw new Error('raw stream body secret');
    })();
    const fake = transportReturning(response(body));

    await expect(acquireArtifact(options(), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_STREAM' });
    expect(await readFile(unrelated, 'utf8')).toBe('keep');
    expect(await readFile(foreign, 'utf8')).toBe('keep');
    expect(existsSync(destination())).toBe(false);
    expect((await readdir(cacheDirectory)).sort()).toEqual([`.${SHA256}.foreign.tmp`, 'unrelated.tmp']);
  });

  it('rejects a hash mismatch and removes its unique temp', async () => {
    const wrong = Buffer.from('x'.repeat(CONTENT.byteLength));
    const fake = transportReturning(response(bytes(wrong)));
    await expect(acquireArtifact(options(), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_DIGEST' });
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it('uses a distinct unpredictable temp name on every attempt', async () => {
    const observed: string[] = [];
    const run = async () => {
      const body = (async function* () {
        observed.push(...(await readdir(cacheDirectory)).filter((name) => name.endsWith('.tmp')));
        yield Buffer.from('x'.repeat(CONTENT.byteLength));
      })();
      const fake = transportReturning(response(body));
      await expect(acquireArtifact(options(), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_DIGEST' });
    };
    await run();
    await run();
    expect(observed).toHaveLength(2);
    expect(new Set(observed).size).toBe(2);
    for (const name of observed) expect(name).toMatch(new RegExp(`^\\.${SHA256}\\.[0-9a-f]{32}\\.tmp$`));
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it('rehashes and reuses a valid winner created during atomic promotion', async () => {
    const body = (async function* () {
      yield CONTENT;
      await writeFile(destination(), CONTENT);
    })();
    const fake = transportReturning(response(body));
    await expect(acquireArtifact(options(), dependencies(fake.transport))).resolves.toBe(destination());
    await expect(readFile(destination())).resolves.toEqual(CONTENT);
    expect(await readdir(cacheDirectory)).toEqual([`${SHA256}.zip`]);
  });

  it('never overwrites or accepts a corrupt promotion winner', async () => {
    const raced = Buffer.from('raced-corrupt-entry');
    const body = (async function* () {
      yield CONTENT;
      await writeFile(destination(), raced);
    })();
    const fake = transportReturning(response(body));
    await expect(acquireArtifact(options(), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_PROMOTION_CONFLICT' });
    await expect(readFile(destination())).resolves.toEqual(raced);
    expect(await readdir(cacheDirectory)).toEqual([`${SHA256}.zip`]);
  });

  it('rehashes publication and removes it if the closed temp path is swapped before link', async () => {
    let swapped = false;
    const openFile: ArtifactOpenFile = async (path, flags, mode) => {
      const handle = await open(path, flags, mode);
      if (flags !== 'wx') return handle;
      return new Proxy(handle, {
        get(target, property) {
          if (property === 'close') return async () => {
            await target.close();
            await writeFile(path, Buffer.from('swapped-after-close'));
            swapped = true;
          };
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
    const fake = transportReturning(response(bytes(CONTENT)));

    await expect(acquireArtifact(options(), dependencies(fake.transport, publicLookup(), { openFile }))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_PROMOTION' });
    expect(swapped).toBe(true);
    expect(existsSync(destination())).toBe(false);
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it('checks the whole-operation deadline after atomic publication and removes its link', async () => {
    const timerScheduler = new ManualTimerScheduler();
    const linkFile: ArtifactLinkFile = async (existingPath, newPath) => {
      const { link: realLink } = await import('node:fs/promises');
      await realLink(existingPath, newPath);
      timerScheduler.advance(300_000);
    };
    const fake = transportReturning(response(bytes(CONTENT)));

    await expect(acquireArtifact(options(), dependencies(fake.transport, publicLookup(), { linkFile, timerScheduler }))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_TOTAL_TIMEOUT' });
    expect(existsSync(destination())).toBe(false);
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it('captures and cleans a temp handle when the total deadline fires during wx creation', async () => {
    const timerScheduler = new ManualTimerScheduler();
    const openFile: ArtifactOpenFile = async (path, flags, mode) => {
      const handle = await open(path, flags, mode);
      if (flags === 'wx') timerScheduler.fireDelay(300_000);
      return handle;
    };
    const fake = transportReturning(response(bytes(CONTENT)));

    await expect(acquireArtifact(options(), dependencies(fake.transport, publicLookup(), { openFile, timerScheduler }))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_TOTAL_TIMEOUT' });
    expect(existsSync(destination())).toBe(false);
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it.each(['sync', 'close'] as const)('preserves the total-deadline error and cleans temp when it fires during %s', async (phase) => {
    const timerScheduler = new ManualTimerScheduler();
    const openFile: ArtifactOpenFile = async (path, flags, mode) => {
      const handle = await open(path, flags, mode);
      if (flags !== 'wx') return handle;
      return new Proxy(handle, {
        get(target, property) {
          if (property === phase) return async () => {
            await target[phase]();
            timerScheduler.advance(300_000);
          };
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
    const fake = transportReturning(response(bytes(CONTENT)));

    await expect(acquireArtifact(options(), dependencies(fake.transport, publicLookup(), { openFile, timerScheduler }))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_TOTAL_TIMEOUT' });
    expect(existsSync(destination())).toBe(false);
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it.each(['sync', 'close'] as const)('preserves total deadline when temp %s rejects after it fires', async (phase) => {
    const timerScheduler = new ManualTimerScheduler();
    const openFile: ArtifactOpenFile = async (path, flags, mode) => {
      const handle = await open(path, flags, mode);
      if (flags !== 'wx') return handle;
      return new Proxy(handle, {
        get(target, property) {
          if (property === phase) return async () => {
            if (phase === 'close') await target.close();
            timerScheduler.fireDelay(300_000);
            throw new Error(`${phase} rejection secret`);
          };
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
    const fake = transportReturning(response(bytes(CONTENT)));

    await expect(acquireArtifact(options(), dependencies(fake.transport, publicLookup(), { openFile, timerScheduler }))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_TOTAL_TIMEOUT' });
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it.each(['realpath', 'lstat'] as const)('preserves total deadline when ancestor %s rejects after it fires', async (phase) => {
    const timerScheduler = new ManualTimerScheduler();
    const realpathFile: ArtifactRealpath | undefined = phase === 'realpath'
      ? async () => {
        timerScheduler.fireDelay(300_000);
        throw new Error('realpath rejection secret');
      }
      : undefined;
    const lstatFile: ArtifactLstat | undefined = phase === 'lstat'
      ? (async () => {
        timerScheduler.fireDelay(300_000);
        throw new Error('lstat rejection secret');
      }) as ArtifactLstat
      : undefined;
    const fake = transportReturning(response());

    await expect(acquireArtifact(options(), dependencies(fake.transport, publicLookup(), {
      timerScheduler,
      ...(realpathFile ? { realpathFile } : {}),
      ...(lstatFile ? { lstatFile } : {}),
    }))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_TOTAL_TIMEOUT' });
    expect(fake.requests).toHaveLength(0);
  });

  it('preserves total deadline when an existing-cache open rejects after it fires', async () => {
    await writeFile(destination(), CONTENT);
    const timerScheduler = new ManualTimerScheduler();
    const openFile: ArtifactOpenFile = async () => {
      timerScheduler.fireDelay(300_000);
      throw Object.assign(new Error('cache open rejection secret'), { code: 'EACCES' });
    };
    const fake = transportReturning(response());

    await expect(acquireArtifact(options(), dependencies(fake.transport, publicLookup(), { openFile, timerScheduler }))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_TOTAL_TIMEOUT' });
    await expect(readFile(destination())).resolves.toEqual(CONTENT);
    expect(fake.requests).toHaveLength(0);
  });

  it('preserves total deadline when wx temp open rejects after it fires', async () => {
    const timerScheduler = new ManualTimerScheduler();
    const openFile: ArtifactOpenFile = async (path, flags, mode) => {
      if (flags === 'wx') {
        timerScheduler.fireDelay(300_000);
        throw Object.assign(new Error('temp open rejection secret'), { code: 'EACCES' });
      }
      return open(path, flags, mode);
    };
    const fake = transportReturning(response(bytes(CONTENT)));

    await expect(acquireArtifact(options(), dependencies(fake.transport, publicLookup(), { openFile, timerScheduler }))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_TOTAL_TIMEOUT' });
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it('preserves total deadline when atomic link rejects after it fires', async () => {
    const timerScheduler = new ManualTimerScheduler();
    const linkFile: ArtifactLinkFile = async () => {
      timerScheduler.fireDelay(300_000);
      throw Object.assign(new Error('link rejection secret'), { code: 'EACCES' });
    };
    const fake = transportReturning(response(bytes(CONTENT)));

    await expect(acquireArtifact(options(), dependencies(fake.transport, publicLookup(), { linkFile, timerScheduler }))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_TOTAL_TIMEOUT' });
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it('preserves total deadline when final temp unlink rejects after it fires', async () => {
    const timerScheduler = new ManualTimerScheduler();
    let rejected = false;
    const unlinkFile: ArtifactUnlinkFile = async (path) => {
      if (!rejected && path.endsWith('.tmp')) {
        rejected = true;
        timerScheduler.fireDelay(300_000);
        throw Object.assign(new Error('unlink rejection secret'), { code: 'EACCES' });
      }
      await rm(path, { force: true });
    };
    const fake = transportReturning(response(bytes(CONTENT)));

    await expect(acquireArtifact(options(), dependencies(fake.transport, publicLookup(), { timerScheduler, unlinkFile }))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_TOTAL_TIMEOUT' });
    expect(rejected).toBe(true);
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it('aborts an idle request after 30 seconds without creating a temp', async () => {
    const timerScheduler = new ManualTimerScheduler();
    const started = deferred();
    let aborted = false;
    const transport: ArtifactTransport = async (request) => {
      started.resolve();
      return new Promise<ArtifactTransportResponse>((_resolve, reject) => {
        request.signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('underlying timeout secret'));
        }, { once: true });
      });
    };
    const operation = acquireArtifact(options(), dependencies(transport, publicLookup(), { timerScheduler }));
    await expectStartedBeforeSettlement(started.promise, operation);
    timerScheduler.advance(30_000);

    await expect(operation).rejects.toMatchObject({ code: 'ERR_ARTIFACT_IDLE_TIMEOUT' });
    expect(aborted).toBe(true);
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it('aborts an idle body after 30 seconds and cleans its temp', async () => {
    const timerScheduler = new ManualTimerScheduler();
    const waiting = deferred();
    let rejectWait: ((error: Error) => void) | undefined;
    const abort = vi.fn(() => rejectWait?.(new Error('body abort secret')));
    const body = (async function* () {
      yield CONTENT.subarray(0, 1);
      await new Promise<void>((_resolve, reject) => {
        rejectWait = reject;
        waiting.resolve();
      });
    })();
    const fake = transportReturning(response(body, { abort }));
    const operation = acquireArtifact(options(), dependencies(fake.transport, publicLookup(), { timerScheduler }));
    await expectStartedBeforeSettlement(waiting.promise, operation);
    timerScheduler.advance(30_000);

    await expect(operation).rejects.toMatchObject({ code: 'ERR_ARTIFACT_IDLE_TIMEOUT' });
    expect(abort).toHaveBeenCalled();
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it('enforces a five-minute whole-operation deadline despite body activity', async () => {
    const timerScheduler = new ManualTimerScheduler();
    type PendingRead = {
      readonly resolve: (result: IteratorResult<Uint8Array>) => void;
      readonly reject: (error: Error) => void;
    };
    let pendingRead: PendingRead | undefined;
    const demandWaiters: (() => void)[] = [];
    const waitForDemand = async () => {
      if (pendingRead) return;
      await new Promise<void>((resolve) => demandWaiters.push(resolve));
    };
    const pushActivity = () => {
      const read = pendingRead;
      expect(read).toBeDefined();
      pendingRead = undefined;
      read!.resolve({ done: false, value: Buffer.from([0]) });
    };
    const body: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise<IteratorResult<Uint8Array>>((resolve, reject) => {
            pendingRead = { resolve, reject };
            demandWaiters.splice(0).forEach((notify) => notify());
          }),
        };
      },
    };
    const abort = vi.fn(() => pendingRead?.reject(new Error('total abort secret')));
    const fake = transportReturning(response(body, { abort }));
    const operation = acquireArtifact(options({ expectedBytes: 1_000 }), dependencies(fake.transport, publicLookup(), { timerScheduler }));
    await waitForDemand();
    for (let elapsed = 25_000; elapsed < 300_000; elapsed += 25_000) {
      timerScheduler.advance(25_000);
      pushActivity();
      await waitForDemand();
    }
    timerScheduler.advance(25_000);

    await expect(operation).rejects.toMatchObject({ code: 'ERR_ARTIFACT_TOTAL_TIMEOUT' });
    expect(abort).toHaveBeenCalled();
    expect(await readdir(cacheDirectory)).toEqual([]);
  });

  it('returns a constant redacted error across message, stack, inspect, and JSON', async () => {
    const querySecret = 'query-secret-value';
    const authSecret = 'authorization-secret-value';
    const bodySecret = 'response-body-secret-value';
    const pathSecret = basename(cacheDirectory);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const transport: ArtifactTransport = async () => {
      throw new Error(`${querySecret} ${authSecret} ${bodySecret} ${cacheDirectory}`);
    };

    let failure: unknown;
    try {
      await acquireArtifact(options({ assetUrl: `${ASSET_URL}?token=${querySecret}` }), dependencies(transport));
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ArtifactAcquisitionError);
    expect(failure).toMatchObject({
      code: 'ERR_ARTIFACT_NETWORK',
      message: 'Artifact acquisition failed: network request failed',
    });
    expect(failure).not.toHaveProperty('cause');
    const renderings = [
      String(failure),
      failure instanceof Error ? failure.stack ?? '' : '',
      inspect(failure),
      JSON.stringify(failure),
    ];
    for (const rendered of renderings) {
      expect(rendered).not.toContain(querySecret);
      expect(rendered).not.toContain(authSecret);
      expect(rendered).not.toContain(bodySecret);
      expect(rendered).not.toContain(pathSecret);
      expect(rendered).not.toContain(cacheDirectory);
    }
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('does not disclose secrets from redirect headers, resolver errors, or stream errors', async () => {
    const secret = 'do-not-disclose';
    const failures: Promise<string>[] = [];
    const capture = async (operation: Promise<string>): Promise<string> => {
      try { await operation; return 'unexpected success'; }
      catch (error) { return inspect(error); }
    };
    const redirect = transportReturning((request) => response(bytes(), {
      status: 302,
      rawHeaders: rawHeaders(['Location', `https://evil.invalid/a.zip?token=${secret}`]),
      url: request.url.href,
    }));
    failures.push(capture(acquireArtifact(options(), dependencies(redirect.transport))));
    const resolver: RawAddressLookup = (_hostname, _options, callback) => callback(new Error(`${secret} ${cacheDirectory}`), []);
    failures.push(capture(acquireArtifact(options(), dependencies(transportReturning(response()).transport, resolver))));
    const stream = transportReturning(response((async function* () { throw new Error(`${secret} ${cacheDirectory}`); })()));
    failures.push(capture(acquireArtifact(options(), dependencies(stream.transport))));

    for (const rendered of await Promise.all(failures)) {
      expect(rendered).not.toContain(secret);
      expect(rendered).not.toContain(cacheDirectory);
    }
  });

  it('rejects malformed immutable expectations before touching cache or transport', async () => {
    const fake = transportReturning(response());
    await mkdir(join(cacheDirectory, 'sentinel'));
    await expect(acquireArtifact(options({ expectedSha256: 'ABC' }), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_EXPECTED_SHA' });
    await expect(acquireArtifact(options({ expectedBytes: 0 }), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_EXPECTED_BYTES' });
    await expect(acquireArtifact(options({ expectedBytes: MAX_ARTIFACT_BYTES + 1 }), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_EXPECTED_BYTES' });
    expect(fake.requests).toHaveLength(0);
    expect(await readdir(cacheDirectory)).toEqual(['sentinel']);
  });

  it('accepts the five-GiB policy boundary before applying offline network policy', async () => {
    const fake = transportReturning(response());
    await expect(acquireArtifact(options({ expectedBytes: MAX_ARTIFACT_BYTES, network: 'deny' }), dependencies(fake.transport))).rejects.toMatchObject({ code: 'ERR_ARTIFACT_NETWORK_DENIED' });
    expect(fake.requests).toHaveLength(0);
  });
});
