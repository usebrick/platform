/**
 * v0.18.4 (Phase B R-M2): types split.
 * Module: _header
 *
 * VERSION constant — read from package.json at runtime so a release
 * version bump propagates without a separate code change here. The
 * build's noExternal rule inlines this at compile time, so the
 * value is baked in.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

export const VERSION = pkg.version;
