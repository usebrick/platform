export function lowDeclarationRatioWithSixColonAny(): string {
  return [
    ...Array.from({ length: 6 }, (_, index) => `const escape${index}: any = input${index};`),
    ...Array.from({ length: 30 }, (_, index) => `const typed${index}: number = ${index};`),
  ].join('\n');
}

export function highDeclarationRatioAcrossAnnotationAssertionAndGeneric(): string {
  return [
    'const a = input as any;',
    'const b = output as any;',
    'const c = parse<any>(raw);',
    'const d = read<any>(raw);',
    'const e: any = raw;',
    'const typed: string = "ok";',
  ].join('\n');
}

export const CAL002_ANY_PARITY_CASES = [
  {
    caseId: 'any-line-density-rejected',
    source: lowDeclarationRatioWithSixColonAny(),
    virtualPath: 'src/types.ts',
    expectedReplacementObservation: 'no-finding',
  },
  {
    caseId: 'any-declaration-ratio-retained',
    source: highDeclarationRatioAcrossAnnotationAssertionAndGeneric(),
    virtualPath: 'src/types.ts',
    expectedReplacementObservation: 'finding',
  },
  {
    caseId: 'any-non-typescript-guard',
    source: lowDeclarationRatioWithSixColonAny(),
    virtualPath: 'src/types.js',
    expectedReplacementObservation: 'no-finding',
  },
] as const;
