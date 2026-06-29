import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * Rule: product/ux-pattern-fragmentation
 * Phase 9 of ROADMAP.md (Product Consistency, target 0.9.0).
 *
 * Counts the number of distinct UX patterns per category across the
 * codebase. Fires when the count exceeds a per-category threshold —
 * e.g. 5 distinct modal implementations, 4 distinct confirmation
 * dialogs. AI agents pick whichever pattern their training data last
 * surfaced, so the count balloons faster than human-authored code.
 *
 * Pattern categories (initial v1):
 *   - modal       (Modal, Dialog, Sheet, Drawer, Popup, Overlay)
 *   - toast       (Toast, Snackbar, Notification, Alert, Banner)
 *   - button      (Button, IconButton, Action, CTA, LinkButton)
 *   - input       (Input, TextField, FormField, TextInput, SearchBox)
 *   - card        (Card, Tile, Panel, Box, Surface)
 *
 * Per-category thresholds (deliberately tight to fire only when there's
 * genuine drift; can be relaxed in signal-strength.json if it false-alarms):
 *   - modal:    4 distinct = fire (humans consolidate around 1–2)
 *   - toast:    3 distinct = fire (one Toast + one Snackbar is normal)
 *   - button:   5 distinct = fire (Button + IconButton + LinkButton is normal)
 *   - input:    4 distinct = fire
 *   - card:     4 distinct = fire
 *
 * The rule emits one issue per category that exceeds its threshold.
 */

interface PatternCategory {
  /** Display name for the issue message. */
  label: string;
  /** Suffixes / prefixes that signal a component belongs to this category. */
  matches: (name: string) => boolean;
  /** Threshold above which the rule fires. */
  threshold: number;
}

const CATEGORIES: PatternCategory[] = [
  {
    label: 'modal',
    matches: (n) => /(?:Modal|Dialog|Sheet|Drawer|Popup|Overlay|Lightbox)$/i.test(n),
    threshold: 4,
  },
  {
    label: 'toast',
    matches: (n) => /(?:Toast|Snackbar|Notification|Alert|Banner|Flash)$/i.test(n),
    threshold: 3,
  },
  {
    label: 'button',
    matches: (n) => /(?:Button|Action|Cta|LinkButton|FloatingAction)$/i.test(n),
    threshold: 5,
  },
  {
    label: 'input',
    matches: (n) => /(?:Input|TextField|FormField|TextInput|SearchBox|TextArea|Select)$/i.test(n),
    threshold: 4,
  },
  {
    label: 'card',
    // Container is excluded — it's a layout primitive, not a card.
    matches: (n) => /(?:Card|Tile|Panel|Box|Surface)$/i.test(n),
    threshold: 4,
  },
];

export const uxPatternFragmentationRule = createRule<RuleContext>({
  id: 'product/ux-pattern-fragmentation',
  category: 'arch',
  severity: 'medium',
  aiSpecific: true,
  description:
    'Too many distinct UX patterns per category (e.g. 5 modal implementations, 4 confirmation dialogs). Pick one canonical pattern per category and remove the rest.',
  create(context) {
    return context;
  },
  analyze(_context, facts: ScanFacts): Issue[] {
    const counts: Record<string, Set<string>> = {};
    for (const cat of CATEGORIES) {
      counts[cat.label] = new Set();
    }

    for (const component of facts.v2.components) {
      if (!component.name) continue;
      if (!/^[A-Z]/.test(component.name)) continue;
      for (const cat of CATEGORIES) {
        if (cat.matches(component.name)) {
          counts[cat.label]!.add(component.name);
          break;
        }
      }
    }

    const issues: Issue[] = [];
    for (const cat of CATEGORIES) {
      const distinct = counts[cat.label]!.size;
      if (distinct < cat.threshold) continue;

      const examples = [...counts[cat.label]!].slice(0, 5).join(', ');
      const more = distinct > 5 ? `, +${distinct - 5} more` : '';
      issues.push({
        ruleId: 'product/ux-pattern-fragmentation',
        category: 'arch',
        severity: 'medium',
        aiSpecific: true,
        message:
          `${cat.label} category has ${distinct} distinct patterns (threshold: ${cat.threshold}): ` +
          `${examples}${more}. Consolidate to one canonical ${cat.label} and remove the others.`,
        filePath: facts.v2.file.path,
        line: 1,
        column: 1,
        advice:
          `Pick the most-used ${cat.label} implementation as canonical, then alias or delete the ` +
          `rest. slopbrick's \`patterns\` subcommand and \`slop_suggest\` MCP tool already know ` +
          `about the canonical pattern from the constitution; the drift is the gap.`,
      });
    }

    return issues;
  },
});

export default uxPatternFragmentationRule satisfies Rule<RuleContext>;
