// v0.42.0 (Sprint 3, §3a.5): tests for the AGENTS.md / CLAUDE.md
// auto-refresh hook. Covers the marker-block pair, safeRewrite's
// three cases (both markers / neither / one), wrapWithMarkers
// round-trip, and end-to-end refreshSnippets.

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  generateAgentsMdSnippet,
  MARKER_BEGIN,
  MARKER_END,
  wrapWithMarkers,
} from '../../src/snippet/generators';
import { safeRewrite } from '../../src/snippet/render';
import { refreshSnippets, SNIPPET_TARGETS } from '../../src/snippet/refresh';
import type { Rule } from '../../src/types';

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-snippet-refresh-'));
}

function fakeRule(): Rule {
  return {
    id: 'ai/test-rule',
    category: 'ai',
    severity: 'medium',
    aiSpecific: true,
    create: () => ({}),
    analyze: () => [],
    description: 'fake rule for tests',
  };
}

describe('marker constants', () => {
  it('uses a versioned begin/end pair (v3)', () => {
    expect(MARKER_BEGIN.startsWith('<!--')).toBe(true);
    expect(MARKER_BEGIN.endsWith('-->')).toBe(true);
    expect(MARKER_BEGIN).toContain('begin:v3');
    expect(MARKER_END).toContain('end:v3');
    expect(MARKER_BEGIN).not.toBe(MARKER_END);
  });
});

describe('wrapWithMarkers', () => {
  it('emits begin/end around the body at level 1', () => {
    const out = wrapWithMarkers(1, 'hello');
    expect(out).toContain(MARKER_BEGIN);
    expect(out).toContain('hello');
    expect(out).toContain(MARKER_END);
    expect(out.indexOf(MARKER_BEGIN)).toBeLessThan(out.indexOf(MARKER_END));
  });

  it('omits the slopbrick-managed-section heading at level 2', () => {
    const out = wrapWithMarkers(2, 'hello');
    expect(out).not.toContain('slopbrick-managed-section');
    expect(out).toContain(MARKER_BEGIN);
    expect(out).toContain(MARKER_END);
  });
});

describe('safeRewrite', () => {
  it('replaces the inner block when both markers are present', () => {
    const existing = [
      'USER CONTENT',
      '',
      MARKER_BEGIN,
      'old inner body',
      MARKER_END,
      '',
      'TRAILING USER CONTENT',
    ].join('\n');

    const out = safeRewrite(existing, 'new body');
    expect(out.rewritten).toBe(true);
    expect(out.content).toContain('USER CONTENT');
    expect(out.content).toContain('TRAILING USER CONTENT');
    expect(out.content).toContain('new body');
    expect(out.content).not.toContain('old inner body');
  });

  it('fails closed when no markers are present', () => {
    const existing = 'just a file, no slopbrick markers anywhere.';
    const out = safeRewrite(existing, 'attempted rewrite');
    expect(out.failClosed).toBe(true);
    expect(out.rewritten).toBe(false);
    // Critical: fail-closed means the original content is untouched.
    expect(out.content).toBe(existing);
  });

  it('warns + skips when only one marker is present', () => {
    const existing = `${MARKER_BEGIN}\nbody without end marker`;
    const out = safeRewrite(existing, 'attempted rewrite');
    expect(out.mismatched).toBe(true);
    expect(out.rewritten).toBe(false);
    expect(out.content).toBe(existing);
  });

  it('warns when the end marker precedes the begin marker', () => {
    const reversed = `${MARKER_END}\nout of order body\n${MARKER_BEGIN}`;
    const out = safeRewrite(reversed, 'attempted rewrite');
    expect(out.mismatched).toBe(true);
    expect(out.content).toBe(reversed);
  });

  it('preserves content before AND after the managed block', () => {
    const existing = `before\n\n${MARKER_BEGIN}\nold\n${MARKER_END}\n\nafter`;
    const out = safeRewrite(existing, 'fresh');
    expect(out.content).toContain('before');
    expect(out.content).toContain('after');
    expect(out.content).toContain('fresh');
  });
});

describe('generateAgentsMdSnippet', () => {
  it('wraps the body in v3 markers', () => {
    const out = generateAgentsMdSnippet([fakeRule()]);
    expect(out).toContain(MARKER_BEGIN);
    expect(out).toContain(MARKER_END);
    expect(out.indexOf(MARKER_BEGIN)).toBeLessThan(out.indexOf(MARKER_END));
  });
});

describe('refreshSnippets', () => {
  it('reports files rewritten when markers exist', () => {
    const dir = freshDir();
    try {
      const agentsPath = join(dir, 'AGENTS.md');
      writeFileSync(
        agentsPath,
        `# project agents\n\n${MARKER_BEGIN}\nold\n${MARKER_END}\n`,
        'utf-8',
      );
      const out = refreshSnippets(dir, [fakeRule()]);
      expect(out.rewritten).toContain('AGENTS.md');
      expect(out.failClosed).toEqual([]);
      // After refresh, the file contains the freshly-generated snippet.
      const fs = require('node:fs') as typeof import('node:fs');
      const newContent = fs.readFileSync(agentsPath, 'utf-8');
      expect(newContent).toContain(MARKER_BEGIN);
      // The marker-pinned body was rewritten — verify the
      // 'slopbrick-managed-section' heading (level-1 marker header)
      // appears, which only the rewritten version contains.
      expect(newContent).toContain('slopbrick-managed-section');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports absent files (does not error)', () => {
    const dir = freshDir();
    try {
      const out = refreshSnippets(dir, [fakeRule()]);
      expect(out.absent).toContain('AGENTS.md');
      expect(out.absent).toContain('CLAUDE.md');
      expect(out.rewritten).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports fail-closed when a file is missing markers', () => {
    const dir = freshDir();
    try {
      writeFileSync(join(dir, 'AGENTS.md'), 'no markers here', 'utf-8');
      const out = refreshSnippets(dir, [fakeRule()]);
      expect(out.failClosed).toContain('AGENTS.md');
      expect(out.rewritten).toEqual([]);
      // Original content preserved.
      const fs = require('node:fs') as typeof import('node:fs');
      expect(fs.readFileSync(join(dir, 'AGENTS.md'), 'utf-8')).toBe('no markers here');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('targets the canonical snippet file set by default', () => {
    expect(SNIPPET_TARGETS).toContain('AGENTS.md');
    expect(SNIPPET_TARGETS).toContain('CLAUDE.md');
  });
});
