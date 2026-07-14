import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = fileURLToPath(new URL('..', import.meta.url));
const schemaDir = join(root, 'schemas', 'v1');

const task1BSchemas = [
  'calibration-admission-source-register',
  'calibration-source-review',
  'calibration-admission-artifact-receipt',
  'calibration-admission-source-generation-proposal',
  'calibration-admission-source-generation-approval',
  'calibration-admission-source-generation',
  'calibration-admission-source-current',
  'calibration-acquisition-round-authorization',
  'calibration-approved-acquisition',
  'calibration-acquisition-receipt',
  'calibration-acquisition-round-receipt',
  'calibration-acquisition-round-lock',
  'calibration-acquisition-round-transaction',
  'calibration-admission-record',
  'calibration-admission-record-stream',
  'calibration-admission-decision',
  'calibration-admission-review-sample',
  'calibration-admission-decision-ledger',
  'calibration-admission-blind-assignment',
  'calibration-admission-blind-review-receipt',
  'calibration-admission-adjudicator-assignment',
  'calibration-admission-adjudicator-receipt',
  'calibration-historical-temporal-attestation',
] as const;

describe('v10.3 Task 1B schema contracts', () => {
  it('compiles every schema under strict AJV and rejects empty objects', () => {
    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    const schemas = [
      JSON.parse(readFileSync(join(schemaDir, 'calibration-corpus-manifest.schema.json'), 'utf8')) as object,
      JSON.parse(readFileSync(join(schemaDir, 'calibration-admission-tool-authority-snapshot.schema.json'), 'utf8')) as object,
      ...task1BSchemas.map((name) => JSON.parse(readFileSync(join(schemaDir, `${name}.schema.json`), 'utf8')) as object),
    ];
    for (const schema of schemas) ajv.addSchema(schema);
    for (const name of task1BSchemas) {
      const validate = ajv.getSchema(`https://usebrick.dev/schemas/v1/${name}.schema.json`);
      expect(validate, `${name} must be registered`).toBeDefined();
      expect(validate!({}), `${name} must reject an empty object`).toBe(false);
      // These fixtures prove the JSON-Schema boundary only. In particular,
      // the source-register fixture is a minimal schema-valid shape; the
      // exact 329-entry semantic register/review proof lives in the focused
      // admission-review contract, with a semantic-invalid companion fixture.
      const valid = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'schema', 'valid', `${name}.valid.json`), 'utf8')) as unknown;
      expect(validate!(valid), `${name} valid fixture: ${JSON.stringify(validate!.errors)}`).toBe(true);
      const invalid = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'schema', 'invalid', `${name}.invalid.json`), 'utf8')) as unknown;
      expect(validate!(invalid), `${name} invalid fixture must fail`).toBe(false);
      expect(invalid).toEqual({});
    }
    expect(readdirSync(join(root, 'tests', 'fixtures', 'schema', 'invalid'))).toEqual(expect.arrayContaining(task1BSchemas.map((name) => `${name}.invalid.json`)));
  });
});
