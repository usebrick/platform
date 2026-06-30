// Set the version env var so _header.ts's VERSION constant
// matches package.json during vitest runs (tsup's define only
// runs at build time).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'),
) as { version: string };
process.env.SLOPBRICK_VERSION = pkg.version;
