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

for (const file of schemaFiles) {
  const schema = JSON.parse(readFileSync(join(schemaDir, file), 'utf8')) as object;
  validators.set(file.replace('.schema.json', ''), ajv.compile(schema));
}

function validateDirectory(directory: string, expected: boolean): void {
  for (const file of readdirSync(directory).filter((entry) => entry.endsWith('.json'))) {
    const match = /^(inventory|constitution|health|structure|calibration-corpus-manifest)\./.exec(file);
    if (!match) throw new Error(`Fixture ${file} does not identify a schema`);
    const validate = validators.get(match[1]);
    if (!validate) throw new Error(`No schema loaded for ${match[1]}`);
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
