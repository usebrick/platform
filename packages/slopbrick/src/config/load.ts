// Config file loading: walks up from cwd to find a config file.
//
// Filename (v0.11.0+): `slopbrick.config.{mjs,cjs,js}`. The legacy
// `slop-audit.config.*` name was removed in v0.11.0; users running an
// old config should run `slopbrick migrate` to rename both the config
// file AND the `.slop-audit/` artifact directory.
//
// Reads the user config via the right loader (`import` for ESM, `require`
// for CJS — determined by extension or nearest `package.json` `type`
// field), and merges it on top of DEFAULT_CONFIG + detected framework.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { logger } from '../engine/logger';
import { ConfigValidationError, validateConfig } from './validation';
import { DEFAULT_CONFIG } from './defaults';
import { detectStack } from './detect';
import { detectConstitution, resolveConstitution } from './conventions';
import type { ResolvedConfig } from '../types';

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const out = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const s = (source as Record<string, unknown>)[key];
    if (s && typeof s === 'object' && !Array.isArray(s) && out[key] && typeof out[key] === 'object') {
      out[key] = deepMerge(out[key] as Record<string, unknown>, s as Record<string, unknown>);
    } else if (s !== undefined) {
      out[key] = s;
    }
  }
  return out as T;
}

export function resolveConfigPath(dir: string): string | undefined {
  const candidates = ['slopbrick.config.mjs', 'slopbrick.config.cjs', 'slopbrick.config.js'];
  let current = resolve(dir);
  while (true) {
    for (const name of candidates) {
      const full = join(current, name);
      if (existsSync(full)) return full;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

function detectJsLoader(configPath: string): 'import' | 'require' {
  const ext = extname(configPath);
  if (ext === '.mjs') return 'import';
  if (ext === '.cjs') return 'require';
  // For .js, inspect nearest package.json type field.
  let current = dirname(resolve(configPath));
  while (true) {
    const pkgPath = join(current, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        return pkg.type === 'module' ? 'import' : 'require';
      } catch {
        return 'require';
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return 'require';
}

async function loadConfigFile(path: string): Promise<Partial<ResolvedConfig>> {
  const loader = detectJsLoader(path);
  if (loader === 'require') {
    const req = createRequire(import.meta.url);
    const mod = req(path);
    return mod.default ?? mod;
  }
  const mod = await import(path);
  return mod.default ?? mod;
}

export async function loadConfig(cwd: string): Promise<ResolvedConfig> {
  const detected = detectStack(cwd);
  const detectedConstitution = detectConstitution(cwd);
  const configPath = resolveConfigPath(cwd);
  if (!configPath) {
    return {
      ...deepMerge(DEFAULT_CONFIG, detected),
      constitution: resolveConstitution(undefined, detectedConstitution),
    };
  }
  let user: Partial<ResolvedConfig>;
  try {
    user = await loadConfigFile(configPath);
  } catch (error) {
    // Keep malformed JavaScript/config imports on the documented config
    // error path. Without this boundary, a syntax error escaped as an
    // unexpected internal error (exit 3), making `scan` and `ci` disagree
    // with `validate-config` and hiding the actionable file path.
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigValidationError(configPath, [`failed to load config: ${message}`], []);
  }
  const validation = validateConfig(user);
  if (validation.errors.length > 0) {
    throw new ConfigValidationError(configPath, validation.errors, validation.warnings);
  }
  for (const warning of validation.warnings) {
    logger.warn(`Warning: ${warning}`);
  }
  const merged = deepMerge(deepMerge(DEFAULT_CONFIG, detected), user as Partial<ResolvedConfig>);
  merged.constitution = resolveConstitution(
    (user as Partial<ResolvedConfig>).constitution,
    detectedConstitution,
  );
  return merged;
}
