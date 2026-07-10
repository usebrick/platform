import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { ResolvedConfig } from '../types';
import {
  discoverFilesWithDiagnostics,
  type SelectionAccounting,
} from '../engine/discover.js';
import { detectMonorepoRoot, findWorkspacePackages } from '../config/detect/monorepo';

export interface ScanDiscoveryOptions {
  workspace: string;
  config: ResolvedConfig;
  configPath?: string;
  cliIncludeOverride: boolean;
}

export interface ScanDiscoveryResult {
  files: string[];
  selectionAccounting: SelectionAccounting;
}

function containsPath(parent: string, candidate: string): boolean {
  const rel = relative(resolve(parent), resolve(candidate));
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

export async function discoverScanFilesWithDiagnostics(options: ScanDiscoveryOptions): Promise<ScanDiscoveryResult> {
  const workspace = resolve(options.workspace);

  if (options.cliIncludeOverride) {
    return discoverFilesWithDiagnostics(workspace, options.config);
  }

  if (options.configPath) {
    const configRoot = dirname(resolve(options.configPath));
    const discovered = await discoverFilesWithDiagnostics(configRoot, options.config);
    const files = discovered.files.filter((file) => containsPath(workspace, file));
    const outsideWorkspace = discovered.files.length - files.length;
    return {
      files,
      selectionAccounting: {
        ...discovered.selectionAccounting,
        selected: files.length,
        excluded: {
          ...discovered.selectionAccounting.excluded,
          outsideWorkspace: discovered.selectionAccounting.excluded.outsideWorkspace + outsideWorkspace,
        },
      },
    };
  }

  if (detectMonorepoRoot(workspace) === workspace) {
    const packages = findWorkspacePackages(workspace);
    if (packages.length > 0) {
      const roots = packages.map((pkg) => relative(workspace, pkg).split(sep).join('/'));
      const include = options.config.include.flatMap((pattern) =>
        roots.map((root) => (root ? `${root}/${pattern}` : pattern)),
      );
      return discoverFilesWithDiagnostics(workspace, { ...options.config, include });
    }
  }

  return discoverFilesWithDiagnostics(workspace, options.config);
}

/** Backward-compatible files-only facade. */
export async function discoverScanFiles(options: ScanDiscoveryOptions): Promise<string[]> {
  return (await discoverScanFilesWithDiagnostics(options)).files;
}
