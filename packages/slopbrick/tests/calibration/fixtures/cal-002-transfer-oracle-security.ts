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
): CAL002TransferOracleCase {
  return {
    caseId: `${kind}-1`,
    virtualPath: 'src/oracle.ts',
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
    execution: sourceText('src/oracle.ts'),
    positiveCases,
    negativeCases,
    adversarialCases,
    controls: fiveControls('src/oracle.ts', controlSources),
  };
}

export const CAL002_SECURITY_TRANSFER_ORACLES = [
  fixture(
    'security/hardcoded-secret',
    'security-contract',
    'OWASP Secrets Management and CWE-798',
    positive('const accessKey = "AKIAIOSFODNN7EXAMPLE";'),
    negative('const accessKey = process.env.AWS_ACCESS_KEY_ID;'),
    adversarial('const accessKey = "example-access-key";'),
    [
      'const token=process.env.TOKEN;',
      'const label="token";',
      '// const token="ghp_abcdefghijklmnopqrstuvwxyz123456";\nconst ok=true;',
      'const password="test";',
      'const config={ secretRef:"vault://service/key" };',
    ],
  ),
  fixture(
    'security/sql-construction',
    'security-contract',
    'OWASP SQL Injection Prevention',
    positive('const q = `SELECT * FROM users WHERE id = ${userId}`;'),
    negative('client.query("SELECT * FROM users WHERE id = $1", [userId]);'),
    adversarial('const prose = "Update every call site before merging";'),
    [
      'connection.execute("SELECT * FROM users WHERE id = ?",[id]);',
      'prisma.user.findUnique({where:{id}});',
      '// const q=`SELECT * FROM users WHERE id=${id}`;\nconst ok=true;',
      'knex("users").where("id",id);',
      'const q="SELECT * FROM users WHERE active=true";',
    ],
  ),
] as const satisfies readonly CAL002TransferredOracleFixture[];
