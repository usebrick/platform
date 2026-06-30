// Build the  grouped ScanFactsV2 shape from the flat InternalFacts
// accumulator that extractFacts() assembles during the AST walk.
//
// Inputs:
//   facts: InternalFacts — the flat-shape accumulator populated by the
//          walk loop. Includes the v2-only fields (componentSizes,
//          astroComponents, optimisticUpdates) plus legacy flat
//          fields (hooks, imports, components, etc.) that v2 derives
//          from.
//   source: original file contents (for the v2._source field that some
//           rules read for inline-source inspection).
//   ext: lowercase file extension (".tsx", ".vue", ".html", "" for
//        extension-less sniffed files).
//   framework: caller-provided framework name, used as the fallback
//              for unknown extensions.
//   config: optional ResolvedConfig — needed to evaluate
//           `allowedImports` for the import-path-mismatch rule.
//
// Output:
//   A fully-assembled ScanFactsV2. The function is pure — given the
//   same inputs it always returns the same v2 object. The only side
//   effect is the per-call regex creation; both compile-time cost and
//   readability favor extracting them as module-level constants.

import type { ResolvedConfig } from '../../types';
import type {
  ComponentFacts,
  ClassNameFact,
  ElementFact,
  HookFact,
  FetchCallFact,
  OptimisticUpdateFact,
  LogicalExpressionFact,
  StateBinding,
  StylePropFact,
  KeyPropFact,
  ComponentSizeFact,
  AstroComponentFact,
  ScanFacts,
} from '../../types';
import type {
  ScanFactsV2,
  FileMeta,
  JsxElementRecord,
} from '../types';
import {
  extractDisabledRules,
  extractDepNames,
  maxJsxNestingDepth,
  deriveFramework,
} from './scan-helpers.js';

/**
 * Internal accumulator produced by extractFacts(). Mirrors the
 * historical flat-shape fields plus the v2-only fields. Kept in this
 * module (rather than ./internal.ts) because v2-build is the only
 * consumer; the walk loop builds the same shape inline.
 */
export interface InternalFacts {
  filePath: string;
  components: ComponentFacts[];
  staticClassNames: ClassNameFact[];
  allElements: ElementFact[];
  imports: Array<{ source: string; line: number; column: number; importedNames?: string[] }>;
  hooks: HookFact[];
  logicalExpressions: LogicalExpressionFact[];
  styleProps: StylePropFact[];
  keyProps: KeyPropFact[];
  componentSizes: ComponentSizeFact[];
  astroComponents: AstroComponentFact[];
  fetchCalls: FetchCallFact[];
  optimisticUpdates: OptimisticUpdateFact[];
  /**
   *  dead-code detector. The visitor's import/branch/return
   *  handlers push binding + reference data here; the v2 builder
   *  copies it into `ScanFactsV2.deadCode`. See
   *  `engine/types.ts` → `DeadCodeFacts` for the shape. */
  deadCode: import('../types').DeadCodeFacts;
  /**
   *  file-level referenced-name set. The identifier walk in
   *  dispatch.ts adds every non-binding-site identifier it sees.
   *  A binding whose name is missing from this set is unused. */
  referencedNames: Set<string>;
  //  v2 source passthrough (not exposed on the returned ScanFacts).
  _source?: string;
}

// Tailwind token regexes. Extracted as module-level constants so the
// hot loop in scanDesignTokens doesn't recompile them per call.
const TAILWIND_COLOR_RE = /^(?:bg|text|border|ring|from|to|via|fill|stroke)-([a-z]+-\d+|white|black|transparent|current|\[.+?\])$/;
const TAILWIND_SPACING_RE = /^(?:[pm][xytrbl]?|gap|space-[xy])-(\d+(?:\.\d+)?)$/;
const TAILWIND_RADIUS_RE = /^(?:rounded(?:-[a-z]+)?)-(.+)$/;
const TAILWIND_FONT_RE = /^text-(xs|sm|base|lg|xl|\d+xl|\[\d+px\]|\[.+\])$/;

const INTERACTIVE_HTML_TAGS = /^(button|a|input|select|textarea)$/;
const ARIA_ATTR_PREFIX = 'aria-';
const ARIA_ROLE_KEY = 'role';

function isPrimitiveTagName(tag: string): boolean {
  return /^[a-z][a-z0-9]*$/.test(tag);
}

function buildFileMeta(
  filePath: string,
  source: string,
  ext: string,
  framework: string,
): FileMeta {
  return {
    path: filePath,
    loc: source.split('\n').length,
    extension: ext,
    framework: deriveFramework(ext, framework),
  };
}

