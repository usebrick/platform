import { readFileSync, writeFileSync } from 'node:fs';

export interface UseClientFixResult {
  applied: boolean;
  reason?: string;
}

export function applyUseClientFix(filePath: string): UseClientFixResult {
  const content = readFileSync(filePath, 'utf-8');

  const trimmed = content.trimStart();
  if (trimmed.startsWith("'use client'") || trimmed.startsWith('"use client"')) {
    return { applied: false, reason: 'already-present' };
  }

  writeFileSync(filePath, `"use client";\n\n${content}`);
  return { applied: true };
}
