import { builtinRules } from './builtins';
import type { Issue, Rule, RuleContext, ResolvedConfig } from '../types';

export interface EnabledRule {
  rule: Rule;
  context: unknown;
}

/**
 * v0.9.3: re-export the canonical `Rule<Context>` from `src/types.ts` as
 * `RuleRegistryFactory` for the one external caller that imports it by
 * name. Was structurally identical to `Rule` but missing the
 * `description?` field, so the duplicate type was a footgun.
 */
export type RuleRegistryFactory<Context = unknown> = Rule<Context>;

/**
 * v0.42.0 (Sprint 3, §3b.4): a rule whose existence is a co-fire of
 *  existing rules. The `RuleRegistry` treats composites uniformly
 *  with built-ins \u2014 same `register` + `createContexts` lifecycle.
 */
export type CompositeAsRule = Rule & {
  /** Member rule IDs that must co-fire for the composite to fire. */
  compositeRuleIds: ReadonlyArray<string>;
  /** Minimum number of members that must co-fire. */
  compositeMinMatch: number;
};

export class RuleRegistry {
  private rules = new Map<string, Rule>();

  /**
   * Register a rule. The 2-arg overload `register(id, factory)` was
   * deleted in v0.42.0 (architecture review F6): no callers used it,
   * every `Rule` carries its own `id`, and the per-id registration
   * was ergonomically redundant with the 1-arg form (`register(rule)`).
   * External consumers that needed `register-by-id` semantics can
   * construct a `Rule` directly and pass it in.
   */
  register(rule: Rule): void {
    this.rules.set(rule.id, rule);
  }

  loadBuiltins(onlyRuleId?: string): void {
    for (const rule of builtinRules) {
      if (onlyRuleId && rule.id !== onlyRuleId) continue;
      this.register(rule);
    }
  }

  getRules(filter?: { kind: 'ai' | 'human' }): Rule[] {
    const list = Array.from(this.rules.values());
    if (!filter) return list;
    return list.filter((r) => (filter.kind === 'ai' ? r.aiSpecific : !r.aiSpecific));
  }

  /** v0.18.8: remove every rule where `predicate(rule)` returns true.
   *  Used by focused calibration scripts to scan a single category
   *  without instantiating all 99 rules. */
  removeWhere(predicate: (rule: Rule) => boolean): number {
    let removed = 0;
    for (const [id, rule] of this.rules) {
      if (predicate(rule)) {
        this.rules.delete(id);
        removed++;
      }
    }
    return removed;
  }

  all(): Rule[] {
    return Array.from(this.rules.values());
  }

  /** v0.42.0 (§3b.5): look up a registered rule by id.
   *  Returns undefined if not registered. */
  get(id: string): Rule | undefined {
    return this.rules.get(id);
  }

  /** v0.42.0 (§3b.5): check whether a rule id is registered. */
  has(id: string): boolean {
    return this.rules.has(id);
  }

  createContexts(
    config: ResolvedConfig,
    filePath: string,
    cwd: string,
    hotspotIssues: Issue[] = [],
  ): EnabledRule[] {
    const context: RuleContext = {
      config,
      filePath,
      cwd,
      framework: config.framework,
      uiLibraries: config.uiLibraries,
      hasTailwind: config.hasTailwind,
      supportsRsc: config.supportsRsc,
      hotspotIssues,
    };
    return this.getRules().map((rule) => ({
      rule,
      context: rule.create(context),
    }));
  }
}
