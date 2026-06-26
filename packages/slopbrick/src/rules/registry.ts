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

export class RuleRegistry {
  private rules = new Map<string, Rule>();

  register(rule: Rule): void;
  register(id: string, factory: Rule): void;
  register(ruleOrId: Rule | string, factory?: Rule): void {
    if (typeof ruleOrId === 'string') {
      if (!factory) {
        throw new Error('Factory is required when registering by id');
      }
      const rule: Rule = {
        id: ruleOrId,
        category: factory.category,
        severity: factory.severity,
        aiSpecific: factory.aiSpecific,
        create: factory.create,
        analyze: factory.analyze,
      };
      this.rules.set(ruleOrId, rule);
    } else {
      this.rules.set(ruleOrId.id, ruleOrId);
    }
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
