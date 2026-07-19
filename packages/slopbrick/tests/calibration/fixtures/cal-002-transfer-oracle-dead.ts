import type { CAL002OracleAuthority } from './cal-002-oracle-cases';
import {
  fiveControls,
  sourceText,
  type CAL002TransferOracleCase,
  type CAL002TransferredOracleFixture,
  type CAL002TransferredOracleRuleId,
} from './cal-002-transfer-oracle-types';

function sourceCase(
  kind: 'positive' | 'negative' | 'adversarial',
  source: string,
  index = 0,
): CAL002TransferOracleCase {
  return {
    caseId: `${kind}-${index + 1}`,
    virtualPath: 'src/oracle.tsx',
    source,
  };
}

const positive = (source: string): readonly CAL002TransferOracleCase[] => [
  sourceCase('positive', source),
];

const negative = (source: string): readonly CAL002TransferOracleCase[] => [
  sourceCase('negative', source),
];

const adversarial = (source: string): readonly CAL002TransferOracleCase[] => [
  sourceCase('adversarial', source),
];

function fixture(
  ruleId: CAL002TransferredOracleRuleId,
  authority: CAL002OracleAuthority,
  reference: string,
  positiveCases: readonly CAL002TransferOracleCase[],
  negativeCases: readonly CAL002TransferOracleCase[],
  adversarialCases: readonly CAL002TransferOracleCase[],
  controlSources: readonly [string, string, string, string, string],
): CAL002TransferredOracleFixture {
  return {
    ruleId,
    authority,
    reference,
    execution: sourceText('src/oracle.tsx'),
    positiveCases,
    negativeCases,
    adversarialCases,
    controls: fiveControls('src/oracle.tsx', controlSources),
  };
}

export const CAL002_DEAD_TRANSFER_ORACLES = [
  fixture(
    'dead/unreachable',
    'repository-contract',
    'facts.v2 same-block control-flow contract',
    positive('function f(){ return 1; cleanup(); }'),
    negative('function f(ok){ if(ok) return 1; return compute(); }'),
    adversarial('function f(){ try { work(); } finally { cleanup(); } }'),
    [
      'function f(){ throw new Error("x"); }',
      'function f(){ return compute(); }',
      '// return; cleanup();\nfunction f(){ cleanup(); }',
      'function f(){ if(false){ cleanup(); } }',
      'function f(){ for(;;){ break; } cleanup(); }',
    ],
  ),
  fixture(
    'dead/unused-import',
    'repository-contract',
    'facts.v2 binding reference contract',
    positive('import { parse } from "./parse";\nexport const value = 1;'),
    negative('import { parse } from "./parse";\nexport const value = parse("1");'),
    adversarial('import type { Parser } from "./parse";\nexport type Config = Parser;'),
    [
      'import "./side-effect";',
      'import * as api from "./api";\napi.run();',
      '// import { parse } from "./parse";\nexport const value=1;',
      'import React from "react";\nexport const view=<div/>;',
      'import { type Parser } from "./parse";\nexport type Config=Parser;',
    ],
  ),
  fixture(
    'dead/unused-local',
    'repository-contract',
    'facts.v2 local binding reference contract',
    positive('function f(){ const stale = compute(); return 1; }'),
    negative('function f(){ const value = compute(); return value; }'),
    adversarial('const moduleRegistration = register();\nexport function f(){ return 1; }'),
    [
      'function f(){ const _ignored=compute(); return 1; }',
      'function f(){ let value=1; return value; }',
      '// const stale=compute();\nfunction f(){ return 1; }',
      'const exported=1; export { exported };',
      'function f(){ class Local{}; return new Local(); }',
    ],
  ),
  fixture(
    'dead/unused-parameter',
    'repository-contract',
    'facts.v2 parameter reference contract',
    positive('function add(value, stale){ return value + 1; }'),
    negative('function add(value){ return value + 1; }'),
    adversarial('function callback(_event){ return true; }'),
    [
      'function View(props){ return <Child {...props}/>; }',
      'function f(value){ return String(value); }',
      '// function f(stale){}\nfunction f(value){ return value; }',
      'function f(_unused){ return 1; }',
      'const f = ({value}) => value;',
    ],
  ),
] as const satisfies readonly CAL002TransferredOracleFixture[];
