// Name-similarity clustering + cross-file drift detection (v0.9.2 phase 3-4).
//
// The lens: "did this code introduce a new pattern when an existing pattern
// already existed?" Detected at the cross-file level by clustering pattern
// inventory entries by name stem (after stripping common suffixes), then
// flagging any stem that has 2+ distinct variants in the same category.
//
// Example: `UserService`, `UserManager`, `UserHandler` all strip to
// `User`. Three files = 1 stem with 3 variants = drift signal.
//
// Routes get a different normalization: `/users` and `/users/:id` are
// treated as the same resource (parameter segments stripped) because the
// lens asks about the resource, not the route signature.
//
// Pure functions. No I/O. Consumed by scan.ts to surface drift in the
// Architecture Drift section of the pretty report.

/** Local minimal types — mirror the shapes in slopbrick's
 *  `mcp/patterns.ts`. The engine doesn't import from mcp/patterns to
 *  avoid a circular dep at the workspace level. */
export interface PatternMatch {
  name: string;
  files: string[];
  imports?: string[];
}

export interface PatternInventory {
  scannedFiles: number;
  patterns: {
    modal: PatternMatch[];
    button: PatternMatch[];
    api: PatternMatch[];
    state: PatternMatch[];
    dataFetching: PatternMatch[];
    service: PatternMatch[];
    route: PatternMatch[];
    ormModel: PatternMatch[];
  };
}

/** Common suffixes stripped from class/struct/function names to derive the
 *  stem. Order matters: longer suffixes are matched first so
 *  `RepositoryClient` → stem `Repository` (not `Repository` → nothing). */
const SUFFIXES_TO_STRIP = [
  'RepositoryClient',
  'ServiceFactory',
  'Repository',
  'Service',
  'Manager',
  'Handler',
  'Controller',
  'Helper',
  'Factory',
  'Provider',
  'Store',
  'Client',
  'API',
  'Util',
  'Repo',
  // UI / frontend pattern suffixes (frontend component conventions)
  'Modal',
  'Dialog',
  'Drawer',
  'Sheet',
  'Panel',
  'Card',
  'List',
  'Form',
  'Page',
  'View',
  'Button',
  'Icon',
  'Submit',
  'Input',
  'Select',
  // Backend ORM suffixes
  'Model',
  'Schema',
  'Entity',
  'Document',
  'Record',
];

/** Strip a known suffix from a name. Returns the name unchanged if no
 *  suffix matches. */
function stripSuffix(name: string): string {
  for (const suffix of SUFFIXES_TO_STRIP) {
    if (name.endsWith(suffix) && name.length > suffix.length) {
      return name.slice(0, -suffix.length);
    }
  }
  return name;
}

/** Normalize a route path to its resource stem. Strips parameter segments
 *  (`:id`, `{id}`) so `/users` and `/users/:id` cluster as the same
 *  resource. */
export function normalizeRoute(path: string): string {
  // Strip :param segments.
  let normalized = path.replace(/:\w+/g, '');
  // Strip {param} segments.
  normalized = normalized.replace(/\{\w+\}/g, '');
  // Collapse trailing slashes.
  normalized = normalized.replace(/\/+$/, '');
  return normalized;
}

/** A drift finding: a single conceptual entity (stem) realized as 2+
 *  distinct patterns in the same category across files.
 *
 *  Renamed from `DriftSignal` to `CrossFileDriftSignal` (v0.9.2) for
 *  naming consistency with the cross-file drift detection pipeline. */
export interface CrossFileDriftSignal {
  /** The pattern category where drift was detected (e.g. 'service'). */
  category: keyof PatternInventory['patterns'];
  /** The stem after suffix stripping. Multiple variants cluster here. */
  stem: string;
  /** The original pattern names that collapsed to this stem. */
  variants: string[];
  /** All files contributing to any variant, deduped. */
  files: string[];
}

/** Derive the stem for a pattern name within its category. Routes use
 *  path normalization; everything else uses suffix stripping. */
function stemFor(category: keyof PatternInventory['patterns'], name: string): string {
  if (category === 'route') return normalizeRoute(name);
  return stripSuffix(name);
}

/** Cluster patterns in a single category by stem. Returns only clusters
 *  with 2+ variants — singletons aren't drift. */
function clusterCategory(
  category: keyof PatternInventory['patterns'],
  patterns: PatternMatch[],
): CrossFileDriftSignal[] {
  // Group by stem. Each entry: stem -> { variants: Set<string>, files: Set<string> }
  const groups = new Map<string, { variants: Set<string>; files: Set<string> }>();

  for (const p of patterns) {
    const stem = stemFor(category, p.name);
    if (!groups.has(stem)) {
      groups.set(stem, { variants: new Set(), files: new Set() });
    }
    const group = groups.get(stem)!;
    group.variants.add(p.name);
    for (const file of p.files) group.files.add(file);
  }

  const signals: CrossFileDriftSignal[] = [];
  for (const [stem, group] of groups) {
    if (group.variants.size < 2) continue;
    signals.push({
      category,
      stem,
      variants: Array.from(group.variants).sort(),
      files: Array.from(group.files).sort(),
    });
  }
  // Sort signals: largest drift (most variants) first, then alphabetical.
  signals.sort((a, b) => {
    if (b.variants.length !== a.variants.length) return b.variants.length - a.variants.length;
    return a.stem.localeCompare(b.stem);
  });
  return signals;
}

/** Run cross-file drift detection on the full PatternInventory.
 *
 *  Returns one CrossFileDriftSignal per (category, stem) cluster with
 *  2+ variants. */
export function detectCrossFileDrift(
  inventory: PatternInventory,
): CrossFileDriftSignal[] {
  const all: CrossFileDriftSignal[] = [];
  const categories: Array<keyof PatternInventory['patterns']> = [
    'modal',
    'button',
    'api',
    'state',
    'dataFetching',
    'service',
    'route',
    'ormModel',
  ];
  for (const category of categories) {
    const patterns = inventory.patterns[category];
    if (patterns.length === 0) continue;
    all.push(...clusterCategory(category, patterns));
  }
  return all;
}

/** Group drift signals by stem (across categories). For the report
 *  output, the user wants to see:
 *    User Pattern (3 implementations, 2 categories):
 *      service: UserService, UserManager, UserHandler
 *      ormModel: User
 *  This is "same conceptual entity, multiple roles". Distinct from
 *  in-category drift. */
export interface CrossCategoryDrift {
  stem: string;
  /** Patterns grouped by category. */
  byCategory: Map<keyof PatternInventory['patterns'], string[]>;
  files: string[];
}

/** Find stems that appear in 2+ categories. */
export function detectCrossCategoryDrift(
  signals: CrossFileDriftSignal[],
): CrossCategoryDrift[] {
  const byStem = new Map<string, CrossCategoryDrift>();
  for (const signal of signals) {
    if (!byStem.has(signal.stem)) {
      byStem.set(signal.stem, {
        stem: signal.stem,
        byCategory: new Map(),
        files: [],
      });
    }
    const entry = byStem.get(signal.stem)!;
    entry.byCategory.set(signal.category, signal.variants);
    for (const file of signal.files) {
      if (!entry.files.includes(file)) entry.files.push(file);
    }
  }
  // Only stems with multiple categories are "cross-category drift".
  const result: CrossCategoryDrift[] = [];
  for (const drift of byStem.values()) {
    if (drift.byCategory.size >= 2) result.push(drift);
  }
  return result;
}
