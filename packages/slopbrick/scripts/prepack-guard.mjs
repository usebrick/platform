#!/usr/bin/env node
// prepack guard — refuses to pack a tarball with workspace:* deps,
// which npm cannot install. Catches the v0.11.1 bug where
// "@usebrick/core": "workspace:*" leaked into the published tarball,
// making `npm install slopbrick@0.11.1` fail with EUNSUPPORTEDPROTOCOL.
//
// Run via `pnpm prepack` (auto-invoked by `npm pack` / `pnpm pack`).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(here, '..', 'package.json');

let pkg;
try {
  pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
} catch (err) {
  console.error('\n❌ prepack guard: failed to parse package.json.');
  console.error('   path:', pkgPath);
  console.error('   error:', err.message);
  console.error('\nFix: run `node -e "JSON.parse(require(\'fs\').readFileSync(\'package.json\', \'utf8\'))"`');
  console.error('   to see the exact parse error, then fix the syntax.');
  process.exit(2);
}

const fields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const offenders = [];

for (const field of fields) {
  const deps = pkg[field] ?? {};
  for (const [name, range] of Object.entries(deps)) {
    if (typeof range === 'string' && range.startsWith('workspace:')) {
      offenders.push(`${field}.${name} = "${range}"`);
    }
  }
}

if (offenders.length > 0) {
  console.error('\n❌ prepack guard: workspace:* deps are not publishable.\n');
  console.error('npm cannot resolve "workspace:*" — it is a pnpm-only protocol.');
  console.error('Publishing this package would break `npm install slopbrick` for');
  console.error('every user (we hit this in v0.11.1).\n');
  console.error('Offending entries:');
  for (const o of offenders) console.error('  - ' + o);
  console.error('\nFix:');
  console.error('  1. Add the package to `tsup.config.ts` → `noExternal` so tsup');
  console.error('     bundles it into dist/.');
  console.error('  2. Remove the workspace:* entry from package.json.\n');
  process.exit(1);
}

console.log('✓ prepack guard: no workspace:* deps in package.json.');
