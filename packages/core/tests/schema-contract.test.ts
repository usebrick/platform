import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = fileURLToPath(new URL('..', import.meta.url));
const schemaDir = join(root, 'schemas', 'v1');
const index = JSON.parse(readFileSync(join(schemaDir, 'index.json'), 'utf8')) as {
  schemas: Record<string, { $id: string; file: string }>;
};

describe('schema contract and package delivery', () => {
  it('indexes every canonical schema at the exact on-disk path and id', () => {
    const expected = [
      'inventory',
      'constitution',
      'health',
      'structure',
      'calibration-corpus-manifest',
      'calibration-run-manifest',
      'calibration-checkout-map',
      'calibration-observation',
      'calibration-failure',
      'calibration-coverage',
      'calibration-admission-policy',
      'calibration-admission-normalizer-registry',
      'calibration-admission-overlap-universe-record',
      'calibration-admission-overlap-universe',
      'calibration-admission-overlap-policy',
      'calibration-admission-bounded-shard-receipt',
      'calibration-admission-overlap-checkpoint',
      'calibration-admission-overlap-current',
      'calibration-admission-overlap-generation',
      'calibration-admission-overlap-index-receipt',
      'calibration-admission-overlap-resource-receipt',
      'calibration-admission-overlap-publication-lock',
      'calibration-admission-overlap-publication-transaction',
      'calibration-admission-overlap-edge-row',
      'calibration-admission-overlap-adjacency-row',
      'calibration-admission-overlap-cluster-summary-row',
      'calibration-admission-overlap-cluster-membership-row',
      'calibration-admission-overlap-ledger',
      'calibration-admission-witness-policy',
      'calibration-admission-tool-profile',
      'calibration-admission-invocation-intent',
      'calibration-admission-tool-receipt',
      'calibration-admission-tool-authority-index',
      'calibration-admission-tool-authority-snapshot',
      'calibration-tool-authority-publication-lock',
      'calibration-tool-authority-publication-transaction',
      'calibration-nested-publication-handoff',
      'calibration-admission-evidence-index',
      'calibration-admission-evidence-payload',
      'calibration-admission-evidence-payload-set',
      'calibration-admission-evidence-receipt',
      'calibration-admission-evidence-bundle',
      'calibration-approved-evidence-acquisition',
      'calibration-evidence-acquisition-reservation',
      'calibration-evidence-acquisition-receipt',
      'calibration-evidence-acquisition-envelope',
      'calibration-evidence-cas-primary-completion',
      'calibration-admission-evidence-cas-transaction',
      'calibration-admission-materialization-receipt',
      'calibration-admission-source-register',
      'calibration-admission-acquisition-index',
      'calibration-admission-acquisition-snapshot',
      'calibration-acquisition-publication-proposal',
      'calibration-acquisition-publication-lock',
      'calibration-acquisition-publication-transaction',
      'calibration-acquisition-round-authorization',
      'calibration-approved-acquisition',
      'calibration-acquisition-receipt',
      'calibration-acquisition-round-receipt',
      'calibration-acquisition-round-lock',
      'calibration-acquisition-round-transaction',
      'calibration-source-review',
      'calibration-admission-register-delta',
      'calibration-register-generation-receipt',
      'calibration-register-generation-lock',
      'calibration-register-generation-transaction',
      'calibration-admission-artifact-receipt',
      'calibration-admission-source-generation-proposal',
      'calibration-admission-source-generation-approval',
      'calibration-admission-source-generation',
      'calibration-admission-source-current',
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
      'calibration-admission-privacy-result',
      'calibration-admission-privacy-ledger',
      'calibration-admission-quality-ledger',
      'calibration-admission-lineage-ledger',
    ];
    expect(Object.keys(index.schemas).sort()).toEqual(expected.sort());

    for (const [name, entry] of Object.entries(index.schemas)) {
      expect(entry.file).toBe(`${name}.schema.json`);
      const schema = JSON.parse(readFileSync(join(schemaDir, entry.file), 'utf8')) as { $id?: string };
      expect(schema.$id).toBe(entry.$id);
    }
  });

  it('keeps the structure JSON projection distinct from structure.md', () => {
    const schema = JSON.parse(
      readFileSync(join(schemaDir, 'structure.schema.json'), 'utf8'),
    ) as { description?: string };
    expect(schema.description).toContain('structured JSON projection');
    expect(schema.description).toContain('derived');
    expect(schema.description).toContain('structure.md');
    const index = JSON.parse(readFileSync(join(schemaDir, 'index.json'), 'utf8')) as {
      schemas: { structure: { description: string } };
    };
    expect(index.schemas.structure.description.toLowerCase()).toContain('structured json projection');
    expect(index.schemas.structure.description).toContain('derived Markdown');
  });

  it('validates the canonical structure projection fixture', () => {
    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    const schema = JSON.parse(
      readFileSync(join(schemaDir, 'structure.schema.json'), 'utf8'),
    ) as object;
    const validate = ajv.compile(schema);
    const fixture = JSON.parse(
      readFileSync(join(root, 'tests/fixtures/schema/valid/structure.valid.json'), 'utf8'),
    ) as unknown;
    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
  });

  it('keeps health.json score-bearing and separate from the empty scan envelope', () => {
    const ajv = new Ajv({ allErrors: true, strict: true });
    addFormats(ajv);
    const schema = JSON.parse(
      readFileSync(join(schemaDir, 'health.schema.json'), 'utf8'),
    ) as object;
    const validate = ajv.compile(schema);
    const valid = JSON.parse(
      readFileSync(join(root, 'tests/fixtures/schema/valid/health.valid.json'), 'utf8'),
    ) as unknown;
    expect(validate(valid), JSON.stringify(validate.errors)).toBe(true);

    const scoreFreeEmptyEnvelope = {
      version: '5',
      generatedAt: '2026-07-09T00:00:00.000Z',
      workspace: '/tmp/project',
      completionStatus: 'empty',
      scoreValidity: 'not-applicable',
      issueCounts: { high: 0, medium: 0, low: 0 },
    };
    expect(validate(scoreFreeEmptyEnvelope)).toBe(false);
  });

  it('compiles the closed calibration coverage schema under strict AJV', () => {
    const ajv = new Ajv({ allErrors: true, strict: true });
    const schema = JSON.parse(readFileSync(join(schemaDir, 'calibration-coverage.schema.json'), 'utf8')) as object;
    const validate = ajv.compile(schema);
    const valid = JSON.parse(readFileSync(join(root, 'tests/fixtures/schema/valid/calibration-coverage.valid.json'), 'utf8')) as unknown;
    const invalid = JSON.parse(readFileSync(join(root, 'tests/fixtures/schema/invalid/calibration-coverage.invalid.json'), 'utf8')) as unknown;
    expect(validate(valid), JSON.stringify(validate.errors)).toBe(true);
    expect(validate(invalid)).toBe(false);
  });

  it('ships schemas through the package files declaration', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      files?: string[];
    };
    expect(pkg.files).toContain('schemas');
  });
});