function buildJsxElements(allElements: ElementFact[]): JsxElementRecord[] {
  return allElements.map((el) => {
    const classTokens = el.classNames.flatMap((cn) => cn.value.split(/\s+/).filter(Boolean));
    const arbitrary = classTokens.filter((t) => /-\[.*\]$/.test(t));
    const inlineStyles: Record<string, string> = {};
    // Inline styles are captured in facts.styleProps as opaque source
    // strings (e.g. `{ padding: '4px', margin: '8px' }`). The v2 shape
    // surfaces them as parsed key→value maps.  keeps this shallow:
    // we re-parse the source lazily on read in the migrated rule.
    // For now, expose a stub map; the rule reads facts.styleProps directly.
    void inlineStyles;
    return {
      tag: el.tag,
      isPrimitive: isPrimitiveTagName(el.tag),
      classNames: classTokens,
      arbitraryValues: arbitrary,
      inlineStyles,
      interactive: el.eventHandlers.length > 0 || INTERACTIVE_HTML_TAGS.test(el.tag),
      ariaProps: Object.keys(el.attributes).filter(
        (a) => a.startsWith(ARIA_ATTR_PREFIX) || a === ARIA_ROLE_KEY,
      ),
      attributes: { ...el.attributes },
      line: el.line,
      column: el.column,
    };
  });
}

/**
 * Walk static className facts and bucket tokens into the four
 * design-token dimensions v2 tracks: spacing, color, font-size, and
 * border-radius. Powers the visual/math-* entropy rules.
 */
function scanDesignTokens(staticClassNames: ClassNameFact[]): {
  spacingUsage: number[];
  colorValues: string[];
  fontSizes: string[];
  borderRadius: string[];
} {
  const spacingUsage: number[] = [];
  const colorValues: string[] = [];
  const fontSizes: string[] = [];
  const borderRadius: string[] = [];
  for (const cn of staticClassNames) {
    for (const token of cn.value.split(/\s+/).filter(Boolean)) {
      const colorMatch = TAILWIND_COLOR_RE.exec(token);
      if (colorMatch) colorValues.push(colorMatch[1]!);
      const spacingMatch = TAILWIND_SPACING_RE.exec(token);
      if (spacingMatch) spacingUsage.push(parseFloat(spacingMatch[1]!));
      const radiusMatch = TAILWIND_RADIUS_RE.exec(token);
      if (radiusMatch) borderRadius.push(radiusMatch[1]!);
      const fontMatch = TAILWIND_FONT_RE.exec(token);
      if (fontMatch) fontSizes.push(fontMatch[1]!);
    }
  }
  return { spacingUsage, colorValues, fontSizes, borderRadius };
}

/**
 * Map flat-shape `imports[]` into v2 imports[] with `isAllowed`
 * resolved against the project's `allowedImports` list. The default
 * allowed prefixes are `@/...` and `~/...`, matching the conventions
 * documented in README's "Configuration" section.
 */
function buildImportRecords(
  imports: InternalFacts['imports'],
  allowedPrefixes: readonly string[],
): ScanFactsV2['imports'] {
  return imports.map((imp) => {
    const allowed =
      (imp.source.startsWith('@/') || imp.source.startsWith('~/')) &&
      allowedPrefixes.some((prefix) => imp.source.startsWith(prefix));
    return {
      source: imp.source,
      specifiers: (imp.importedNames ?? []).map((name) => ({ name, isDefault: false })),
      isAllowed: allowed,
      line: imp.line,
      column: imp.column,
    };
  });
}

function buildComponentRecords(components: ComponentFacts[]): ScanFactsV2['components'] {
  return components.map((c) => ({
    name: c.name ?? '',
    isExported: true, // conservative — visitor doesn't track export status explicitly
    loc: c.endLine - c.line,
    isClientComponent: !c.isServerComponent,
    isServerComponent: c.isServerComponent,
    props: (c.propBindings ?? []).map((name) => ({ name, type: 'unknown' as const, isRequired: false })),
    hookCalls: (c.hookCalls ?? []).map((h) => ({ name: h.name, line: h.line, column: h.column })),
    line: c.line,
    column: c.column,
  }));
}

