#!/usr/bin/env node
// Update packages/website/src/data/version.json so the website
// tracks the latest published slopbrick version. Called by
// `pnpm version-packages` (and the GitHub release workflow via
// changesets/action) right after `changeset version` bumps the
// version, so the two stay in lock-step without a human step.
//
// Why a custom script: the website reads its "what version is
// this?" string from a JSON file in src/data/ (consumed by the
// homepage hero + the docs landing page). changesets only
// knows how to bump package.json + CHANGELOG; it doesn't know
// about this file, so we hook it in via the `version-packages`
// wrapper script in the root package.json.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const slopbrickPkg = JSON.parse(
  readFileSync(join(root, 'packages/slopbrick/package.json'), 'utf-8'),
);
const versionFile = join(root, 'packages/website/src/data/version.json');
const data = JSON.parse(readFileSync(versionFile, 'utf-8'));

const prev = data.slopbrick;
data.slopbrick = slopbrickPkg.version;
data.built = new Date().toISOString().slice(0, 10);

writeFileSync(versionFile, JSON.stringify(data, null, 2) + '\n');
console.log(
  `synced website version.json: slopbrick ${prev} -> ${data.slopbrick} (built ${data.built})`,
);
