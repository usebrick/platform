import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

const PUBLIC_PROPERTY_NAMES = new Set(['description', 'message', 'advice']);
const MUTATING_COLLECTION_METHODS = new Set([
  'add',
  'clear',
  'copyWithin',
  'delete',
  'fill',
  'pop',
  'push',
  'reverse',
  'set',
  'shift',
  'sort',
  'splice',
  'unshift',
]);
const DYNAMIC_VALUE = '{runtime value}';
const TRANSPARENT_ARRAY_TYPE_WRAPPERS = new Set([
  'NonNullable',
  'Partial',
  'Readonly',
  'Required',
]);
const DYNAMIC_EXECUTION_NAMES = new Set(['eval', 'Function']);
const PROTOTYPE_ACCESS_NAMES = new Set([
  '__proto__',
  'getPrototypeOf',
  'prototype',
  'setPrototypeOf',
]);

export const PROVENANCE_FRAMING =
  /\bAI\b|\bA\s*\.\s*I\s*\.|\b(?:artificial|machine)\s+intelligence\b|\bLLMs?\b|\bauthorship\b|\bfingerprint\b|\blanguage[- ]models?\b|\b(?:ChatGPT|GPT(?:[- ]?[0-9][A-Za-z0-9.-]*)?|OpenAI|Claude|Anthropic|Gemini|Copilot|Codex|DeepSeek|Grok|Qwen|Llama|Mistral|Amazon\s+Q(?:\s+Developer)?|CodeWhisperer|Cursor|Windsurf|Devin|Aider|Cline|Tabnine|Replit\s+Agent|GitLab\s+Duo|JetBrains\s+Junie|Google\s+Bard|Roo\s+Code|Kiro|Jules|Perplexity)\b|\b(?:human|machine)[- ](?:written|generated|authored|produced|created|code)\b|\b(?:coding[- ]+)?(?:agents?|bots?)[- ](?:written|generated|authored|produced|created|code)\b|\bmodels?[- ](?:created|generated|written|authored|produced)\b|\b(?:models?|(?:coding[- ]+)?(?:agents?|bots?))\s+(?:added|generated|authored|wrote|written|left|defaulted|defaults?|sprinkled|sprinkles?|produced|created)\b|\b(?:written|generated|authored|produced|created)\s+by\s+(?:an?\s+)?(?:model|agent|bot)\b/iu;

const NAMED_AUTHORSHIP_FRAMING =
  /\b(?:[A-Z][A-Za-z0-9.-]*\s+(?:added|generated|authored|wrote|produced|created|built|implemented)|(?:v[0-9][A-Za-z0-9.-]*|[a-z][A-Za-z0-9-]*\.[A-Za-z0-9.-]+)\s+(?:has\s+)?(?:added|generated|authored|wrote|produced|created|built|implemented)|(?!(?:Use|Keep|Prefer|Ensure|Replace|Build|See|Review|Never|Either|At|If|When|The|This|That)\b)[A-Z][A-Za-z0-9.-]*(?:\s+[A-Z][A-Za-z0-9.-]*){1,3}\s+(?:has\s+)?(?:[a-z]+ed|built|wrote|made|left)|(?:[A-Za-z]+ed|[Bb]uilt|[Ww]ritten|[Ww]rote|[Mm]ade)\s+by\s+(?:the\s+)?[A-Z][A-Za-z0-9.-]*(?:\s+[A-Z][A-Za-z0-9.-]*){0,3}|(?:came|originated|derived)\s+from\s+[A-Z][A-Za-z0-9.-]*(?:\s+[A-Z][A-Za-z0-9.-]*){0,3})\b/u;

const AUTHORSHIP_ACTION_FRAMING =
  /\b(?:added|generated|authored|wrote|written|produced|created|built|implemented|left)\s+(?:this|the|a|an|fallback|branch|implementation|code|file)\b/iu;

const NAMED_AUTHORSHIP_NOUN_FRAMING =
  /\b(?:(?!(?:This|That|The|A|An)\b)[A-Z][A-Za-z0-9.-]*(?:\s+[A-Z][A-Za-z0-9.-]*){0,3}\s+is\s+(?:the\s+)?author\s+of|courtesy\s+of\s+(?:the\s+)?[A-Z][A-Za-z0-9.-]*(?:\s+[A-Z][A-Za-z0-9.-]*){0,3})\b/u;

function hasProvenanceFraming(text: string): boolean {
  return PROVENANCE_FRAMING.test(text)
    || NAMED_AUTHORSHIP_FRAMING.test(text)
    || AUTHORSHIP_ACTION_FRAMING.test(text)
    || NAMED_AUTHORSHIP_NOUN_FRAMING.test(text);
}

export interface PublicRuleCopy {
  readonly location: string;
  readonly property: 'description' | 'message' | 'advice';
  readonly text: string;
}

export interface GeneratedCatalogCopy {
  readonly location: string;
  readonly text: string;
}

interface ResolverContext {
  readonly source: ts.SourceFile;
  readonly checker?: ts.TypeChecker;
  readonly callsByName: ReadonlyMap<string, readonly ts.CallExpression[]>;
  readonly functionsByName: ReadonlyMap<string, readonly ts.FunctionLikeDeclaration[]>;
  readonly parametersByName: ReadonlyMap<string, readonly ts.ParameterDeclaration[]>;
  readonly taintedPropertiesByBinding: ReadonlyMap<string, ReadonlySet<string>>;
  readonly variablesByName: ReadonlyMap<string, readonly ts.VariableDeclaration[]>;
  readonly mutatedCollections: ReadonlySet<string>;
  readonly writtenIdentifiers: ReadonlySet<string>;
  readonly writtenProperties: ReadonlySet<string>;
}

const PROGRAMS_BY_SOURCE_ROOT = new Map<string, ts.Program>();

interface ResolutionAttempt {
  readonly matched: boolean;
  readonly values?: readonly string[];
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function dedupe(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function ruleFiles(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return ruleFiles(path);
      return entry.isFile() && path.endsWith('.ts') ? [path] : [];
    })
    .sort(compareCodePoints);
}

function propertyName(node: ts.PropertyName, source: ts.SourceFile): string {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  if (ts.isComputedPropertyName(node) && ts.isStringLiteralLike(node.expression)) {
    return node.expression.text;
  }
  return node.getText(source).replace(/^['"]|['"]$/gu, '');
}

function bindingNames(node: ts.BindingName): readonly string[] {
  if (ts.isIdentifier(node)) return [node.text];
  return node.elements.flatMap((element) =>
    ts.isBindingElement(element) ? bindingNames(element.name) : []);
}

function transparentIdentifier(expression: ts.Expression): ts.Identifier | undefined {
  if (ts.isIdentifier(expression)) return expression;
  if (ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)) {
    return transparentIdentifier(expression.expression);
  }
  return undefined;
}

function leftmostIdentifier(expression: ts.Expression): ts.Identifier | undefined {
  let current = expression;
  while (ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isTypeAssertionExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isSatisfiesExpression(current)) {
    current = current.expression;
  }
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    current = current.expression;
    while (ts.isParenthesizedExpression(current)
      || ts.isAsExpression(current)
      || ts.isTypeAssertionExpression(current)
      || ts.isNonNullExpression(current)
      || ts.isSatisfiesExpression(current)) {
      current = current.expression;
    }
  }
  return ts.isIdentifier(current) ? current : undefined;
}

function typeCannotCarryUnboundedText(type: ts.Type): boolean {
  if (type.isUnion()) return type.types.every(typeCannotCarryUnboundedText);
  if (type.flags & (ts.TypeFlags.NumberLike
    | ts.TypeFlags.BooleanLike
    | ts.TypeFlags.BigIntLike
    | ts.TypeFlags.Null
    | ts.TypeFlags.Undefined
    | ts.TypeFlags.Never)) return true;
  if (type.isStringLiteral()) return !hasProvenanceFraming(type.value);
  return false;
}

function callResultPropertyCannotCarryUnboundedText(
  call: ts.CallExpression,
  expression: ts.Expression,
  context: ResolverContext,
): boolean {
  if (!context.checker) return false;
  const callType = context.checker.getTypeAtLocation(call);
  if (callType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false;
  return typeCannotCarryUnboundedText(context.checker.getTypeAtLocation(expression));
}

function programForSourceRoot(sourceRoot: string, rootNames: readonly string[]): ts.Program {
  const cached = PROGRAMS_BY_SOURCE_ROOT.get(sourceRoot);
  if (cached) return cached;
  const program = ts.createProgram({
    rootNames: [...rootNames],
    options: {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noLib: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      types: [],
    },
  });
  PROGRAMS_BY_SOURCE_ROOT.set(sourceRoot, program);
  return program;
}

function functionName(node: ts.FunctionLikeDeclaration): string | undefined {
  if ('name' in node && node.name && ts.isIdentifier(node.name)) return node.name.text;
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  return undefined;
}

function ruleHookName(node: ts.FunctionLikeDeclaration): string | undefined {
  const parent = node.parent;
  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    return propertyName(parent.name, node.getSourceFile());
  }
  return functionName(node);
}

