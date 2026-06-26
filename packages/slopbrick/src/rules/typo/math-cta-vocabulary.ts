import type { Issue, Rule, RuleContext, ScanFacts } from '../../types';
import { createRule } from '../rule';

/**
 * Math rule: AI-default CTA vocabulary fingerprint.
 * AI vibe-coded sites reuse a small set of marketing-style CTA phrases:
 *   "Get started", "Sign up", "Learn more", "Try now", "Try free", etc.
 * next, back, ok, yes, no, done, confirm, apply, reset, etc.) from
 * the vocabulary list. Those terms fire on virtually any UI with
 * buttons and produced FP > TP in calibration. The remaining list
 * is restricted to marketing/CTA copy that AI vibe-coding sites
 * reuse heavily but humans rarely reach for.
 * Threshold: ≥4 buttons AND ≥80% match the (now-tighter) AI vocabulary.
 */
const AI_VOCAB = new Set([
  'get started', 'sign up', 'learn more', 'try now', 'try free',
  'subscribe', 'continue', 'send', 'book a demo', 'start free trial',
  'start trial', 'get in touch', 'view all', 'see more', 'load more',
  'show more', 'read more', 'explore', 'discover', 'launch', 'deploy',
  'connect', 'join', 'log in', 'sign in', 'register', 'invite', 'share',
]);

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export const mathCtaVocabularyRule = createRule<RuleContext>({
  id: 'typo/math-cta-vocabulary',
  category: 'typo',
  severity: 'medium',
  aiSpecific: true,
  description: 'CTA button text falls back to a small AI-default vocabulary in ≥80% of buttons',
  create(context) {
    return context;
  },
  analyze(_context, facts): Issue[] {
    const issues: Issue[] = [];
    if (!facts.v2) return issues;
    let aiCount = 0;
    let total = 0;
    let firstAnchor: { line: number; column: number } | undefined;

    for (const el of facts.v2.jsx.elements) {
      if (el.tag.toLowerCase() !== 'button') continue;
      const ariaLabel = el.attributes['aria-label'];
      const text = el.attributes.value ?? ariaLabel ?? '';
      const trimmed = text.trim();
      if (!trimmed) continue;
      total++;
      if (!firstAnchor) firstAnchor = { line: el.line, column: el.column };
      if (AI_VOCAB.has(normalizeText(trimmed))) aiCount++;
    }

    if (total < 4) return issues;
    const ratio = aiCount / total;
    if (ratio < 0.8) return issues;

    issues.push({
      ruleId: 'typo/math-cta-vocabulary',
      category: 'typo',
      severity: 'medium',
      aiSpecific: true,
      message:
        `${aiCount}/${total} buttons (${(ratio * 100).toFixed(0)}%) use AI-default CTA vocabulary (Get started, Sign up, Learn more, etc.). ` +
        `Humans mix domain-specific verbs.`,
      line: firstAnchor?.line ?? 1,
      column: firstAnchor?.column ?? 1,
      advice:
        'Use domain-specific action verbs ("Reserve", "Confirm ride", "Activate card") instead of falling back on the AI-default CTA vocabulary.',
    });

    return issues;
  },
});

export default mathCtaVocabularyRule satisfies Rule<RuleContext>;
