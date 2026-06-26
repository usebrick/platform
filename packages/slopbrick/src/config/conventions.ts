// Constitution detection, declaration, and enforcement.
//
// `constitution` is the new top-level field in `slopbrick.config.mjs`
// that lets a repository declare "we use X for state, Y for data
// fetching, Z for UI" in machine-readable form, plus an explicit
// deny-list of packages the project has decided are off-limits. Once
// declared, the `slop_suggest` and `slop_check_constitution` MCP tools
// can flag PR-introduced code that drifts from the declared stack
// (e.g. "this file imports Redux, project declares Zustand in
// constitution") or imports a forbidden package (e.g. "this file
// imports moment, which is on the deny-list").
//
// Detection reads package.json (and a few structural signals for
// shadcn/ui) and returns a partial `Constitution` object. User-provided
// values in `slopbrick.config.mjs` always win over auto-detection —
// if the user explicitly sets `stateManagement: []`, that is a
// declaration of "we don't use any state-management library."

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Constitution declared by the user (or auto-detected from package.json).
 * Each allow-list field is a list of canonical names — agents and
 * reviewers can match against import strings without needing the
 * original package name. For example, `@reduxjs/toolkit` and `redux`
 * both surface as `'redux'` under `stateManagement`.
 *
 * `forbidden` is the deny-list: bare package specifiers and `@scope/`
 * prefixes that the project has decided are off-limits. Matched against
 * imports during `slop_check_constitution` and the `slopbrick drift`
 * command.
 */
export interface Constitution {
  /** State-management libraries, e.g. 'zustand', 'redux', 'jotai'. */
  stateManagement?: string[];
  /** Data-fetching / server-state libraries, e.g. 'react-query', 'swr'. */
  dataFetching?: string[];
  /** UI component libraries, e.g. 'shadcn', 'radix', 'mui'. */
  uiLibrary?: string[];
  /** Form + schema-validation libraries, e.g. 'react-hook-form', 'zod'. */
  forms?: string[];
  /** Styling solutions, e.g. 'tailwind', 'styled-components', 'emotion'. */
  styling?: string[];
  /** Routing libraries, e.g. 'next', 'react-router', 'tanstack-router'. */
  routing?: string[];
  /** Free-form user-declared categories, keyed by category name. */
  custom?: Record<string, string[]>;
  /**
   * Explicit deny-list of bare package specifiers and `@scope/`
   * prefixes. Anything in this list is forbidden — even if it would
   * otherwise match a canonical category. Matching rules (see
   * `matchForbidden`):
   *  - `forbidden: ['moment']` matches `moment` exactly.
   *  - `forbidden: ['@types/']` matches any `@types/...` import.
   *  - `forbidden: ['lodash']` matches `lodash` but not `lodash-es`.
   */
  forbidden?: string[];
}

/**
 * Signal → constitution mapping. The detector walks `package.json`
 * deps + devDeps and checks each key against this table. Multiple
 * package names can map to the same canonical constitution name (e.g.
 * `@reduxjs/toolkit` and `redux` both → `'redux'`).
 *
 * Exported so downstream consumers (MCP `slop_suggest` /
 * `slop_check_constitution`) can match import specifiers against the
 * canonical field+signal pairs without re-deriving the table.
 */