function appendMapValue<T>(map: Map<string, T[]>, key: string, value: T): void {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

function buildResolverContext(source: ts.SourceFile, checker?: ts.TypeChecker): ResolverContext {
  const callsByName = new Map<string, ts.CallExpression[]>();
  const functionsByName = new Map<string, ts.FunctionLikeDeclaration[]>();
  const parametersByName = new Map<string, ts.ParameterDeclaration[]>();
  const variablesByName = new Map<string, ts.VariableDeclaration[]>();
  const mutatedCollections = new Set<string>();
  const collectionAliasPairs: Array<readonly [string, string]> = [];
  const writtenIdentifiers = new Set<string>();
  const writtenProperties = new Set<string>();

  const recordWrite = (target: ts.Expression): void => {
    if (ts.isParenthesizedExpression(target)) {
      recordWrite(target.expression);
    } else if (ts.isObjectLiteralExpression(target)) {
      for (const property of target.properties) {
        if (ts.isShorthandPropertyAssignment(property)) recordWrite(property.name);
        else if (ts.isPropertyAssignment(property)) recordWrite(property.initializer);
        else if (ts.isSpreadAssignment(property)) recordWrite(property.expression);
      }
    } else if (ts.isArrayLiteralExpression(target)) {
      for (const element of target.elements) {
        if (ts.isOmittedExpression(element)) continue;
        recordWrite(ts.isSpreadElement(element) ? element.expression : element);
      }
    } else if (ts.isIdentifier(target)) {
      writtenIdentifiers.add(target.text);
    } else if (ts.isPropertyAccessExpression(target)) {
      const receiver = transparentIdentifier(target.expression);
      if (!receiver) return;
      writtenProperties.add(`${receiver.text}.${target.name.text}`);
    } else if (ts.isElementAccessExpression(target)) {
      const receiver = transparentIdentifier(target.expression);
      if (!receiver) return;
      if (target.argumentExpression && ts.isStringLiteralLike(target.argumentExpression)) {
        writtenProperties.add(`${receiver.text}.${target.argumentExpression.text}`);
      } else {
        writtenProperties.add(`${receiver.text}.*`);
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      recordWrite(node.left);
      if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        || node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionEqualsToken
        || node.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken
        || node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken) {
        const left = transparentIdentifier(node.left);
        const right = transparentIdentifier(node.right);
        if (left && right) collectionAliasPairs.push([left.text, right.text]);
      }
    }
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
      && (node.operator === ts.SyntaxKind.PlusPlusToken
        || node.operator === ts.SyntaxKind.MinusMinusToken)) {
      recordWrite(node.operand);
    }
    if (ts.isDeleteExpression(node)) recordWrite(node.expression);
    if ((ts.isForOfStatement(node) || ts.isForInStatement(node))
      && !ts.isVariableDeclarationList(node.initializer)) {
      recordWrite(node.initializer);
    }
    if (ts.isCallExpression(node)) {
      const receiver = ts.isPropertyAccessExpression(node.expression)
        ? transparentIdentifier(node.expression.expression)
        : ts.isElementAccessExpression(node.expression)
          ? transparentIdentifier(node.expression.expression)
          : undefined;
      const method = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : ts.isElementAccessExpression(node.expression)
          && node.expression.argumentExpression
          && ts.isStringLiteralLike(node.expression.argumentExpression)
          ? node.expression.argumentExpression.text
          : undefined;
      const unresolvedComputedMethod = ts.isElementAccessExpression(node.expression)
        && method === undefined;
      if (receiver
        && (unresolvedComputedMethod || method && MUTATING_COLLECTION_METHODS.has(method))) {
        mutatedCollections.add(receiver.text);
      }
    }
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'Object'
      && node.expression.name.text === 'assign'
      && node.arguments[0]
      && transparentIdentifier(node.arguments[0])) {
      writtenProperties.add(`${transparentIdentifier(node.arguments[0])!.text}.*`);
    }
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && ((node.expression.expression.text === 'Object'
          && new Set(['defineProperties', 'defineProperty', 'setPrototypeOf'])
            .has(node.expression.name.text))
        || (node.expression.expression.text === 'Reflect'
          && new Set(['defineProperty', 'set', 'setPrototypeOf'])
            .has(node.expression.name.text)))
      && node.arguments[0]
      && transparentIdentifier(node.arguments[0])) {
      writtenProperties.add(`${transparentIdentifier(node.arguments[0])!.text}.*`);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      appendMapValue(callsByName, node.expression.text, node);
    }
    if (ts.isFunctionLike(node)) {
      const name = functionName(node);
      if (name) appendMapValue(functionsByName, name, node);
      for (const parameter of node.parameters) {
        for (const bindingName of bindingNames(parameter.name)) {
          appendMapValue(parametersByName, bindingName, parameter);
        }
      }
    }
    if (ts.isVariableDeclaration(node)) {
      for (const bindingName of bindingNames(node.name)) {
        appendMapValue(variablesByName, bindingName, node);
      }
      const alias = node.initializer ? transparentIdentifier(node.initializer) : undefined;
      if (ts.isIdentifier(node.name) && alias) {
        collectionAliasPairs.push([node.name.text, alias.text]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const [name, functions] of functionsByName) {
    if (functions.length !== 1) continue;
    const fn = functions[0]!;
    for (const call of callsByName.get(name) ?? []) {
      for (const [index, parameter] of fn.parameters.entries()) {
        if (!ts.isIdentifier(parameter.name)) continue;
        const argumentsForParameter = parameter.dotDotDotToken
          ? call.arguments.slice(index)
          : call.arguments[index] === undefined
            ? []
            : [call.arguments[index]!];
        for (const argument of argumentsForParameter) {
          const alias = transparentIdentifier(argument);
          if (alias) collectionAliasPairs.push([parameter.name.text, alias.text]);
        }
      }
    }
  }
  const taintedPropertiesByBinding = new Map<string, Set<string>>();
  const addPropertyTaint = (binding: string, property: string): boolean => {
    const existing = taintedPropertiesByBinding.get(binding);
    if (existing) {
      const size = existing.size;
      existing.add(property);
      return existing.size !== size;
    }
    taintedPropertiesByBinding.set(binding, new Set([property]));
    return true;
  };
  for (const binding of mutatedCollections) addPropertyTaint(binding, '*');
  for (const binding of writtenIdentifiers) addPropertyTaint(binding, '*');
  for (const property of writtenProperties) {
    const separator = property.indexOf('.');
    if (separator > 0) {
      const propertyName = property.slice(separator + 1);
      addPropertyTaint(
        property.slice(0, separator),
        propertyName === '__proto__' ? '*' : propertyName,
      );
    }
  }
  for (const identifier of writtenIdentifiers) mutatedCollections.add(identifier);
  for (const property of writtenProperties) {
    const separator = property.indexOf('.');
    if (separator > 0) mutatedCollections.add(property.slice(0, separator));
  }
  let propagated = true;
  while (propagated) {
    propagated = false;
    for (const [left, right] of collectionAliasPairs) {
      if (mutatedCollections.has(left) || mutatedCollections.has(right)) {
        if (!mutatedCollections.has(left)) {
          mutatedCollections.add(left);
          propagated = true;
        }
        if (!mutatedCollections.has(right)) {
          mutatedCollections.add(right);
          propagated = true;
        }
      }
      for (const property of taintedPropertiesByBinding.get(left) ?? []) {
        if (addPropertyTaint(right, property)) propagated = true;
      }
      for (const property of taintedPropertiesByBinding.get(right) ?? []) {
        if (addPropertyTaint(left, property)) propagated = true;
      }
    }
  }
  return {
    source,
    checker,
    callsByName,
    functionsByName,
    mutatedCollections,
    parametersByName,
    taintedPropertiesByBinding,
    variablesByName,
    writtenIdentifiers,
    writtenProperties,
  };
}

function ownerFunction(parameter: ts.ParameterDeclaration): ts.FunctionLikeDeclaration | undefined {
  return ts.isFunctionLike(parameter.parent) ? parameter.parent : undefined;
}

function parameterIndex(parameter: ts.ParameterDeclaration): number {
  const owner = ownerFunction(parameter);
  return owner ? owner.parameters.indexOf(parameter) : -1;
}

function lexicalScope(node: ts.Node): ts.Node {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isSourceFile(current)
      || ts.isBlock(current)
      || ts.isModuleBlock(current)
      || ts.isCaseBlock(current)
      || ts.isForStatement(current)
      || ts.isForInStatement(current)
      || ts.isForOfStatement(current)
      || ts.isCatchClause(current)) {
      return current;
    }
    current = current.parent;
  }
  return node.getSourceFile();
}

function nearestVariableDeclarations(
  expression: ts.Identifier,
  context: ResolverContext,
): readonly ts.VariableDeclaration[] {
  const declarations = (context.variablesByName.get(expression.text) ?? [])
    .filter((candidate) => candidate.getStart(context.source) < expression.getStart(context.source))
    .map((candidate) => ({ candidate, scope: lexicalScope(candidate) }))
    .filter(({ scope }) => scope.pos <= expression.pos && expression.end <= scope.end);
  if (declarations.length === 0) return [];
  const nearestSpan = Math.min(...declarations.map(({ scope }) => scope.end - scope.pos));
  return declarations
    .filter(({ scope }) => scope.end - scope.pos === nearestSpan)
    .map(({ candidate }) => candidate);
}

function isNonReferenceIdentifier(node: ts.Identifier): boolean {
  const parent = node.parent;
  return (ts.isPropertyAccessExpression(parent) && parent.name === node)
    || (ts.isPropertyAssignment(parent) && parent.name === node)
    || (ts.isMethodDeclaration(parent) && parent.name === node)
    || (ts.isGetAccessorDeclaration(parent) && parent.name === node)
    || (ts.isSetAccessorDeclaration(parent) && parent.name === node)
    || (ts.isBindingElement(parent) && parent.propertyName === node)
    || ts.isImportSpecifier(parent)
    || (ts.isExportSpecifier(parent) && parent.name === node && parent.propertyName !== undefined)
    || (ts.isLabeledStatement(parent) && parent.label === node)
    || (ts.isBreakOrContinueStatement(parent) && parent.label === node);
}

function isForOfIterableReference(node: ts.Identifier): boolean {
  let current: ts.Expression = node;
  while (current.parent
    && (ts.isParenthesizedExpression(current.parent)
      || ts.isAsExpression(current.parent)
      || ts.isTypeAssertionExpression(current.parent)
      || ts.isNonNullExpression(current.parent)
      || ts.isSatisfiesExpression(current.parent))
    && current.parent.expression === current) {
    current = current.parent;
  }
  return ts.isForOfStatement(current.parent) && current.parent.expression === current;
}

