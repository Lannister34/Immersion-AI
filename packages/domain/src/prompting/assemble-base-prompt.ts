import type { PromptInputSnapshot } from './prompt-input-snapshot.js';
import { type PromptTemplateSourceSelection, resolvePromptTemplateSource } from './prompt-source.js';
import { normalizePromptWhitespace } from './prompt-template.js';
import type { PromptVariableValues } from './prompt-variable-registry.js';
import { buildPromptVariableValues } from './prompt-variable-values.js';
import { type PromptTemplateDiagnostics, renderPromptTemplate } from './render-prompt-template.js';

export interface BasePromptAssemblyResult {
  diagnostics: PromptTemplateDiagnostics;
  prompt: string;
  source: PromptTemplateSourceSelection;
  variableValues: PromptVariableValues;
}

function freezeDiagnostics(diagnostics: PromptTemplateDiagnostics): PromptTemplateDiagnostics {
  const cyclicVariables = [...diagnostics.cyclicVariables];
  const invalidVariableTemplates = [...diagnostics.invalidVariableTemplates];
  const truncatedExpansions = [...diagnostics.truncatedExpansions];
  const unknownConditions = [...diagnostics.unknownConditions];
  const unresolvedVariables = [...diagnostics.unresolvedVariables];

  Object.freeze(cyclicVariables);
  Object.freeze(invalidVariableTemplates);
  Object.freeze(truncatedExpansions);
  Object.freeze(unknownConditions);
  Object.freeze(unresolvedVariables);

  return Object.freeze({
    cyclicVariables,
    invalidVariableTemplates,
    truncatedExpansions,
    unknownConditions,
    unresolvedVariables,
  });
}

function freezeSource(source: PromptTemplateSourceSelection): PromptTemplateSourceSelection {
  return Object.freeze({
    kind: source.kind,
    template: source.template,
  });
}

export function assembleBasePrompt(snapshot: PromptInputSnapshot): BasePromptAssemblyResult {
  const source = resolvePromptTemplateSource({
    chatSystemPrompt: snapshot.chat.customSystemPrompt,
    defaultSystemPromptTemplate: snapshot.settings.defaultSystemPromptTemplate,
    knownDefaultSystemPromptTemplates: snapshot.settings.knownDefaultSystemPromptTemplates,
    settingsSystemPromptTemplate: snapshot.settings.systemPromptTemplate,
    ...(snapshot.character ? { characterSystemPrompt: snapshot.character.systemPrompt } : {}),
  });
  const variableValues = buildPromptVariableValues(snapshot);
  const rendered = renderPromptTemplate(source.template, variableValues);

  return Object.freeze({
    diagnostics: freezeDiagnostics(rendered.diagnostics),
    prompt: normalizePromptWhitespace(rendered.output),
    source: freezeSource(source),
    variableValues,
  });
}
