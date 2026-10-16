import {
  type ParsedPromptTemplate,
  type PromptTemplateNode,
  PromptTemplateParseError,
  parsePromptTemplate,
} from './prompt-template.js';
import { type PromptVariableKey, type PromptVariableValues, readPromptVariable } from './prompt-variable-registry.js';

export const MAX_RENDERED_TEMPLATE_LENGTH = 200_000;

const TEMPLATE_EXPANSION_SOURCE = '(template)';

export interface PromptTemplateDiagnostics {
  cyclicVariables: string[];
  invalidVariableTemplates: string[];
  truncatedExpansions: string[];
  unknownConditions: string[];
  unresolvedVariables: string[];
}

export interface PromptTemplateRenderResult {
  diagnostics: PromptTemplateDiagnostics;
  output: string;
}

interface RenderSink {
  full: boolean;
  remaining: number;
  source: string;
  text: string;
}

type RenderFindings = Record<keyof PromptTemplateDiagnostics, Set<string>>;

interface RenderState {
  findings: RenderFindings;
  inProgress: Set<PromptVariableKey>;
  rendered: Map<PromptVariableKey, string>;
  values: PromptVariableValues;
}

function createFindings(): RenderFindings {
  return {
    cyclicVariables: new Set(),
    invalidVariableTemplates: new Set(),
    truncatedExpansions: new Set(),
    unknownConditions: new Set(),
    unresolvedVariables: new Set(),
  };
}

function toDiagnostics(findings: RenderFindings): PromptTemplateDiagnostics {
  return {
    cyclicVariables: [...findings.cyclicVariables],
    invalidVariableTemplates: [...findings.invalidVariableTemplates],
    truncatedExpansions: [...findings.truncatedExpansions],
    unknownConditions: [...findings.unknownConditions],
    unresolvedVariables: [...findings.unresolvedVariables],
  };
}

function createSink(source: string): RenderSink {
  return {
    full: false,
    remaining: MAX_RENDERED_TEMPLATE_LENGTH,
    source,
    text: '',
  };
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function fittingPrefixLength(piece: string, room: number): number {
  return room > 0 && isHighSurrogate(piece.charCodeAt(room - 1)) ? room - 1 : room;
}

function append(sink: RenderSink, piece: string, state: RenderState) {
  if (piece.length <= sink.remaining) {
    sink.text += piece;
    sink.remaining -= piece.length;
    return;
  }

  sink.text += piece.slice(0, fittingPrefixLength(piece, sink.remaining));
  sink.remaining = 0;
  sink.full = true;
  state.findings.truncatedExpansions.add(sink.source);
}

function parseVariableTemplate(key: PromptVariableKey, value: string, state: RenderState): ParsedPromptTemplate | null {
  try {
    return parsePromptTemplate(value);
  } catch (error) {
    if (error instanceof PromptTemplateParseError) {
      state.findings.invalidVariableTemplates.add(key);
      return null;
    }

    throw error;
  }
}

function renderValueInto(sink: RenderSink, key: PromptVariableKey, value: string, state: RenderState) {
  if (!value.includes('{{')) {
    append(sink, value, state);
    return;
  }

  const parsed = parseVariableTemplate(key, value, state);

  if (!parsed) {
    append(sink, value, state);
    return;
  }

  renderNodes(parsed.nodes, sink, state);
}

function renderVariableValue(key: PromptVariableKey, state: RenderState): string {
  const rendered = state.rendered.get(key);

  if (rendered !== undefined) {
    return rendered;
  }

  const value = readPromptVariable(state.values, key);

  if (state.inProgress.has(key)) {
    state.findings.cyclicVariables.add(key);
    return value;
  }

  const sink = createSink(key);
  state.inProgress.add(key);
  renderValueInto(sink, key, value, state);
  state.inProgress.delete(key);
  state.rendered.set(key, sink.text);
  return sink.text;
}

function renderNode(node: PromptTemplateNode, sink: RenderSink, state: RenderState) {
  if (node.type === 'text') {
    append(sink, node.value, state);
    return;
  }

  if (node.type === 'variable') {
    if (!node.canonicalKey) {
      state.findings.unresolvedVariables.add(node.name);
      append(sink, `{{${node.name}}}`, state);
      return;
    }

    append(sink, renderVariableValue(node.canonicalKey, state), state);
    return;
  }

  if (!node.canonicalKey) {
    state.findings.unknownConditions.add(node.condition);
    return;
  }

  if (readPromptVariable(state.values, node.canonicalKey).length === 0) {
    return;
  }

  renderNodes(node.children, sink, state);
}

function renderNodes(nodes: readonly PromptTemplateNode[], sink: RenderSink, state: RenderState) {
  for (const node of nodes) {
    if (sink.full) {
      return;
    }

    renderNode(node, sink, state);
  }
}

export function renderParsedPromptTemplate(
  template: ParsedPromptTemplate,
  values: PromptVariableValues,
): PromptTemplateRenderResult {
  const state: RenderState = {
    findings: createFindings(),
    inProgress: new Set(),
    rendered: new Map(),
    values,
  };
  const sink = createSink(TEMPLATE_EXPANSION_SOURCE);

  renderNodes(template.nodes, sink, state);

  return {
    diagnostics: toDiagnostics(state.findings),
    output: sink.text,
  };
}

export function renderPromptTemplate(template: string, values: PromptVariableValues): PromptTemplateRenderResult {
  return renderParsedPromptTemplate(parsePromptTemplate(template), values);
}
