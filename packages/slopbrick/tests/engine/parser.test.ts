import { describe, expect, it } from 'vitest';
import { parseFile } from '@usebrick/engine';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const createTmpDir = () => mkdtempSync(join(tmpdir(), 'slopbrick-parser-test-'));

describe('parseFile', () => {
  it('parses a TSX file', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Button.tsx');
      writeFileSync(file, `export function Button() { return <button>Hi</button>; }`);
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses a .js file that contains JSX (Next.js style)', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Logo.js');
      writeFileSync(
        file,
        `export function Logo() {\n  return (\n    <Link href="/" className="logo" aria-label="Home">\n      <span>Logo</span>\n    </Link>\n  );\n}\n`,
      );
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Round 23: 27 .ts files in the positive corpus have shebangs (#!/usr/bin/env node).
  // SWC's TypeScript parser doesn't strip them — fix the parser to drop the first
  // line if it starts with `#!`.
  it('parses a .ts file with a shebang (round 23)', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'script.ts');
      writeFileSync(
        file,
        `#!/usr/bin/env node\nconst x: number = 1;\nexport default x;\n`,
      );
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses a .ts file with a shebang and JSX (round 23)', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'cli.tsx');
      writeFileSync(
        file,
        `#!/usr/bin/env node\nimport React from 'react';\nexport const App = () => <div>hi</div>;\n`,
      );
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // Round 24: edge-case parser tests. The parser must tolerate weird-but-real
  // inputs without throwing, even if some don't produce meaningful ASTs.
  describe('edge cases (round 24)', () => {
    it('handles an empty file', async () => {
      const dir = createTmpDir();
      try {
        const file = join(dir, 'Empty.tsx');
        writeFileSync(file, '');
        const result = await parseFile(file);
        expect(result.ast.type).toBe('Module');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('handles a file with only a comment', async () => {
      const dir = createTmpDir();
      try {
        const file = join(dir, 'Comment.tsx');
        writeFileSync(file, '// just a comment\n');
        const result = await parseFile(file);
        expect(result.ast.type).toBe('Module');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('handles a file with a UTF-8 BOM', async () => {
      const dir = createTmpDir();
      try {
        const file = join(dir, 'BOM.tsx');
        writeFileSync(file, '\uFEFFexport const x = 1;\n');
        const result = await parseFile(file);
        expect(result.ast.type).toBe('Module');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('handles CRLF line endings', async () => {
      const dir = createTmpDir();
      try {
        const file = join(dir, 'CRLF.tsx');
        writeFileSync(file, 'export const x = 1;\r\nexport const y = 2;\r\n');
        const result = await parseFile(file);
        expect(result.ast.type).toBe('Module');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    // v0.14.5l: backend files (.py, .go) parse as blank-padded empty
    // modules so the rule engine can still run on them (rules that
    // need SWC will silently produce 0 issues, but regex-only rules
    // like markdown-leakage and comment-ratio can fire).
    it('parses .py files as empty modules (line offsets preserved)', async () => {
      const dir = createTmpDir();
      try {
        const file = join(dir, 'sample.py');
        const source = 'def hello():\n    """A docstring."""\n    print("hi")\n';
        writeFileSync(file, source);
        const result = await parseFile(file);
        // AST is an empty Module (no body), but line offsets are preserved
        expect(result.ast.type).toBe('Module');
        // The source has been blank-padded: every non-newline char is ' '
        expect(result.source).toContain('\n');
        // Lines still exist (line offset preservation)
        expect(result.source.split('\n').length).toBe(source.split('\n').length);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('parses .go files as empty modules (line offsets preserved)', async () => {
      const dir = createTmpDir();
      try {
        const file = join(dir, 'main.go');
        const source = 'package main\n\nfunc main() {\n    println("hi")\n}\n';
        writeFileSync(file, source);
        const result = await parseFile(file);
        expect(result.ast.type).toBe('Module');
        expect(result.source.split('\n').length).toBe(source.split('\n').length);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('handles Unicode in identifiers and strings', async () => {
      const dir = createTmpDir();
      try {
        const file = join(dir, 'Unicode.tsx');
        writeFileSync(
          file,
          'export const café = "naïve résumé 日本語";\nexport const 名前 = () => <div>🎉</div>;\n',
        );
        const result = await parseFile(file);
        expect(result.ast.type).toBe('Module');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('handles a deeply-nested JSX tree (50 levels)', async () => {
      const dir = createTmpDir();
      try {
        const file = join(dir, 'Deep.tsx');
        let source = 'export const X = () => <div>';
        for (let i = 0; i < 50; i++) source += '<section>';
        source += 'hi';
        for (let i = 0; i < 50; i++) source += '</section>';
        source += '</div>;\n';
        writeFileSync(file, source);
        const result = await parseFile(file);
        expect(result.ast.type).toBe('Module');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('handles a single-line giant file (5,000 tokens)', async () => {
      const dir = createTmpDir();
      try {
        const file = join(dir, 'Big.tsx');
        const tokens = Array.from({ length: 5000 }, (_, i) => `x${i}: ${i}`).join(', ');
        writeFileSync(file, `export const Big = { ${tokens} };\n`);
        const result = await parseFile(file);
        expect(result.ast.type).toBe('Module');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('handles a file with only whitespace', async () => {
      const dir = createTmpDir();
      try {
        const file = join(dir, 'WS.tsx');
        writeFileSync(file, '   \n\n\t  \n');
        const result = await parseFile(file);
        expect(result.ast.type).toBe('Module');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  it('throws on invalid syntax', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'bad.tsx');
      writeFileSync(file, `export function Button() { return <button>`);
      await expect(parseFile(file)).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses an .astro file with frontmatter and JSX', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Home.astro');
      writeFileSync(
        file,
        `---\nconst title = 'Home';\n---\n<html lang="en">\n  <body>\n    <h1 client:load>{title}</h1>\n  </body>\n</html>\n`,
      );
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
      // Astro templates are HTML-like, so the AST is intentionally blanked.
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses an .astro file with no frontmatter', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Plain.astro');
      writeFileSync(file, `<div>hello</div>\n`);
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
      // Astro templates are HTML-like, so the AST is intentionally blanked.
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses a .vue file with <script setup lang="ts">', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Counter.vue');
      writeFileSync(
        file,
        `<script setup lang="ts">\nconst count = ref(0);\nfunction inc() { count.value++; }\n</script>\n<template>\n  <button @click="inc">{{ count }}</button>\n</template>\n`,
      );
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses a .svelte file with a <script> block', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'Counter.svelte');
      writeFileSync(
        file,
        `<script>\n  let count = 0;\n  function increment() { count += 1; }\n</script>\n<button on:click={increment}>{count}</button>\n`,
      );
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty AST for a .vue file without a script block', async () => {
    const dir = createTmpDir();
    try {
      const file = join(dir, 'TemplateOnly.vue');
      writeFileSync(file, `<template><div>hi</div></template>\n`);
      const result = await parseFile(file);
      expect(result.ast.type).toBe('Module');
      expect(result.ast.body).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// v0.18.3 (R-MED env-var fix): the parser cache is now a
// passed option, not an env-var read in the engine. These
// tests exercise the explicit-opts path. The env-var fallback
// is still tested in tests/engine/cache-bench.test.ts (the
// legacy path, kept for backward compat with the test suite).
describe('parseFile — explicit cache options (v0.18.3 R-MED)', () => {
  it('writes and reads the cache when opts.cache.enabled is true', async () => {
    const dir = createTmpDir();
    const cacheDir = join(dir, 'cache');
    try {
      const file = join(dir, 'Cached.tsx');
      const source = `export const x = 1;`;
      writeFileSync(file, source);

      // First call: cache miss, writes to disk.
      const first = await parseFile(file, {
        cache: { enabled: true, root: cacheDir },
      });
      expect(first.ast.type).toBe('Module');
      // The cache file should now exist (md5-named .json).
      // We don't check the exact filename (md5 hash), but
      // verify the cache directory has at least one file.
      const files = (await import('fs')).readdirSync(cacheDir);
      expect(files.length).toBeGreaterThan(0);

      // Second call: cache hit, returns without re-parsing.
      // We can't easily verify "no re-parse" without spying
      // on the SWC internals, so just verify the result is
      // equivalent.
      const second = await parseFile(file, {
        cache: { enabled: true, root: cacheDir },
      });
      expect(second.ast.type).toBe(first.ast.type);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not write the cache when opts.cache.enabled is false', async () => {
    const dir = createTmpDir();
    const cacheDir = join(dir, 'cache');
    try {
      const file = join(dir, 'NoCache.tsx');
      writeFileSync(file, `export const y = 2;`);

      await parseFile(file, {
        cache: { enabled: false, root: cacheDir },
      });

      // Cache directory should be empty (or not exist).
      const fs = await import('fs');
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir);
        expect(files).toEqual([]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not read the cache when opts.cache.enabled is false', async () => {
    const dir = createTmpDir();
    const cacheDir = join(dir, 'cache');
    try {
      const file = join(dir, 'Poisoned.tsx');
      writeFileSync(file, `export const z = 3;`);

      // Pre-poison the cache: write a file with garbage so
      // any read attempt would return nonsense. If the engine
      // respects `enabled: false`, it should ignore this.
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, 'poison.json'), 'garbage');

      const result = await parseFile(file, {
        cache: { enabled: false, root: cacheDir },
      });
      // The AST should be a real Module (parsed fresh), not
      // whatever the poisoned cache file would have returned.
      expect(result.ast.type).toBe('Module');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
