import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);

function isExpectedGitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EACCES') return true;
  // execFile reports non-zero exits on `code`; execFileSync reports them on `status`.
  const status = (error as { status?: string | number }).status;
  const exitCode = status ?? code;
  if (exitCode === 128 || exitCode === '128' || exitCode === 129 || exitCode === '129') return true;
  return false;
}

async function runGit(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf-8',
    });
    return stdout.trim();
  } catch (error) {
    if (isExpectedGitError(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function getGitHead(cwd: string): Promise<string | undefined> {
  return runGit(cwd, ['rev-parse', 'HEAD']);
}

/** Resolve the index Git actually uses, including linked worktrees/submodules. */
export async function getGitIndexPath(cwd: string): Promise<string | undefined> {
  const path = await runGit(cwd, ['rev-parse', '--git-path', 'index']);
  return path ? resolve(cwd, path) : undefined;
}

export async function getStagedFiles(cwd: string): Promise<string[]> {
  const output = await runGit(cwd, ['diff', '--cached', '--name-only']);
  if (!output) return [];
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

export async function getChangedFiles(cwd: string): Promise<string[]> {
  const staged = await runGit(cwd, ['diff', '--cached', '--name-only']);
  const unstaged = await runGit(cwd, ['diff', '--name-only']);
  const all = new Set<string>();
  for (const output of [staged, unstaged]) {
    if (!output) continue;
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) all.add(trimmed);
    }
  }
  return Array.from(all);
}

export async function getWorkingTreeChanges(cwd: string): Promise<string[]> {
  const changed = await getChangedFiles(cwd);
  const untracked = await runGit(cwd, ['ls-files', '--others', '--exclude-standard']);
  const all = new Set<string>(changed);
  if (untracked) {
    for (const line of untracked.split('\n')) {
      const trimmed = line.trim();
      if (trimmed) all.add(trimmed);
    }
  }
  return Array.from(all);
}

export async function getFilesSince(cwd: string, ref: string): Promise<string[]> {
  const output = await runGit(cwd, ['diff', '--name-only', `${ref}..HEAD`]);
  if (!output) return [];
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

/**
 * List files changed between two git refs using the three-dot diff
 * syntax (`base...head`), which compares `head` to the merge-base of
 * `base` and `head`. This matches GitHub's PR view: a file is "in the
 * PR" if it changed in the branch since the merge-base.
 *
 * Returns an empty array when the diff is empty or one of the refs
 * does not resolve. Paths are repo-relative (forward-slash normalized
 * by `git diff`).
 */
export async function getFilesInRange(
  cwd: string,
  base: string,
  head: string,
): Promise<string[]> {
  const output = await runGit(cwd, ['diff', '--name-only', `${base}...${head}`]);
  if (!output) return [];
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

export function getGitRoot(cwd: string): string | undefined {
  try {
    const stdout = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf-8',
    });
    return stdout.trim();
  } catch (error) {
    if (isExpectedGitError(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function getFileEditCount(
  cwd: string,
  filePath: string,
  days: number,
): Promise<number> {
  const output = await runGit(cwd, [
    'log',
    '--oneline',
    `--since=${days}.days`,
    '--',
    filePath,
  ]);
  if (!output) return 0;
  return output.split('\n').filter((line) => line.trim() !== '').length;
}

export async function getFileLastModifiedDate(
  cwd: string,
  filePath: string,
): Promise<Date | undefined> {
  const output = await runGit(cwd, ['log', '-1', '--format=%ct', '--', filePath]);
  if (!output) return undefined;
  const timestamp = Number.parseInt(output, 10);
  if (Number.isNaN(timestamp)) return undefined;
  return new Date(timestamp * 1000);
}
