import { describe, expect, it } from 'vitest';

import {
  isPromptVariableAlias,
  type PromptVariableValues,
  resolvePromptVariableKey,
} from './prompt-variable-registry.js';
import { MAX_RENDERED_TEMPLATE_LENGTH, renderPromptTemplate } from './render-prompt-template.js';

const everyAlias = '{{char}}{{user}}{{description}}{{personality}}{{scenario}}{{userPersona}}';

function countingValues(values: PromptVariableValues) {
  const reads = new Map<string, number>();
  const proxy = new Proxy(values, {
    get(target, property, receiver) {
      if (typeof property === 'string') {
        reads.set(property, (reads.get(property) ?? 0) + 1);
      }

      return Reflect.get(target, property, receiver);
    },
  });

  return { proxy, reads };
}

describe('renderPromptTemplate expansion bounds', () => {
  it('renders a mutually nesting card within MAX_RENDERED_TEMPLATE_LENGTH and names the truncated keys', () => {
    const scenario = 'Туман над гаванью. '.repeat(10);
    const result = renderPromptTemplate('{{description}}', {
      'character.description': '{{personality}}'.repeat(1300),
      'character.personality': '{{scenario}}'.repeat(1600),
      'scenario.content': scenario,
    });

    expect(result.output).toBe(scenario.repeat(1600).slice(0, MAX_RENDERED_TEMPLATE_LENGTH));
    expect(result.diagnostics.truncatedExpansions).toEqual(['character.personality', 'character.description']);
  });

  it('terminates on a card where every field references every field', () => {
    const fanOut = everyAlias.repeat(300);
    const result = renderPromptTemplate(fanOut, {
      'character.description': fanOut,
      'character.name': fanOut,
      'character.personality': fanOut,
      'scenario.content': fanOut,
      'user.name': fanOut,
      'user.persona': fanOut,
    });

    expect(result.output).toHaveLength(MAX_RENDERED_TEMPLATE_LENGTH);
    expect([...result.diagnostics.cyclicVariables].sort()).toEqual([
      'character.description',
      'character.name',
      'character.personality',
      'scenario.content',
      'user.name',
      'user.persona',
    ]);
    expect(result.diagnostics.truncatedExpansions).toContain('(template)');
  });

  it('renders nothing for a six-level fan-out chain with an empty leaf', () => {
    const result = renderPromptTemplate('{{userPersona}}'.repeat(12), {
      'character.description': '{{personality}}'.repeat(12),
      'character.name': '{{user}}'.repeat(12),
      'character.personality': '{{scenario}}'.repeat(12),
      'scenario.content': '{{char}}'.repeat(12),
      'user.name': '',
      'user.persona': '{{description}}'.repeat(12),
    });

    expect(result.output).toBe('');
    expect(result.diagnostics.truncatedExpansions).toEqual([]);
    expect(result.diagnostics.cyclicVariables).toEqual([]);
  });

  it('charges nested output once: a 150 000-character personality behind {{description}} renders whole', () => {
    const personality = 'ё'.repeat(150_000);
    const result = renderPromptTemplate('{{description}}', {
      'character.description': '{{personality}}',
      'character.personality': personality,
    });

    expect(result.output).toBe(personality);
    expect(result.diagnostics.truncatedExpansions).toEqual([]);
  });

  it('a template that renders each field once at the contract limits is not truncated', () => {
    const fields = '{{char}}|{{user}}|{{description}}|{{personality}}|{{scenario}}|{{userPersona}}';
    const preamble = 'П'.repeat(20_000 - fields.length);
    const values = {
      'character.description': 'd'.repeat(20_000),
      'character.name': 'Н'.repeat(200),
      'character.personality': 'p'.repeat(5_000),
      'scenario.content': 'с'.repeat(20_000),
      'user.name': 'u'.repeat(120),
      'user.persona': '😀'.repeat(10_000),
    };
    const result = renderPromptTemplate(preamble + fields, values);

    expect(result.output).toBe(
      [
        preamble + values['character.name'],
        values['user.name'],
        values['character.description'],
        values['character.personality'],
        values['scenario.content'],
        values['user.persona'],
      ].join('|'),
    );
    expect(result.diagnostics.truncatedExpansions).toEqual([]);
  });

  it('cuts an oversized plain field at the limit and names it', () => {
    const result = renderPromptTemplate('{{description}}', {
      'character.description': 'д'.repeat(MAX_RENDERED_TEMPLATE_LENGTH + 10),
    });

    expect(result.output).toBe('д'.repeat(MAX_RENDERED_TEMPLATE_LENGTH));
    expect(result.diagnostics.truncatedExpansions).toEqual(['character.description']);
  });

  it('never cuts a surrogate pair in half at the limit', () => {
    const atLimit = renderPromptTemplate(`${'a'.repeat(MAX_RENDERED_TEMPLATE_LENGTH - 2)}😀`, {});
    const overLimit = renderPromptTemplate(`${'a'.repeat(MAX_RENDERED_TEMPLATE_LENGTH - 1)}😀`, {});

    expect(atLimit.output).toHaveLength(MAX_RENDERED_TEMPLATE_LENGTH);
    expect(atLimit.diagnostics.truncatedExpansions).toEqual([]);
    expect(overLimit.output).toBe('a'.repeat(MAX_RENDERED_TEMPLATE_LENGTH - 1));
    expect(overLimit.diagnostics.truncatedExpansions).toEqual(['(template)']);
  });

  it('reads and expands each variable once per render however often it is referenced', () => {
    const { proxy, reads } = countingValues({
      'character.description': '{{personality}} и {{user}}',
      'character.personality': 'Упрямый',
      'user.name': 'Алекс',
    });
    const result = renderPromptTemplate('{{personality}} {{description}} {{description}}', proxy);

    expect(result.output).toBe('Упрямый Упрямый и Алекс Упрямый и Алекс');
    expect(Object.fromEntries(reads)).toEqual({
      'character.description': 1,
      'character.personality': 1,
      'user.name': 1,
    });
  });
});

