// Monorepo / workspace detection.
//
//   expandWorkspacePattern  — turn a single pnpm/npm glob into a list
//                             of package roots.
//   findWorkspacePackages  — read pnpm-workspace.yaml + package.json
//                             workspaces + nx.json, return all
//                             discovered package roots.
//   detectMonorepoRoot     — walk up the directory tree until we find
//                             a workspace marker (pnpm-workspace.yaml,
//                             pnpm-workspace.yml, or turbo.json).
//
// Used by ./stack.ts (detectStack merges per-package UI libraries from
// every workspace package) and by ../program.ts (the scan action uses
// detectMonorepoRoot to auto-pick a workspace root when --workspace
// is left at its default value).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const WORKSPACE_FILES = ['pnpm-workspace.yaml', 'pnpm-workspace.yml', 'turbo.json'];

function expandWorkspacePattern(root: string, pattern: string): string[] {
  if (pattern.endsWith('/*')) {
    const dir = resolve(root, pattern.slice(0, -2));
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
    const found: string[] = [];
    for (const entry of readdirSync(dir)) {
      const resolved = join(dir, entry);
      if (existsSync(join(resolved, 'package.json'))) found.push(resolved);
    }
    return found;
  }
  const resolved = resolve(root, pattern);
  if (existsSync(join(resolved, 'package.json'))) return [resolved];
  return [];
}

function findWorkspacePackages(cwd: string): string[] {
  const root = resolve(cwd);
  const packages: string[] = [];
  const pnpmWorkspace = join(root, 'pnpm-workspace.yaml');
  if (existsSync(pnpmWorkspace)) {
    const content = readFileSync(pnpmWorkspace, 'utf-8');
    const matches = content.match(/^\s*-\s*['"]?([^'"\n]+)['"]?/gm);
    if (matches) {
      for (const match of matches) {
        const pattern = match.replace(/^\s*-\s*['"]?|['"]?$/g, '');
        packages.push(...expandWorkspacePattern(root, pattern));
      }
    }
  }
  const pkgPath = join(root, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (Array.isArray(pkg.workspaces)) {
        for (const pattern of pkg.workspaces) {
          packages.push(...expandWorkspacePattern(root, pattern));
        }
      }
    } catch {
      // ignore
    }
  }
  const nxPath = join(root, 'nx.json');
  if (existsSync(nxPath)) {
    try {
      const nx = JSON.parse(readFileSync(nxPath, 'utf-8'));
      const projects = nx.projects;
      if (Array.isArray(projects)) {
        for (const pattern of projects) {
          packages.push(...expandWorkspacePattern(root, pattern));
        }
      } else if (typeof projects === 'object' && projects !== null) {
        for (const pattern of Object.values(projects)) {
          if (typeof pattern === 'string') {
            packages.push(...expandWorkspacePattern(root, pattern));
          }
        }
      }
    } catch {
      // ignore
    }
  }
  return packages;
}

export function detectMonorepoRoot(cwd: string): string | undefined {
  let current = resolve(cwd);
  while (true) {
    for (const name of WORKSPACE_FILES) {
      if (existsSync(join(current, name))) {
        return current;
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

export { findWorkspacePackages };