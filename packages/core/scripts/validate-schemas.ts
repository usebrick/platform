import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const schemaDir = join(root, 'schemas', 'v1');
const fixtureRoot = join(root, 'tests', 'fixtures', 'schema');

const schemaFiles = readdirSync(schemaDir).filter((file) => file.endsWith('.schema.json'));
const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validators = new Map<string, ReturnType<Ajv['compile']>>();

const loadedSchemas = schemaFiles.map((file) => ({
  file,
  schema: JSON.parse(readFileSync(join(schemaDir, file), 'utf8')) as object,
}));
// Register the complete schema set before compiling so additive contracts can
// reference another versioned Core schema by its canonical $id.
for (const { schema } of loadedSchemas) ajv.addSchema(schema);
for (const { file, schema } of loadedSchemas) {
  const id = (schema as { $id?: string }).$id;
  const validator = id ? ajv.getSchema(id) : undefined;
  if (!validator) throw new Error(`Schema ${file} did not register a validator`);
  validators.set(file.replace('.schema.json', ''), validator);
}

function validateDirectory(directory: string, expected: boolean): void {
  for (const file of readdirSync(directory).filter((entry) => entry.endsWith('.json'))) {
    const match = /^(inventory|constitution|health|structure|calibration-corpus-manifest|calibration-run-manifest|calibration-checkout-map|calibration-observation|calibration-failure|calibration-coverage|calibration-admission-policy|calibration-admission-witness-policy|calibration-admission-tool-profile|calibration-admission-invocation-intent|calibration-admission-tool-receipt|calibration-admission-tool-authority-index|calibration-admission-tool-authority-snapshot|calibration-tool-authority-publication-lock|calibration-tool-authority-publication-transaction|calibration-nested-publication-handoff|calibration-admission-evidence-index|calibration-admission-evidence-payload|calibration-admission-evidence-payload-set|calibration-admission-evidence-receipt|calibration-admission-evidence-bundle|calibration-approved-evidence-acquisition|calibration-evidence-acquisition-reservation|calibration-evidence-acquisition-receipt|calibration-evidence-acquisition-envelope|calibration-evidence-cas-primary-completion|calibration-admission-evidence-cas-transaction|calibration-admission-materialization-receipt|calibration-admission-acquisition-index|calibration-admission-acquisition-snapshot|calibration-acquisition-publication-proposal|calibration-acquisition-publication-lock|calibration-acquisition-publication-transaction|calibration-acquisition-round-authorization|calibration-approved-acquisition|calibration-acquisition-receipt|calibration-acquisition-round-receipt|calibration-acquisition-round-lock|calibration-acquisition-round-transaction|calibration-admission-source-register|calibration-source-review|calibration-admission-register-delta|calibration-register-generation-receipt|calibration-register-generation-lock|calibration-register-generation-transaction|calibration-admission-artifact-receipt|calibration-admission-source-generation-proposal|calibration-admission-source-generation-approval|calibration-admission-source-generation|calibration-admission-source-current|calibration-admission-record|calibration-admission-record-stream|calibration-admission-decision|calibration-admission-review-sample|calibration-admission-decision-ledger|calibration-admission-blind-assignment|calibration-admission-blind-review-receipt|calibration-admission-adjudicator-assignment|calibration-admission-adjudicator-receipt|calibration-historical-temporal-attestation|calibration-admission-privacy-result|calibration-admission-privacy-ledger|calibration-admission-quality-ledger|calibration-admission-lineage-ledger|calibration-admission-normalizer-registry|calibration-admission-overlap-universe-record|calibration-admission-overlap-universe|calibration-admission-overlap-policy)\./.exec(file);
    // Keep the legacy fixture allow-list readable while explicitly admitting
    // the overlap artifact contracts introduced after the original list.
    const overlapArtifactMatch = /^(calibration-admission-(?:bounded-shard-receipt|overlap-checkpoint|overlap-index-receipt|overlap-resource-receipt|overlap-edge-row|overlap-adjacency-row|overlap-cluster-summary-row|overlap-cluster-membership-row|overlap-ledger|overlap-generation|overlap-current|overlap-publication-lock|overlap-publication-transaction))\./.exec(file);
    const schemaMatch = match ?? overlapArtifactMatch;
    if (!schemaMatch) throw new Error(`Fixture ${file} does not identify a schema`);
    const validate = validators.get(schemaMatch[1]);
    if (!validate) throw new Error(`No schema loaded for ${schemaMatch[1]}`);
    const data = JSON.parse(readFileSync(join(directory, file), 'utf8')) as unknown;
    const valid = validate(data);
    if (valid !== expected) {
      throw new Error(`${file}: expected valid=${expected}; errors=${JSON.stringify(validate.errors)}`);
    }
  }
}

validateDirectory(join(fixtureRoot, 'valid'), true);
validateDirectory(join(fixtureRoot, 'invalid'), false);
console.log('Schema fixtures validated successfully.');
