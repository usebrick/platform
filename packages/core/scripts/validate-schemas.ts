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
    const schemaName = [...validators.keys()]
      .sort((left, right) => right.length - left.length)
      .find((name) => file.startsWith(`${name}.`));
    if (!schemaName) throw new Error(`Fixture ${file} does not identify a loaded schema`);
    const validate = validators.get(schemaName);
    if (!validate) throw new Error(`Fixture ${file} does not identify a loaded schema`);
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
