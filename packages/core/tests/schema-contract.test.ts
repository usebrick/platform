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
    const expected = ['inventory', 'constitution', 'health', 'structure'];
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

  it('ships schemas through the package files declaration', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      files?: string[];
    };
    expect(pkg.files).toContain('schemas');
  });
});