export const CONSTITUTION_SIGNALS: Record<string, {
  field: keyof Omit<Constitution, 'forbidden' | 'custom'>;
  signal: string;
}> = {
  // State management
  zustand: { field: 'stateManagement', signal: 'zustand' },
  '@reduxjs/toolkit': { field: 'stateManagement', signal: 'redux' },
  'react-redux': { field: 'stateManagement', signal: 'redux' },
  redux: { field: 'stateManagement', signal: 'redux' },
  jotai: { field: 'stateManagement', signal: 'jotai' },
  mobx: { field: 'stateManagement', signal: 'mobx' },
  'mobx-react-lite': { field: 'stateManagement', signal: 'mobx' },
  recoil: { field: 'stateManagement', signal: 'recoil' },
  valtio: { field: 'stateManagement', signal: 'valtio' },

  // Data fetching / server state
  '@tanstack/react-query': { field: 'dataFetching', signal: 'react-query' },
  '@tanstack/query': { field: 'dataFetching', signal: 'react-query' },
  'react-query': { field: 'dataFetching', signal: 'react-query' },
  swr: { field: 'dataFetching', signal: 'swr' },
  '@apollo/client': { field: 'dataFetching', signal: 'apollo' },
  '@urql/core': { field: 'dataFetching', signal: 'urql' },
  urql: { field: 'dataFetching', signal: 'urql' },

  // UI libraries
  '@radix-ui/react-dialog': { field: 'uiLibrary', signal: 'radix' },
  '@radix-ui/react-dropdown-menu': { field: 'uiLibrary', signal: 'radix' },
  '@radix-ui/react-popover': { field: 'uiLibrary', signal: 'radix' },
  '@mui/material': { field: 'uiLibrary', signal: 'mui' },
  '@chakra-ui/react': { field: 'uiLibrary', signal: 'chakra' },
  antd: { field: 'uiLibrary', signal: 'antd' },
  '@mantine/core': { field: 'uiLibrary', signal: 'mantine' },
  tamagui: { field: 'uiLibrary', signal: 'tamagui' },

  // Forms + validation
  'react-hook-form': { field: 'forms', signal: 'react-hook-form' },
  formik: { field: 'forms', signal: 'formik' },
  zod: { field: 'forms', signal: 'zod' },
  yup: { field: 'forms', signal: 'yup' },
  joi: { field: 'forms', signal: 'joi' },

  // Styling (mirrors detectStylingSolution but exposes the canonical name)
  tailwindcss: { field: 'styling', signal: 'tailwind' },
  'styled-components': { field: 'styling', signal: 'styled-components' },
  '@emotion/react': { field: 'styling', signal: 'emotion' },
  '@emotion/styled': { field: 'styling', signal: 'emotion' },
  '@pandacss/dev': { field: 'styling', signal: 'panda' },

  // Routing
  next: { field: 'routing', signal: 'next' },
  'react-router': { field: 'routing', signal: 'react-router' },
  'react-router-dom': { field: 'routing', signal: 'react-router' },
  '@tanstack/react-router': { field: 'routing', signal: 'tanstack-router' },
  'vue-router': { field: 'routing', signal: 'vue-router' },
  sveltekit: { field: 'routing', signal: 'sveltekit' },
  '@sveltejs/kit': { field: 'routing', signal: 'sveltekit' },
};

function readDeps(cwd: string): Set<string> {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return new Set();
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as typeof pkg;
  } catch {
    return new Set();
  }
  const out = new Set<string>();
  for (const source of [pkg.dependencies, pkg.devDependencies]) {
    if (source && typeof source === 'object') {
      for (const name of Object.keys(source)) out.add(name);
    }
  }
  return out;
}

function pushUnique<T>(arr: T[] | undefined, value: T): T[] {
  const list = arr ?? [];
  if (list.includes(value)) return list;
  return [...list, value];
}

/**
 * Detect the constitution from the project root. Returns a partial
 * `Constitution` object — fields with no detected signals are omitted.
 * User-provided declarations always win; see `resolveConstitution`.
 *
 * Note: `forbidden` is never auto-detected — it is always explicit.
 */
export function detectConstitution(cwd: string): Constitution {
  const deps = readDeps(cwd);
  if (deps.size === 0) return {};

  const out: Constitution = {};

  for (const [pkg, { field, signal }] of Object.entries(CONSTITUTION_SIGNALS)) {
    if (deps.has(pkg)) {
      // Field is always one of the known string-array fields; `custom`
      // and `forbidden` are excluded by the signal table above, so this
      // assignment is safe.
      (out as Record<string, string[]>)[field] = pushUnique(
        (out as Record<string, string[]>)[field],
        signal,
      );
    }
  }

  // shadcn/ui is structural, not a single npm package. Detect by the
  // canonical trio: components/ui dir + class-variance-authority + tailwind.
  if (
    existsSync(join(cwd, 'components/ui')) &&
    deps.has('class-variance-authority') &&
    deps.has('tailwindcss')
  ) {
    out.uiLibrary = pushUnique(out.uiLibrary, 'shadcn');
  }

  return out;
}

