/* ============================================================
   prebuild — read the slopbrick + core package.json files
   and write src/data/version.json so the Footer can show the
   live version. Runs automatically before `astro build` via
   the `prebuild` script in package.json.
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readVersion(pkgPath: string): string {
  try {
    const data = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return data.version || '0.0.0';
  } catch (err) {
    console.warn(`prebuild: could not read ${pkgPath}, using 0.0.0`);
    return '0.0.0';
  }
}

const slopbrick = readVersion(join(root, '..', 'slopbrick', 'package.json'));
const core = readVersion(join(root, '..', 'core', 'package.json'));

const data = {
  slopbrick,
  core,
  built: new Date().toISOString().slice(0, 10),
};

const outDir = join(root, 'src', 'data');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'version.json');
writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n');

console.log(`prebuild: wrote ${outPath} (slopbrick=${slopbrick}, core=${core})`);
