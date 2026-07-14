/**
 * v0.14.5+: Read each JSON Schema in schemas/v1/*.json, generate a
 * TypeScript interface in src/generated/<name>.ts.
 *
 * Run via `pnpm --filter @usebrick/core codegen`. Called automatically
 * by `prebuild` and by the CI contract test.
 */
import { compileFromFile } from 'json-schema-to-typescript';
import type { FileInfo } from '@apidevtools/json-schema-ref-parser';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Deviation from spec verbatim: `__dirname` is undefined under `"type": "module"`.
// Follow the project convention used by slopbrick/scripts/*.ts and
// website/scripts/prebuild.ts — derive __dirname from import.meta.url.
const __dirname = dirname(fileURLToPath(import.meta.url));

const SCHEMAS_DIR = resolve(__dirname, '..', 'schemas', 'v1');
const OUT_DIR = resolve(__dirname, '..', 'src', 'generated');

const LOCAL_SCHEMA_ORIGIN = 'https://usebrick.dev/schemas/v1/';
const LOCAL_SCHEMA_URL = new URL(LOCAL_SCHEMA_ORIGIN);

/**
 * Resolve the repository's canonical schema URLs from the checked-out schema
 * directory.  Code generation is a build input and must never depend on the
 * availability (or current HTML response) of usebrick.dev.  The public `$id`
 * remains an HTTPS URL for consumers, but codegen always reads the pinned
 * local bytes.
 */
function readLocalSchema(file: FileInfo): Buffer {
  const url = new URL(file.url);
  if (url.origin !== LOCAL_SCHEMA_URL.origin || !url.pathname.startsWith(LOCAL_SCHEMA_URL.pathname)) {
    throw new Error(`Unexpected schema reference outside ${LOCAL_SCHEMA_ORIGIN}: ${file.url}`);
  }
  if (url.search) throw new Error(`Schema references must not contain a query: ${file.url}`);
  const fileName = decodeURIComponent(url.pathname.slice(LOCAL_SCHEMA_URL.pathname.length));
  if (!/^[A-Za-z0-9._-]+\.schema\.json$/.test(fileName)) {
    throw new Error(`Invalid local schema reference: ${file.url}`);
  }
  return readFileSync(join(SCHEMAS_DIR, fileName));
}

const localSchemaResolver = {
  name: 'local-canonical-schema',
  order: 1,
  canRead: (file: FileInfo) => file.url.startsWith(LOCAL_SCHEMA_ORIGIN),
  read: readLocalSchema,
};

/**
 * json-schema-to-typescript currently renders a fixed `prefixItems` tuple of
 * local `$ref`s as `[unknown, unknown]`.  The runtime AJV schema is already
 * authoritative, but leaking `unknown` from the generated public types makes
 * the compile-time contract needlessly weak.  Keep this deterministic
 * post-processing next to codegen so a fresh generation reproduces the same
 * stronger tuple types without hand-editing generated files.
 */
function strengthenFixedTuples(file: string, generated: string): string {
  if (file === 'calibration-admission-decision.schema.json') {
    return generated.replace('adjudicatesDecisionIds?: [unknown, unknown];', 'adjudicatesDecisionIds?: [Sha256, Sha256];');
  }
  if (file === 'calibration-admission-blind-assignment.schema.json') {
    return generated.replace('reviewerIds: [unknown, unknown];', 'reviewerIds: [Id, Id];');
  }
  if (file === 'calibration-admission-record.schema.json') {
    return generated.replace('acceptingReviewerDecisionIds: [unknown, unknown];', 'acceptingReviewerDecisionIds: [Sha256, Sha256];');
  }
  if (file === 'calibration-admission-blind-review-receipt.schema.json') {
    return generated.replace(
      'sealedDecisions: [unknown, unknown];',
      'sealedDecisions: [{ reviewerId: Id; decisionId: Sha256; peerDecisionVisibleBeforeSeal: false }, { reviewerId: Id; decisionId: Sha256; peerDecisionVisibleBeforeSeal: false }];',
    );
  }
  if (file === 'calibration-admission-adjudicator-assignment.schema.json'
    || file === 'calibration-admission-adjudicator-receipt.schema.json') {
    return generated.replace('priorDecisionIds: [unknown, unknown];', 'priorDecisionIds: [Sha256, Sha256];');
  }
  return generated;
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const files = readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith('.schema.json'));
  for (const file of files) {
    const schemaPath = join(SCHEMAS_DIR, file);
    const ts = await compileFromFile(schemaPath, {
      additionalProperties: false,
      cwd: SCHEMAS_DIR,
      $refOptions: {
        resolve: {
          external: true,
          http: false,
          'local-canonical-schema': localSchemaResolver,
        },
      },
      bannerComment: `// AUTO-GENERATED from ${file}. Do not hand-edit.`,
      style: { tabWidth: 2, printWidth: 100 },
    });
    const outName = file.replace('.schema.json', '.ts');
    const outPath = join(OUT_DIR, outName);
    writeFileSync(outPath, strengthenFixedTuples(file, ts), 'utf-8');
    console.log(`codegen: ${file} → src/generated/${outName}`);
  }
}

main().catch((err) => {
  console.error('codegen failed:', err);
  process.exit(1);
});
