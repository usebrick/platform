export type V103RuleEvidence = {
  readonly ruleId: string;
  readonly category: 'visual' | 'typo' | 'wcag' | 'layout' | 'component' | 'logic' | 'arch' | 'perf' | 'security' | 'test' | 'docs' | 'db' | 'ai' | 'context' | 'product' | 'i18n';
  readonly aiSpecific: boolean;
  readonly severity: 'low' | 'medium' | 'high';
  readonly count: number;
};

const CATEGORIES = new Set<V103RuleEvidence['category']>(['visual','typo','wcag','layout','component','logic','arch','perf','security','test','docs','db','ai','context','product','i18n']);
const SEVERITIES = new Set<V103RuleEvidence['severity']>(['low','medium','high']);
const RULE_ID = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export function isV103RuleEvidenceList(value: unknown): value is readonly V103RuleEvidence[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
    const evidence = item as Record<string, unknown>;
    if (Object.keys(evidence).some((key) => !['ruleId','category','aiSpecific','severity','count'].includes(key))
      || typeof evidence.ruleId !== 'string' || !RULE_ID.test(evidence.ruleId)
      || typeof evidence.category !== 'string' || !CATEGORIES.has(evidence.category as V103RuleEvidence['category'])
      || typeof evidence.aiSpecific !== 'boolean' || !SEVERITIES.has(evidence.severity as V103RuleEvidence['severity'])
      || typeof evidence.count !== 'number' || !Number.isSafeInteger(evidence.count) || evidence.count < 1
      || seen.has(evidence.ruleId)) return false;
    seen.add(evidence.ruleId);
  }
  return true;
}
