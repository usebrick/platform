import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { ResolvedConfig } from '../types';
import { discoverFiles } from '../engine/discover.js';
import { detectMonorepoRoot, findWorkspacePackages } from '../config/detect/monorepo';

export interface ScanDiscoveryOptions {
  workspace: string;
  config: ResolvedConfig;
  configPath?: string;
  cliIncludeOverride: boolean;
}

function containsPath(parent: string, candidate: string): boolean {
  const rel = relative(resolve(parent), resolve(candidate));
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

export async function discoverScanFiles(options: ScanDiscoveryOptions): Promise<string[]> {
  const workspace = resolve(options.workspace);

  if (options.cliIncludeOverride) {
    return Array.from(new Set(await discoverFiles(workspace, options.config))).sort();
  }

  if (options.configPath) {
    const configRoot = dirname(resolve(options.configPath));
    const files = await discoverFiles(configRoot, options.config);
    return files.filter((file) => containsPath(workspace, file));
  }

  if (detectMonorepoRoot(workspace) === workspace) {
    const packages = findWorkspacePackages(workspace);
    if (packages.length > 0) {
      const roots = packages.map((pkg) => relative(workspace, pkg).split(sep).join('/'));
      const include = options.config.include.flatMap((pattern) =>
        roots.map((root) => (root ? `${root}/${pattern}` : pattern)),
      );
      return discoverFiles(workspace, { ...options.config, include });
    }
  }

  return discoverFiles(workspace, options.config);
}
