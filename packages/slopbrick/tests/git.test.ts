import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  getGitHead,
  getGitIndexPath,
  getGitRoot,
  getStagedFiles,
  getChangedFiles,
  getWorkingTreeChanges,
  getFileEditCount,
  getFileLastModifiedDate,
  getFilesInRange,
} from '../src/cli/git';

const createTmpDir = () => realpathSync(mkdtempSync(join(tmpdir(), 'slopbrick-git-test-')));

const git = (cwd: string, ...args: string[]): void => {
  execFileSync('git', args, { cwd, encoding: 'utf-8' });
};

const gitCommitAt = (cwd: string, message: string, date: string): void => {
  execFileSync('git', ['commit', '-m', message], {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    },
  });
};

describe('git helpers', () => {
  let repo: string;

  beforeEach(() => {
    repo = createTmpDir();
    git(repo, 'init', '-b', 'main');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test User');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  describe('getGitRoot', () => {
    it('returns the repo root inside a git repository', () => {
      expect(getGitRoot(repo)).toBe(repo);
    });

    it('returns undefined outside a git repository', () => {
      expect(getGitRoot(tmpdir())).toBeUndefined();
    });

    it('returns the root from a nested directory', () => {
      const nested = join(repo, 'packages', 'app');
      mkdirSync(nested, { recursive: true });
      expect(getGitRoot(nested)).toBe(repo);
    });
  });

  describe('getGitHead', () => {
    it('returns undefined when there are no commits', async () => {
      expect(await getGitHead(repo)).toBeUndefined();
    });

    it('returns the current commit hash', async () => {
      writeFileSync(join(repo, 'file.txt'), 'hello');
      git(repo, 'add', 'file.txt');
      git(repo, 'commit', '-m', 'initial');
      const head = await getGitHead(repo);
      expect(head).toMatch(/^[a-f0-9]{40}$/);
    });

    it('returns undefined outside a git repository', async () => {
      expect(await getGitHead(tmpdir())).toBeUndefined();
    });
  });

  describe('getGitIndexPath', () => {
    it('resolves the canonical index path and fails closed outside Git', async () => {
      expect(await getGitIndexPath(repo)).toBe(join(repo, '.git', 'index'));
      expect(await getGitIndexPath(tmpdir())).toBeUndefined();
    });
  });

  describe('getStagedFiles', () => {
    it('returns an empty array when there are no staged files', async () => {
      expect(await getStagedFiles(repo)).toEqual([]);
    });

    it('returns staged file paths', async () => {
      mkdirSync(join(repo, 'src'), { recursive: true });
      writeFileSync(join(repo, 'src', 'Button.tsx'), 'export const Button = () => {};');
      git(repo, 'add', 'src/Button.tsx');
      expect(await getStagedFiles(repo)).toEqual(['src/Button.tsx']);
    });

    it('returns an empty array outside a git repository', async () => {
      expect(await getStagedFiles(tmpdir())).toEqual([]);
    });
  });

  describe('getChangedFiles', () => {
    it('returns staged files', async () => {
      writeFileSync(join(repo, 'staged.ts'), 'x');
      git(repo, 'add', 'staged.ts');
      const result = await getChangedFiles(repo);
      expect(result).toContain('staged.ts');
    });

    it('returns unstaged modified files', async () => {
      writeFileSync(join(repo, 'modified.ts'), 'x');
      git(repo, 'add', 'modified.ts');
      git(repo, 'commit', '-m', 'initial');
      writeFileSync(join(repo, 'modified.ts'), 'y');
      const result = await getChangedFiles(repo);
      expect(result).toContain('modified.ts');
    });

    it('does NOT include untracked files', async () => {
      writeFileSync(join(repo, 'untracked.ts'), 'x');
      const result = await getChangedFiles(repo);
      expect(result).not.toContain('untracked.ts');
    });
  });

  describe('getWorkingTreeChanges', () => {
    it('returns staged + unstaged + untracked files', async () => {
      // initial commit so we have HEAD
      writeFileSync(join(repo, '.gitkeep'), '');
      git(repo, 'add', '.gitkeep');
      git(repo, 'commit', '-m', 'initial');
      // committed-then-modified → unstaged change
      writeFileSync(join(repo, 'modified.ts'), 'x');
      git(repo, 'add', 'modified.ts');
      git(repo, 'commit', '-m', 'add modified');
      writeFileSync(join(repo, 'modified.ts'), 'y');
      // staged (added after HEAD)
      writeFileSync(join(repo, 'staged.ts'), 'x');
      git(repo, 'add', 'staged.ts');
      // untracked (not git add'd)
      writeFileSync(join(repo, 'untracked.ts'), 'x');

      const result = await getWorkingTreeChanges(repo);
      expect(result).toContain('staged.ts');
      expect(result).toContain('modified.ts');
      expect(result).toContain('untracked.ts');
    });

    it('returns an empty array in a clean repo', async () => {
      writeFileSync(join(repo, 'clean.ts'), 'x');
      git(repo, 'add', 'clean.ts');
      git(repo, 'commit', '-m', 'initial');
      const result = await getWorkingTreeChanges(repo);
      expect(result).toEqual([]);
    });

    it('returns an empty array outside a git repository', async () => {
      expect(await getWorkingTreeChanges(tmpdir())).toEqual([]);
    });

    it('deduplicates when a file is both staged and modified after staging', async () => {
      writeFileSync(join(repo, 'dedup.ts'), 'x');
      git(repo, 'add', 'dedup.ts');
      writeFileSync(join(repo, 'dedup.ts'), 'y');
      const result = await getWorkingTreeChanges(repo);
      const occurrences = result.filter((f) => f === 'dedup.ts').length;
      expect(occurrences).toBe(1);
    });
  });

  describe('getFileEditCount', () => {
    it('returns the number of edits in the requested window', async () => {
      const file = join(repo, 'counter.ts');
      writeFileSync(file, 'let n = 0;');
      git(repo, 'add', 'counter.ts');
      gitCommitAt(repo, 'first', '2026-06-12T00:00:00Z');

      writeFileSync(file, 'let n = 1;');
      git(repo, 'add', 'counter.ts');
      gitCommitAt(repo, 'second', '2026-06-14T00:00:00Z');

      expect(await getFileEditCount(repo, 'counter.ts', 30)).toBe(2);
    });

    it('returns 0 outside a git repository', async () => {
      expect(await getFileEditCount(tmpdir(), 'counter.ts', 30)).toBe(0);
    });
  });

  describe('getFileLastModifiedDate', () => {
    it('returns the last commit date for the file', async () => {
      const file = join(repo, 'dated.ts');
      writeFileSync(file, 'export const value = 1;');
      git(repo, 'add', 'dated.ts');
      gitCommitAt(repo, 'initial', '2026-05-01T12:00:00Z');

      const date = await getFileLastModifiedDate(repo, 'dated.ts');
      expect(date).toBeInstanceOf(Date);
      expect(date?.toISOString()).toBe('2026-05-01T12:00:00.000Z');
    });

    it('returns undefined when there are no commits', async () => {
      expect(await getFileLastModifiedDate(repo, 'missing.ts')).toBeUndefined();
    });

    it('returns undefined outside a git repository', async () => {
      expect(await getFileLastModifiedDate(tmpdir(), 'missing.ts')).toBeUndefined();
    });
  });

  describe('getFilesInRange', () => {
    // Build a repo with a feature branch containing changes on top of
    // `main`. Returns the path so each test can call `getFilesInRange`
    // with its own (base, head) pair without rebuilding the fixture.
    const setupFeatureBranch = (): { repo: string } => {
      // initial commit on main
      writeFileSync(join(repo, 'README.md'), 'hello\n');
      git(repo, 'add', 'README.md');
      git(repo, 'commit', '-m', 'initial');
      // branch off into a feature branch with two new files + a modification
      git(repo, 'checkout', '-q', '-b', 'feature');
      mkdirSync(join(repo, 'src'), { recursive: true });
      writeFileSync(join(repo, 'src/new.ts'), 'export const a = 1;');
      writeFileSync(join(repo, 'src/another.ts'), 'export const b = 2;');
      writeFileSync(join(repo, 'README.md'), 'hello\nworld\n');
      git(repo, 'add', '.');
      git(repo, 'commit', '-m', 'add files');
      return { repo };
    };

    it('returns files changed in the feature branch since main', async () => {
      setupFeatureBranch();
      const files = await getFilesInRange(repo, 'main', 'feature');
      expect(files.sort()).toEqual(['README.md', 'src/another.ts', 'src/new.ts']);
    });

    it('returns an empty array when the diff is empty (HEAD == main)', async () => {
      writeFileSync(join(repo, 'README.md'), 'hello');
      git(repo, 'add', 'README.md');
      git(repo, 'commit', '-m', 'initial');
      const files = await getFilesInRange(repo, 'main', 'HEAD');
      expect(files).toEqual([]);
    });

    it('returns an empty array when the base ref does not exist', async () => {
      // Fresh repo with one commit; ask for a non-existent base.
      writeFileSync(join(repo, '.gitkeep'), '');
      git(repo, 'add', '.gitkeep');
      git(repo, 'commit', '-m', 'init');
      const files = await getFilesInRange(repo, 'does-not-exist', 'HEAD');
      expect(files).toEqual([]);
    });

    it('returns an empty array outside a git repository', async () => {
      const other = realpathSync(mkdtempSync(join(tmpdir(), 'slopbrick-git-norepo-')));
      try {
        const files = await getFilesInRange(other, 'main', 'HEAD');
        expect(files).toEqual([]);
      } finally {
        rmSync(other, { recursive: true, force: true });
      }
    });
  });
});
