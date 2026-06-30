/**
 * v0.18.2: single source of truth for the corpus directory layout.
 *
 * The corpus lives on disk at `CORPUS_ROOT` (default
 * `/Users/cheng/corpus-expansion`, override via the
 * `SLOPBRICK_CORPUS_DIR` env var for forks, CI runners, or
 * read-only mirrors). All TS code (CLI defaults, integration
 * tests, scripts) MUST import the derived paths from here
 * instead of hardcoding `/Users/cheng/corpus-expansion/...` —
 * the hardcoded-string pattern is the bug class that caused
 * the v0.18.2 PR-1j sweep (the corpus was renamed from
 * `ai-slop-baseline/` to `corpus-expansion/` and ~7 files
 * had stale references).
 *
 * Python scripts in `scripts/` mirror this constant as
 * `CORPUS_ROOT = Path(os.environ.get('SLOPBRICK_CORPUS_DIR',
 * '/Users/cheng/corpus-expansion'))` (search-and-replace
 * version of the same idea). If you change the default here,
 * change it in the Python scripts too.
 */
import { join } from 'node:path';

export const CORPUS_ROOT =
  process.env['SLOPBRICK_CORPUS_DIR'] ?? '/Users/cheng/corpus-expansion';

/** AI-generated / AI-assisted code (positive class). */
export const POSITIVE_DIR = join(CORPUS_ROOT, 'positive');

/** Human-written production code (negative class). */
export const NEGATIVE_DIR = join(CORPUS_ROOT, 'negative');

/** Pre-computed file lists (regenerate with
 *  `corpus-expansion/build-filelists-v2.sh`). */
export const FILELISTS_DIR = join(CORPUS_ROOT, 'filelists');

/** Common helper: derive `<root>/<sub>/<filename>` for a
 *  filelists entry. Used by tests and scripts. */
export const filelistPath = (name: string): string =>
  join(FILELISTS_DIR, name);
