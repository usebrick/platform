/**
 * v0.14.5+: Verify the generated types are fresh. Re-runs codegen and
 * `git diff`s against the committed versions. Fails CI if there's an
 * uncommitted diff (meaning a schema changed but the types weren't
 * regenerated).
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  execSync('pnpm codegen', { cwd: resolve(__dirname, '..'), stdio: 'inherit' });
  const diff = execSync('git diff --name-only src/generated/', {
    cwd: resolve(__dirname, '..'),
    encoding: 'utf-8',
  }).trim();
  if (diff) {
    console.error('codegen produced uncommitted changes. Run \`pnpm codegen\` and commit.');
    console.error('Changed files:', diff);
    process.exit(1);
  }
  console.log('codegen is fresh');
} catch (err) {
  console.error('verify-codegen-fresh failed:', err);
  process.exit(1);
}