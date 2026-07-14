import { isV103RuleEvidenceList, type V103RuleEvidence } from './rule-evidence';

export type ScanClass = { readonly kind: 'success'; readonly findingsCount: number; readonly ruleEvidence?: readonly V103RuleEvidence[] } | { readonly kind: 'excluded'; readonly exclusionReason: string } | { readonly kind: 'parse_failure' } | { readonly kind: 'timeout' } | { readonly kind: 'crash' };
export interface ScannerInvocation { readonly filePath: string; readonly resultPath: string; readonly timeoutMs: number; readonly includeRules: readonly string[]; readonly excludeRules: readonly string[]; }
export type ScannerInvoker = (input: ScannerInvocation) => Promise<{ readonly exitCode: number; readonly json?: unknown }>;

type IssueMetadata = Pick<V103RuleEvidence, 'ruleId' | 'category' | 'aiSpecific' | 'severity'>;

function issueMetadata(value: unknown): IssueMetadata | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const issue = value as Record<string, unknown>;
  if (typeof issue.ruleId !== 'string' || issue.ruleId.length === 0 || typeof issue.category !== 'string' || typeof issue.aiSpecific !== 'boolean' || issue.severity !== 'low' && issue.severity !== 'medium' && issue.severity !== 'high') return undefined;
  return { ruleId: issue.ruleId, category: issue.category as IssueMetadata['category'], aiSpecific: issue.aiSpecific, severity: issue.severity };
}

function preserveRuleEvidence(issues: unknown[]): { readonly ok: true; readonly ruleEvidence?: readonly V103RuleEvidence[] } | { readonly ok: false } {
  const byRule = new Map<string, V103RuleEvidence>();
  for (const issue of issues) {
    const metadata = issueMetadata(issue);
    if (!metadata) return { ok: false };
    const existing = byRule.get(metadata.ruleId);
    if (existing) {
      if (existing.category !== metadata.category || existing.aiSpecific !== metadata.aiSpecific || existing.severity !== metadata.severity) return { ok: false };
      byRule.set(metadata.ruleId, { ...existing, count: existing.count + 1 });
    } else {
      byRule.set(metadata.ruleId, { ...metadata, count: 1 });
    }
  }
  const ruleEvidence = [...byRule.values()].sort((left, right) => left.ruleId < right.ruleId ? -1 : left.ruleId > right.ruleId ? 1 : 0);
  return ruleEvidence.length === 0 || isV103RuleEvidenceList(ruleEvidence) ? { ok: true, ...(ruleEvidence.length === 0 ? {} : { ruleEvidence }) } : { ok: false };
}

/** Classifies the existing scan-file-worker JSON contract without exposing local paths. */
export async function invokeV103Scanner(invoke: ScannerInvoker, options: Omit<ScannerInvocation, 'includeRules' | 'excludeRules'> & { readonly includeRules?: readonly string[]; readonly excludeRules?: readonly string[] }): Promise<ScanClass> {
  try {
    const response = await invoke({ ...options, includeRules: options.includeRules ?? [], excludeRules: options.excludeRules ?? [] });
    if (response.exitCode !== 0 || typeof response.json !== 'object' || response.json === null || Array.isArray(response.json)) return { kind: 'crash' };
    const json = response.json as Record<string, unknown>;
    if (json.ok !== true) return { kind: 'crash' };
    if (typeof json.parseError === 'string' && json.parseError.length > 0) return { kind: 'parse_failure' };
    if (!Array.isArray(json.issues)) return { kind: 'crash' };
    const preserved = preserveRuleEvidence(json.issues);
    if (!preserved.ok) return { kind: 'crash' };
    return { kind: 'success', findingsCount: json.issues.length, ...(preserved.ruleEvidence === undefined ? {} : { ruleEvidence: preserved.ruleEvidence }) };
  } catch (error) {
    return error instanceof Error && (error.name === 'TimeoutError' || (error as { code?: string }).code === 'ETIMEDOUT' || /^child timeout after \d+ms$/.test(error.message)) ? { kind: 'timeout' } : { kind: 'crash' };
  }
}