describe('renderPromptTemplate alias resolution', () => {
  it('{{constructor}} is reported as unresolved and {{#if toString}} as an unknown condition', () => {
    const result = renderPromptTemplate(
      '{{constructor}}|{{__proto__}}|{{hasOwnProperty}}{{#if toString}}hidden{{/if}}{{#if valueOf}}hidden{{/if}}',
      { 'user.name': 'Alex' },
    );

    expect(result.output).toBe('{{constructor}}|{{__proto__}}|{{hasOwnProperty}}');
    expect(result.diagnostics.unresolvedVariables).toEqual(['constructor', '__proto__', 'hasOwnProperty']);
    expect(result.diagnostics.unknownConditions).toEqual(['toString', 'valueOf']);
  });

  it('resolves only the registry own aliases', () => {
    expect(isPromptVariableAlias('char')).toBe(true);
    expect(isPromptVariableAlias('constructor')).toBe(false);
    expect(isPromptVariableAlias('__proto__')).toBe(false);
    expect(resolvePromptVariableKey('toString')).toBeNull();
    expect(resolvePromptVariableKey('userPersona')).toBe('user.persona');
  });

  it('reports an unresolved variable once however often it appears', () => {
    const result = renderPromptTemplate(
      '{{mood}} {{mood}} {{description}}{{#if weather}}a{{/if}}{{#if weather}}b{{/if}}',
      {
        'character.description': '{{mood}}',
      },
    );

    expect(result.output).toBe('{{mood}} {{mood}} {{mood}}');
    expect(result.diagnostics.unresolvedVariables).toEqual(['mood']);
    expect(result.diagnostics.unknownConditions).toEqual(['weather']);
  });
});

describe('renderPromptTemplate cycles', () => {
  it('expands a self-referencing value once and reports the cycle', () => {
    const result = renderPromptTemplate('{{user}}', {
      'user.name': '{{user}} и {{user}}',
    });

    expect(result.output).toBe('{{user}} и {{user}} и {{user}} и {{user}}');
    expect(result.diagnostics.cyclicVariables).toEqual(['user.name']);
  });

  it('reuses the memoized expansion of a key reached first through a cycle', () => {
    const result = renderPromptTemplate('{{user}}/{{scenario}}', {
      'scenario.content': '{{user}}',
      'user.name': '{{scenario}}',
    });

    expect(result.output).toBe('{{scenario}}/{{scenario}}');
    expect(result.diagnostics.cyclicVariables).toEqual(['user.name']);
  });
});
