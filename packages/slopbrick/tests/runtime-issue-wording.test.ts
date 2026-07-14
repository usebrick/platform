import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface RuntimeFinding {
  file: string;
  line: number;
  field: 'message' | 'advice';
  text: string;
  label: string;
}

/**
 * Issue text is an engineering-facing contract. It may describe a measured
 * association, but it must not tell a user that code is AI-authored or invoke
 * human-vs-AI norms as remediation. Qualified context such as "not authorship
 * proof" and "AI-associated signal" is intentionally allowed.
 */
const PROHIBITED_RUNTIME_CLAIMS: ReadonlyArray<[RegExp, string]> = [
  [/\bAI[- ]generated\b/iu, 'AI-generated attribution'],
  [/\bLLM\b/iu, 'LLM attribution'],
  [/\bAI\s+(?:agents?|tools?|chat|code|defaults?|tends?|often|signature|signal|smell|fingerprint|misuse|iteration|rotation|vibe|thinking)\b/iu, 'AI-vs-engineering claim'],
  [/\bAI\s*\/\s*\w+/iu, 'AI-vs-engineering claim'],
  [/\bhumans?\b/iu, 'human-vs-AI norm'],
  [/\b(?:human|real)\s+(?:code|codebases?|files?)\b/iu, 'human-vs-code norm'],
  [/\btraining[- ]data\b/iu, 'training-data attribution'],
  [/\bverify authorship\b/iu, 'authorship verification instruction'],
  [/\bthe model ran\b/iu, 'model-authorship attribution'],
  [/\bdev\/AI default\b/iu, 'AI-default attribution'],
];

function ruleFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...ruleFiles(path));
    else if (entry.isFile() && path.endsWith('.ts')) files.push(path);
  }
  return files;
}

function runtimeFindings(): RuntimeFinding[] {
  const root = join(__dirname, '..', 'src', 'rules');
  const findings: RuntimeFinding[] = [];

  for (const file of ruleFiles(root)) {
    const source = readFileSync(file, 'utf8');
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAssignment(node)) {
        const field = node.name.getText(sourceFile).replace(/^['"]|['"]$/g, '');
        if (field === 'message' || field === 'advice') {
          const text = node.initializer.getText(sourceFile);
          for (const [pattern, label] of PROHIBITED_RUNTIME_CLAIMS) {
            if (pattern.test(text)) {
              const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
              findings.push({ file, line, field, text, label });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return findings;
}

describe('runtime Issue wording policy', () => {
  it('keeps message and advice engineering-facing', () => {
    const findings = runtimeFindings();
    expect(
      findings,
      findings.map((finding) => `${finding.file}:${finding.line} ${finding.field} (${finding.label})`).join('\n'),
    ).toEqual([]);
  });
});
