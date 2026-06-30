/**
 * v0.18.4 (Phase B R-M2): types split.
 * Module: _header
 *
 * VERSION constant — read from package.json at runtime so a release
 * version bump propagates without a separate code change here. The
 * build's `define` rule inlines this at compile time, so the
 * value is baked in.
 *
 * The literal `process.env.SLOPBRICK_VERSION` is replaced by
 * tsup's esbuild `define` at build time, using the version field
 * from this package's package.json. No runtime file I/O, so the
 * dist/ bundle stays self-contained and the path-relative
 * `require('../package.json')` trick (which breaks after bundling)
 * is no longer needed.
 */

declare const process: { env: Record<string, string | undefined> };

// tsup replaces `process.env.SLOPBRICK_VERSION` at build time.
// Falls back to '0.0.0' in unbuilt source (vitest, dev runs) so
// VERSION is always a string.
export const VERSION: string = process.env.SLOPBRICK_VERSION ?? '0.0.0';
