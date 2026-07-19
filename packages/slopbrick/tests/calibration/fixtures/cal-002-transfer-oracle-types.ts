import { createHash } from 'node:crypto';

import type {
  CAL002OracleAuthority,
  CAL002OracleExecution,
  CAL002OracleObservation,
} from './cal-002-oracle-cases';

export type CAL002TransferredOracleRuleId =
  | 'cpp/c-style-cast'
  | 'cpp/raw-new-delete'
  | 'rust/todo-macro'
  | 'dead/unreachable'
  | 'dead/unused-import'
  | 'dead/unused-local'
  | 'dead/unused-parameter'
  | 'security/hardcoded-secret'
  | 'security/sql-construction';

export interface CAL002TransferOracleCase {
  readonly caseId: string;
  readonly virtualPath: string;
  readonly source: string;
}

export type CAL002TransferOracleControlFamily =
  | 'alternate-syntax'
  | 'baseline'
  | 'comment-adjacent'
  | 'near-miss'
  | 'regression-safe';

export type CAL002TransferOracleControl = CAL002TransferOracleCase & {
  readonly familyId: CAL002TransferOracleControlFamily;
};

export interface CAL002TransferredOracleFixture {
  readonly ruleId: CAL002TransferredOracleRuleId;
  readonly authority: CAL002OracleAuthority;
  readonly reference: string;
  readonly execution: CAL002OracleExecution;
  readonly positiveCases: readonly CAL002TransferOracleCase[];
  readonly negativeCases: readonly CAL002TransferOracleCase[];
  readonly adversarialCases: readonly CAL002TransferOracleCase[];
  readonly controls: readonly [
    CAL002TransferOracleCase & { readonly familyId: 'alternate-syntax' },
    CAL002TransferOracleCase & { readonly familyId: 'baseline' },
    CAL002TransferOracleCase & { readonly familyId: 'comment-adjacent' },
    CAL002TransferOracleCase & { readonly familyId: 'near-miss' },
    CAL002TransferOracleCase & { readonly familyId: 'regression-safe' },
  ];
}

export interface CAL002DurableTransferOracleCase {
  readonly caseId: string;
  readonly expected: CAL002OracleObservation;
  readonly observed: CAL002OracleObservation;
  readonly sourceSha256: string;
}

export const CAL002_TRANSFER_CONTROL_FAMILIES = [
  'alternate-syntax',
  'baseline',
  'comment-adjacent',
  'near-miss',
  'regression-safe',
] as const satisfies readonly CAL002TransferOracleControlFamily[];

const TRANSFERRED_RULE_IDS = new Set<CAL002TransferredOracleRuleId>([
  'cpp/c-style-cast',
  'cpp/raw-new-delete',
  'rust/todo-macro',
  'dead/unreachable',
  'dead/unused-import',
  'dead/unused-local',
  'dead/unused-parameter',
  'security/hardcoded-secret',
  'security/sql-construction',
]);

const AUTHORITIES = new Set<CAL002OracleAuthority>([
  'language-contract',
  'security-contract',
  'wcag-22',
  'repository-contract',
]);

