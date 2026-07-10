import { createHash } from 'node:crypto';
import { relative } from 'node:path';

export interface ComponentSignature {
  name: string;
  file: string;
  fileRel: string;
  line: number;
  params: string[];
  hooks: string[];
  props: string[];
}

const NAME_RE = /(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g;
const ARROW_RE = /(?:export\s+(?:default\s+)?)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/g;
const HOOK_RE = /\b(use[A-Z][\w$]*)\s*\(/g;
const PARAM_TOKEN_RE = /[A-Za-z_$][\w$]*/g;

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function matchAll(re: RegExp, source: string): RegExpExecArray[] {
  const global = re.global ? re : new RegExp(re.source, re.flags + 'g');
  return Array.from(source.matchAll(global));
}

function relativeOrSelf(workspaceDir: string, filePath: string): string {
  try { return relative(workspaceDir, filePath) || filePath; } catch { return filePath; }
}

function extractHooks(source: string): string[] {
  return matchAll(HOOK_RE, source).flatMap((match) => match[1] ? [match[1]] : []);
}

function extractPropsFromSignature(paramList: string): string[] {
  const props: string[] = [];
  for (const segment of paramList.split(',')) {
    const trimmed = segment.trim();
    if (trimmed.startsWith('...') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
      for (const match of trimmed.matchAll(PARAM_TOKEN_RE)) {
        if (match[0] && !props.includes(match[0])) props.push(match[0]);
      }
      continue;
    }
    if (trimmed === 'props') continue;
    const id = trimmed.match(PARAM_TOKEN_RE)?.[0];
    if (id && id !== 'props') props.push(id);
  }
  return unique(props);
}

function extractParamNames(paramList: string): string[] {
  return unique(Array.from(paramList.matchAll(PARAM_TOKEN_RE), (match) => match[0])
    .filter((token) => token !== 'props' && token !== 'state' && !token.match(/^[A-Z]/)));
}

/** Extract deterministic function/component signatures from supplied source. */
export function extractSignatures(source: string, filePath: string, workspaceDir: string): ComponentSignature[] {
  const signatures: ComponentSignature[] = [];
  const seen = new Set<string>();
  for (const match of [...matchAll(NAME_RE, source), ...matchAll(ARROW_RE, source)]) {
    const name = match[1];
    if (!name || seen.has(name)) continue;
    const params = match[2] ?? '';
    seen.add(name);
    signatures.push({
      name,
      file: filePath,
      fileRel: relativeOrSelf(workspaceDir, filePath),
      line: source.slice(0, match.index).split('\n').length,
      params: extractParamNames(params),
      hooks: unique(extractHooks(source)),
      props: extractPropsFromSignature(params),
    });
  }
  return signatures;
}

/** Stable fingerprint over normalized signature features. */
export function fingerprintSignature(sig: Pick<ComponentSignature, 'hooks' | 'props' | 'params'>): string {
  const payload = [[...sig.hooks].sort(), [...sig.props].sort(), [...sig.params].sort()]
    .map((values) => values.join(',')).join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/** Jaccard similarity over a signature's hooks, props, and parameters. */
export function signatureSimilarity(
  a: Pick<ComponentSignature, 'hooks' | 'props' | 'params'>,
  b: Pick<ComponentSignature, 'hooks' | 'props' | 'params'>,
): number {
  const aSet = new Set([...a.hooks, ...a.props, ...a.params]);
  const bSet = new Set([...b.hooks, ...b.props, ...b.params]);
  if (aSet.size === 0 && bSet.size === 0) return 0;
  let intersection = 0;
  for (const value of aSet) if (bSet.has(value)) intersection++;
  return intersection / (aSet.size + bSet.size - intersection);
}
