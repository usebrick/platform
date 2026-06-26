// Styling solution detection.
//
//   detectStylingSolution — inspect package.json + tailwind config
//                            files + .module.{css,scss,sass,less}
//                            matches and return one of the supported
//                            StylingSolution values.
//
// Detection order:
//   1. Check known package names (tailwindcss, @pandacss/dev, etc.)
//   2. Look for tailwind.config.{js,mjs,cjs,ts} at project root
//   3. Walk project root for any *.module.{css,scss,sass,less} file
//   4. Default to 'other'
//
// Called from ../init.ts (runInitWizard uses it to pre-fill the
// prompt's default selection) and from ../program.ts (init action
// reports the detected styling in the post-init summary).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { StylingSolution } from '../defaults';

const STYLING_DETECTION: Record<StylingSolution, string[]> = {
  tailwind: ['tailwindcss'],
  panda: ['@pandacss/dev'],
  'styled-components': ['styled-components'],
  emotion: ['@emotion/react', '@emotion/styled'],
  'css-modules': [],
  other: [],
};

export function detectStylingSolution(cwd: string): StylingSolution {
  const pkgPath = join(cwd, 'package.json');
  let deps: Record<string, unknown> = {};
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      deps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
      };
    } catch {
      // ignore malformed package.json
    }
  }
  const names = Object.keys(deps).map((name) => name.toLowerCase());

  for (const [solution, signals] of Object.entries(STYLING_DETECTION)) {
    for (const signal of signals) {
      if (names.includes(signal.toLowerCase())) {
        return solution as StylingSolution;
      }
    }
  }

  const tailwindConfigFiles = [
    'tailwind.config.js',
    'tailwind.config.mjs',
    'tailwind.config.cjs',
    'tailwind.config.ts',
  ];
  if (tailwindConfigFiles.some((name) => existsSync(join(resolve(cwd), name)))) {
    return 'tailwind';
  }

  try {
    for (const entry of readdirSync(cwd)) {
      const resolved = join(cwd, entry);
      if (!statSync(resolved).isDirectory()) {
        if (/\.module\.(css|scss|sass|less)$/i.test(entry)) {
          return 'css-modules';
        }
        continue;
      }
      for (const child of readdirSync(resolved)) {
        if (/\.module\.(css|scss|sass|less)$/i.test(child)) {
          return 'css-modules';
        }
      }
    }
  } catch {
    // ignore unreadable directories
  }

  return 'other';
}