function buildProductionSized(bodyLines: readonly string[]): string {
  return [
    'export function service(input: number): number {',
    ...bodyLines.map((line) => `  ${line}`),
    '  return input;',
    '}',
    `/* ${'production-sized calibration padding '.repeat(40)} */`,
  ].join('\n');
}

function fiveClusteredLogs(): string[] {
  const callOffsets = new Set([0, 7, 14, 21, 29]);
  return Array.from({ length: 30 }, (_, offset) => (
    callOffsets.has(offset)
      ? `console.log('cluster ${offset}', input);`
      : 'void input;'
  ));
}

function fiveLogsSeparatedBy(lineDistance: number): string[] {
  const lines: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    if (index > 0) {
      for (let offset = 1; offset < lineDistance; offset += 1) lines.push('void input;');
    }
    lines.push(`console.log('spread ${index}', input);`);
  }
  return lines;
}

export const CAL002_CONSOLE_PARITY_CASES = [
  {
    caseId: 'console-five-in-thirty-ported',
    source: buildProductionSized(fiveClusteredLogs()),
    virtualPath: 'src/service.ts',
    expectedReplacementObservation: 'finding',
  },
  {
    caseId: 'console-window-spread-guard',
    source: buildProductionSized(fiveLogsSeparatedBy(31)),
    virtualPath: 'src/service.ts',
    expectedReplacementObservation: 'no-finding',
  },
  {
    caseId: 'console-test-file-guard',
    source: buildProductionSized(fiveClusteredLogs()),
    virtualPath: 'src/service.test.ts',
    expectedReplacementObservation: 'no-finding',
  },
  {
    caseId: 'console-logger-file-guard',
    source: buildProductionSized(fiveClusteredLogs()),
    virtualPath: 'src/logger.ts',
    expectedReplacementObservation: 'no-finding',
  },
  {
    caseId: 'console-structured-logger-guard',
    source: `import pino from 'pino';\n${buildProductionSized(fiveClusteredLogs())}`,
    virtualPath: 'src/service.ts',
    expectedReplacementObservation: 'no-finding',
  },
] as const;
