/**
 * v0.14.5+: Verify the generated types are fresh. Re-runs codegen and
 * checks tracked, staged, and untracked schema/generated paths against the
 * complete schema/type peer set. Fails CI if any part of the contract is
 * uncommitted or a generated peer is missing/orphaned.
 */
import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { findSchemaGenerationGaps, mergeCodegenChangePaths } from './codegen-status';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');

function gitNames(command: string): string[] {
  const output = execSync(command, {
    cwd: packageRoot,
    encoding: 'utf-8',
  });
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

try {
  execSync('pnpm codegen', { cwd: packageRoot, stdio: 'inherit' });
  const generatedChanges = mergeCodegenChangePaths(
    gitNames('git diff --name-only -- src/generated/'),
    gitNames('git diff --cached --name-only -- src/generated/'),
    gitNames('git ls-files --others --exclude-standard -- src/generated/'),
  );
  const schemaChanges = mergeCodegenChangePaths(
    gitNames('git diff --name-only -- schemas/v1/'),
    gitNames('git diff --cached --name-only -- schemas/v1/'),
    gitNames('git ls-files --others --exclude-standard -- schemas/v1/'),
  );
  const schemaDir = resolve(packageRoot, 'schemas', 'v1');
  const generatedDir = resolve(packageRoot, 'src', 'generated');
  const gaps = findSchemaGenerationGaps(
    readdirSync(schemaDir).filter((name) => name.endsWith('.schema.json')),
    readdirSync(generatedDir).filter((name) => name.endsWith('.ts')),
  );
  if (generatedChanges.length || schemaChanges.length || gaps.missing.length || gaps.orphaned.length) {
    console.error('codegen is not clean. Run `pnpm codegen`, review every schema/type pair, and commit the complete set.');
    if (schemaChanges.length) console.error('Changed schema files:', schemaChanges.join('\n'));
    if (generatedChanges.length) console.error('Changed generated files:', generatedChanges.join('\n'));
    if (gaps.missing.length) console.error('Missing generated peers:', gaps.missing.join(', '));
    if (gaps.orphaned.length) console.error('Orphan generated peers:', gaps.orphaned.join(', '));
    process.exit(1);
  }
  console.log('codegen is fresh');
} catch (err) {
  console.error('verify-codegen-fresh failed:', err);
  process.exit(1);
}
