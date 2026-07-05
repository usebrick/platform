
// v0.42.0: tests for the looksLikeRegexSyntax heuristic in docs/broken-link.
// Verifies regex-shape markers are detected and real paths are not.
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { brokenLinkRule } from '../../src/rules/docs/broken-link';
import type { RuleContext, ScanFacts } from '../../src/types';

function makeCtx(cwd: string, filePath: string): RuleContext {
  return { cwd, filePath, config: {} as RuleContext['config'], framework: '', uiLibraries: [], hasTailwind: false, supportsRsc: false, hotspotIssues: [] };
}

function makeFacts(source: string): ScanFacts {
  return { v2: { _source: source } } as unknown as ScanFacts;
}

describe('docs/broken-link — v0.42.0 regex-shape filtering', () => {
  it('skips targets that contain regex character classes', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bl-test-'));
    try {
      writeFileSync(join(tmp, 'doc.md'), 'See [text]([^\'"]+)\n');
      const issues = brokenLinkRule.analyze(
        makeCtx(tmp, join(tmp, 'doc.md')),
        makeFacts('See [text]([^\'"]+)\n'),
      );
      expect(issues).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('skips targets with backslash escapes', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bl-test-'));
    try {
      writeFileSync(join(tmp, 'doc.md'), 'match [text](/\\s/)\\n');
      const issues = brokenLinkRule.analyze(
        makeCtx(tmp, join(tmp, 'doc.md')),
        makeFacts('match [text](/\\s/)\n'),
      );
      expect(issues).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('skips non-capturing groups', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bl-test-'));
    try {
      const issues = brokenLinkRule.analyze(
        makeCtx(tmp, join(tmp, 'doc.md')),
        makeFacts('See [text](?:foo)\n'),
      );
      expect(issues).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('still fires on real broken relative links', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bl-test-'));
    try {
      writeFileSync(join(tmp, 'doc.md'), 'See [guide](missing-guide.md)\n');
      const issues = brokenLinkRule.analyze(
        makeCtx(tmp, join(tmp, 'doc.md')),
        makeFacts('See [guide](missing-guide.md)\n'),
      );
      expect(issues.length).toBe(1);
      expect(issues[0]?.ruleId).toBe('docs/broken-link');
      expect(issues[0]?.extras?.link).toBe('missing-guide.md');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not fire on real relative links that resolve', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bl-test-'));
    try {
      writeFileSync(join(tmp, 'doc.md'), 'See [guide](real.md)\n');
      writeFileSync(join(tmp, 'real.md'), '# Real');
      const issues = brokenLinkRule.analyze(
        makeCtx(tmp, join(tmp, 'doc.md')),
        makeFacts('See [guide](real.md)\n'),
      );
      expect(issues).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('still fires on real broken links with mixed-shape targets', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'bl-test-'));
    try {
      writeFileSync(join(tmp, 'doc.md'), 'See [text](missing/foo/bar.md)\n');
      const issues = brokenLinkRule.analyze(
        makeCtx(tmp, join(tmp, 'doc.md')),
        makeFacts('See [text](missing/foo/bar.md)\n'),
      );
      expect(issues.length).toBe(1);
      expect(issues[0]?.extras?.link).toBe('missing/foo/bar.md');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});


// v0.42.0 follow-up: tests for the inBlockComment + inComment
// annotations on extracted links. Same fix landed for the

// v0.42.0 follow-up: tests for the inBlockComment + inComment
// annotations on extracted links. Same fix landed for the
// broken-link rule (commit 0f2df63) and the stale-function/
// package-reference rules (commits bf83962 + c53bbca).
// inBlockComment is true for /* ... */ block comments.
// inComment is true for // line comments AND /* ... */ blocks.
import { extractMarkdownLinks } from '../../src/engine/doc-freshness';

describe('extractMarkdownLinks — v0.42.0 inBlockComment + inComment annotations', () => {
  it('annotates links inside /* ... */ as inBlockComment=true (and inComment=true)', () => {
    const src = `
/**
 * Extract markdown links \`[text](target)\`. Returns the target.
 */
const other = \`[real](docs/real.md)\`;
`;
    const links = extractMarkdownLinks(src);
    expect(links.length).toBe(2);
    expect(links[0]!.inBlockComment).toBe(true);
    expect(links[0]!.inComment).toBe(true);
    expect(links[1]!.inBlockComment).toBe(false);
    expect(links[1]!.inComment).toBe(false);
  });

  it('annotates links on // comment lines as inComment=true (inBlockComment=false)', () => {
    // Single-line // comment line; non-backticked link on the comment
    // line, then a backticked link on the next line.
    const src = '// See [docs](docs/intro.md)\nconst real = `[other](real.md)`;';
    const links = extractMarkdownLinks(src);
    expect(links.length).toBe(2);
    expect(links[0]!.inComment).toBe(true);
    expect(links[0]!.inBlockComment).toBe(false);
    expect(links[1]!.inComment).toBe(false);
    expect(links[1]!.inBlockComment).toBe(false);
  });

  it('preserves the index for callers that want byte-offset math', () => {
    const src = '[text](real.md)';
    const links = extractMarkdownLinks(src);
    expect(links[0]!.index).toBe(0);
  });
});
