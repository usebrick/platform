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
  // json-schema-to-typescript currently renders a `prefixItems` tuple with
  // `items: false` as `never[]`. Preserve the five canonical artifact shapes
  // in the generated public type while leaving the JSON Schema authoritative.
  if (file === 'calibration-admission-pre-witness-boundary.schema.json') {
    return generated.replace(
      'artifacts: never[];',
      'artifacts: [{ kind: "lineage_ledger"; relativePath: "static/lineage.json"; sha256: Sha256 }, { kind: "overlap_generation"; relativePath: "static/overlap.json"; sha256: Sha256 }, { kind: "privacy_ledger"; relativePath: "static/privacy.json"; sha256: Sha256 }, { kind: "quality_ledger"; relativePath: "static/quality.json"; sha256: Sha256 }, { kind: "record_stream"; relativePath: "static/records.jsonl"; sha256: Sha256 }];',
    );
  }
  if (file === 'calibration-admission-pre-witness-bundle.schema.json') {
    const withTuple = generated.replace(
      'witnessPolicies: never[];',
      'witnessPolicies: [AdmissionWitnessPolicyV1, AdmissionWitnessPolicyV1];',
    );
    const withArray = withTuple.replace(
      /  toolProfiles:[\s\S]*?;\n  \/\*\*\n   \* @maxItems 452382\n   \*\/\n  invocationIntents:/,
      '  toolProfiles: CalibrationAdmissionToolProfileV1[];\n  /**\n   * @maxItems 452382\n   *\/\n  invocationIntents:',
    );
    return `import type { AdmissionWitnessPolicyV1 } from './calibration-admission-witness-policy';\n${withArray}`;
  }
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
  if (file === 'calibration-admission-witness-review-receipt.schema.json') {
    return generated
      .replace('independentlyRegeneratedWitnessSha256s: [unknown, unknown];', 'independentlyRegeneratedWitnessSha256s: [Sha256, Sha256];')
      .replace('regenerationToolReceiptSha256s: [unknown, unknown];', 'regenerationToolReceiptSha256s: [Sha256, Sha256];')
      .replace('reviewerDecisionIds: [unknown, unknown];', 'reviewerDecisionIds: [Sha256, Sha256];');
  }
  if (file === 'calibration-admission-witness-review-bundle.schema.json') {
    const strengthened = generated
      .replace('regenerations: [unknown, unknown];', 'regenerations: [WitnessRegeneration, WitnessRegeneration];')
      .replace('regenerations: [Regeneration, Regeneration];', 'regenerations: [WitnessRegeneration, WitnessRegeneration];')
      .replace('reviewerDecisions: [unknown, unknown];', 'reviewerDecisions: [CalibrationAdmissionDecisionV103, CalibrationAdmissionDecisionV103];');
    return `import type { CalibrationAdmissionDecisionV103 } from './calibration-admission-decision';
${strengthened}
export interface WitnessRegeneration {
  invocationIntent: CalibrationAdmissionInvocationIntentV1;
  toolReceipt: CalibrationAdmissionToolReceiptV1;
  witnessSha256: Sha256;
}
`;
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
