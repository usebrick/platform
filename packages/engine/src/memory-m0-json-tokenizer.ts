export type MemoryM0JsonFaultReason =
  | 'bom'
  | 'utf8'
  | 'json'
  | 'root'
  | 'duplicate-key'
  | 'depth'
  | 'tokens';

export class MemoryM0JsonFault extends Error {
  readonly reason: MemoryM0JsonFaultReason;

  constructor(reason: MemoryM0JsonFaultReason) {
    super(reason);
    this.name = 'MemoryM0JsonFault';
    this.reason = reason;
  }
}

export type MemoryM0JsonPrimitive = null | boolean | number | string;
export type MemoryM0JsonPunctuation = '{' | '}' | '[' | ']' | ':' | ',';
export type MemoryM0JsonToken =
  | Readonly<{ kind: 'punctuation'; value: MemoryM0JsonPunctuation }>
  | Readonly<{ kind: 'value'; value: MemoryM0JsonPrimitive }>
  | Readonly<{ kind: 'eof' }>;

const JSON_NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

function isWhitespace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

function isTokenBoundary(character: string | undefined): boolean {
  return character === undefined
    || character === ','
    || character === ']'
    || character === '}'
    || character === ' '
    || character === '\t'
    || character === '\n'
    || character === '\r';
}

export class MemoryM0JsonTokenizer {
  readonly #source: string;
  readonly #maxTokens: number;
  #position = 0;
  #tokenCount = 0;

  constructor(source: string, maxTokens: number) {
    this.#source = source;
    this.#maxTokens = maxTokens;
  }

  next(): MemoryM0JsonToken {
    this.#skipWhitespace();
    if (this.#position >= this.#source.length) return { kind: 'eof' };

    this.#beginToken();
    const character = this.#source[this.#position]!;
    if ('{}[]:,'.includes(character)) {
      this.#position += 1;
      return { kind: 'punctuation', value: character as MemoryM0JsonPunctuation };
    }
    if (character === '"') return { kind: 'value', value: this.#readString() };
    if (character === '-' || (character >= '0' && character <= '9')) {
      return { kind: 'value', value: this.#readNumber() };
    }
    if (this.#readLiteral('true')) return { kind: 'value', value: true };
    if (this.#readLiteral('false')) return { kind: 'value', value: false };
    if (this.#readLiteral('null')) return { kind: 'value', value: null };
    throw new MemoryM0JsonFault('json');
  }

  #skipWhitespace(): void {
    while (
      this.#position < this.#source.length
      && isWhitespace(this.#source.charCodeAt(this.#position))
    ) {
      this.#position += 1;
    }
  }

  #beginToken(): void {
    if (this.#tokenCount >= this.#maxTokens) throw new MemoryM0JsonFault('tokens');
    this.#tokenCount += 1;
  }

  #readLiteral(literal: 'true' | 'false' | 'null'): boolean {
    if (!this.#source.startsWith(literal, this.#position)) return false;
    const end = this.#position + literal.length;
    if (!isTokenBoundary(this.#source[end])) throw new MemoryM0JsonFault('json');
    this.#position = end;
    return true;
  }

  #readNumber(): number {
    JSON_NUMBER.lastIndex = this.#position;
    const match = JSON_NUMBER.exec(this.#source);
    if (!match || !isTokenBoundary(this.#source[JSON_NUMBER.lastIndex])) {
      throw new MemoryM0JsonFault('json');
    }
    this.#position = JSON_NUMBER.lastIndex;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) throw new MemoryM0JsonFault('json');
    return value;
  }

  #readString(): string {
    this.#position += 1;
    let result = '';
    let chunkStart = this.#position;
    while (this.#position < this.#source.length) {
      const code = this.#source.charCodeAt(this.#position);
      if (code === 0x22) {
        result += this.#source.slice(chunkStart, this.#position);
        this.#position += 1;
        return result;
      }
      if (code < 0x20) throw new MemoryM0JsonFault('json');
      if (code === 0x5c) {
        result += this.#source.slice(chunkStart, this.#position);
        this.#position += 1;
        result += this.#readEscape();
        chunkStart = this.#position;
      } else {
        this.#consumeRawScalar(code);
      }
    }
    throw new MemoryM0JsonFault('json');
  }

  #consumeRawScalar(code: number): void {
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = this.#source.charCodeAt(this.#position + 1);
      if (low < 0xdc00 || low > 0xdfff) throw new MemoryM0JsonFault('json');
      this.#position += 2;
      return;
    }
    if (code >= 0xdc00 && code <= 0xdfff) throw new MemoryM0JsonFault('json');
    this.#position += 1;
  }

  #readEscape(): string {
    const escape = this.#source[this.#position];
    if (escape === undefined) throw new MemoryM0JsonFault('json');
    this.#position += 1;
    switch (escape) {
      case '"': return '"';
      case '\\': return '\\';
      case '/': return '/';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case 'u': return this.#readUnicodeEscape();
      default: throw new MemoryM0JsonFault('json');
    }
  }

  #readUnicodeEscape(): string {
    const high = this.#readHexQuad();
    if (high >= 0xdc00 && high <= 0xdfff) throw new MemoryM0JsonFault('json');
    if (high < 0xd800 || high > 0xdbff) return String.fromCharCode(high);
    if (this.#source[this.#position] !== '\\' || this.#source[this.#position + 1] !== 'u') {
      throw new MemoryM0JsonFault('json');
    }
    this.#position += 2;
    const low = this.#readHexQuad();
    if (low < 0xdc00 || low > 0xdfff) throw new MemoryM0JsonFault('json');
    return String.fromCodePoint(0x10000 + ((high - 0xd800) << 10) + (low - 0xdc00));
  }

  #readHexQuad(): number {
    const value = this.#source.slice(this.#position, this.#position + 4);
    if (!/^[0-9a-fA-F]{4}$/.test(value)) throw new MemoryM0JsonFault('json');
    this.#position += 4;
    return Number.parseInt(value, 16);
  }
}
