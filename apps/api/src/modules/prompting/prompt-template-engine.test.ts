import { describe, expect, it } from 'vitest';

import {
  normalizePromptWhitespace,
  PromptTemplateParseError,
  parsePromptTemplate,
  renderPromptTemplate,
  resolvePromptVariableKey,
} from './application/prompt-template-engine.js';

const legacyDefaultPromptEn = `Write {{char}}'s next reply in a collaborative roleplay between {{char}} and {{user}}.

{{char}}'s character card:
{{description}}
{{#if personality}}Personality: {{personality}}{{/if}}
{{#if scenario}}Scenario: {{scenario}}{{/if}}

{{#if userPersona}}[{{user}}'s persona: {{userPersona}}]{{/if}}

Guidelines:
- Write in third person; use *asterisks* for actions/narration, unformatted text for dialogue
- Match {{char}}'s vocabulary, speech patterns, and thinking to their age, background, and personality
- Never speak or act as {{user}}; never narrate {{user}}'s thoughts or actions`;

const legacyDefaultPromptRu = `Напиши следующую реплику {{char}} в совместной ролевой игре между {{char}} и {{user}}.

Карточка персонажа {{char}}:
{{description}}
{{#if personality}}Характер: {{personality}}{{/if}}
{{#if scenario}}Сценарий: {{scenario}}{{/if}}

{{#if userPersona}}[Персона {{user}}: {{userPersona}}]{{/if}}

Правила:
- Пиши от третьего лица; используй *звёздочки* для действий и повествования
- Никогда не говори и не действуй за {{user}}
- Всегда оставайся в образе`;

