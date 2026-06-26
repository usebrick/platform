// Stack detection: framework + UI libraries + Tailwind flag + rule
// presets, all rolled into one Partial<ResolvedConfig>.
//
//   detectUiLibraries        — match installed deps against a known
//                              UI-library signature table; also detects
//                              shadcn/ui by checking for components/ui
//                              + class-variance-authority + radix +
//                              tailwindcss.
//   frameworkFromFiles       — first-pass framework inference from
//                              source-file extensions (.vue → vue,
//                              .svelte → svelte, .astro → astro,
//                              .tsx/.jsx → react).
//   frameworkFromConfigFiles — second-pass inference from build-tool
//                              config files (astro.config.*,
//                              svelte.config.*, vite + App.vue,
//                              vite-solid.config.*).
//   collectSourceFiles +
//   collectSourceFilesRecursive — bounded BFS into src/app/components/
//                              pages for frameworkFromFiles.
//   detectStack              — orchestrator. Reads package.json, picks
//                              a framework (dep names first, then
//                              config files, then source files),
//                              merges per-framework rule presets,
//                              detects UI libraries for the root +
//                              every workspace package, and reports
//                              the hasTailwind flag.
//
// Framework detection precedence (per detectStack):
//   1. React Native / Expo (special-case: these disable React-specific
//      rules via NATIVE_RULE_OVERRIDES and set supportsRsc=false)
//   2. Next.js
//   3. Astro (dep)
//   4. Qwik
//   5. Svelte (incl. SvelteKit)
//   6. Vue (incl. Nuxt)
//   7. Solid
//   8. React (incl. Preact)
//   9. Framework from config files
//   10. Framework from source files
//
// Public API consumed by ../program.ts init action and indirectly by
// src/index.ts via ./defaults → loadConfig → applyFrameworkPreset.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import type { Framework, UiLibrary } from '../defaults';
import type { ResolvedConfig } from '../../types';
import { FRAMEWORK_PRESETS, NATIVE_RULE_OVERRIDES } from '../presets';
import { findWorkspacePackages } from './monorepo';

const SOURCE_SCAN_DIRS = ['src', 'app', 'components', 'pages'];
const FRAMEWORK_EXTENSIONS = ['.vue', '.svelte', '.astro', '.tsx', '.jsx'];
const MAX_SOURCE_FILES_FOR_FRAMEWORK_DETECTION = 20;
const MAX_SOURCE_SCAN_DEPTH = 4;
const IGNORED_SOURCE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.svelte-kit',
  '.astro',
]);
const ASTRO_CONFIG_FILES = [
  'astro.config.mjs',
  'astro.config.js',
  'astro.config.cjs',
];
const VITE_CONFIG_FILES = [
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mjs',
];
const SOLID_CONFIG_FILES = ['vite.config.ts', 'vite-solid.config.ts'];

const UI_LIBRARY_DETECTION: Record<string, string[]> = {
  tamagui: ['tamagui'],
  nativewind: ['nativewind'],
  mui: ['@mui/material'],
  chakra: ['@chakra-ui/react'],
  panda: ['@pandacss/dev'],
  'styled-components': ['styled-components'],
  emotion: ['@emotion/react', '@emotion/styled'],
  radix: ['@radix-ui/react-*'],
};

function detectUiLibraries(deps: Record<string, unknown>, cwd: string): string[] {
  const names = Object.keys(deps).map((n) => n.toLowerCase());
  const found: string[] = [];
  for (const [library, signals] of Object.entries(UI_LIBRARY_DETECTION)) {
    for (const signal of signals) {
      if (signal.endsWith('-*')) {
        const prefix = signal.slice(0, -1);
        if (names.some((n) => n.startsWith(prefix))) {
          found.push(library);
          break;
        }
      } else if (names.includes(signal.toLowerCase())) {
        found.push(library);
        break;
      }
    }
  }
  if (
    deps['class-variance-authority'] &&
    found.includes('radix') &&
    names.includes('tailwindcss') &&
    existsSync(join(cwd, 'components/ui'))
  ) {
    found.push('shadcn/ui');
  }
  return [...new Set(found)].sort();
}

function frameworkFromFiles(files: string[]): Framework | undefined {
  const candidates = files.slice(0, MAX_SOURCE_FILES_FOR_FRAMEWORK_DETECTION);
  const extOf = (file: string) => extname(file).toLowerCase();
  if (candidates.some((f) => extOf(f) === '.vue')) return 'vue';
  if (candidates.some((f) => extOf(f) === '.svelte')) return 'svelte';
  if (candidates.some((f) => extOf(f) === '.astro')) return 'astro';
  if (candidates.some((f) => extOf(f) === '.tsx' || extOf(f) === '.jsx')) return 'react';
  return undefined;
}

