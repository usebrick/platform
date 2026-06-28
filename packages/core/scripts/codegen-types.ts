/**
 * v0.14.5+: Read each JSON Schema in schemas/v1/*.json, generate a
 * TypeScript interface in src/generated/<name>.ts.
 *
 * Run via `pnpm --filter @usebrick/core codegen`. Called automatically
 * by `prebuild` and by the CI contract test.
 */
import { compileFromFile } from 'json-schema-to-typescript';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Deviation from spec verbatim: `__dirname` is undefined under `"type": "module"`.
// Follow the project convention used by slopbrick/scripts/*.ts and
// website/scripts/prebuild.ts — derive __dirname from import.meta.url.
const __dirname = dirname(fileURLToPath(import.meta.url));

const SCHEMAS_DIR = resolve(__dirname, '..', 'schemas', 'v1');
const OUT_DIR = resolve(__dirname, '..', 'src', 'generated');

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const files = readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith('.schema.json'));
  for (const file of files) {
    const schemaPath = join(SCHEMAS_DIR, file);
    const ts = await compileFromFile(schemaPath, {
      additionalProperties: false,
      bannerComment: `// AUTO-GENERATED from ${file}. Do not hand-edit.`,
      style: { tabWidth: 2, printWidth: 100 },
    });
    const outName = file.replace('.schema.json', '.ts');
    const outPath = join(OUT_DIR, outName);
    writeFileSync(outPath, ts, 'utf-8');
    console.log(`codegen: ${file} → src/generated/${outName}`);
  }
}

main().catch((err) => {
  console.error('codegen failed:', err);
  process.exit(1);
});
