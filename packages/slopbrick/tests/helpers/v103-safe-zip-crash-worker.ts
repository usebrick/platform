import { createHash } from 'node:crypto';
import { constants, writeSync } from 'node:fs';
import {
  link as linkFile,
  open as openFile,
  readFile,
  unlink as unlinkFile,
} from 'node:fs/promises';
import { basename, join } from 'node:path';

import { extractReleaseArchive } from '../../src/calibration/v103/safe-zip';
import { MATERIALIZATION_RECEIPT_FILENAME } from '../../src/calibration/v103/materialization-receipt';

type CrashPoint =
  | 'extracted-file-write'
  | 'extracted-file-sync'
  | 'receipt-write'
  | 'receipt-sync'
  | 'deepest-directory-sync'
  | 'parent-directory-sync'
  | 'tree-root-sync'
  | 'prepublication-cache-sync'
  | 'temporary-reference-write'
  | 'temporary-reference-sync'
  | 'hard-link'
  | 'first-postlink-cache-sync'
  | 'temporary-reference-unlink'
  | 'postunlink-cache-sync';

interface CrashWorkerSpec {
  readonly cacheDirectory: string;
  readonly archivePath: string;
  readonly point: CrashPoint;
  readonly timing: 'before' | 'after';
  readonly treeToken: string;
  readonly temporaryReferenceToken: string;
}

const CRASH_POINTS = new Set<CrashPoint>([
  'extracted-file-write',
  'extracted-file-sync',
  'receipt-write',
  'receipt-sync',
  'deepest-directory-sync',
  'parent-directory-sync',
  'tree-root-sync',
  'prepublication-cache-sync',
  'temporary-reference-write',
  'temporary-reference-sync',
  'hard-link',
  'first-postlink-cache-sync',
  'temporary-reference-unlink',
  'postunlink-cache-sync',
]);
const TOKEN = /^[0-9a-f]{32}$/;

function failWorker(message: string): never {
  writeSync(2, `v10.3 crash worker: ${message}\n`);
  process.exit(87);
}

function parseSpec(value: string | undefined): CrashWorkerSpec {
  if (value === undefined) failWorker('missing specification');
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    failWorker('invalid specification JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    failWorker('invalid specification');
  }
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.cacheDirectory !== 'string'
    || typeof record.archivePath !== 'string'
    || typeof record.point !== 'string'
    || !CRASH_POINTS.has(record.point as CrashPoint)
    || (record.timing !== 'before' && record.timing !== 'after')
    || typeof record.treeToken !== 'string'
    || !TOKEN.test(record.treeToken)
    || typeof record.temporaryReferenceToken !== 'string'
    || !TOKEN.test(record.temporaryReferenceToken)
  ) failWorker('invalid specification fields');
  return {
    cacheDirectory: record.cacheDirectory,
    archivePath: record.archivePath,
    point: record.point as CrashPoint,
    timing: record.timing,
    treeToken: record.treeToken,
    temporaryReferenceToken: record.temporaryReferenceToken,
  };
}

function crashAtCheckpoint(spec: CrashWorkerSpec): never {
  writeSync(1, `V103_SAFE_ZIP_CRASH:${spec.point}:${spec.timing}\n`);
  process.exit(86);
}

