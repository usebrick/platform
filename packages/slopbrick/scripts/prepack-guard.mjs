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
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const fields = ['dependencies', 'peerDependencies', 'optionalDependencies'];
const offenders = [];
const devOffenders = [];

for (const field of fields) {
  const deps = pkg[field] ?? {};
  for (const [name, range] of Object.entries(deps)) {
    if (typeof range === 'string' && range.startsWith('workspace:')) {
      offenders.push(`${field}.${name} = "${range}"`);
    }
  }
}

// devDependencies are NOT installed by end users (npm skips them by default),
// so workspace:* is allowed there. The build still installs them locally via
// pnpm so tsup's `noExternal` can bundle them. Only fail on devDep workspace:*
// if the build manifest explicitly opts into shipping devDeps to npm.
for (const [name, range] of Object.entries(pkg.devDependencies ?? {})) {
  if (typeof range === 'string' && range.startsWith('workspace:')) {
    devOffenders.push(`devDependencies.${name} = "${range}"`);
  }
}

if (devOffenders.length > 0) {
  console.log('ℹ️  devDependencies with workspace:* (allowed — not published):');
  for (const o of devOffenders) console.log('  - ' + o);
  console.log();
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