function bindingHasUnsupportedReference(
  declaration: ts.VariableDeclaration,
  context: ResolverContext,
  allowed: (node: ts.Identifier) => boolean,
): boolean {
  if (!ts.isIdentifier(declaration.name)) return true;
  let unsupported = false;
  const visit = (node: ts.Node): void => {
    if (unsupported) return;
    if (ts.isIdentifier(node)
      && node.text === declaration.name.text
      && node !== declaration.name
      && !isNonReferenceIdentifier(node)
      && !allowed(node)) {
      const containingParameters = (context.parametersByName.get(node.text) ?? [])
        .filter((parameter) => {
          const fn = ownerFunction(parameter);
          return fn && fn.pos <= node.pos && node.end <= fn.end;
        });
      if (containingParameters.length === 0) {
        const nearest = nearestVariableDeclarations(node, context);
        if (nearest.length !== 1 || nearest[0] === declaration) unsupported = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(context.source);
  return unsupported;
}

function variableHasUnsupportedReference(
  declaration: ts.VariableDeclaration,
  context: ResolverContext,
): boolean {
  return bindingHasUnsupportedReference(declaration, context, isForOfIterableReference);
}

function isTransparentReturnReference(
  node: ts.Identifier,
  owner: ts.FunctionLikeDeclaration,
): boolean {
  let current: ts.Expression = node;
  while (current.parent
    && (ts.isParenthesizedExpression(current.parent)
      || ts.isAsExpression(current.parent)
      || ts.isTypeAssertionExpression(current.parent)
      || ts.isNonNullExpression(current.parent)
      || ts.isSatisfiesExpression(current.parent))
    && current.parent.expression === current) {
    current = current.parent;
  }
  if (!ts.isReturnStatement(current.parent) || current.parent.expression !== current) return false;
  let container: ts.Node | undefined = current.parent.parent;
  while (container && !ts.isFunctionLike(container)) container = container.parent;
  return container === owner;
}

function argumentsReferToOwner(
  node: ts.Identifier,
  owner: ts.FunctionLikeDeclaration,
): boolean {
  if (ts.isArrowFunction(owner)) return false;
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isFunctionLike(current) && !ts.isArrowFunction(current)) return current === owner;
    current = current.parent;
  }
  return false;
}

function parameterHasUnsupportedReference(
  parameter: ts.ParameterDeclaration,
  context: ResolverContext,
): boolean {
  if (!ts.isIdentifier(parameter.name)) return true;
  const owner = ownerFunction(parameter);
  if (!owner) return true;
  const ownerSpan = owner.end - owner.pos;
  let unsupported = false;
  const visit = (node: ts.Node): void => {
    if (unsupported) return;
    if (ts.isIdentifier(node)
      && node.text === 'arguments'
      && argumentsReferToOwner(node, owner)) {
      unsupported = true;
      return;
    }
    if (ts.isIdentifier(node)
      && node.text === parameter.name.text
      && node !== parameter.name
      && !isNonReferenceIdentifier(node)) {
      const containingParameters = (context.parametersByName.get(node.text) ?? [])
        .filter((candidate) => {
          const fn = ownerFunction(candidate);
          return fn && fn.pos <= node.pos && node.end <= fn.end;
        });
      const shadowed = containingParameters.some((candidate) => {
        if (candidate === parameter) return false;
        const fn = ownerFunction(candidate);
        return fn !== undefined && fn.end - fn.pos < ownerSpan;
      });
      if (!shadowed && !isTransparentReturnReference(node, owner)) unsupported = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(owner);
  return unsupported;
}

function combine(left: readonly string[], right: readonly string[]): readonly string[] {
  const combined: string[] = [];
  for (const leftValue of left) {
    for (const rightValue of right) combined.push(leftValue + rightValue);
  }
  return dedupe(combined);
}

function returnExpressions(node: ts.FunctionLikeDeclaration): readonly ts.Expression[] {
  if (!node.body) return [];
  if (!ts.isBlock(node.body)) return [node.body];
  const expressions: ts.Expression[] = [];
  const visit = (child: ts.Node): void => {
    if (child !== node.body && ts.isFunctionLike(child)) return;
    if (ts.isReturnStatement(child) && child.expression) expressions.push(child.expression);
    ts.forEachChild(child, visit);
  };
  visit(node.body);
  return expressions;
}

function publicPropertyExpressions(
  node: ts.Node,
  property: string,
): readonly (ts.Expression | ts.Identifier)[] {
  const expressions: Array<ts.Expression | ts.Identifier> = [];
  const visit = (child: ts.Node): void => {
    if (child !== node && ts.isFunctionLike(child)) return;
    if (ts.isPropertyAssignment(child)
      && propertyName(child.name, child.getSourceFile()) === property) {
      expressions.push(child.initializer);
    } else if (ts.isShorthandPropertyAssignment(child) && child.name.text === property) {
      expressions.push(child.name);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return expressions;
}

function expressionMayDefineProperty(expression: ts.Expression, property: string): boolean {
  if (ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)) {
    return expressionMayDefineProperty(expression.expression, property);
  }
  if (ts.isConditionalExpression(expression)) {
    return expressionMayDefineProperty(expression.whenTrue, property)
      || expressionMayDefineProperty(expression.whenFalse, property);
  }
  if (!ts.isObjectLiteralExpression(expression)) return true;
  return expression.properties.some((candidate) => {
    if (ts.isSpreadAssignment(candidate)) {
      return expressionMayDefineProperty(candidate.expression, property);
    }
    if (!('name' in candidate) || !candidate.name) return false;
    if (ts.isComputedPropertyName(candidate.name)
      && !ts.isStringLiteralLike(candidate.name.expression)) {
      return true;
    }
    return propertyName(candidate.name, candidate.getSourceFile()) === property;
  });
}

function localTypeAliases(name: string, source: ts.SourceFile): readonly ts.TypeAliasDeclaration[] {
  const aliases: ts.TypeAliasDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === name) {
      aliases.push(node);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return aliases;
}

interface TypeEnvironment {
  readonly bindings: ReadonlyMap<string, TypeBinding>;
  readonly parent?: TypeEnvironment;
}

interface TypeBinding {
  readonly environment: TypeEnvironment;
  readonly type: ts.TypeNode;
}

const EMPTY_TYPE_ENVIRONMENT: TypeEnvironment = { bindings: new Map() };

function lookupTypeBinding(name: string, environment: TypeEnvironment): TypeBinding | undefined {
  let current: TypeEnvironment | undefined = environment;
  while (current) {
    const binding = current.bindings.get(name);
    if (binding) return binding;
    current = current.parent;
  }
  return undefined;
}

function aliasTypeEnvironment(
  alias: ts.TypeAliasDeclaration,
  reference: ts.TypeReferenceNode,
  parent: TypeEnvironment,
): TypeEnvironment {
  const bindings = new Map<string, TypeBinding>();
  for (const [index, parameter] of (alias.typeParameters ?? []).entries()) {
    const argument = reference.typeArguments?.[index];
    if (argument) bindings.set(parameter.name.text, { environment: parent, type: argument });
  }
  return { bindings, parent };
}

function typeIsSingularIssue(
  type: ts.TypeNode | undefined,
  seenAliases: ReadonlySet<string> = new Set(),
  environment: TypeEnvironment = EMPTY_TYPE_ENVIRONMENT,
): boolean {
  if (!type) return false;
  if (ts.isParenthesizedTypeNode(type)
    || ts.isTypeOperatorNode(type)
    || ts.isOptionalTypeNode(type)) {
    return typeIsSingularIssue(type.type, seenAliases, environment);
  }
  if (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type)) {
    return type.types.some((member) => typeIsSingularIssue(member, seenAliases, environment));
  }
  if (!ts.isTypeReferenceNode(type)) return false;
  const name = ts.isIdentifier(type.typeName) ? type.typeName.text : type.typeName.right.text;
  if (ts.isIdentifier(type.typeName)) {
    const binding = lookupTypeBinding(name, environment);
    if (binding) return typeIsSingularIssue(binding.type, seenAliases, binding.environment);
  }
  if (name === 'Issue') return true;
  if (seenAliases.has(name)) return false;
  const nextSeen = new Set(seenAliases);
  nextSeen.add(name);
  return localTypeAliases(name, type.getSourceFile())
    .some((alias) => typeIsSingularIssue(
      alias.type,
      nextSeen,
      aliasTypeEnvironment(alias, type, environment),
    ));
}

function typeMentionsIssue(
  type: ts.TypeNode | undefined,
  seenAliases: ReadonlySet<string> = new Set(),
  environment: TypeEnvironment = EMPTY_TYPE_ENVIRONMENT,
): boolean {
  if (!type) return false;
  let found = false;
  const visit = (node: ts.Node): void => {
    if (ts.isTypeReferenceNode(node)) {
      const name = ts.isIdentifier(node.typeName) ? node.typeName.text : node.typeName.right.text;
      const binding = ts.isIdentifier(node.typeName)
        ? lookupTypeBinding(name, environment)
        : undefined;
      if (binding && typeMentionsIssue(binding.type, seenAliases, binding.environment)) {
        found = true;
      } else if (name === 'Issue') {
        found = true;
      } else if (!seenAliases.has(name)) {
        const nextSeen = new Set(seenAliases);
        nextSeen.add(name);
        found = localTypeAliases(name, node.getSourceFile())
          .some((alias) => typeMentionsIssue(
            alias.type,
            nextSeen,
            aliasTypeEnvironment(alias, node, environment),
          ));
      }
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(type);
  return found;
}

function typeMentionsIssueArray(
  type: ts.TypeNode | undefined,
  seenAliases: ReadonlySet<string> = new Set(),
  environment: TypeEnvironment = EMPTY_TYPE_ENVIRONMENT,
): boolean {
  if (!type) return false;
  if (ts.isParenthesizedTypeNode(type)
    || ts.isTypeOperatorNode(type)
    || ts.isOptionalTypeNode(type)) {
    return typeMentionsIssueArray(type.type, seenAliases, environment);
  }
  if (ts.isArrayTypeNode(type)) return typeMentionsIssue(type.elementType, seenAliases, environment);
  if (ts.isTupleTypeNode(type)) {
    return type.elements.some((element) => typeMentionsIssue(element, seenAliases, environment));
  }
  if (ts.isTypeReferenceNode(type)) {
    const name = ts.isIdentifier(type.typeName) ? type.typeName.text : type.typeName.right.text;
    if (ts.isIdentifier(type.typeName)) {
      const binding = lookupTypeBinding(name, environment);
      if (binding) return typeMentionsIssueArray(binding.type, seenAliases, binding.environment);
    }
    if (name === 'Array' || name === 'ReadonlyArray') {
      return (type.typeArguments ?? [])
        .some((argument) => typeMentionsIssue(argument, seenAliases, environment));
    }
    if (TRANSPARENT_ARRAY_TYPE_WRAPPERS.has(name)) {
      return (type.typeArguments ?? [])
        .some((argument) => typeMentionsIssueArray(argument, seenAliases, environment));
    }
    if (seenAliases.has(name)) return false;
    const nextSeen = new Set(seenAliases);
    nextSeen.add(name);
    return localTypeAliases(name, type.getSourceFile())
      .some((alias) => typeMentionsIssueArray(
        alias.type,
        nextSeen,
        aliasTypeEnvironment(alias, type, environment),
      ));
  }
  if (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type)) {
    return type.types.some((member) => typeMentionsIssueArray(member, seenAliases, environment));
  }
  if (ts.isConditionalTypeNode(type)) {
    return typeMentionsIssueArray(type.trueType, seenAliases, environment)
      || typeMentionsIssueArray(type.falseType, seenAliases, environment);
  }
  if (ts.isMappedTypeNode(type)) {
    return (type.typeParameter.constraint !== undefined
        && typeMentionsIssueArray(type.typeParameter.constraint, seenAliases, environment))
      || (type.nameType !== undefined
        && typeMentionsIssueArray(type.nameType, seenAliases, environment))
      || (type.type !== undefined
        && typeMentionsIssueArray(type.type, seenAliases, environment));
  }
  return false;
}

function isPropertyOnlyObjectReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent))
    && parent.expression === node) {
    return ts.isBinaryExpression(parent.parent)
      && parent.parent.left === parent
      && parent.parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && parent.parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
  }
  return false;
}

