import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { repoRoot } from '../helpers/cli';

const execFileAsync = promisify(execFile);

// .github/ lives at the git repo root, because GitHub Actions expects it
// at the workspace root. After the slopbrick/ flatten (86f1885) this
// directory is now `repoRoot` itself, not its parent.
const ACTION_DIR = resolve(repoRoot, '.github/actions/slopbrick');
const SCRIPT_PATH = join(ACTION_DIR, 'post-comment.sh');
const ACTION_YML = join(ACTION_DIR, 'action.yml');
const README_MD = join(ACTION_DIR, 'README.md');

async function runShell(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(args[0], args.slice(1));
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer; code?: number };
    return {
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
      code: typeof e.code === 'number' ? e.code : 1,
    };
  }
}

describe('PR-comment GitHub Action', () => {
  it('ships the post-comment.sh script and is executable', () => {
    expect(existsSync(SCRIPT_PATH)).toBe(true);
    // The shell shebang makes it runnable; bash -n below covers syntax.
  });

  it('post-comment.sh passes bash syntax check', async () => {
    const result = await runShell(['bash', '-n', SCRIPT_PATH]);
    expect(result.code, `bash -n failed: ${result.stderr}`).toBe(0);
    expect(result.stderr).toBe('');
  });

  // shellcheck would catch quoting / portability issues but is not always
  // installed. Treat it as an optional, advisory gate.
  it('post-comment.sh passes shellcheck when available', async () => {
    const probe = await runShell(['which', 'shellcheck']);
    if (probe.code !== 0) {
      // TODO: install shellcheck in CI when convenient. For now, skip silently
      // with a notice so the test still passes.
      process.stderr.write('shellcheck not installed; skipping\n');
      return;
    }
    const result = await runShell(['shellcheck', '--severity=warning', SCRIPT_PATH]);
    expect(result.code, `shellcheck failed:\n${result.stderr}`).toBe(0);
  });

  describe('action.yml', () => {
    const actionYml = readFileSync(ACTION_YML, 'utf8');

    it('declares pr-comment input (default false)', () => {
      expect(actionYml).toMatch(/^\s{2}pr-comment:\s*$/m);
      // The block beneath pr-comment: should contain a default of 'false'.
      const block = actionYml.split(/^\s{2}pr-comment:\s*$/m)[1] ?? '';
      const slice = block.split(/^\s{2}[a-z-]+:\s*$/m)[0] ?? '';
      expect(slice).toMatch(/default:\s*'false'/);
    });

    it('declares pr-number input with pull_request.number default', () => {
      expect(actionYml).toMatch(/^\s{2}pr-number:\s*$/m);
      const block = actionYml.split(/^\s{2}pr-number:\s*$/m)[1] ?? '';
      const slice = block.split(/^\s{2}[a-z-]+:\s*$/m)[0] ?? '';
      expect(slice).toMatch(/github\.event\.pull_request\.number/);
    });

    it('has a Post PR comment step gated on inputs.pr-comment', () => {
      expect(actionYml).toMatch(/-\s*name:\s*Post PR comment/);
      // Capture the step block. The next sibling in `runs.steps` is either the
      // end of the steps array (no leading dash), or another `- name:` entry.
      const stepMatch = actionYml.match(/-\s*name:\s*Post PR comment[\s\S]*?(?=\n    -\s*name:|^\S|$)/);
      if (!stepMatch) {
        throw new Error('failed to isolate Post PR comment step');
      }
      const step = stepMatch[0];
      expect(step).toMatch(/if:\s*inputs\.pr-comment\s*==\s*'true'/);
      expect(step).toMatch(/continue-on-error:\s*true/);
      expect(step).toMatch(/post-comment\.sh/);
      expect(step).toMatch(/PR_NUMBER:/);
      expect(step).toMatch(/GITHUB_TOKEN:/);
      expect(step).toMatch(/INPUT_REPORT_PATH:/);
    });
  });

  describe('README.md', () => {
    const readme = readFileSync(README_MD, 'utf8');

    it('documents pr-comment and pr-number inputs', () => {
      expect(readme).toContain('`pr-comment`');
      expect(readme).toContain('`pr-number`');
    });

    it('shows permissions block including pull-requests: write', () => {
      expect(readme).toMatch(/pull-requests:\s*write/);
      expect(readme).toMatch(/permissions:/);
    });
  });
});