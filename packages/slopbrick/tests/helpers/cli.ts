import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

export const execFileAsync = promisify(execFile);
export const repoRoot = resolve(__dirname, '../..');
export const binPath = join(repoRoot, 'bin', 'slopbrick.js');
export const workerScript = join(repoRoot, 'dist', 'engine', 'worker.cjs');

export const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slopbrick-test-'));

export function cleanupTempDir(dir: string): void {
  if (!dir) return;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures so they do not mask real test failures
  }
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function run(args: string[], cwd = repoRoot): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [binPath, ...args], { cwd });
    return { stdout: stdout ?? '', stderr: stderr ?? '', exitCode: 0 };
  } catch (err) {
    const error = err as { stdout?: string | Buffer; stderr?: string | Buffer; code?: number };
    return {
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? '',
      exitCode: typeof error.code === 'number' ? error.code : 1,
    };
  }
}

export function assertDistBuilt(): void {
  if (!existsSync(workerScript)) {
    throw new Error(
      `dist/ is not built. Run "pnpm build" before running tests. (missing ${workerScript})`,
    );
  }
}

/**
 * Prove that the packaged CLI/worker maps contain the current source bytes.
 * A file-exists check is insufficient: a stale dist/ can still resolve and
 * run successfully while silently omitting a source fix. tsup embeds
 * `sourcesContent` in these maps, so compare only repository-owned source
 * entries and fail with the first stale path. This is a test/build receipt
 * guard, not a release hash.
 */
export function assertDistSourceFresh(): void {
  const roots = [repoRoot, resolve(repoRoot, '../engine'), resolve(repoRoot, '../core')];
  const mapPaths: Array<{ root: string; path: string }> = [];
  const collectMaps = (root: string, directory: string): void => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) collectMaps(root, path);
      else if (entry.isFile() && entry.name.endsWith('.map')) mapPaths.push({ root, path });
    }
  };
  for (const root of roots) collectMaps(root, join(root, 'dist'));

  for (const { root, path: mapPath } of mapPaths.sort((left, right) => left.path.localeCompare(right.path))) {
    if (!existsSync(mapPath)) {
      throw new Error(`dist source map is missing: ${mapPath}`);
    }
    let map: { sources?: unknown; sourcesContent?: unknown };
    try {
      map = JSON.parse(readFileSync(mapPath, 'utf8')) as typeof map;
    } catch (error) {
      throw new Error(`dist source map is unreadable: ${mapPath}: ${String(error)}`);
    }
    // Some tree-shaken ESM entries intentionally have an empty source list;
    // there is no source byte to compare, so the sibling CJS/entry map remains
    // the freshness witness for that artifact.
    if (Array.isArray(map.sources) && map.sources.length === 0 &&
      (map.sourcesContent === undefined || (Array.isArray(map.sourcesContent) && map.sourcesContent.length === 0))) continue;
    if (!Array.isArray(map.sources) || !Array.isArray(map.sourcesContent) || map.sources.length !== map.sourcesContent.length) {
      throw new Error(`dist source map lacks aligned sourcesContent: ${mapPath}`);
    }
    let compared = 0;
    for (let index = 0; index < map.sources.length; index += 1) {
      const source = map.sources[index];
      const embedded = map.sourcesContent[index];
      if (typeof source !== 'string' || typeof embedded !== 'string') continue;
      const sourcePath = resolve(dirname(mapPath), source);
      const relativePath = relative(root, sourcePath).replaceAll('\\', '/');
      if (isAbsolute(relativePath) || relativePath.startsWith('../') || (!relativePath.startsWith('src/') && !relativePath.startsWith('scripts/'))) continue;
      if (!existsSync(sourcePath)) throw new Error(`dist source map references missing source: ${relativePath}`);
      const current = readFileSync(sourcePath, 'utf8');
      if (current !== embedded) throw new Error(`dist source map is stale for ${relativePath}; rebuild before running packaged CLI tests`);
      compared += 1;
    }
    if (compared === 0) throw new Error(`dist source map has no repository-owned source entries: ${mapPath}`);
  }
}
