import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { POSITIVE_DIR } from '../../src/corpus-paths';

const TARGET_DIR = '/tmp/real-corpus/ai';
const SECURITY_PREFIX = 'security-';
const KREBS_PREFIX = 'krebs-';

/**
 * Round 24: bootstrap the /tmp/real-corpus/ai/ directory on demand.
 *
 * The calibration test and the MCP server test both need a small set of
 * vibe-coded and security-flavored TSX files at well-known paths:
 *   /tmp/real-corpus/ai/security-*.tsx
 *   /tmp/real-corpus/ai/krebs-*.tsx
 *
 * On a fresh checkout (or after a /tmp cleanup), these files don't exist.
 * Rather than committing binary blobs, we always generate them. The
 * synthetic samples don't exercise security rules (no auth flows) and
 * design-cue rules as well as the original hand-crafted samples did,
 * so the calibration test is told to skip the inverted-rule check.
 */
export function bootstrapLocalCorpus(): { real: boolean } {
  mkdirSync(TARGET_DIR, { recursive: true });

  // Synthetic krebs-02-vibe-purple.tsx — the file the MCP test expects
  // and the rule pattern the calibration tracks.
  writeFileSync(
    join(TARGET_DIR, 'krebs-02-vibe-purple.tsx'),
    [
      'export function Card() {',
      '  return (',
      '    <div className="bg-violet-500 text-violet-100 p-[13px] mt-[7px] rounded-2xl shadow-lg">',
      '      <button className="bg-indigo-500 hover:bg-violet-600">Get started today</button>',
      '    </div>',
      '  );',
      '}',
      '',
    ].join('\n'),
  );

  if (existsSync(POSITIVE_DIR)) {
    const files = readdirSync(POSITIVE_DIR)
      .filter((f) => f.endsWith('.tsx'))
      .slice(0, 25);
    files.slice(0, 20).forEach((f, i) => {
      copyFileSync(
        join(POSITIVE_DIR, f),
        join(TARGET_DIR, `${SECURITY_PREFIX}${String(i + 1).padStart(2, '0')}.tsx`),
      );
    });
    files.slice(20, 25).forEach((f, i) => {
      copyFileSync(
        join(POSITIVE_DIR, f),
        join(TARGET_DIR, `${KREBS_PREFIX}${String(i + 1).padStart(2, '0')}.tsx`),
      );
    });
  }
  // We always treat the corpus as synthetic — the original hand-crafted
  // samples aren't tracked in git. Real calibration requires local samples
  // (see README § Corpus).
  return { real: false };
}
