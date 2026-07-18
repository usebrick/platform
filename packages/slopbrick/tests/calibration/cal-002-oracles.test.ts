import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CAL002_DETERMINISTIC_RULE_IDS } from '../../src/calibration/cal-002/contracts';
import * as oracleFixtureRegistry from './fixtures/cal-002-oracle-cases';
import {
  CAL002_ORACLE_CONTROL_SOURCES,
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

const CONTROL_FAMILY_IDS = [
  'baseline',
  'alternate-syntax',
  'comment-adjacent',
  'near-miss',
  'regression-safe',
] as const;

const EXPECTED_CASE_IDS_BY_RULE = CAL002_DETERMINISTIC_RULE_IDS.map((ruleId) => [
  `cal002-${ruleId.replace('/', '-')}-positive`,
  `cal002-${ruleId.replace('/', '-')}-negative`,
] as const);

const EXPECTED_UNIT_IDS_BY_RULE = CAL002_DETERMINISTIC_RULE_IDS.map((ruleId) =>
  CONTROL_FAMILY_IDS.map((familyId) => `cal002-${ruleId.replace('/', '-')}-${familyId}`),
);

type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

interface FixtureExecution {
  readonly mode: string;
  readonly context: Record<string, JsonValue>;
}

interface FixtureControlWithExecution {
  readonly source: string;
  readonly contentSha256: string;
  readonly execution?: FixtureExecution;
}

function sha256(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key] as JsonValue)}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('Expected a JSON-serializable oracle value.');
  return encoded;
}

function expectVirtualRelativePath(path: string): void {
  expect(path.length).toBeGreaterThan(0);
  expect(path).not.toMatch(/^(?:[/\\]|[A-Za-z]:[/\\])/u);
  expect(path).not.toMatch(/(?:^|[/\\])(?:Users|home|tmp)(?:[/\\]|$)/u);
  expect(path).not.toContain('\\');
}