function nearestFunctionLike(node: ts.Node): ts.FunctionLikeDeclaration | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isFunctionLike(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function isRuleObject(object: ts.ObjectLiteralExpression): boolean {
  return object.properties.some((candidate) =>
    ts.isPropertyAssignment(candidate)
    && propertyName(candidate.name, candidate.getSourceFile()) === 'id'
    && ts.isStringLiteralLike(candidate.initializer));
}

function isRuleAnalyzeHook(fn: ts.FunctionLikeDeclaration | undefined): boolean {
  if (!fn) return false;
  if (ts.isMethodDeclaration(fn) && ts.isObjectLiteralExpression(fn.parent)) {
    return isRuleObject(fn.parent) && propertyName(fn.name, fn.getSourceFile()) === 'analyze';
  }
  const parent = fn.parent;
  return ts.isPropertyAssignment(parent)
    && parent.initializer === fn
    && ts.isObjectLiteralExpression(parent.parent)
    && isRuleObject(parent.parent)
    && propertyName(parent.name, fn.getSourceFile()) === 'analyze';
}

function isEmptyArrayInitializer(expression: ts.Expression | undefined): boolean {
  if (!expression) return false;
  if (ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)) {
    return isEmptyArrayInitializer(expression.expression);
  }
  return ts.isArrayLiteralExpression(expression) && expression.elements.length === 0;
}

function isAccumulatorPushReceiver(node: ts.Identifier): boolean {
  let current: ts.Expression = node;
  while (current.parent
    && (ts.isParenthesizedExpression(current.parent)
      || ts.isAsExpression(current.parent)
      || ts.isTypeAssertionExpression(current.parent)
      || ts.isNonNullExpression(current.parent)
      || ts.isSatisfiesExpression(current.parent))
    && current.parent.expression === current) {
    current = current.parent;
  }
  const access = current.parent;
  return ts.isPropertyAccessExpression(access)
    && access.expression === current
    && access.name.text === 'push'
    && ts.isCallExpression(access.parent)
    && access.parent.expression === access;
}

function issueAccumulatorIsTerminal(
  receiver: ts.Identifier,
  emission: ts.CallExpression,
  analyzeHook: ts.FunctionLikeDeclaration,
  context: ResolverContext,
): boolean {
  const declarations = nearestVariableDeclarations(receiver, context);
  if (declarations.length !== 1) return false;
  const declaration = declarations[0]!;
  if (!typeMentionsIssue(declaration.type)
    || !isEmptyArrayInitializer(declaration.initializer)
    || declaration.pos < analyzeHook.pos
    || declaration.end > analyzeHook.end) {
    return false;
  }

  let hasTerminalReturn = false;
  const unsupported = bindingHasUnsupportedReference(declaration, context, (reference) => {
    const nearest = nearestVariableDeclarations(reference, context);
    if (nearest.length !== 1 || nearest[0] !== declaration) return false;
    if (isAccumulatorPushReceiver(reference)) return true;
    if (isTransparentReturnReference(reference, analyzeHook)
      && reference.getStart(context.source) > emission.end) {
      hasTerminalReturn = true;
      return true;
    }
    return false;
  });
  return !unsupported && hasTerminalReturn;
}

function isDirectIssueEmissionReference(
  node: ts.Identifier,
  context: ResolverContext,
): boolean {
  let current: ts.Node = node;
  while (current.parent) {
    const parent = current.parent;
    if ((ts.isParenthesizedExpression(parent)
        || ts.isAsExpression(parent)
        || ts.isTypeAssertionExpression(parent)
        || ts.isNonNullExpression(parent)
        || ts.isSatisfiesExpression(parent))
      && parent.expression === current) {
      current = parent;
      continue;
    }
    if (ts.isConditionalExpression(parent)
      && (parent.whenTrue === current || parent.whenFalse === current)) {
      current = parent;
      continue;
    }
    if (ts.isArrayLiteralExpression(parent)
      && parent.elements.some((element) => element === current)) {
      current = parent;
      continue;
    }
    if (ts.isSpreadElement(parent) && parent.expression === current) {
      current = parent;
      continue;
    }
    if (ts.isReturnStatement(parent) && parent.expression === current) {
      return isRuleAnalyzeHook(nearestFunctionLike(parent));
    }
    if (ts.isCallExpression(parent)
      && parent.arguments.some((argument) => argument === current)
      && ts.isPropertyAccessExpression(parent.expression)
      && parent.expression.name.text === 'push') {
      const analyzeHook = nearestFunctionLike(parent);
      if (!analyzeHook || !isRuleAnalyzeHook(analyzeHook)) return false;
      const receiver = transparentIdentifier(parent.expression.expression);
      return receiver !== undefined
        && issueAccumulatorIsTerminal(receiver, parent, analyzeHook, context);
    }
    return false;
  }
  return false;
}

function publicCopyObjectHasUnsupportedReference(
  declaration: ts.VariableDeclaration,
  context: ResolverContext,
): boolean {
  return bindingHasUnsupportedReference(
    declaration,
    context,
    (node) => isPropertyOnlyObjectReference(node) || isDirectIssueEmissionReference(node, context),
  );
}