describe('prompt template engine', () => {
  it('keeps plain text templates stable through parse and render', () => {
    const result = renderPromptTemplate('Static prompt body.', {});

    expect(result.output).toBe('Static prompt body.');
    expect(result.diagnostics).toEqual({
      cyclicVariables: [],
      invalidVariableTemplates: [],
      truncatedExpansions: [],
      unknownConditions: [],
      unresolvedVariables: [],
    });
  });

  it('resolves legacy aliases to canonical variable keys', () => {
    expect(resolvePromptVariableKey('char')).toBe('character.name');
    expect(resolvePromptVariableKey('user')).toBe('user.name');
    expect(resolvePromptVariableKey('user.persona')).toBe('user.persona');
    expect(resolvePromptVariableKey('unknown')).toBeNull();
  });

  it('parses canonical placeholders and legacy conditionals', () => {
    const parsed = parsePromptTemplate('{{character.name}}{{#if userPersona}}{{userPersona}}{{/if}}');

    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.nodes[0]).toMatchObject({
      type: 'variable',
      name: 'character.name',
      canonicalKey: 'character.name',
    });
    expect(parsed.nodes[1]).toMatchObject({
      type: 'if',
      condition: 'userPersona',
      canonicalKey: 'user.persona',
    });
  });

  it('renders legacy placeholders and canonical placeholders in one template', () => {
    const result = renderPromptTemplate('Привет, {{user}}. Это {{char}}. {{character.description}}', {
      'character.description': 'Детектив в плаще.',
      'character.name': 'Морган',
      'user.name': 'Алекс',
    });

    expect(result.output).toBe('Привет, Алекс. Это Морган. Детектив в плаще.');
    expect(result.diagnostics).toEqual({
      cyclicVariables: [],
      invalidVariableTemplates: [],
      truncatedExpansions: [],
      unknownConditions: [],
      unresolvedVariables: [],
    });
  });

  it('renders conditional blocks for present values from canonical and legacy names', () => {
    const legacyResult = renderPromptTemplate('{{#if userPersona}}[Персона: {{userPersona}}]{{/if}}', {
      'user.persona': 'Опытный переговорщик',
    });
    const canonicalResult = renderPromptTemplate('{{#if user.persona}}[Persona: {{user.name}}]{{/if}}', {
      'user.name': 'Alex',
      'user.persona': 'Negotiator',
    });

    expect(legacyResult.output).toBe('[Персона: Опытный переговорщик]');
    expect(canonicalResult.output).toBe('[Persona: Alex]');
  });

  it('treats undefined, null, and empty string as falsy for conditionals', () => {
    const valuesList = [{}, { 'user.persona': null }, { 'user.persona': undefined }, { 'user.persona': '' }];

    for (const values of valuesList) {
      const result = renderPromptTemplate('A{{#if userPersona}}B{{/if}}C', values);

      expect(result.output).toBe('AC');
    }
  });

  it('treats whitespace-only values as truthy to preserve legacy behavior', () => {
    const result = renderPromptTemplate('A{{#if userPersona}}B{{/if}}C', {
      'user.persona': '   ',
    });

    expect(result.output).toBe('ABC');
  });

  it('preserves unknown variables and records diagnostics', () => {
    const result = renderPromptTemplate('Hello {{future.variable}} and {{user}}', {
      'user.name': 'Alex',
    });

    expect(result.output).toBe('Hello {{future.variable}} and Alex');
    expect(result.diagnostics.unresolvedVariables).toEqual(['future.variable']);
  });

  it('drops unknown conditional blocks and records diagnostics', () => {
    const result = renderPromptTemplate('Before{{#if future.variable}} hidden {{/if}}After', {
      'user.name': 'Alex',
    });

    expect(result.output).toBe('BeforeAfter');
    expect(result.diagnostics.unknownConditions).toEqual(['future.variable']);
  });

  it('renders nested placeholders inside scenario content for legacy compatibility', () => {
    const result = renderPromptTemplate('{{scenario}}', {
      'character.name': 'Морган',
      'scenario.content': '{{user}} заходит в кабинет. {{char}} уже ждёт.',
      'user.name': 'Алекс',
    });

    expect(result.output).toBe('Алекс заходит в кабинет. Морган уже ждёт.');
  });

  it('records cyclic variable expansion instead of silently leaking unresolved placeholders', () => {
    const result = renderPromptTemplate('{{user}}', {
      'scenario.content': '{{user}}',
      'user.name': '{{scenario}}',
    });

    expect(result.output).toBe('{{scenario}}');
    expect(result.diagnostics.cyclicVariables).toEqual(['user.name']);
  });

  it('preserves malformed template syntax inside variable values and records diagnostics', () => {
    const result = renderPromptTemplate('{{scenario}}', {
      'scenario.content': 'Intro {{#if user}}broken',
      'user.name': 'Alex',
    });

    expect(result.output).toBe('Intro {{#if user}}broken');
    expect(result.diagnostics.invalidVariableTemplates).toEqual(['scenario.content']);
  });

  it('matches the current english default template rendering after whitespace normalization', () => {
    const result = renderPromptTemplate(legacyDefaultPromptEn, {
      'character.description': 'A sharp-eyed detective in a rain-soaked coat.',
      'character.name': 'Morgan',
      'character.personality': 'Dry, observant, relentless.',
      'scenario.content': '{{user}} arrives for a late-night interrogation with {{char}}.',
      'user.name': 'Alex',
      'user.persona': 'An anxious witness',
    });

    expect(
      normalizePromptWhitespace(result.output),
    ).toBe(`Write Morgan's next reply in a collaborative roleplay between Morgan and Alex.

Morgan's character card:
A sharp-eyed detective in a rain-soaked coat.
Personality: Dry, observant, relentless.
Scenario: Alex arrives for a late-night interrogation with Morgan.

[Alex's persona: An anxious witness]

Guidelines:
- Write in third person; use *asterisks* for actions/narration, unformatted text for dialogue
- Match Morgan's vocabulary, speech patterns, and thinking to their age, background, and personality
- Never speak or act as Alex; never narrate Alex's thoughts or actions`);
  });

  it('matches the current russian default template rendering after whitespace normalization', () => {
    const result = renderPromptTemplate(legacyDefaultPromptRu, {
      'character.description': 'Частный детектив в промокшем плаще.',
      'character.name': 'Морган',
      'character.personality': 'Сухой, наблюдательный, упрямый.',
      'scenario.content': '{{user}} приходит на ночной допрос к {{char}}.',
      'user.name': 'Алекс',
      'user.persona': 'Нервный свидетель',
    });

    expect(
      normalizePromptWhitespace(result.output),
    ).toBe(`Напиши следующую реплику Морган в совместной ролевой игре между Морган и Алекс.

Карточка персонажа Морган:
Частный детектив в промокшем плаще.
Характер: Сухой, наблюдательный, упрямый.
Сценарий: Алекс приходит на ночной допрос к Морган.

[Персона Алекс: Нервный свидетель]

Правила:
- Пиши от третьего лица; используй *звёздочки* для действий и повествования
- Никогда не говори и не действуй за Алекс
- Всегда оставайся в образе`);
  });

  it('renders character custom prompts that only use user and char placeholders', () => {
    const result = renderPromptTemplate('{{char}} смотрит на {{user}} и молчит.', {
      'character.name': 'Морган',
      'user.name': 'Алекс',
    });

    expect(result.output).toBe('Морган смотрит на Алекс и молчит.');
  });

  it('throws on unmatched closing blocks', () => {
    expect(() => parsePromptTemplate('{{/if}}')).toThrowError(PromptTemplateParseError);
  });

  it('throws on unclosed blocks', () => {
    expect(() => parsePromptTemplate('{{#if user}}missing end')).toThrowError(PromptTemplateParseError);
  });

  it('throws on nested conditional blocks to keep the first slice narrow', () => {
    expect(() => parsePromptTemplate('{{#if user}}{{#if char}}x{{/if}}{{/if}}')).toThrowError(PromptTemplateParseError);
  });

  it('treats unsupported else syntax as an unresolved variable token', () => {
    const result = renderPromptTemplate('A {{else}} B', {});

    expect(result.output).toBe('A {{else}} B');
    expect(result.diagnostics.unresolvedVariables).toEqual(['else']);
  });
});