async function main(): Promise<never> {
  const spec = parseSpec(process.argv[2]);
  const archiveBytes = await readFile(spec.archivePath);
  const expectedAssetSha256 = createHash('sha256').update(archiveBytes).digest('hex');
  if (basename(spec.archivePath) !== `${expectedAssetSha256}.zip`) {
    failWorker('archive name does not bind its digest');
  }

  const treePath = join(spec.cacheDirectory, `.v103-tree-${spec.treeToken}`);
  const extractedFilePath = join(treePath, 'pkg/src/readme.txt');
  const receiptPath = join(treePath, MATERIALIZATION_RECEIPT_FILENAME);
  const deepestDirectoryPath = join(treePath, 'pkg/src');
  const parentDirectoryPath = join(treePath, 'pkg');
  const temporaryReferencePath = join(
    spec.cacheDirectory,
    `.v103-ref-${spec.temporaryReferenceToken}.tmp`,
  );
  let randomIndex = 0;
  let cacheSyncCount = 0;
  const writeProgress = new Map<string, {
    readonly expectedBytes: number;
    bytesWritten: number;
  }>();

  const maybeBefore = (point: CrashPoint): void => {
    if (spec.point === point && spec.timing === 'before') crashAtCheckpoint(spec);
  };
  const maybeAfter = (point: CrashPoint): void => {
    if (spec.point === point && spec.timing === 'after') crashAtCheckpoint(spec);
  };
  const classifyWrite = (path: string): CrashPoint | undefined => (
    path === extractedFilePath
      ? 'extracted-file-write'
      : path === receiptPath
        ? 'receipt-write'
        : path === temporaryReferencePath
          ? 'temporary-reference-write'
          : undefined
  );
  const classifySync = (path: string): CrashPoint | undefined => {
    if (path === extractedFilePath) return 'extracted-file-sync';
    if (path === receiptPath) return 'receipt-sync';
    if (path === deepestDirectoryPath) return 'deepest-directory-sync';
    if (path === parentDirectoryPath) return 'parent-directory-sync';
    if (path === treePath) return 'tree-root-sync';
    if (path === temporaryReferencePath) return 'temporary-reference-sync';
    if (path === spec.cacheDirectory) {
      cacheSyncCount += 1;
      if (cacheSyncCount === 1) return 'prepublication-cache-sync';
      if (cacheSyncCount === 2) return 'first-postlink-cache-sync';
      if (cacheSyncCount === 3) return 'postunlink-cache-sync';
    }
    return undefined;
  };

  const injectedOpenFile = async (
    pathValue: Parameters<typeof openFile>[0],
    flags: Parameters<typeof openFile>[1],
    mode?: number,
  ): Promise<Awaited<ReturnType<typeof openFile>>> => {
    const path = String(pathValue);
    const handle = await openFile(pathValue, flags, mode);
    const writePoint = classifyWrite(path);
    if (writePoint !== undefined) {
      const originalWrite = handle.write.bind(handle);
      Object.defineProperty(handle, 'write', {
        configurable: true,
        value: async (buffer: Buffer, offset: number, length: number, position: number) => {
          maybeBefore(writePoint);
          let progress = writeProgress.get(path);
          if (progress === undefined) {
            progress = { expectedBytes: length, bytesWritten: 0 };
            writeProgress.set(path, progress);
          }
          const result = await originalWrite(buffer, offset, length, position);
          progress.bytesWritten += result.bytesWritten;
          // A real write may be partial. The "after" checkpoint is reached only
          // after repeated underlying writes cover the complete first request.
          if (progress.bytesWritten >= progress.expectedBytes) maybeAfter(writePoint);
          return result;
        },
      });
    }

    const originalSync = handle.sync.bind(handle);
    Object.defineProperty(handle, 'sync', {
      configurable: true,
      value: async () => {
        const syncPoint = classifySync(path);
        if (syncPoint !== undefined) maybeBefore(syncPoint);
        await originalSync();
        if (syncPoint !== undefined) maybeAfter(syncPoint);
      },
    });
    return handle;
  };

  const injectedLinkFile = async (
    source: Parameters<typeof linkFile>[0],
    destination: Parameters<typeof linkFile>[1],
  ): Promise<void> => {
    maybeBefore('hard-link');
    await linkFile(source, destination);
    maybeAfter('hard-link');
  };
  const injectedUnlinkFile = async (
    pathValue: Parameters<typeof unlinkFile>[0],
  ): Promise<void> => {
    const path = String(pathValue);
    if (path === temporaryReferencePath) maybeBefore('temporary-reference-unlink');
    await unlinkFile(pathValue);
    if (path === temporaryReferencePath) maybeAfter('temporary-reference-unlink');
  };

  try {
    await extractReleaseArchive({
      archivePath: spec.archivePath,
      expectedAssetSha256,
      expectedAssetBytes: archiveBytes.byteLength,
      cacheDirectory: spec.cacheDirectory,
      extractionPolicy: 'safe-zip-v1',
    }, {
      filesystemSecurity: {
        noFollowFlag: constants.O_NOFOLLOW,
        nonBlockingFlag: constants.O_NONBLOCK,
        directoryFlag: constants.O_DIRECTORY,
        effectiveUid: typeof process.geteuid === 'function' ? process.geteuid() : undefined,
      },
      openFile: injectedOpenFile as never,
      linkFile: injectedLinkFile,
      unlinkFile: injectedUnlinkFile,
      randomBytes: (size: number) => {
        if (size !== 16) failWorker('unexpected random token size');
        const token = randomIndex === 0 ? spec.treeToken : spec.temporaryReferenceToken;
        randomIndex += 1;
        if (randomIndex > 2) failWorker('unexpected extra random token request');
        return Buffer.from(token, 'hex');
      },
    });
  } catch (error) {
    const message = error instanceof Error ? `${error.name}:${error.message}` : String(error);
    failWorker(`operation failed before checkpoint (${message})`);
  }
  failWorker('selected checkpoint was not reached');
}

await main();
