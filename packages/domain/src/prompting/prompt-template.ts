import { type PromptVariableKey, resolvePromptVariableKey } from './prompt-variable-registry.js';

export interface PromptTextNode {
  type: 'text';
  value: string;
}

export interface PromptVariableNode {
  canonicalKey: PromptVariableKey | null;
  name: string;
  type: 'variable';
}

export interface PromptConditionalNode {
  canonicalKey: PromptVariableKey | null;
  condition: string;
  children: PromptTemplateNode[];
  type: 'if';
}

export type PromptTemplateNode = PromptTextNode | PromptVariableNode | PromptConditionalNode;

export interface ParsedPromptTemplate {
  nodes: PromptTemplateNode[];
}

interface PromptConditionalFrame {
  children: PromptTemplateNode[];
  condition: string;
  nodes: PromptTemplateNode[];
}

export class PromptTemplateParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptTemplateParseError';
  }
}

export function normalizePromptWhitespace(value: string): string {
  return value.replace(/\n{3,}/g, '\n\n').trim();
}

function pushText(nodes: PromptTemplateNode[], value: string) {
  if (value.length === 0) {
    return;
  }

  nodes.push({
    type: 'text',
    value,
  });
}

function parseToken(token: string, stack: PromptConditionalFrame[]) {
  const currentFrame = stack[stack.length - 1]!;
  const currentNodes = currentFrame.nodes;
  const content = token.slice(2, -2).trim();

  if (content === '/if') {
    if (stack.length === 1) {
      throw new PromptTemplateParseError('Unexpected {{/if}} without a matching {{#if ...}} block.');
    }

    const frame = stack.pop()!;
    const parentNodes = stack[stack.length - 1]!.nodes;

    parentNodes.push({
      type: 'if',
      condition: frame.condition,
      canonicalKey: resolvePromptVariableKey(frame.condition),
      children: frame.children,
    });
    return;
  }

  if (content.startsWith('#if ')) {
    const condition = content.slice(4).trim();

    if (!condition) {
      throw new PromptTemplateParseError('Conditional block is missing a variable name.');
    }

    if (stack.length > 1) {
      throw new PromptTemplateParseError('Nested {{#if ...}} blocks are not supported in the current template engine.');
    }

    stack.push({
      condition,
      children: [],
      nodes: [],
    });
    stack[stack.length - 1]!.nodes = stack[stack.length - 1]!.children;
    return;
  }

  currentNodes.push({
    type: 'variable',
    name: content,
    canonicalKey: resolvePromptVariableKey(content),
  });
}

export function parsePromptTemplate(template: string): ParsedPromptTemplate {
  const rootFrame: PromptConditionalFrame = {
    condition: '__root__',
    children: [],
    nodes: [],
  };
  rootFrame.nodes = rootFrame.children;
  const stack: PromptConditionalFrame[] = [rootFrame];
  const tokenPattern = /\{\{#if [^}]+\}\}|\{\{\/if\}\}|\{\{[^}]+\}\}/g;
  let cursor = 0;

  for (const match of template.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    const token = match[0];
    const currentNodes = stack[stack.length - 1]!.nodes;

    pushText(currentNodes, template.slice(cursor, index));
    parseToken(token, stack);
    cursor = index + token.length;
  }

  pushText(stack[stack.length - 1]!.nodes, template.slice(cursor));

  if (stack.length > 1) {
    const danglingCondition = stack[stack.length - 1]!.condition;

    throw new PromptTemplateParseError(`Unclosed {{#if ${danglingCondition}}} block.`);
  }

  return {
    nodes: rootFrame.children,
  };
}
