import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

const BEGIN_SENTINEL = '# slopbrick-hook-begin';
const END_SENTINEL = '# slopbrick-hook-end';
const SENTINEL_BLOCK = `${BEGIN_SENTINEL}\nnpx slopbrick --staged\n${END_SENTINEL}\n`;

export type HookResult = {
  ok: boolean;
  message: string;
  exitCode: 0 | 2;
};

function hookPath(gitRoot: string): string {
  const huskyDir = join(gitRoot, '.husky');
  if (existsSync(huskyDir)) {
    return join(huskyDir, 'pre-commit');
  }
  return join(gitRoot, '.git', 'hooks', 'pre-commit');
}

function readHookContent(path: string): string {
  return readFileSync(path, 'utf8');
}

function sentinelsPresent(content: string): { begin: boolean; end: boolean } {
  const lines = content.split(/\r?\n/);
  return {
    begin: lines.some((line) => line === BEGIN_SENTINEL),
    end: lines.some((line) => line === END_SENTINEL),
  };
}

function replaceSentinelBlock(content: string): string {
  const lines = content.split(/\r?\n/);
  const beginIndex = lines.indexOf(BEGIN_SENTINEL);
  const endIndex = lines.indexOf(END_SENTINEL);
  if (beginIndex === -1 || endIndex === -1 || beginIndex > endIndex) {
    return content;
  }

  const before = lines.slice(0, beginIndex);
  const after = lines.slice(endIndex + 1);
  return `${before.join('\n')}${before.length > 0 ? '\n' : ''}${SENTINEL_BLOCK}${after.join('\n')}`;
}

export function installHook(gitRoot: string): HookResult {
  const path = hookPath(gitRoot);

  if (existsSync(path)) {
    const content = readHookContent(path);
    const { begin, end } = sentinelsPresent(content);

    if (begin && end) {
      const replaced = replaceSentinelBlock(content);
      if (replaced === content) {
        return {
          ok: true,
          message: 'Hook already installed',
          exitCode: 0,
        };
      }
      writeFileSync(path, replaced.endsWith('\n') ? replaced : `${replaced}\n`);
      chmodSync(path, 0o755);
      return {
        ok: true,
        message: 'Replaced pre-commit hook block',
        exitCode: 0,
      };
    }

    if (begin || end) {
      const found = begin ? BEGIN_SENTINEL : END_SENTINEL;
      const missing = begin ? END_SENTINEL : BEGIN_SENTINEL;
      return {
        ok: false,
        message: `Malformed pre-commit hook: found ${found} without matching ${missing}`,
        exitCode: 2,
      };
    }

    const normalized =
      content.length > 0 && !content.endsWith('\n') ? `${content}\n` : content;

    writeFileSync(path, `${normalized}${SENTINEL_BLOCK}`);
    chmodSync(path, 0o755);
    return {
      ok: true,
      message: 'Installed pre-commit hook',
      exitCode: 0,
    };
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, SENTINEL_BLOCK, { mode: 0o755 });
  chmodSync(path, 0o755);

  return {
    ok: true,
    message: 'Installed pre-commit hook',
    exitCode: 0,
  };
}

export function uninstallHook(gitRoot: string): HookResult {
  const path = hookPath(gitRoot);

  if (!existsSync(path)) {
    return {
      ok: true,
      message: 'Hook not installed',
      exitCode: 0,
    };
  }

  const content = readHookContent(path);
  const { begin: hasBegin, end: hasEnd } = sentinelsPresent(content);

  if (!hasBegin && !hasEnd) {
    return {
      ok: true,
      message: 'Hook not installed',
      exitCode: 0,
    };
  }

  const lines = content.split(/\r?\n/);
  const beginIndex = lines.indexOf(BEGIN_SENTINEL);
  const endIndex = lines.indexOf(END_SENTINEL);

  if (beginIndex === -1 || endIndex === -1 || beginIndex > endIndex) {
    return {
      ok: false,
      message: 'Malformed pre-commit hook: sentinel block is incomplete',
      exitCode: 2,
    };
  }

  let start = beginIndex;
  while (start > 0 && lines[start - 1] === '') {
    start -= 1;
  }

  let end = endIndex;
  while (end < lines.length - 1 && lines[end + 1] === '') {
    end += 1;
  }

  const remaining = [...lines.slice(0, start), ...lines.slice(end + 1)];
  const result = remaining.join('\n');

  writeFileSync(path, result.endsWith('\n') ? result : `${result}\n`);

  return {
    ok: true,
    message: 'Uninstalled pre-commit hook',
    exitCode: 0,
  };
}
