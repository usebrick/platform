import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const SOURCE_PROJECTION_ROOT = 'sources/benchmarks/humanvsai-code-dataset/projection-v1';
const SHA256 = /^[a-f0-9]{64}$/u;

export interface ProjectionIndexRow {
  readonly recordId: string;
  readonly relativePath: string;
  readonly contentSha256: string;
}

function contained(root: string, child: string): boolean {
  const childRelative = relative(root, child);
  return childRelative !== ''
    && !isAbsolute(childRelative)
    && childRelative !== '..'
    && !childRelative.startsWith(`..${sep}`);
}

export function parseProjectionIndex(bytes: Buffer): Map<string, ProjectionIndexRow> {
  const rows = new Map<string, ProjectionIndexRow>();
  for (const [index, line] of bytes.toString('utf8').trimEnd().split('\n').entries()) {
    const value: unknown = JSON.parse(line);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`projection row ${index + 1} is not an object`);
    const row = value as Record<string, unknown>;
    if (typeof row.recordId !== 'string' || typeof row.relativePath !== 'string' || typeof row.contentSha256 !== 'string' || !SHA256.test(row.contentSha256)) {
      throw new Error(`projection row ${index + 1} has an invalid identity`);
    }
    if (isAbsolute(row.relativePath) || row.relativePath.split(/[\\/]/u).includes('..') || rows.has(row.recordId)) {
      throw new Error(`projection row ${index + 1} has an unsafe or duplicate path`);
    }
    rows.set(row.recordId, { recordId: row.recordId, relativePath: row.relativePath, contentSha256: row.contentSha256 });
  }
  return rows;
}

export async function corpusV1ProjectionRoot(corpusRoot: string): Promise<string> {
  return realpath(resolve(corpusRoot, SOURCE_PROJECTION_ROOT));
}

export async function readCorpusV1Unit(
  projectionRoot: string,
  projection: ProjectionIndexRow,
): Promise<{ readonly path: string; readonly bytes: Buffer }> {
  const lexicalPath = resolve(projectionRoot, projection.relativePath);
  if (!contained(projectionRoot, lexicalPath)) throw new Error('selected source path escaped the projection root');
  const lexical = await lstat(lexicalPath);
  if (lexical.isSymbolicLink() || !lexical.isFile()) throw new Error('selected source unit is not a regular file');
  const path = await realpath(lexicalPath);
  if (!contained(projectionRoot, path)) throw new Error('selected source unit resolved outside the projection root');
  const metadata = await stat(path);
  if (!metadata.isFile()) throw new Error('selected source unit is not a file');
  const bytes = await readFile(path);
  const contentSha256 = createHash('sha256').update(bytes).digest('hex');
  if (contentSha256 !== projection.contentSha256) throw new Error('selected source unit hash changed');
  return { path, bytes };
}
