import {
  MemoryM0JsonFault,
  MemoryM0JsonTokenizer,
  type MemoryM0JsonPrimitive,
  type MemoryM0JsonToken,
} from './memory-m0-json-tokenizer';

export type MemoryM0JsonObject = ReadonlyMap<string, MemoryM0JsonValue>;
export type MemoryM0JsonArray = readonly MemoryM0JsonValue[];
export type MemoryM0JsonValue = MemoryM0JsonPrimitive | MemoryM0JsonObject | MemoryM0JsonArray;

type ObjectState = 'key-or-end' | 'key' | 'colon' | 'value' | 'comma-or-end';
type ArrayState = 'value-or-end' | 'value' | 'comma-or-end';
type ObjectFrame = {
  kind: 'object';
  value: Map<string, MemoryM0JsonValue>;
  state: ObjectState;
  key?: string;
};
type ArrayFrame = {
  kind: 'array';
  value: MemoryM0JsonValue[];
  state: ArrayState;
};
type JsonFrame = ObjectFrame | ArrayFrame;

function attachValue(frame: JsonFrame, value: MemoryM0JsonValue): void {
  if (frame.kind === 'array') {
    frame.value.push(value);
    frame.state = 'comma-or-end';
    return;
  }
  if (frame.key === undefined) throw new MemoryM0JsonFault('json');
  frame.value.set(frame.key, value);
  delete frame.key;
  frame.state = 'comma-or-end';
}

function openContainer(
  token: MemoryM0JsonToken,
  stack: JsonFrame[],
  parent: JsonFrame,
  maxDepth: number,
): boolean {
  if (token.kind !== 'punctuation' || (token.value !== '{' && token.value !== '[')) return false;
  if (stack.length >= maxDepth) throw new MemoryM0JsonFault('depth');
  if (token.value === '{') {
    const value = new Map<string, MemoryM0JsonValue>();
    attachValue(parent, value);
    stack.push({ kind: 'object', value, state: 'key-or-end' });
  } else {
    const value: MemoryM0JsonValue[] = [];
    attachValue(parent, value);
    stack.push({ kind: 'array', value, state: 'value-or-end' });
  }
  return true;
}

function consumeObjectKey(
  frame: ObjectFrame,
  token: MemoryM0JsonToken,
  stack: JsonFrame[],
  allowEnd: boolean,
): void {
  if (allowEnd && token.kind === 'punctuation' && token.value === '}') {
    stack.pop();
    return;
  }
  if (token.kind !== 'value' || typeof token.value !== 'string') {
    throw new MemoryM0JsonFault('json');
  }
  if (frame.value.has(token.value)) throw new MemoryM0JsonFault('duplicate-key');
  frame.key = token.value;
  frame.state = 'colon';
}

function consumeObjectDelimiter(
  frame: ObjectFrame,
  token: MemoryM0JsonToken,
  stack: JsonFrame[],
): void {
  if (token.kind === 'punctuation' && token.value === ',') {
    frame.state = 'key';
    return;
  }
  if (token.kind === 'punctuation' && token.value === '}') {
    stack.pop();
    return;
  }
  throw new MemoryM0JsonFault('json');
}

function consumeObjectToken(
  frame: ObjectFrame,
  token: MemoryM0JsonToken,
  stack: JsonFrame[],
  maxDepth: number,
): void {
  if (frame.state === 'key-or-end' || frame.state === 'key') {
    consumeObjectKey(frame, token, stack, frame.state === 'key-or-end');
    return;
  }
  if (frame.state === 'colon') {
    if (token.kind !== 'punctuation' || token.value !== ':') throw new MemoryM0JsonFault('json');
    frame.state = 'value';
    return;
  }
  if (frame.state === 'value') {
    if (openContainer(token, stack, frame, maxDepth)) return;
    if (token.kind !== 'value') throw new MemoryM0JsonFault('json');
    attachValue(frame, token.value);
    return;
  }
  consumeObjectDelimiter(frame, token, stack);
}

function consumeArrayValue(
  frame: ArrayFrame,
  token: MemoryM0JsonToken,
  stack: JsonFrame[],
  maxDepth: number,
  allowEnd: boolean,
): void {
  if (allowEnd && token.kind === 'punctuation' && token.value === ']') {
    stack.pop();
    return;
  }
  if (openContainer(token, stack, frame, maxDepth)) return;
  if (token.kind !== 'value') throw new MemoryM0JsonFault('json');
  attachValue(frame, token.value);
}

function consumeArrayToken(
  frame: ArrayFrame,
  token: MemoryM0JsonToken,
  stack: JsonFrame[],
  maxDepth: number,
): void {
  if (frame.state === 'value-or-end' || frame.state === 'value') {
    consumeArrayValue(frame, token, stack, maxDepth, frame.state === 'value-or-end');
    return;
  }
  if (token.kind === 'punctuation' && token.value === ',') {
    frame.state = 'value';
    return;
  }
  if (token.kind === 'punctuation' && token.value === ']') {
    stack.pop();
    return;
  }
  throw new MemoryM0JsonFault('json');
}

export function parseBoundedMemoryM0JsonObject(
  source: string,
  maxDepth: number,
  maxTokens: number,
): MemoryM0JsonObject {
  const tokenizer = new MemoryM0JsonTokenizer(source, maxTokens);
  const first = tokenizer.next();
  if (first.kind !== 'punctuation' || first.value !== '{') throw new MemoryM0JsonFault('root');

  const root = new Map<string, MemoryM0JsonValue>();
  const stack: JsonFrame[] = [{ kind: 'object', value: root, state: 'key-or-end' }];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    const token = tokenizer.next();
    if (frame.kind === 'object') consumeObjectToken(frame, token, stack, maxDepth);
    else consumeArrayToken(frame, token, stack, maxDepth);
  }
  if (tokenizer.next().kind !== 'eof') throw new MemoryM0JsonFault('json');
  return root;
}