function frameworkFromConfigFiles(cwd: string): Framework | undefined {
  if (ASTRO_CONFIG_FILES.some((name) => existsSync(join(cwd, name)))) return 'astro';
  if (existsSync(join(cwd, 'svelte.config.js')) || existsSync(join(cwd, 'svelte.config.ts'))) {
    return 'svelte';
  }
  if (
    VITE_CONFIG_FILES.some((name) => existsSync(join(cwd, name))) &&
    existsSync(join(cwd, 'src', 'App.vue'))
  ) {
    return 'vue';
  }
  if (SOLID_CONFIG_FILES.some((name) => existsSync(join(cwd, name)))) return 'solid';
  return undefined;
}

function collectSourceFiles(
  cwd: string,
  max = MAX_SOURCE_FILES_FOR_FRAMEWORK_DETECTION,
): string[] {
  const files: string[] = [];
  for (const dirName of SOURCE_SCAN_DIRS) {
    const dir = join(cwd, dirName);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    collectSourceFilesRecursive(dir, files, max);
    if (files.length >= max) break;
  }
  return files.slice(0, max);
}

function collectSourceFilesRecursive(
  dir: string,
  files: string[],
  max: number,
  depth = 0,
): void {
  if (depth >= MAX_SOURCE_SCAN_DEPTH) return;
  for (const entry of readdirSync(dir)) {
    if (files.length >= max) return;
    if (IGNORED_SOURCE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectSourceFilesRecursive(full, files, max, depth + 1);
    } else if (FRAMEWORK_EXTENSIONS.includes(extname(entry).toLowerCase())) {
      files.push(full);
    }
  }
}

export function detectStack(cwd: string): Partial<ResolvedConfig> {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    return {};
  }
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };
    const names = Object.keys(deps).map((name) => name.toLowerCase());
    const result: Partial<ResolvedConfig> = {};

    const hasExpo = names.includes('expo') || names.some((n) => n.startsWith('expo-'));
    const hasReactNative = names.includes('react-native');

    if (hasExpo || hasReactNative) {
      result.framework = hasExpo ? 'expo' : 'react-native';
      result.supportsRsc = false;
      result.rules = { ...NATIVE_RULE_OVERRIDES };
    } else if (names.includes('next')) {
      result.framework = 'react';
      result.supportsRsc = true;
    } else if (names.some((n) => n === 'astro')) {
      result.framework = 'astro';
      result.supportsRsc = true;
    } else if (names.some((n) => n.includes('qwik'))) {
      result.framework = 'qwik';
      result.supportsRsc = false;
    } else if (names.some((n) => n === 'svelte' || n.includes('sveltekit'))) {
      result.framework = 'svelte';
      result.supportsRsc = false;
    } else if (names.some((n) => n === 'vue' || n === 'nuxt')) {
      result.framework = 'vue';
      result.supportsRsc = false;
    } else if (names.some((n) => n === 'solid-js')) {
      result.framework = 'solid';
      result.supportsRsc = false;
    } else if (names.some((n) => n === 'react' || n === 'preact')) {
      result.framework = 'react';
      result.supportsRsc = false;
    }

    if (!result.framework) {
      result.framework = frameworkFromConfigFiles(cwd);
    }

    if (!result.framework) {
      const files = collectSourceFiles(cwd, MAX_SOURCE_FILES_FOR_FRAMEWORK_DETECTION);
      result.framework = frameworkFromFiles(files);
    }

    result.hasTailwind = names.includes('tailwindcss');
    if (!result.hasTailwind) {
      const tailwindConfigFiles = [
        'tailwind.config.js',
        'tailwind.config.mjs',
        'tailwind.config.cjs',
        'tailwind.config.ts',
      ];
      result.hasTailwind = tailwindConfigFiles.some((name) => existsSync(join(resolve(cwd), name)));
    }

    result.uiLibraries = detectUiLibraries(deps, cwd);

    if (result.framework) {
      const preset = FRAMEWORK_PRESETS[result.framework];
      if (preset) {
        result.rules = { ...result.rules, ...preset.rules };
      }
    }

    const workspacePackages = findWorkspacePackages(cwd);
    for (const workspaceRoot of workspacePackages) {
      try {
        const workspacePkg = JSON.parse(readFileSync(join(workspaceRoot, 'package.json'), 'utf-8'));
        const workspaceDeps = {
          ...workspacePkg.dependencies,
          ...workspacePkg.devDependencies,
          ...workspacePkg.peerDependencies,
        };
        const libs = detectUiLibraries(workspaceDeps, workspaceRoot);
        result.uiLibraries = [...new Set([...(result.uiLibraries ?? []), ...libs])].sort();
      } catch {
        // ignore
      }
    }

    return result;
  } catch {
    // ignore malformed package.json
  }
  return {};
}

export type { UiLibrary };