const OBSERVATIONS = new Set<CAL002OracleObservation>([
  'finding',
  'no-finding',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (actual.length !== canonical.length || actual.some((key, index) => key !== canonical[index])) {
    throw new TypeError(`${label} contains unknown or missing fields`);
  }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function expectedExtensions(ruleId: CAL002TransferredOracleRuleId): readonly string[] {
  if (ruleId.startsWith('cpp/')) {
    return ['.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh', '.hxx'];
  }
  if (ruleId.startsWith('rust/')) return ['.rs'];
  return ['.ts', '.tsx'];
}

function assertVirtualPath(
  value: unknown,
  ruleId: CAL002TransferredOracleRuleId,
  label: string,
): asserts value is string {
  assertNonEmptyString(value, label);
  if (
    value.startsWith('/')
    || /^[A-Za-z]:/.test(value)
    || value.includes('\\')
    || value.split('/').some((segment) => segment === '..' || segment === '.' || segment.length === 0)
  ) {
    throw new TypeError(`${label} must be a normalized relative virtual path`);
  }
  const lowerPath = value.toLowerCase();
  if (!expectedExtensions(ruleId).some((extension) => lowerPath.endsWith(extension))) {
    throw new TypeError(`${label} has a mismatched language extension for ${ruleId}`);
  }
}

function assertSourceCase(
  value: unknown,
  ruleId: CAL002TransferredOracleRuleId,
  label: string,
  expectedFamily?: CAL002TransferOracleControlFamily,
): asserts value is CAL002TransferOracleCase | CAL002TransferOracleControl {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  assertExactKeys(
    value,
    expectedFamily
      ? ['caseId', 'familyId', 'source', 'virtualPath']
      : ['caseId', 'source', 'virtualPath'],
    label,
  );
  assertNonEmptyString(value.caseId, `${label}.caseId`);
  assertVirtualPath(value.virtualPath, ruleId, `${label}.virtualPath`);
  assertNonEmptyString(value.source, `${label}.source`);
  if (expectedFamily !== undefined && value.familyId !== expectedFamily) {
    throw new TypeError(`${label} must use control family ${expectedFamily}`);
  }
}

export function sourceText(virtualSourcePath: string): CAL002OracleExecution {
  return {
    mode: 'source-text',
    context: { virtualSourcePath },
  };
}

export function fiveControls(
  virtualPath: string,
  sources: readonly [string, string, string, string, string],
): CAL002TransferredOracleFixture['controls'] {
  return [
    {
      caseId: 'control-alternate-syntax',
      familyId: 'alternate-syntax',
      virtualPath,
      source: sources[0],
    },
    {
      caseId: 'control-baseline',
      familyId: 'baseline',
      virtualPath,
      source: sources[1],
    },
    {
      caseId: 'control-comment-adjacent',
      familyId: 'comment-adjacent',
      virtualPath,
      source: sources[2],
    },
    {
      caseId: 'control-near-miss',
      familyId: 'near-miss',
      virtualPath,
      source: sources[3],
    },
    {
      caseId: 'control-regression-safe',
      familyId: 'regression-safe',
      virtualPath,
      source: sources[4],
    },
  ];
}

export function durableTransferOracleCase(
  testCase: CAL002TransferOracleCase,
  expected: CAL002OracleObservation,
  observed: CAL002OracleObservation,
): CAL002DurableTransferOracleCase {
  const durable = {
    caseId: testCase.caseId,
    expected,
    observed,
    sourceSha256: createHash('sha256').update(testCase.source).digest('hex'),
  } satisfies CAL002DurableTransferOracleCase;
  assertCAL002DurableTransferOracleCase(durable);
  return durable;
}

export function assertCAL002DurableTransferOracleCase(
  value: unknown,
): asserts value is CAL002DurableTransferOracleCase {
  if (!isRecord(value)) {
    throw new TypeError('CAL-002 durable transfer-oracle case must be an object');
  }
  assertExactKeys(
    value,
    ['caseId', 'expected', 'observed', 'sourceSha256'],
    'CAL-002 durable transfer-oracle case',
  );
  assertNonEmptyString(value.caseId, 'durable caseId');
  if (!OBSERVATIONS.has(value.expected as CAL002OracleObservation)) {
    throw new TypeError('durable expected observation is invalid');
  }
  if (!OBSERVATIONS.has(value.observed as CAL002OracleObservation)) {
    throw new TypeError('durable observed observation is invalid');
  }
  if (typeof value.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sourceSha256)) {
    throw new TypeError('durable sourceSha256 must be a lowercase SHA-256 digest');
  }
}

export function assertCAL002TransferredOracleFixture(
  value: unknown,
): asserts value is CAL002TransferredOracleFixture {
  if (!isRecord(value)) {
    throw new TypeError('CAL-002 transferred oracle fixture must be an object');
  }
  assertExactKeys(
    value,
    [
      'adversarialCases',
      'authority',
      'controls',
      'execution',
      'negativeCases',
      'positiveCases',
      'reference',
      'ruleId',
    ],
    'CAL-002 transferred oracle fixture',
  );
  if (!TRANSFERRED_RULE_IDS.has(value.ruleId as CAL002TransferredOracleRuleId)) {
    throw new TypeError('CAL-002 transferred oracle fixture has an unknown rule ID');
  }
  const ruleId = value.ruleId as CAL002TransferredOracleRuleId;
  if (!AUTHORITIES.has(value.authority as CAL002OracleAuthority)) {
    throw new TypeError(`CAL-002 transferred oracle fixture ${ruleId} has an invalid authority`);
  }
  assertNonEmptyString(value.reference, `${ruleId}.reference`);

  if (!isRecord(value.execution) || value.execution.mode !== 'source-text') {
    throw new TypeError(`${ruleId}.execution must use source-text mode`);
  }
  assertExactKeys(value.execution, ['context', 'mode'], `${ruleId}.execution`);
  if (!isRecord(value.execution.context)) {
    throw new TypeError(`${ruleId}.execution.context must be an object`);
  }
  assertExactKeys(
    value.execution.context,
    ['virtualSourcePath'],
    `${ruleId}.execution.context`,
  );
  assertVirtualPath(
    value.execution.context.virtualSourcePath,
    ruleId,
    `${ruleId}.execution.context.virtualSourcePath`,
  );
  const executionPath = value.execution.context.virtualSourcePath;

  const groups = [
    ['positiveCases', value.positiveCases],
    ['negativeCases', value.negativeCases],
    ['adversarialCases', value.adversarialCases],
  ] as const;
  const seenCaseIds = new Set<string>();
  for (const [groupName, cases] of groups) {
    if (!Array.isArray(cases) || cases.length === 0) {
      throw new TypeError(`${ruleId}.${groupName} must contain at least one case`);
    }
    cases.forEach((testCase, index) => {
      const label = `${ruleId}.${groupName}[${index}]`;
      assertSourceCase(testCase, ruleId, label);
      if (testCase.virtualPath !== executionPath) {
        throw new TypeError(`${label} path must match the source-text execution path`);
      }
      if (seenCaseIds.has(testCase.caseId)) {
        throw new TypeError(`${ruleId} contains duplicate case ID ${testCase.caseId}`);
      }
      seenCaseIds.add(testCase.caseId);
    });
  }

  if (!Array.isArray(value.controls) || value.controls.length !== 5) {
    throw new TypeError(`${ruleId}.controls must contain exactly five control cases`);
  }
  value.controls.forEach((control, index) => {
    const family = CAL002_TRANSFER_CONTROL_FAMILIES[index]!;
    const label = `${ruleId}.controls[${index}]`;
    assertSourceCase(control, ruleId, label, family);
    if (control.virtualPath !== executionPath) {
      throw new TypeError(`${label} path must match the source-text execution path`);
    }
    if (seenCaseIds.has(control.caseId)) {
      throw new TypeError(`${ruleId} contains duplicate case ID ${control.caseId}`);
    }
    seenCaseIds.add(control.caseId);
  });
}
