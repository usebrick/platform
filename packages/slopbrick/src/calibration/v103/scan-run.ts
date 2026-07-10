import { verifyV103Observations } from './observations';
import type { SelectionRecord } from './selection';
import type { TerminalSyntheticOutcome } from './bisection';

type Counts = { requested: number; successful: number; excluded: number; failed: number };
const blank = (): Counts => ({ requested: 0, successful: 0, excluded: 0, failed: 0 });
const add = (counts: Counts, status: string) => { counts.requested++; if (status.startsWith('success')) counts.successful++; else if (status === 'excluded') counts.excluded++; else counts.failed++; };

export function materializeV103Scan(runId: string, records: readonly SelectionRecord[], outcomes: readonly TerminalSyntheticOutcome[]) {
  const selected = records.filter((record) => record.status === 'selected');
  const outcomeByFile = new Map(outcomes.map((outcome) => [outcome.fileId, outcome]));
  if (outcomeByFile.size !== outcomes.length || selected.length !== outcomes.length || selected.some((record) => !outcomeByFile.has(record.fileId))) throw new Error('Selected records and terminal outcomes do not match');
  const observations: Record<string, unknown>[] = [];
  const failures: Record<string, unknown>[] = [];
  const strata = new Map<string, Counts>(), repositories = new Map<string, Counts>(), families = new Map<string, Counts>();
  for (const record of selected) {
    const outcome = outcomeByFile.get(record.fileId)!;
    const polarity = record.label as 'verified_ai' | 'verified_human';
    const observation: Record<string, unknown> = { version: 'v10.3', runId, fileId: record.fileId, repositoryId: record.repositoryId, familyId: record.familyId, language: record.language, polarity, status: outcome.status };
    if (outcome.status === 'success_findings') observation.findingsCount = outcome.findingsCount;
    else if (outcome.status === 'success_zero') observation.findingsCount = 0;
    else observation.failureCode = outcome.status;
    observations.push(observation);
    if (outcome.status === 'parse_failure' || outcome.status === 'timeout' || outcome.status === 'scanner_failure') failures.push({ version: 'v10.3', runId, fileId: record.fileId, status: outcome.status, failureCode: outcome.status });
    for (const [map, key] of [[strata, `${record.language}\0${polarity}`], [repositories, record.repositoryId], [families, record.familyId]] as const) { const counts = map.get(key) ?? blank(); add(counts, outcome.status); map.set(key, counts); }
  }
  const total = observations.reduce<Counts>((counts, observation) => { add(counts, observation.status as string); return counts; }, blank());
  const coverage = { version: 'v10.3', runId, ...total,
    strata: [...strata].map(([key, counts]) => { const [language, polarity] = key.split('\0'); return { language, polarity, ...counts }; }),
    repositories: [...repositories].map(([repositoryId, counts]) => ({ repositoryId, ...counts })),
    families: [...families].map(([familyId, counts]) => ({ familyId, ...counts })),
  };
  const expected = { verified_ai: selected.filter((record) => record.label === 'verified_ai').map((record) => record.fileId), verified_human: selected.filter((record) => record.label === 'verified_human').map((record) => record.fileId) };
  const verification = verifyV103Observations({ runId, expectedFileIdsByPolarity: expected }, observations, failures, coverage);
  if (!verification.ok) throw new Error(`Observation materialization failed: ${verification.error}`);
  return { observations, failures, coverage, verification };
}
