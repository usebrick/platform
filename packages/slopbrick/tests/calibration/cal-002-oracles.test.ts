import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CAL002_DETERMINISTIC_RULE_IDS } from '../../src/calibration/cal-002/contracts';
import {
  CAL002_ORACLE_DECLARATIONS,
  CAL002_ORACLE_MUTATION_CASES,
  CAL002_ORACLE_SOURCE_CONTROLS,
  CAL002_ORACLE_TRANSFERS,
  type CAL002OracleAuthority,
} from './fixtures/cal-002-oracle-cases';

const AUTHORITIES = new Set<CAL002OracleAuthority>([
  'language-contract',
  'security-contract',
  'wcag-22',
  'repository-contract',
]);

function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

describe('CAL-002 deterministic oracle fixture registry', () => {
  it('covers exactly the frozen 32 rules with unique, hash-bound cases and five-family source controls', () => {
    expect(CAL002_DETERMINISTIC_RULE_IDS).toHaveLength(32);
    expect(CAL002_ORACLE_DECLARATIONS.map(({ ruleId }) => ruleId)).toEqual(CAL002_DETERMINISTIC_RULE_IDS);
    expect(new Set(CAL002_ORACLE_DECLARATIONS.map(({ ruleId }) => ruleId)).size).toBe(32);

    const caseIds = new Set<string>();
    const caseKeys = new Set<string>();
    const unitKeys = new Set<string>();

    for (const declaration of CAL002_ORACLE_DECLARATIONS) {
      expect(AUTHORITIES.has(declaration.authority)).toBe(true);
      expect(declaration.execution.mode.length).toBeGreaterThan(0);
      expect(declaration.execution.context.length).toBeGreaterThan(0);
      expect(declaration.reference.length).toBeGreaterThan(0);
      expect(declaration.positiveCaseIds.length).toBeGreaterThan(0);
      expect(declaration.negativeCaseIds.length).toBeGreaterThan(0);

      const ruleCases = CAL002_ORACLE_MUTATION_CASES.filter(({ ruleId }) => ruleId === declaration.ruleId);
      expect(ruleCases.some(({ caseId, expected }) => declaration.positiveCaseIds.includes(caseId) && expected === 'finding')).toBe(true);
      expect(ruleCases.some(({ caseId, expected }) => declaration.negativeCaseIds.includes(caseId) && expected === 'no-finding')).toBe(true);
      expect(new Set(ruleCases.map(({ source }) => source)).size).toBeGreaterThan(1);
      const positiveCases = ruleCases.filter(({ caseId }) => declaration.positiveCaseIds.includes(caseId));
      const negativeCases = ruleCases.filter(({ caseId }) => declaration.negativeCaseIds.includes(caseId));
      for (const positiveCase of positiveCases) {
        for (const negativeCase of negativeCases) expect(positiveCase.source).not.toBe(negativeCase.source);
      }

      const controls = CAL002_ORACLE_SOURCE_CONTROLS.filter(({ ruleId }) => ruleId === declaration.ruleId);
      expect(controls).toHaveLength(5);
      expect(new Set(controls.map(({ familyId }) => familyId)).size).toBe(5);
      expect(new Set(controls.map(({ source }) => source)).size).toBe(5);
      expect(controls.every(({ observed }) => observed === 'no-finding')).toBe(true);
    }

    for (const fixture of CAL002_ORACLE_MUTATION_CASES) {
      expect(caseIds.has(fixture.caseId)).toBe(false);
      caseIds.add(fixture.caseId);
      const key = `${fixture.ruleId}\0${fixture.caseId}`;
      expect(caseKeys.has(key)).toBe(false);
      caseKeys.add(key);
      expect(fixture.sourceSha256).toBe(sha256(fixture.source));
    }

    for (const fixture of CAL002_ORACLE_SOURCE_CONTROLS) {
      const key = `${fixture.ruleId}\0${fixture.unitId}`;
      expect(unitKeys.has(key)).toBe(false);
      unitKeys.add(key);
      expect(fixture.contentSha256).toBe(sha256(fixture.source));
      expect(fixture.unitId).not.toMatch(/(?:^|[/\\])(?:Users|home|tmp)(?:[/\\]|$)/u);
    }

    const declaredIds = new Set(CAL002_ORACLE_DECLARATIONS.map(({ ruleId }) => ruleId));
    for (const transfer of CAL002_ORACLE_TRANSFERS) {
      expect(CAL002_DETERMINISTIC_RULE_IDS).not.toContain(transfer.ruleId);
      expect(declaredIds).not.toContain(transfer.ruleId);
      expect(transfer.reason).toBe('standards-or-contract-quality-claim');
    }
  });
});
