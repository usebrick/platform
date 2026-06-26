import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { parseFile } from '../../src/engine/parser';
import { extractFacts } from '../../src/engine/visitor';
import { DEFAULT_CONFIG } from '../../src/config';

const createTmp = () => mkdtempSync(join(tmpdir(), 'slopbrick-fuzz-'));

// Round 24: generate random TSX inputs and verify the parser + visitor
// don't crash. We don't assert anything about the result — we only check
// that no exception escapes.
describe('parser + visitor fuzz (round 24)', () => {
  it('does not crash on random identifiers + JSX', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[A-Za-z_$][A-Za-z0-9_$]{0,20}$/),
        async (name) => {
          const dir = createTmp();
          try {
            const file = join(dir, 'X.tsx');
            writeFileSync(
              file,
              `export function ${name}() { return <${name} className="x">hi</${name}>; }\n`,
            );
            const { ast, source } = await parseFile(file);
            const facts = extractFacts(file, ast, source);
            expect(facts).toBeDefined();
          } finally {
            rmSync(dir, { recursive: true, force: true });
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  it('does not crash on random short strings inside JSX text', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 80 }), async (text) => {
        const dir = createTmp();
        try {
          const file = join(dir, 'X.tsx');
          // Use a safe wrapper; we only care that the parser tolerates the inner text.
          const safe = text.replace(/[<>{}"`]/g, '');
          writeFileSync(file, `export const X = () => <div title="${safe}">${safe}</div>;\n`);
          const { ast, source } = await parseFile(file);
          const facts = extractFacts(file, ast, source);
          expect(facts).toBeDefined();
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }),
      { numRuns: 30 },
    );
  });

  it('does not crash on random property names in JSX', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,15}$/),
        async (prop) => {
          const dir = createTmp();
          try {
            const file = join(dir, 'X.tsx');
            writeFileSync(file, `export const X = () => <div ${prop}={42}>x</div>;\n`);
            const { ast, source } = await parseFile(file);
            const facts = extractFacts(file, ast, source);
            // We don't care about the content; only that nothing threw.
            void facts;
          } finally {
            rmSync(dir, { recursive: true, force: true });
          }
        },
      ),
      { numRuns: 30 },
    );
  });

  it('does not crash on a randomly-nested JSX tree', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 6 }), async (depth) => {
        const dir = createTmp();
        try {
          const file = join(dir, 'X.tsx');
          const inner = '<span>x</span>'.repeat(depth);
          writeFileSync(file, `export const X = () => <div>${inner}</div>;\n`);
          const { ast, source } = await parseFile(file);
          const facts = extractFacts(file, ast, source);
          expect(facts).toBeDefined();
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      }),
      { numRuns: 20 },
    );
  });
});
