export const CAL002_SQL_PARITY_CASES = [
  {
    caseId: 'sql-with-template-ported',
    source: 'const q = `WITH active AS (SELECT * FROM users WHERE id = ${userId}) SELECT * FROM active`;',
    virtualPath: 'src/query.ts',
    expectedReplacementObservation: 'finding',
  },
  {
    caseId: 'sql-with-parameterized-guard',
    source: 'client.query("WITH active AS (SELECT * FROM users WHERE id = $1) SELECT * FROM active", [userId]);',
    virtualPath: 'src/query.ts',
    expectedReplacementObservation: 'no-finding',
  },
  {
    caseId: 'sql-with-comment-guard',
    source: '// const q = `WITH active AS (SELECT * FROM users WHERE id = ${userId}) SELECT * FROM active`;',
    virtualPath: 'src/query.ts',
    expectedReplacementObservation: 'no-finding',
  },
] as const;