describe('CAL-002 deterministic oracle fixture registry', () => {
  it('rejects the legacy mechanical JavaScript control wrappers', () => {
    const legacyWrappers = [
      { prefix: '(() => {\n', suffix: '\n})();' },
      { prefix: '/* CAL-002 source control */\n', suffix: '' },
      { prefix: 'if (true) {\n', suffix: '\n}' },
      { prefix: 'try {\n', suffix: '\n} finally {\n  void 0;\n}' },
    ];

    for (const control of CAL002_ORACLE_SOURCE_CONTROLS) {
      expect(legacyWrappers.some(({ prefix, suffix }) =>
        control.source.startsWith(prefix) && control.source.endsWith(suffix))).toBe(false);
    }
  });

  it.each([
    'source-text',
    'allowed-imports',
    'link-resolution',
    'multi-file',
    'route-context',
  ] as const)('provides reproducible %s execution context on every control', (mode) => {
    const declarations = CAL002_ORACLE_DECLARATIONS.filter((declaration) => declaration.execution.mode === mode);
    expect(declarations.length).toBeGreaterThan(0);

    for (const declaration of declarations) {
      const controls = CAL002_ORACLE_SOURCE_CONTROLS.filter(({ ruleId }) => ruleId === declaration.ruleId);
      for (const fixture of controls) {
        const control = fixture as FixtureControlWithExecution;
        expect(control.execution).toBeDefined();
        if (control.execution === undefined) continue;
        expect(control.execution.mode).toBe(mode);
        expect(control.execution).toEqual(declaration.execution);

        switch (mode) {
          case 'source-text': {
            expectVirtualRelativePath(control.execution.context.virtualSourcePath as string);
            break;
          }
          case 'allowed-imports': {
            const { virtualImporterPath, allowedImports } = control.execution.context;
            expectVirtualRelativePath(virtualImporterPath as string);
            expect(allowedImports).toEqual(expect.arrayContaining(['@/components/']));
            break;
          }
          case 'link-resolution': {
            const { virtualDocumentPath, virtualTargets } = control.execution.context;
            expectVirtualRelativePath(virtualDocumentPath as string);
            expect(virtualTargets).toEqual(expect.arrayContaining([
              expect.objectContaining({ path: 'docs/guide.md' }),
            ]));
            for (const target of virtualTargets as readonly { readonly path: string }[]) {
              expectVirtualRelativePath(target.path);
            }
            break;
          }
          case 'multi-file': {
            const { virtualDocumentPath, virtualFiles } = control.execution.context;
            expectVirtualRelativePath(virtualDocumentPath as string);
            expect(virtualFiles).toEqual(expect.arrayContaining([
              expect.objectContaining({ path: expect.any(String), content: expect.any(String) }),
            ]));
            for (const file of virtualFiles as readonly { readonly path: string }[]) {
              expectVirtualRelativePath(file.path);
            }
            break;
          }
          case 'route-context': {
            const { virtualRoutePath, middleware, authorization } = control.execution.context;
            expectVirtualRelativePath(virtualRoutePath as string);
            expect(middleware).toEqual(expect.any(Array));
            expect((middleware as readonly string[]).length).toBeGreaterThan(0);
            expect(authorization).toEqual(expect.objectContaining({ kind: expect.any(String) }));
            break;
          }
        }
      }
    }
  });

  it('binds canonical source and execution context into each control content hash', () => {
    for (const fixture of CAL002_ORACLE_SOURCE_CONTROLS) {
      const control = fixture as FixtureControlWithExecution;
      expect(control.execution).toBeDefined();
      if (control.execution === undefined) continue;
      expect(control.contentSha256).toBe(sha256(canonicalJson({
        source: control.source,
        context: control.execution.context,
      })));
    }
  });

  it('uses genuine safe layout for the focus-obscured regression control', () => {
    const control = CAL002_ORACLE_CONTROL_SOURCES['wcag/focus-obscured']['regression-safe'];
    expect(control).not.toMatch(/\b(?:fixed|sticky)\b/u);
    expect(control).not.toMatch(/\bfixed\b[^"']*\bfixed-(?:width|height)\b/u);
  });

  it('locks the exact case and five-family unit IDs in frozen rule order', () => {
    const registry = oracleFixtureRegistry as typeof oracleFixtureRegistry & {
      readonly CAL002_ORACLE_CASE_IDS?: readonly (readonly [string, string])[];
      readonly CAL002_ORACLE_UNIT_IDS?: readonly (readonly string[])[];
    };

    expect(registry.CAL002_ORACLE_CASE_IDS).toEqual(EXPECTED_CASE_IDS_BY_RULE);
    expect(registry.CAL002_ORACLE_UNIT_IDS).toEqual(EXPECTED_UNIT_IDS_BY_RULE);
    expect(CAL002_ORACLE_MUTATION_CASES.map(({ caseId }) => caseId)).toEqual(EXPECTED_CASE_IDS_BY_RULE.flat());
    expect(CAL002_ORACLE_SOURCE_CONTROLS.map(({ unitId }) => unitId)).toEqual(EXPECTED_UNIT_IDS_BY_RULE.flat());
  });

  it('covers exactly the frozen 32 rules with unique, hash-bound cases and five-family source controls', () => {
    expect(CAL002_DETERMINISTIC_RULE_IDS).toHaveLength(32);
    expect(CAL002_ORACLE_DECLARATIONS.map(({ ruleId }) => ruleId)).toEqual(CAL002_DETERMINISTIC_RULE_IDS);
    expect(new Set(CAL002_ORACLE_DECLARATIONS.map(({ ruleId }) => ruleId)).size).toBe(32);
    expect(Object.keys(CAL002_ORACLE_CONTROL_SOURCES)).toEqual(CAL002_DETERMINISTIC_RULE_IDS);

    const caseIds = new Set<string>();
    const caseKeys = new Set<string>();
    const unitKeys = new Set<string>();

    for (const declaration of CAL002_ORACLE_DECLARATIONS) {
      expect(AUTHORITIES.has(declaration.authority)).toBe(true);
      expect(declaration.execution.mode.length).toBeGreaterThan(0);
      expect(Object.keys(declaration.execution.context).length).toBeGreaterThan(0);
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
      const authoredControls = CAL002_ORACLE_CONTROL_SOURCES[declaration.ruleId];
      expect(controls).toHaveLength(5);
      expect(Object.keys(authoredControls)).toEqual(CONTROL_FAMILY_IDS);
      expect(controls.map(({ familyId }) => familyId)).toEqual(CONTROL_FAMILY_IDS);
      expect(controls.map(({ familyId, source }) => ({ familyId, source }))).toEqual(
        CONTROL_FAMILY_IDS.map((familyId) => ({ familyId, source: authoredControls[familyId] })),
      );
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