function buildLogicBlock(facts: InternalFacts): ScanFactsV2['logic'] {
  return {
    hooks: facts.hooks.map((h) => ({
      name: h.name,
      dependencies: h.body ? extractDepNames(h.body) : [],
      returnType: 'unknown' as const,
      location: 'component-body' as const,
      line: h.line,
      column: h.column,
    })),
    stateVariables: facts.components.flatMap((c) =>
      (c.stateBindings ?? StateBindingsNone).map((sb: StateBinding) => ({
        name: sb.valueName ?? '',
        setter: sb.setterName ?? '',
        isUsedInJSX: sb.valueReferenced,
        isZombie: !sb.valueReferenced && !sb.setterReferenced,
        line: sb.line,
        column: sb.column,
      })),
    ),
    defensiveChecks: facts.logicalExpressions
      .filter((le) => le.depth >= 3 && le.isOptionalChainLike)
      .map((le) => ({
        type: 'nullish' as const,
        target: le.text,
        isGhost: false,
        line: le.line,
        column: le.column,
      })),
    apiCalls: facts.fetchCalls.map((fc: FetchCallFact) => ({
      method: 'fetch',
      location: 'component-body' as const,
      isDirect: true,
      line: fc.line,
      column: fc.column,
    })),
    logicalExpressions: facts.logicalExpressions.map((le) => ({
      depth: le.depth,
      line: le.line,
      column: le.column,
      text: le.text,
      isOptionalChainLike: le.isOptionalChainLike,
    })),
    keyProps: facts.keyProps.map((kp: KeyPropFact) => ({
      tag: kp.tag,
      valueType: kp.valueType,
      line: kp.line,
      column: kp.column,
    })),
    optimisticUpdates: facts.optimisticUpdates.map((ou: OptimisticUpdateFact) => ({
      setterName: ou.setterName,
      line: ou.line,
      column: ou.column,
      hasCatchRollback: ou.hasCatchRollback,
    })),
  };
}

const StateBindingsNone: StateBinding[] = [];

/**
 * Public entry point. Assembles the full ScanFactsV2 object.
 */
export function buildV2Facts(
  facts: InternalFacts,
  source: string,
  ext: string,
  framework: string,
  config?: ResolvedConfig,
  templateClassNames: ClassNameFact[] = [],
): ScanFactsV2 {
  const jsxElements = buildJsxElements(facts.allElements);
  return {
    file: buildFileMeta(facts.filePath, source, ext, framework),
    imports: buildImportRecords(facts.imports, config?.allowedImports ?? []),
    components: buildComponentRecords(facts.components),
    jsx: {
      elements: jsxElements,
      maxNestingDepth: maxJsxNestingDepth(jsxElements),
    },
    logic: buildLogicBlock(facts),
    designTokens: scanDesignTokens(facts.staticClassNames),
    //  dead-code detector. Copy the internal accumulator
    //  into the v2 shape, marking each binding as referenced
    //  iff the file-level referenced-name set contains its name.
    deadCode: {
      bindings: facts.deadCode.bindings.map((b) => ({
        ...b,
        isReferenced: facts.referencedNames.has(b.name),
      })),
      constantConditions: facts.deadCode.constantConditions,
      unreachableStatements: facts.deadCode.unreachableStatements,
    },
    componentSizes: facts.componentSizes.map((cs: ComponentSizeFact) => ({
      name: cs.name,
      lineCount: cs.lineCount,
      jsxBranchCount: cs.jsxBranchCount,
      line: cs.line,
      column: cs.column,
    })),
    astroComponents: facts.astroComponents.map((ac: AstroComponentFact) => ({
      tag: ac.tag,
      hasClientDirective: ac.hasClientDirective,
      hasEventHandler: ac.hasEventHandler,
      line: ac.line,
      column: ac.column,
    })),
    disabledRules: extractDisabledRules(source),
    templateClassNames,
    _source: source,
  };
}

/**
 * Helper for the walk loop. Splits a file path into its base name and
 * lower-cased extension. Returns `{ baseName, ext }` where `ext`
 * includes the leading dot (".tsx") or is "" for extension-less
 * sniffed files.
 */
export function splitFilePath(filePath: string): { baseName: string; ext: string } {
  const baseName = filePath.split('/').pop() ?? filePath;
  const dotIdx = baseName.lastIndexOf('.');
  const ext = dotIdx > 0 ? `.${baseName.slice(dotIdx + 1).toLowerCase()}` : '';
  return { baseName, ext };
}

/**
 * Wrap the v2 build into the public ScanFacts envelope. The walk loop
 * returns `{ filePath, v2 }` so the result is callable as the final
 * expression of extractFacts().
 */
export function envelopeScanFacts(filePath: string, v2: ScanFactsV2): ScanFacts {
  return { filePath, v2 };
}