function publicCopyObjectIsDirectlyEmitted(
  declaration: ts.VariableDeclaration,
  context: ResolverContext,
): boolean {
  if (!ts.isIdentifier(declaration.name)) return false;
  let emitted = false;
  const visit = (node: ts.Node): void => {
    if (emitted) return;
    if (ts.isIdentifier(node)
      && node !== declaration.name
      && node.text === declaration.name.text) {
      const nearest = nearestVariableDeclarations(node, context);
      if (nearest.length === 1
        && nearest[0] === declaration
        && isDirectIssueEmissionReference(node, context)) {
        emitted = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(context.source);
  return emitted;
}

function isPotentialIssueObject(object: ts.ObjectLiteralExpression, context: ResolverContext): boolean {
  let current: ts.Node | undefined = object.parent;
  while (current) {
    if (ts.isFunctionLike(current)) {
      const name = ruleHookName(current);
      if (name === 'analyze'
        || typeIsSingularIssue(current.type)
        || current.parameters.some((parameter) => typeIsSingularIssue(parameter.type))) return true;
    }
    if (ts.isVariableDeclaration(current)
      && current.initializer
      && current.initializer.pos <= object.pos
      && object.end <= current.initializer.end
      && typeMentionsIssue(current.type)) {
      return true;
    }
    if (ts.isCallExpression(current)
      && current.arguments.some((argument) => argument.pos <= object.pos && object.end <= argument.end)
      && ts.isPropertyAccessExpression(current.expression)
      && current.expression.name.text === 'push'
      && ts.isIdentifier(current.expression.expression)) {
      const declarations = context.variablesByName.get(current.expression.expression.text) ?? [];
      if (declarations.some((declaration) => typeMentionsIssue(declaration.type))) return true;
    }
    current = current.parent;
  }
  return false;
}

function directObjectPropertyExpression(
  object: ts.ObjectLiteralExpression,
  property: string,
): ts.Expression | ts.Identifier | undefined {
  if (object.properties.some((candidate) =>
    (ts.isSpreadAssignment(candidate) && expressionMayDefineProperty(candidate.expression, property))
    || ('name' in candidate
      && candidate.name
      && ts.isComputedPropertyName(candidate.name)
      && !ts.isStringLiteralLike(candidate.name.expression)))) {
    return undefined;
  }
  if (object.properties.some((candidate) =>
    'name' in candidate
    && candidate.name
    && propertyName(candidate.name, candidate.getSourceFile()) === property
    && !ts.isPropertyAssignment(candidate)
    && !ts.isShorthandPropertyAssignment(candidate))) {
    return undefined;
  }
  const matches = object.properties.filter((candidate) =>
    (ts.isPropertyAssignment(candidate)
      && propertyName(candidate.name, candidate.getSourceFile()) === property)
    || (ts.isShorthandPropertyAssignment(candidate) && candidate.name.text === property),
  );
  if (matches.length !== 1) return undefined;
  const match = matches[0]!;
  return ts.isPropertyAssignment(match) ? match.initializer : match.name;
}

interface ObjectLiteralBinding {
  readonly name: string;
  readonly declaration?: ts.VariableDeclaration;
}

function objectLiteralBinding(object: ts.ObjectLiteralExpression): ObjectLiteralBinding | undefined {
  let current: ts.Expression = object;
  while (current.parent) {
    const parent = current.parent;
    if ((ts.isParenthesizedExpression(parent)
        || ts.isAsExpression(parent)
        || ts.isTypeAssertionExpression(parent)
        || ts.isNonNullExpression(parent)
        || ts.isSatisfiesExpression(parent))
      && parent.expression === current) {
      current = parent;
      continue;
    }
    if (ts.isConditionalExpression(parent)
      && (parent.whenTrue === current || parent.whenFalse === current)) {
      current = parent;
      continue;
    }
    if (ts.isVariableDeclaration(parent)
      && parent.initializer === current
      && ts.isIdentifier(parent.name)) {
      return { name: parent.name.text, declaration: parent };
    }
    if (ts.isBinaryExpression(parent)
      && parent.right === current
      && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const name = transparentIdentifier(parent.left)?.text;
      return name ? { name } : undefined;
    }
    return undefined;
  }
  return undefined;
}

function returnedAccumulatorPropertyExpressions(
  fn: ts.FunctionLikeDeclaration,
  property: string,
  context: ResolverContext,
): readonly (ts.Expression | ts.Identifier)[] | undefined {
  const returns = returnExpressions(fn);
  if (returns.length === 0 || returns.some((returned) => !ts.isIdentifier(returned))) {
    return undefined;
  }
  const accumulatorNames = new Set(returns.map((returned) => (returned as ts.Identifier).text));
  if (accumulatorNames.size !== 1) return undefined;
  const accumulatorName = [...accumulatorNames][0]!;
  if (context.writtenIdentifiers.has(accumulatorName)) return undefined;
  if ([...context.writtenProperties].some((written) => written.startsWith(`${accumulatorName}.`))) {
    return undefined;
  }

  const declarations = (context.variablesByName.get(accumulatorName) ?? [])
    .filter((declaration) => fn.pos <= declaration.pos && declaration.end <= fn.end);
  if (declarations.length !== 1
    || !declarations[0]!.initializer
    || !ts.isArrayLiteralExpression(declarations[0]!.initializer)) {
    return undefined;
  }

  const expressions: Array<ts.Expression | ts.Identifier> = [];
  for (const element of declarations[0]!.initializer.elements) {
    if (!ts.isObjectLiteralExpression(element)) return undefined;
    const expression = directObjectPropertyExpression(element, property);
    if (!expression) return undefined;
    expressions.push(expression);
  }

  let valid = true;
  const visit = (node: ts.Node): void => {
    if (node !== fn && ts.isFunctionLike(node)) {
      const inspectNestedFunction = (nested: ts.Node): void => {
        if (ts.isIdentifier(nested) && nested.text === accumulatorName) {
          valid = false;
          return;
        }
        ts.forEachChild(nested, inspectNestedFunction);
      };
      ts.forEachChild(node, inspectNestedFunction);
      return;
    }
    if (ts.isIdentifier(node) && node.text === accumulatorName) {
      const parent = node.parent;
      const isDeclaration = parent === declarations[0] && parent.name === node;
      const isDirectReturn = ts.isReturnStatement(parent) && parent.expression === node;
      const isDirectPushReceiver = ts.isPropertyAccessExpression(parent)
        && parent.expression === node
        && parent.name.text === 'push'
        && ts.isCallExpression(parent.parent)
        && parent.parent.expression === parent;
      if (!isDeclaration && !isDirectReturn && !isDirectPushReceiver) {
        valid = false;
      }
    }
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === accumulatorName) {
      if (node.expression.name.text !== 'push') {
        valid = false;
        return;
      }
      if (node.arguments.length === 0) {
        valid = false;
        return;
      }
      for (const argument of node.arguments) {
        if (!ts.isObjectLiteralExpression(argument)) {
          valid = false;
          continue;
        }
        const expression = directObjectPropertyExpression(argument, property);
        if (!expression) valid = false;
        else expressions.push(expression);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(fn);
  return valid && expressions.length > 0 ? expressions : undefined;
}

function resolveFunctionCall(
  call: ts.CallExpression,
  context: ResolverContext,
  seen: ReadonlySet<ts.Node>,
  allowDynamic: boolean,
): ResolutionAttempt {
  if (!ts.isIdentifier(call.expression)) return { matched: false };
  const functions = context.functionsByName.get(call.expression.text) ?? [];
  const functionVariables = new Set(
    functions
      .map((fn) => fn.parent)
      .filter((parent): parent is ts.VariableDeclaration => ts.isVariableDeclaration(parent)),
  );
  const conflictingVariables = (context.variablesByName.get(call.expression.text) ?? [])
    .filter((declaration) => !functionVariables.has(declaration));
  const containingParameters = (context.parametersByName.get(call.expression.text) ?? [])
    .filter((parameter) => {
      const fn = ownerFunction(parameter);
      return fn && fn.pos <= call.pos && call.end <= fn.end;
    });
  const matched = functions.length > 0
    || conflictingVariables.length > 0
    || containingParameters.length > 0;
  if (context.writtenIdentifiers.has(call.expression.text)) return { matched: true };
  if (functions.length !== 1
    || conflictingVariables.length > 0
    || containingParameters.length > 0) {
    return { matched };
  }
  const values: string[] = [];
  for (const fn of functions) {
    const returns = returnExpressions(fn);
    if (returns.length === 0) return { matched: true };
    for (const returned of returns) {
      const resolved = resolveExpression(returned, context, seen, allowDynamic);
      if (!resolved || resolved.length === 0) return { matched: true, values: [] };
      values.push(...resolved);
    }
  }
  return { matched: true, values: dedupe(values) };
}

function resolveForwardedProperty(
  expression: ts.PropertyAccessExpression,
  context: ResolverContext,
  seen: ReadonlySet<ts.Node>,
): readonly string[] | undefined {
  if (!ts.isIdentifier(expression.expression)) return undefined;
  const bindingName = expression.expression.text;
  const property = expression.name.text;
  const values: string[] = [];
  let matched = false;
  const containingParameters = (context.parametersByName.get(bindingName) ?? [])
    .filter((parameter) => {
      const fn = ownerFunction(parameter);
      return fn && fn.pos <= expression.pos && expression.end <= fn.end;
    });
  if (containingParameters.length > 0) return undefined;
  if ((context.functionsByName.get(bindingName) ?? []).length > 0) return undefined;
  const declarations = nearestVariableDeclarations(expression.expression, context);
  if (declarations.length !== 1) return undefined;
  if (context.writtenIdentifiers.has(bindingName)
    || context.writtenProperties.has(`${bindingName}.${property}`)
    || context.writtenProperties.has(`${bindingName}.*`)) {
    return undefined;
  }

  for (const declaration of declarations) {
    if (declaration.initializer) {
      let initializer = declaration.initializer;
      while (ts.isParenthesizedExpression(initializer)
        || ts.isAsExpression(initializer)
        || ts.isTypeAssertionExpression(initializer)
        || ts.isNonNullExpression(initializer)
        || ts.isSatisfiesExpression(initializer)) {
        initializer = initializer.expression;
      }
      if (ts.isObjectLiteralExpression(initializer)) {
        matched = true;
        const candidate = directObjectPropertyExpression(initializer, property);
        if (!candidate) return undefined;
        const resolved = resolveExpression(candidate, context, seen, false);
        if (!resolved || resolved.length === 0) return undefined;
        values.push(...resolved);
        continue;
      }
      return undefined;
    }
    const declarationList = declaration.parent;
    const loop = ts.isVariableDeclarationList(declarationList) ? declarationList.parent : undefined;
    if (loop && ts.isForOfStatement(loop) && ts.isCallExpression(loop.expression)
      && ts.isIdentifier(loop.expression.expression)) {
      const helperName = loop.expression.expression.text;
      const functions = context.functionsByName.get(helperName) ?? [];
      const functionVariables = new Set(
        functions
          .map((fn) => fn.parent)
          .filter((parent): parent is ts.VariableDeclaration => ts.isVariableDeclaration(parent)),
      );
      const conflictingVariables = (context.variablesByName.get(helperName) ?? [])
        .filter((candidate) => !functionVariables.has(candidate));
      const containingHelperParameters = (context.parametersByName.get(helperName) ?? [])
        .filter((parameter) => {
          const fn = ownerFunction(parameter);
          return fn && fn.pos <= loop.expression.pos && loop.expression.end <= fn.end;
        });
      if (functions.length !== 1
        || conflictingVariables.length > 0
        || containingHelperParameters.length > 0
        || context.writtenIdentifiers.has(helperName)) {
        return undefined;
      }
      for (const fn of functions) {
        const candidates = returnedAccumulatorPropertyExpressions(fn, property, context);
        if (!candidates) return undefined;
        for (const candidate of candidates) {
          matched = true;
          const resolved = resolveExpression(candidate, context, seen, true);
          if (!resolved) return undefined;
          if (resolved.length === 0) return [];
          values.push(...resolved);
        }
      }
    }
  }

  return matched ? dedupe(values) : undefined;
}

function resolveIterableExpression(
  expression: ts.Expression,
  context: ResolverContext,
  seen: ReadonlySet<ts.Node>,
  allowDynamic: boolean,
): readonly string[] | undefined {
  if (seen.has(expression)) return undefined;
  const nextSeen = new Set(seen);
  nextSeen.add(expression);
  if (ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)) {
    return resolveIterableExpression(expression.expression, context, nextSeen, allowDynamic);
  }
  if (ts.isConditionalExpression(expression)) {
    const whenTrue = resolveIterableExpression(expression.whenTrue, context, nextSeen, allowDynamic);
    const whenFalse = resolveIterableExpression(expression.whenFalse, context, nextSeen, allowDynamic);
    if (!whenTrue || !whenFalse) return undefined;
    if (whenTrue.length === 0 || whenFalse.length === 0) return [];
    return dedupe([...whenTrue, ...whenFalse]);
  }
  if (ts.isArrayLiteralExpression(expression)) {
    const values: string[] = [];
    for (const element of expression.elements) {
      if (ts.isOmittedExpression(element)) continue;
      const resolved = ts.isSpreadElement(element)
        ? resolveIterableExpression(element.expression, context, nextSeen, allowDynamic)
        : resolveExpression(element, context, nextSeen, allowDynamic);
      if (!resolved) return undefined;
      if (resolved.length === 0) return [];
      values.push(...resolved);
    }
    return dedupe(values);
  }
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
    const functions = context.functionsByName.get(expression.expression.text) ?? [];
    const functionVariables = new Set(
      functions
        .map((fn) => fn.parent)
        .filter((parent): parent is ts.VariableDeclaration => ts.isVariableDeclaration(parent)),
    );
    const conflictingVariables = (context.variablesByName.get(expression.expression.text) ?? [])
      .filter((declaration) => !functionVariables.has(declaration));
    const containingParameters = (context.parametersByName.get(expression.expression.text) ?? [])
      .filter((parameter) => {
        const fn = ownerFunction(parameter);
        return fn && fn.pos <= expression.pos && expression.end <= fn.end;
      });
    if (functions.length === 1
      && conflictingVariables.length === 0
      && containingParameters.length === 0
      && !context.writtenIdentifiers.has(expression.expression.text)) {
      const values: string[] = [];
      for (const returned of returnExpressions(functions[0]!)) {
        const resolved = resolveIterableExpression(returned, context, nextSeen, allowDynamic);
        if (!resolved) return undefined;
        if (resolved.length === 0) return [];
        values.push(...resolved);
      }
      return values.length > 0 ? dedupe(values) : [];
    }
    if (functions.length > 0 || conflictingVariables.length > 0 || containingParameters.length > 0) {
      return [];
    }
    return allowDynamic ? [DYNAMIC_VALUE] : undefined;
  }
  if (ts.isIdentifier(expression)) {
    if (context.writtenIdentifiers.has(expression.text)
      || context.mutatedCollections.has(expression.text)
      || [...context.writtenProperties].some((write) => write.startsWith(`${expression.text}.`))) {
      return [];
    }
    const containingParameters = (context.parametersByName.get(expression.text) ?? [])
      .filter((parameter) => {
        const fn = ownerFunction(parameter);
        return fn && fn.pos <= expression.pos && expression.end <= fn.end;
      });
    if (containingParameters.length > 1) return [];
    if (containingParameters.length === 1) {
      const parameter = containingParameters[0]!;
      if (!ts.isIdentifier(parameter.name)
        || parameter.dotDotDotToken
        || parameterHasUnsupportedReference(parameter, context)) return [];
      const fn = ownerFunction(parameter);
      const name = fn ? functionName(fn) : undefined;
      const index = parameterIndex(parameter);
      if (!name || index < 0) return [];
      const values: string[] = [];
      if (parameter.initializer) {
        const resolvedDefault = resolveIterableExpression(
          parameter.initializer,
          context,
          nextSeen,
          allowDynamic,
        );
        if (!resolvedDefault || resolvedDefault.length === 0) return [];
        values.push(...resolvedDefault);
      }
      for (const call of context.callsByName.get(name) ?? []) {
        const argument = call.arguments[index];
        if (!argument) {
          if (!parameter.initializer) return [];
          continue;
        }
        const resolved = resolveIterableExpression(argument, context, nextSeen, allowDynamic);
        if (!resolved || resolved.length === 0) return [];
        values.push(...resolved);
      }
      return values.length > 0 ? dedupe(values) : [];
    }
    const declarations = nearestVariableDeclarations(expression, context);
    if (declarations.length > 1) return [];
    const declaration = declarations[0];
    if (declaration) {
      if (!ts.isIdentifier(declaration.name)
        || !declaration.initializer
        || variableHasUnsupportedReference(declaration, context)) return [];
      return resolveIterableExpression(declaration.initializer, context, nextSeen, allowDynamic);
    }
  }
  const resolved = resolveExpression(expression, context, nextSeen, allowDynamic);
  return resolved ?? (allowDynamic ? [DYNAMIC_VALUE] : undefined);
}

function resolveIdentifier(
  expression: ts.Identifier,
  context: ResolverContext,
  seen: ReadonlySet<ts.Node>,
  allowDynamic: boolean,
): ResolutionAttempt {
  const values: string[] = [];
  let matched = false;
  if (context.writtenIdentifiers.has(expression.text)) {
    return allowDynamic
      ? { matched: true, values: [DYNAMIC_VALUE] }
      : { matched: true };
  }
  const containingParameters = (context.parametersByName.get(expression.text) ?? [])
    .filter((parameter) => {
      const fn = ownerFunction(parameter);
      return fn && fn.pos <= expression.pos && expression.end <= fn.end;
    });
  if (containingParameters.length > 1) return { matched: true, values: [] };
  for (const parameter of containingParameters) {
    if (!ts.isIdentifier(parameter.name)) return { matched: true, values: [] };
    const fn = ownerFunction(parameter);
    const name = fn ? functionName(fn) : undefined;
    const index = parameterIndex(parameter);
    if (!name || index < 0) continue;
    matched = true;
    if (parameter.dotDotDotToken) return { matched: true, values: [] };
    if (parameter.initializer) {
      const resolvedDefault = resolveExpression(
        parameter.initializer,
        context,
        seen,
        allowDynamic,
      );
      if (!resolvedDefault || resolvedDefault.length === 0) {
        return { matched: true, values: [] };
      }
      values.push(...resolvedDefault);
    }
    for (const call of context.callsByName.get(name) ?? []) {
      const argument = call.arguments[index];
      if (!argument) {
        if (!parameter.initializer) return { matched: true, values: [] };
        continue;
      }
      const resolved = resolveExpression(argument, context, seen, allowDynamic);
      if (!resolved || resolved.length === 0) return { matched: true, values: [] };
      values.push(...resolved);
    }
  }

  if (!matched && containingParameters.length === 0) {
    const nearestDeclarations = nearestVariableDeclarations(expression, context);
    if (nearestDeclarations.length > 1) return { matched: true, values: [] };
    const declaration = nearestDeclarations[0];
    if (declaration && !declaration.initializer) {
      const declarationList = declaration.parent;
      const loop = ts.isVariableDeclarationList(declarationList)
        ? declarationList.parent
        : undefined;
      if (ts.isIdentifier(declaration.name) && loop && ts.isForOfStatement(loop)) {
        const resolved = resolveIterableExpression(loop.expression, context, seen, allowDynamic);
        return resolved && resolved.length > 0
          ? { matched: true, values: resolved }
          : { matched: true, values: [] };
      }
      return { matched: true, values: [] };
    }
    if (declaration?.initializer) {
      if (!ts.isIdentifier(declaration.name)) return { matched: true, values: [] };
      matched = true;
      const resolved = resolveExpression(declaration.initializer, context, seen, allowDynamic);
      if (!resolved) return { matched: true, values: [] };
      if (resolved.length === 0) return { matched: true, values: [] };
      values.push(...resolved);
    }
  }

  return matched ? { matched: true, values: dedupe(values) } : { matched: false };
}

function resolveExpression(
  expression: ts.Expression,
  context: ResolverContext,
  seen: ReadonlySet<ts.Node>,
  allowDynamic: boolean,
): readonly string[] | undefined {
  if (seen.has(expression)) return undefined;
  const nextSeen = new Set(seen);
  nextSeen.add(expression);

  if (ts.isStringLiteralLike(expression)) return [expression.text];
  if (ts.isNumericLiteral(expression)) return [expression.text];
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return ['true'];
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return ['false'];
  if (ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)) {
    return resolveExpression(expression.expression, context, nextSeen, allowDynamic);
  }
  if (ts.isTemplateExpression(expression)) {
    let values: readonly string[] = [expression.head.text];
    for (const span of expression.templateSpans) {
      const interpolation = resolveExpression(span.expression, context, nextSeen, true);
      if (!interpolation) return undefined;
      if (interpolation.length === 0) return [];
      values = combine(values, interpolation);
      values = combine(values, [span.literal.text]);
    }
    return values;
  }
  if (ts.isBinaryExpression(expression)
    && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = resolveExpression(expression.left, context, nextSeen, true);
    const right = resolveExpression(expression.right, context, nextSeen, true);
    if (!left || !right) return undefined;
    if (left.length === 0 || right.length === 0) return [];
    return combine(left, right);
  }
  if (ts.isConditionalExpression(expression)) {
    const whenTrue = resolveExpression(expression.whenTrue, context, nextSeen, allowDynamic);
    const whenFalse = resolveExpression(expression.whenFalse, context, nextSeen, allowDynamic);
    if (!whenTrue || !whenFalse) return undefined;
    if (whenTrue.length === 0 || whenFalse.length === 0) return [];
    return dedupe([...whenTrue, ...whenFalse]);
  }
  if (ts.isIdentifier(expression)) {
    const attempt = resolveIdentifier(expression, context, nextSeen, allowDynamic);
    if (attempt.values) return attempt.values;
    return allowDynamic ? [DYNAMIC_VALUE] : undefined;
  }
  if (ts.isCallExpression(expression)) {
    const attempt = resolveFunctionCall(expression, context, nextSeen, allowDynamic);
    if (attempt.values) return attempt.values;
    if (attempt.matched || ts.isIdentifier(expression.expression)) return undefined;
    return allowDynamic ? [DYNAMIC_VALUE] : undefined;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const forwarded = resolveForwardedProperty(expression, context, nextSeen);
    if (forwarded !== undefined) return forwarded;
    if (ts.isIdentifier(expression.expression)) {
      const declarations = nearestVariableDeclarations(expression.expression, context);
      if (declarations.length === 1 && declarations[0]!.initializer) {
        let initializer = declarations[0]!.initializer!;
        while (ts.isParenthesizedExpression(initializer)
          || ts.isAsExpression(initializer)
          || ts.isTypeAssertionExpression(initializer)
          || ts.isNonNullExpression(initializer)
          || ts.isSatisfiesExpression(initializer)) {
          initializer = initializer.expression;
        }
        const callRoot = ts.isCallExpression(initializer)
          && (ts.isPropertyAccessExpression(initializer.expression)
            || ts.isElementAccessExpression(initializer.expression))
          ? leftmostIdentifier(initializer.expression.expression)
          : undefined;
        const callRootIsRuntime = callRoot !== undefined
          && (nearestVariableDeclarations(callRoot, context).length > 0
            || (context.parametersByName.get(callRoot.text) ?? []).some((parameter) => {
              const owner = ownerFunction(parameter);
              return owner && owner.pos <= initializer.pos && initializer.end <= owner.end;
            })
            || new Set(['Array', 'JSON', 'Math', 'Number', 'Object', 'RegExp', 'String']).has(callRoot.text));
        const callResultPropertyIsNonText = ts.isCallExpression(initializer)
          && callResultPropertyCannotCarryUnboundedText(initializer, expression, context);
        if (ts.isObjectLiteralExpression(initializer)
          || ts.isCallExpression(initializer)
            && (ts.isIdentifier(initializer.expression)
              ? uniqueLocalFunctionForCall(initializer, context) === undefined
                && !callResultPropertyIsNonText
              : !callRootIsRuntime)
          || ts.isIdentifier(initializer)
            && nearestVariableDeclarations(initializer, context).length === 0) {
          return undefined;
        }
      }
    }
    return allowDynamic && !PUBLIC_PROPERTY_NAMES.has(expression.name.text)
      ? [DYNAMIC_VALUE]
      : undefined;
  }
  return allowDynamic ? [DYNAMIC_VALUE] : undefined;
}

function uniqueLocalFunctionForCall(
  call: ts.CallExpression,
  context: ResolverContext,
): ts.FunctionLikeDeclaration | undefined {
  if (!ts.isIdentifier(call.expression)) return undefined;
  const name = call.expression.text;
  const functions = context.functionsByName.get(name) ?? [];
  const functionVariables = new Set(
    functions
      .map((fn) => fn.parent)
      .filter((parent): parent is ts.VariableDeclaration => ts.isVariableDeclaration(parent)),
  );
  const conflictingVariables = (context.variablesByName.get(name) ?? [])
    .filter((declaration) => !functionVariables.has(declaration));
  const containingParameters = (context.parametersByName.get(name) ?? [])
    .filter((parameter) => {
      const fn = ownerFunction(parameter);
      return fn && fn.pos <= call.pos && call.end <= fn.end;
    });
  return functions.length === 1
    && conflictingVariables.length === 0
    && containingParameters.length === 0
    && !context.writtenIdentifiers.has(name)
    ? functions[0]
    : undefined;
}

function exactRuleAnalyzeHooks(
  ruleId: string,
  source: ts.SourceFile,
): readonly ts.FunctionLikeDeclaration[] {
  const hooks: ts.FunctionLikeDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const id = node.properties.find((candidate) =>
        ts.isPropertyAssignment(candidate)
        && propertyName(candidate.name, source) === 'id'
        && ts.isStringLiteralLike(candidate.initializer)
        && candidate.initializer.text === ruleId);
      if (id) {
        for (const candidate of node.properties) {
          if (ts.isMethodDeclaration(candidate)
            && propertyName(candidate.name, source) === 'analyze') {
            hooks.push(candidate);
          } else if (ts.isPropertyAssignment(candidate)
            && propertyName(candidate.name, source) === 'analyze'
            && (ts.isArrowFunction(candidate.initializer)
              || ts.isFunctionExpression(candidate.initializer))) {
            hooks.push(candidate.initializer);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hooks;
}

function functionReturnExpressions(
  expression: ts.Expression,
): readonly ts.Expression[] | undefined {
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return returnExpressions(expression);
  }
  return undefined;
}

function hasDirectPublicCopy(object: ts.ObjectLiteralExpression): boolean {
  return object.properties.some((candidate) =>
    (ts.isPropertyAssignment(candidate)
      && PUBLIC_PROPERTY_NAMES.has(propertyName(candidate.name, candidate.getSourceFile())))
    || (ts.isShorthandPropertyAssignment(candidate)
      && PUBLIC_PROPERTY_NAMES.has(candidate.name.text))
    || (ts.isSpreadAssignment(candidate)
      && [...PUBLIC_PROPERTY_NAMES].some((property) =>
        expressionMayDefineProperty(candidate.expression, property))));
}

function hasUnsafeIssueObjectMember(object: ts.ObjectLiteralExpression): boolean {
  return object.properties.some((candidate) =>
    ts.isGetAccessorDeclaration(candidate)
    || ts.isSetAccessorDeclaration(candidate)
    || ts.isMethodDeclaration(candidate)
    || 'name' in candidate
      && candidate.name !== undefined
      && propertyName(candidate.name, object.getSourceFile()) === '__proto__');
}

function isAuditableIssueExpression(
  expression: ts.Expression,
  context: ResolverContext,
  seen: ReadonlySet<ts.Node>,
): boolean {
  if (seen.has(expression)) return false;
  const nextSeen = new Set(seen);
  nextSeen.add(expression);
  if (ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)) {
    return isAuditableIssueExpression(expression.expression, context, nextSeen);
  }
  if (ts.isConditionalExpression(expression)) {
    return isAuditableIssueExpression(expression.whenTrue, context, nextSeen)
      && isAuditableIssueExpression(expression.whenFalse, context, nextSeen);
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return hasDirectPublicCopy(expression)
      && !hasUnsafeIssueObjectMember(expression)
      && expression.properties.every((property) =>
        !ts.isSpreadAssignment(property)
        || ![...PUBLIC_PROPERTY_NAMES].some((name) =>
          expressionMayDefineProperty(property.expression, name))
        || isAuditableIssueExpression(property.expression, context, nextSeen));
  }
  if (ts.isIdentifier(expression)) {
    const containingParameters = (context.parametersByName.get(expression.text) ?? [])
      .filter((parameter) => {
        const fn = ownerFunction(parameter);
        return fn && fn.pos <= expression.pos && expression.end <= fn.end;
      });
    if (containingParameters.length > 0) return false;
    const declarations = nearestVariableDeclarations(expression, context);
    return declarations.length === 1
      && declarations[0]!.initializer !== undefined
      && isAuditableIssueExpression(declarations[0]!.initializer!, context, nextSeen);
  }
  if (ts.isCallExpression(expression)) {
    const fn = uniqueLocalFunctionForCall(expression, context);
    if (!fn) return false;
    const returns = returnExpressions(fn);
    return returns.length > 0
      && returns.every((returned) => isAuditableIssueExpression(returned, context, nextSeen));
  }
  return false;
}

function isAuditableIssueArrayExpression(
  expression: ts.Expression,
  context: ResolverContext,
  seen: ReadonlySet<ts.Node>,
): boolean {
  if (seen.has(expression)) return false;
  const nextSeen = new Set(seen);
  nextSeen.add(expression);
  if (ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isNonNullExpression(expression)
    || ts.isSatisfiesExpression(expression)) {
    return isAuditableIssueArrayExpression(expression.expression, context, nextSeen);
  }
  if (ts.isConditionalExpression(expression)) {
    return isAuditableIssueArrayExpression(expression.whenTrue, context, nextSeen)
      && isAuditableIssueArrayExpression(expression.whenFalse, context, nextSeen);
  }
  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.every((element) => {
      if (ts.isOmittedExpression(element)) return true;
      return ts.isSpreadElement(element)
        ? isAuditableIssueArrayExpression(element.expression, context, nextSeen)
        : isAuditableIssueExpression(element, context, nextSeen);
    });
  }
  if (ts.isIdentifier(expression)) {
    const declarations = nearestVariableDeclarations(expression, context);
    if (declarations.length !== 1 || !declarations[0]!.initializer) return false;
    const declaration = declarations[0]!;
    return typeMentionsIssue(declaration.type)
      && isAuditableIssueArrayExpression(declaration.initializer!, context, nextSeen);
  }
  if (!ts.isCallExpression(expression)) return false;

  if (ts.isPropertyAccessExpression(expression.expression)) {
    const method = expression.expression.name.text;
    if (method === 'map' || method === 'flatMap') {
      const callback = expression.arguments[0];
      if (!callback) return false;
      const returns = functionReturnExpressions(callback);
      if (!returns || returns.length === 0) return false;
      return method === 'map'
        ? returns.every((returned) => isAuditableIssueExpression(returned, context, nextSeen))
        : returns.every((returned) => isAuditableIssueArrayExpression(returned, context, nextSeen));
    }
    if (method === 'slice') {
      return isAuditableIssueArrayExpression(expression.expression.expression, context, nextSeen);
    }
    if (method === 'concat') {
      return isAuditableIssueArrayExpression(expression.expression.expression, context, nextSeen)
        && expression.arguments.every((argument) =>
          isAuditableIssueArrayExpression(argument, context, nextSeen)
          || isAuditableIssueExpression(argument, context, nextSeen));
    }
    if (ts.isIdentifier(expression.expression.expression)
      && expression.expression.expression.text === 'Array'
      && method === 'from') {
      const callback = expression.arguments[1];
      if (!callback) return false;
      const returns = functionReturnExpressions(callback);
      return returns !== undefined
        && returns.length > 0
        && returns.every((returned) => isAuditableIssueExpression(returned, context, nextSeen));
    }
    return false;
  }

  const fn = uniqueLocalFunctionForCall(expression, context);
  if (!fn) return false;
  const returns = returnExpressions(fn);
  return returns.length > 0
    && returns.every((returned) => isAuditableIssueArrayExpression(returned, context, nextSeen));
}

function typedIssueBinding(
  identifier: ts.Identifier,
  context: ResolverContext,
): ts.VariableDeclaration | ts.ParameterDeclaration | undefined {
  const declarations = nearestVariableDeclarations(identifier, context);
  if (declarations.length === 1 && typeMentionsIssueArray(declarations[0]!.type)) {
    return declarations[0];
  }
  const parameters = (context.parametersByName.get(identifier.text) ?? [])
    .filter((parameter) => {
      const fn = ownerFunction(parameter);
      return fn
        && fn.pos <= identifier.pos
        && identifier.end <= fn.end
        && typeMentionsIssueArray(parameter.type);
    })
    .sort((left, right) => {
      const leftOwner = ownerFunction(left)!;
      const rightOwner = ownerFunction(right)!;
      return (leftOwner.end - leftOwner.pos) - (rightOwner.end - rightOwner.pos);
    });
  return parameters[0];
}

function expressionReferencesTypedIssueBinding(
  expression: ts.Expression,
  context: ResolverContext,
): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (node !== expression && ts.isFunctionLike(node) && isRuleAnalyzeHook(node)) return;
    if (ts.isIdentifier(node)
      && !isNonReferenceIdentifier(node)
      && typedIssueBinding(node, context)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function assertTypedIssueArrayOperations(
  source: ts.SourceFile,
  context: ResolverContext,
  filePath: string,
): void {
  const fail = (node: ts.Node, operation = 'typed Issue[] operation'): never => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    throw new TypeError(
      `${filePath}:${line} cannot resolve public copy from ${operation} ${node.getText(source)}`,
    );
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && PROTOTYPE_ACCESS_NAMES.has(node.text)) {
      fail(node, 'global prototype access');
    }
    if (ts.isStringLiteralLike(node) && PROTOTYPE_ACCESS_NAMES.has(node.text)) {
      fail(node, 'global prototype access');
    }
    if (ts.isIdentifier(node) && DYNAMIC_EXECUTION_NAMES.has(node.text)) {
      fail(node, 'dynamic code execution');
    }
    if (ts.isStringLiteralLike(node) && DYNAMIC_EXECUTION_NAMES.has(node.text)) {
      fail(node, 'dynamic code execution');
    }
    if (ts.isElementAccessExpression(node) && node.argumentExpression) {
      const resolvedNames = resolveExpression(node.argumentExpression, context, new Set(), false);
      if (resolvedNames?.some((name) => PROTOTYPE_ACCESS_NAMES.has(name))) {
        fail(node, 'global prototype access');
      }
      if (resolvedNames?.some((name) => DYNAMIC_EXECUTION_NAMES.has(name))) {
        fail(node, 'dynamic code execution');
      }
    }
    if (ts.isPropertyAccessExpression(node)
      && node.name.text === 'prototype') {
      fail(node);
    }
    if (ts.isElementAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && (node.expression.text === 'Object' || node.expression.text === 'Array')
      && node.argumentExpression
      && ts.isStringLiteralLike(node.argumentExpression)
      && node.argumentExpression.text === 'prototype') {
      fail(node);
    }
    if (ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && (node.expression.expression.text === 'Object' || node.expression.expression.text === 'Reflect')
      && node.expression.name.text === 'getPrototypeOf') {
      fail(node, 'global prototype access');
    }
    if (ts.isForOfStatement(node)
      && expressionReferencesTypedIssueBinding(node.expression, context)) {
      fail(node);
    }
    if (ts.isShorthandPropertyAssignment(node)
      && typedIssueBinding(node.name, context)) {
      fail(node);
    }
    if (ts.isPropertyAssignment(node)) {
      const value = transparentIdentifier(node.initializer);
      if (value && typedIssueBinding(value, context)) fail(node);
    }
    if (ts.isElementAccessExpression(node)) {
      const receiver = transparentIdentifier(node.expression);
      if (receiver && typedIssueBinding(receiver, context)) fail(node);
    }
    if (ts.isBinaryExpression(node)
      && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      let publicPropertyWrite: string | undefined;
      let left: ts.Expression = node.left;
      while (ts.isParenthesizedExpression(left)
        || ts.isAsExpression(left)
        || ts.isTypeAssertionExpression(left)
        || ts.isNonNullExpression(left)
        || ts.isSatisfiesExpression(left)) {
        left = left.expression;
      }
      if (ts.isPropertyAccessExpression(left)) {
        publicPropertyWrite = left.name.text;
      } else if (ts.isElementAccessExpression(left)
        && left.argumentExpression
        && ts.isStringLiteralLike(left.argumentExpression)) {
        publicPropertyWrite = left.argumentExpression.text;
      }
      if (publicPropertyWrite && PUBLIC_PROPERTY_NAMES.has(publicPropertyWrite)) {
        fail(node, 'public-copy property write');
      }
      const leftReceiver = ts.isPropertyAccessExpression(node.left)
        || ts.isElementAccessExpression(node.left)
        ? transparentIdentifier(node.left.expression)
        : undefined;
      if (leftReceiver && typedIssueBinding(leftReceiver, context)) fail(node);
      if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const right = transparentIdentifier(node.right);
        if (right && typedIssueBinding(right, context) && ts.isIdentifier(node.left)) fail(node);
        if (expressionReferencesTypedIssueBinding(node.right, context)) fail(node);
      }
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (expressionReferencesTypedIssueBinding(node.initializer, context)) fail(node);
    }
    if (ts.isPropertyDeclaration(node)
      && node.initializer
      && expressionReferencesTypedIssueBinding(node.initializer, context)) {
      fail(node);
    }
    if (ts.isReturnStatement(node)
      && node.expression
      && expressionReferencesTypedIssueBinding(node.expression, context)
      && !isRuleAnalyzeHook(nearestFunctionLike(node))) {
      fail(node);
    }
    if (ts.isThrowStatement(node)
      && node.expression
      && expressionReferencesTypedIssueBinding(node.expression, context)) {
      fail(node);
    }
    if (ts.isYieldExpression(node)
      && node.expression
      && expressionReferencesTypedIssueBinding(node.expression, context)) {
      fail(node);
    }
    if (ts.isTaggedTemplateExpression(node)
      && ts.isTemplateExpression(node.template)
      && node.template.templateSpans.some((span) =>
        expressionReferencesTypedIssueBinding(span.expression, context))) {
      fail(node);
    }
    if (ts.isNewExpression(node)
      && (node.arguments ?? []).some((argument) =>
        expressionReferencesTypedIssueBinding(argument, context))) {
      fail(node);
    }
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression)
        && ((ts.isIdentifier(node.expression.expression)
            && node.expression.expression.text === 'Reflect'
            && (node.expression.name.text === 'set' || node.expression.name.text === 'defineProperty'))
          || (ts.isIdentifier(node.expression.expression)
            && node.expression.expression.text === 'Object'
            && node.expression.name.text === 'defineProperty'))
        && node.arguments[1]
        && ts.isStringLiteralLike(node.arguments[1])
        && PUBLIC_PROPERTY_NAMES.has(node.arguments[1].text)) {
        fail(node, 'dynamic public-copy property write');
      }
      const access = ts.isPropertyAccessExpression(node.expression)
        || ts.isElementAccessExpression(node.expression)
        ? node.expression
        : undefined;
      const receiver = access ? transparentIdentifier(access.expression) : undefined;
      const method = access && ts.isPropertyAccessExpression(access)
        ? access.name.text
        : access?.argumentExpression && ts.isStringLiteralLike(access.argumentExpression)
          ? access.argumentExpression.text
          : undefined;
      if (receiver && typedIssueBinding(receiver, context)) {
        if (method === 'push' || method === 'unshift') {
          for (const argument of node.arguments) {
            const auditable = ts.isSpreadElement(argument)
              ? isAuditableIssueArrayExpression(argument.expression, context, new Set())
              : isAuditableIssueExpression(argument, context, new Set());
            if (!auditable) fail(argument);
          }
        } else if (!method || !new Set(['slice', 'concat']).has(method)) {
          fail(node);
        }
      } else {
        for (const [index, argument] of node.arguments.entries()) {
          const identifier = transparentIdentifier(argument);
          if (identifier && typedIssueBinding(identifier, context)) {
            const fn = uniqueLocalFunctionForCall(node, context);
            if (!fn || !fn.parameters[index] || !typeMentionsIssueArray(fn.parameters[index]!.type)) fail(node);
          } else if (expressionReferencesTypedIssueBinding(argument, context)) {
            fail(node);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function assertAuditableRuleEmissions(
  ruleId: string,
  source: ts.SourceFile,
  context: ResolverContext,
  filePath: string,
): void {
  const hooks = exactRuleAnalyzeHooks(ruleId, source);
  if (hooks.length !== 1) {
    throw new TypeError(`${ruleId} must expose exactly one statically auditable analyze hook; found ${hooks.length}`);
  }
  for (const returned of returnExpressions(hooks[0]!)) {
    if (!isAuditableIssueArrayExpression(returned, context, new Set())) {
      const line = source.getLineAndCharacterOfPosition(returned.getStart(source)).line + 1;
      throw new TypeError(
        `${filePath}:${line} cannot resolve public copy from analyze return ${returned.getText(source)}`,
      );
    }
  }
  assertTypedIssueArrayOperations(source, context, filePath);
}

function declaresRuleId(filePath: string, ruleId: string): boolean {
  const sourceText = readFileSync(filePath, 'utf8');
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)
      && propertyName(node.name, source) === 'id'
      && ts.isStringLiteralLike(node.initializer)
      && node.initializer.text === ruleId) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

export function findRuleSourceFile(ruleId: string, sourceRoot: string): string {
  const matches = ruleFiles(sourceRoot).filter((filePath) => declaresRuleId(filePath, ruleId));
  if (matches.length !== 1) {
    throw new TypeError(`${ruleId} must map to exactly one rule source file; found ${matches.length}`);
  }
  return matches[0]!;
}

export function collectPublicRuleCopy(ruleId: string, sourceRoot: string): readonly PublicRuleCopy[] {
  const filePath = findRuleSourceFile(ruleId, sourceRoot);
  const sourceFiles = ruleFiles(sourceRoot);
  const program = sourceFiles.length > 8 ? programForSourceRoot(sourceRoot, sourceFiles) : undefined;
  const source = program?.getSourceFile(filePath)
    ?? ts.createSourceFile(filePath, readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true);
  const context = buildResolverContext(source, program?.getTypeChecker());
  const rows: PublicRuleCopy[] = [];

  assertAuditableRuleEmissions(ruleId, source, context, filePath);

  const addResolved = (
    property: PublicRuleCopy['property'],
    expression: ts.Expression,
    position: number,
  ): void => {
    const line = source.getLineAndCharacterOfPosition(position).line + 1;
    const location = `${filePath}:${line} ${property}`;
    const resolved = resolveExpression(expression, context, new Set(), false);
    if (!resolved || resolved.length === 0) {
      throw new TypeError(`${location} cannot resolve public copy from ${expression.getText(source)}`);
    }
    for (const text of resolved) rows.push({ location, property, text });
  };

  const visit = (node: ts.Node): void => {
    if (node.parent
      && ts.isObjectLiteralExpression(node.parent)
      && ts.isSpreadAssignment(node)
      && isPotentialIssueObject(node.parent, context)
      && [...PUBLIC_PROPERTY_NAMES].some((property) =>
        expressionMayDefineProperty(node.expression, property))) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      throw new TypeError(
        `${filePath}:${line} cannot resolve public copy from potential spread ${node.expression.getText(source)}`,
      );
    }
    if (node.parent
      && ts.isObjectLiteralExpression(node.parent)
      && 'name' in node
      && node.name
      && ts.isComputedPropertyName(node.name)
      && !ts.isStringLiteralLike(node.name.expression)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      throw new TypeError(
        `${filePath}:${line} cannot resolve potential public copy from computed key ${node.name.getText(source)}`,
      );
    }
    if ((ts.isGetAccessorDeclaration(node)
        || ts.isSetAccessorDeclaration(node)
        || ts.isMethodDeclaration(node))
      && node.parent
      && ts.isObjectLiteralExpression(node.parent)
      && node.name
      && PUBLIC_PROPERTY_NAMES.has(propertyName(node.name, source))) {
      const property = propertyName(node.name, source);
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      throw new TypeError(`${filePath}:${line} ${property} cannot resolve public copy from an accessor or method`);
    }
    if (ts.isPropertyAssignment(node)) {
      const property = propertyName(node.name, source);
      if (PUBLIC_PROPERTY_NAMES.has(property)) {
        const binding = ts.isObjectLiteralExpression(node.parent)
          ? objectLiteralBinding(node.parent)
          : undefined;
        if (ts.isObjectLiteralExpression(node.parent)
          && (isPotentialIssueObject(node.parent, context)
            || binding?.declaration
              && publicCopyObjectIsDirectlyEmitted(binding.declaration, context))
          && hasUnsafeIssueObjectMember(node.parent)) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          throw new TypeError(
            `${filePath}:${line} ${property} cannot resolve public copy from an object with executable members`,
          );
        }
        const taints = binding ? context.taintedPropertiesByBinding.get(binding.name) : undefined;
        const escaped = binding?.declaration
          ? publicCopyObjectHasUnsupportedReference(binding.declaration, context)
          : false;
        if (binding && (escaped || taints?.has('*') || taints?.has(property))) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          throw new TypeError(
            `${filePath}:${line} ${property} cannot resolve public copy after ${binding.name} is written or escapes`,
          );
        }
        const expression = ts.isObjectLiteralExpression(node.parent)
          ? directObjectPropertyExpression(node.parent, property)
          : undefined;
        if (!expression) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          throw new TypeError(`${filePath}:${line} ${property} cannot resolve public copy from its containing object`);
        }
        addResolved(property as PublicRuleCopy['property'], expression, node.getStart(source));
      }
    } else if (ts.isShorthandPropertyAssignment(node)
      && PUBLIC_PROPERTY_NAMES.has(node.name.text)) {
      const binding = ts.isObjectLiteralExpression(node.parent)
        ? objectLiteralBinding(node.parent)
        : undefined;
      const taints = binding ? context.taintedPropertiesByBinding.get(binding.name) : undefined;
      const escaped = binding?.declaration
        ? publicCopyObjectHasUnsupportedReference(binding.declaration, context)
        : false;
      if (binding && (escaped || taints?.has('*') || taints?.has(node.name.text))) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        throw new TypeError(
          `${filePath}:${line} ${node.name.text} cannot resolve public copy after ${binding.name} is written or escapes`,
        );
      }
      const expression = ts.isObjectLiteralExpression(node.parent)
        ? directObjectPropertyExpression(node.parent, node.name.text)
        : undefined;
      if (!expression) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        throw new TypeError(
          `${filePath}:${line} ${node.name.text} cannot resolve public copy from its containing object`,
        );
      }
      addResolved(
        node.name.text as PublicRuleCopy['property'],
        expression,
        node.getStart(source),
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return rows;
}

