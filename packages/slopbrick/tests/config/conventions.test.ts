import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  detectConstitution,
  resolveConstitution,
  formatConstitution,
  matchForbidden,
  type Constitution,
} from '../../src/config/conventions';

function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'slopbrick-conv-'));
}

function writePackageJson(dir: string, deps: Record<string, string>, devDeps: Record<string, string> = {}): void {
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'test', dependencies: deps, devDependencies: devDeps }, null, 2),
    'utf-8',
  );
}

describe('detectConstitution', () => {
  it('returns an empty object when no package.json is present', () => {
    const dir = freshDir();
    try {
      expect(detectConstitution(dir)).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty object when package.json is malformed', () => {
    const dir = freshDir();
    try {
      writeFileSync(join(dir, 'package.json'), '{ this is not json', 'utf-8');
      expect(detectConstitution(dir)).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects Zustand as stateManagement', () => {
    const dir = freshDir();
    try {
      writePackageJson(dir, { zustand: '^4.0.0' });
      expect(detectConstitution(dir)).toEqual({ stateManagement: ['zustand'] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('canonicalizes redux-toolkit and react-redux to the same signal', () => {
    const dir = freshDir();
    try {
      writePackageJson(dir, {
        '@reduxjs/toolkit': '^2.0.0',
        'react-redux': '^9.0.0',
      });
      expect(detectConstitution(dir)).toEqual({ stateManagement: ['redux'] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects react-query from @tanstack/react-query', () => {
    const dir = freshDir();
    try {
      writePackageJson(dir, { '@tanstack/react-query': '^5.0.0' });
      expect(detectConstitution(dir)).toEqual({ dataFetching: ['react-query'] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects shadcn/ui from the components/ui + cva + tailwind trio', () => {
    const dir = freshDir();
    try {
      writePackageJson(
        dir,
        { tailwindcss: '^3.0.0', 'class-variance-authority': '^0.7.0' },
        {},
      );
      mkdirSync(join(dir, 'components/ui'), { recursive: true });
      const c = detectConstitution(dir);
      expect(c.uiLibrary).toContain('shadcn');
      expect(c.styling).toContain('tailwind');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not detect shadcn without all three signals', () => {
    const dir = freshDir();
    try {
      // tailwind only — missing cva + components/ui
      writePackageJson(dir, { tailwindcss: '^3.0.0' });
      const c = detectConstitution(dir);
      expect(c.uiLibrary ?? []).not.toContain('shadcn');
      expect(c.styling).toContain('tailwind');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects constitution entries from devDependencies', () => {
    const dir = freshDir();
    try {
      writePackageJson(dir, {}, { zod: '^3.0.0' });
      expect(detectConstitution(dir)).toEqual({ forms: ['zod'] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects constitution entries across multiple categories simultaneously', () => {
    const dir = freshDir();
    try {
      writePackageJson(dir, {
        zustand: '^4.0.0',
        '@tanstack/react-query': '^5.0.0',
        'react-hook-form': '^7.0.0',
        'next': '^14.0.0',
        'tailwindcss': '^3.0.0',
      });
      const c = detectConstitution(dir);
      expect(c).toEqual({
        stateManagement: ['zustand'],
        dataFetching: ['react-query'],
        forms: ['react-hook-form'],
        routing: ['next'],
        styling: ['tailwind'],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('resolveConstitution', () => {
  const detected: Constitution = {
    stateManagement: ['zustand'],
    dataFetching: ['react-query'],
  };

  it('returns detected when user is undefined', () => {
    const merged = resolveConstitution(undefined, detected);
    expect(merged).toEqual(detected);
  });

  it('returns undefined when both user and detected are empty', () => {
    expect(resolveConstitution(undefined, {})).toBeUndefined();
    expect(resolveConstitution({}, {})).toBeUndefined();
  });

  it('user declarations override detected', () => {
    const merged = resolveConstitution(
      { stateManagement: ['redux'] },
      detected,
    );
    expect(merged?.stateManagement).toEqual(['redux']);
    expect(merged?.dataFetching).toEqual(['react-query']);
  });

  it('explicit empty array is preserved (declaration of "none")', () => {
    const merged = resolveConstitution({ stateManagement: [] }, detected);
    expect(merged?.stateManagement).toEqual([]);
    expect(merged?.dataFetching).toEqual(['react-query']);
  });

  it('preserves user custom field even when no detected data exists', () => {
    const merged = resolveConstitution(
      { custom: { api: ['fetch-wrapper'] } },
      {},
    );
    expect(merged?.custom).toEqual({ api: ['fetch-wrapper'] });
  });

  it('strips fields that resolved to undefined', () => {
    const merged = resolveConstitution({ routing: ['next'] }, {});
    expect(merged).toEqual({ routing: ['next'] });
    expect(merged).not.toHaveProperty('stateManagement');
  });
});

describe('formatConstitution', () => {
  it('reports none when constitution is undefined', () => {
    expect(formatConstitution(undefined)).toContain('none');
  });

  it('renders each detected category on its own line', () => {
    const out = formatConstitution({
      stateManagement: ['zustand'],
      dataFetching: ['react-query'],
    });
    expect(out).toContain('stateManagement: zustand');
    expect(out).toContain('dataFetching: react-query');
  });

  it('renders custom fields under custom. namespace', () => {
    const out = formatConstitution({
      custom: { api: ['fetch-wrapper', 'useApi'] },
    });
    expect(out).toContain('custom.api: fetch-wrapper, useApi');
  });

  it('renders the forbidden deny-list when present', () => {
    const out = formatConstitution({
      stateManagement: ['zustand'],
      forbidden: ['moment', '@types/'],
    });
    expect(out).toContain('forbidden: moment, @types/');
  });
});

describe('matchForbidden', () => {
  it('returns null when forbidden is undefined', () => {
    expect(matchForbidden('moment', undefined)).toBeNull();
  });

  it('returns null when forbidden is empty', () => {
    expect(matchForbidden('moment', [])).toBeNull();
  });

  it('returns the matched entry on exact bare-specifier match', () => {
    expect(matchForbidden('moment', ['moment'])).toBe('moment');
  });

  it('does not partial-match unrelated sibling packages', () => {
    // 'moment-timezone' is NOT a match for forbidden entry 'moment'
    // (the next char is '-' not '/' or end-of-string)
    expect(matchForbidden('moment-timezone', ['moment'])).toBeNull();
  });

  it('matches scoped prefix when the entry ends with a slash', () => {
    expect(matchForbidden('@types/react', ['@types/'])).toBe('@types/');
  });

  it('does not match scoped prefix when entry has no trailing slash', () => {
    // '@typeset' must NOT match forbidden entry '@types/' — the trailing
    // slash in the entry is significant. Without it we'd have a false
    // positive on every package starting with '@types'.
    expect(matchForbidden('@typeset', ['@types/'])).toBeNull();
  });

  it('matches bare prefix against subpaths', () => {
    expect(matchForbidden('lodash/foo', ['lodash'])).toBe('lodash');
  });

  it('does not match sibling package with shared bare prefix', () => {
    // 'lodash-es' must NOT match forbidden entry 'lodash' — the next
    // char is '-' not '/' or end-of-string.
    expect(matchForbidden('lodash-es', ['lodash'])).toBeNull();
  });

  it('returns the first matching entry in declaration order', () => {
    expect(matchForbidden('moment', ['@types/', 'moment'])).toBe('moment');
  });
});

describe('detectConstitution / resolveConstitution — forbidden', () => {
  it('detectConstitution never sets forbidden (auto-detection only)', () => {
    const dir = freshDir();
    try {
      // A package.json full of dependencies that ARE forbidden candidates
      // must not cause `forbidden` to appear in the detection output.
      writePackageJson(dir, {
        moment: '^2.0.0',
        lodash: '^4.0.0',
        '@types/react': '^18.0.0',
      });
      const detected = detectConstitution(dir);
      expect(detected).not.toHaveProperty('forbidden');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolveConstitution preserves user-declared forbidden', () => {
    const merged = resolveConstitution(
      { forbidden: ['moment', '@types/'] },
      {},
    );
    expect(merged?.forbidden).toEqual(['moment', '@types/']);
  });

  it('resolveConstitution leaves forbidden undefined when user omits it', () => {
    const merged = resolveConstitution(
      { stateManagement: ['zustand'] },
      {},
    );
    expect(merged).not.toHaveProperty('forbidden');
  });

  it('resolveConstitution does not merge detected data into forbidden', () => {
    // Even if detection somehow returned forbidden (it doesn't), the
    // resolver must not pick it up — forbidden is purely user-declared.
    const merged = resolveConstitution(
      undefined,
      { stateManagement: ['zustand'], forbidden: ['detected-thing'] } as Constitution,
    );
    expect(merged?.forbidden).toBeUndefined();
  });
});