/**
 * Merge user-declared constitution with auto-detected values. User
 * declarations always win — including explicit empty arrays, which
 * mean "we deliberately don't use this category."
 *
 * `forbidden` is a pure user-declaration — detected data is never
 * merged into it. If the user omits `forbidden`, the result omits it.
 */
export function resolveConstitution(
  user: Partial<Constitution> | undefined,
  detected: Constitution,
): Constitution | undefined {
  if (!user && Object.keys(detected).length === 0) return undefined;

  const pickField = <K extends keyof Omit<Constitution, 'forbidden'>>(
    field: K,
  ): Constitution[K] | undefined => {
    const userVal = user?.[field];
    if (userVal !== undefined) return userVal;
    return detected[field];
  };

  const merged: Constitution = {
    stateManagement: pickField('stateManagement'),
    dataFetching: pickField('dataFetching'),
    uiLibrary: pickField('uiLibrary'),
    forms: pickField('forms'),
    styling: pickField('styling'),
    routing: pickField('routing'),
    custom: user?.custom,
    forbidden: user?.forbidden,
  };

  // Strip fields that resolved to undefined so the output stays compact
  // and `config.constitution !== undefined` is a reliable "did we
  // detect or declare anything?" check.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length > 0 ? (out as Constitution) : undefined;
}

/**
 * Render a human-readable summary of the constitution for the init
 * wizard and doctor output.
 */
export function formatConstitution(c: Constitution | undefined): string {
  if (!c) return '  (none detected or declared)';
  const lines: string[] = [];
  for (const field of [
    'stateManagement',
    'dataFetching',
    'uiLibrary',
    'forms',
    'styling',
    'routing',
  ] as const) {
    const vals = c[field];
    if (vals && vals.length > 0) {
      lines.push(`  ${field}: ${vals.join(', ')}`);
    }
  }
  if (c.custom && Object.keys(c.custom).length > 0) {
    for (const [k, v] of Object.entries(c.custom)) {
      lines.push(`  custom.${k}: ${v.join(', ')}`);
    }
  }
  if (c.forbidden && c.forbidden.length > 0) {
    lines.push(`  forbidden: ${c.forbidden.join(', ')}`);
  }
  return lines.length === 0 ? '  (none detected or declared)' : lines.join('\n');
}

/**
 * Test whether an import specifier is on the constitution's deny-list.
 *
 * Matching rules:
 *  - Exact match against a bare specifier (e.g. `forbidden: ['moment']`
 *    matches `import 'moment'`).
 *  - Scoped prefix match: `forbidden: ['@types/']` matches any
 *    `@types/...` import. The trailing slash is significant — without
 *    it, `@types` would also match `@typeset`.
 *  - Bare prefix match: `forbidden: ['lodash']` matches `lodash` AND
 *    `lodash/foo`, but NOT `lodash-es` or `lodash.debounce`. (Use
 *    `forbidden: ['lodash/']` to forbid every subpath.)
 *
 * Returns the matching forbidden entry (the original string from the
 * config) or null if the import is allowed.
 */
export function matchForbidden(
  spec: string,
  forbidden: readonly string[] | undefined,
): string | null {
  if (!forbidden || forbidden.length === 0) return null;
  for (const entry of forbidden) {
    if (spec === entry) return entry;
    // Scoped prefix — entry ends with '/' (e.g. '@types/')
    if (entry.endsWith('/') && spec.startsWith(entry)) return entry;
    // Bare prefix — must be followed by '/' or end-of-string
    if (entry.length > 0 && spec.startsWith(entry)) {
      const next = spec.charAt(entry.length);
      if (next === '/' || next === '') return entry;
    }
  }
  return null;
}