function parseMarkdownRow(line: string): readonly string[] {
  if (!line.startsWith('|') || !line.endsWith('|')) return [];
  const cells: string[] = [];
  let cell = '';
  for (let index = 1; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '|') {
      let precedingBackslashes = 0;
      for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) {
        precedingBackslashes += 1;
      }
      if (precedingBackslashes % 2 === 0) {
        cells.push(cell.trim().replace(/\\\|/gu, '|'));
        cell = '';
        continue;
      }
    }
    cell += character;
  }
  return cells;
}

export function collectGeneratedCatalogCopy(ruleId: string, catalogPath: string): GeneratedCatalogCopy {
  const lines = readFileSync(catalogPath, 'utf8').split(/\r?\n/u);
  const prefix = `| \`${ruleId}\` |`;
  const matches = lines
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.startsWith(prefix));
  if (matches.length !== 1) {
    throw new TypeError(`${ruleId} must map to exactly one generated catalog row; found ${matches.length}`);
  }
  const match = matches[0]!;
  const cells = parseMarkdownRow(match.line);
  const description = cells.length === 5 || cells.length === 14
    ? cells[cells.length - 1]
    : undefined;
  if (!description) throw new TypeError(`${ruleId} generated catalog row has no description cell`);
  return {
    location: `${catalogPath}:${match.lineNumber} description`,
    text: description,
  };
}

export function assertQualityCopy(text: string, location: string): void {
  if (hasProvenanceFraming(text)) {
    throw new TypeError(`${location} uses provenance or authorship framing`);
  }
}
