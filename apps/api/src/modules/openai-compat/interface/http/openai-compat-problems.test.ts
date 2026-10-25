import { describe, expect, it } from 'vitest';

import { ProviderGenerationError } from '../../../generation/index.js';
import { GenerationProviderUnavailableError } from '../../../providers/index.js';
import { openAiCompatProblems, toUnexpectedOpenAiProblem } from './openai-compat-problems.js';

class ProviderReplyCutShortError extends ProviderGenerationError {
  constructor() {
    super('Ответ модели упёрся в лимит токенов и оборвался.');
  }
}

describe('openAiCompatProblems', () => {
  it('maps a subclass of the provider failure, such as a reply cut at the token limit, as provider_failed', () => {
    expect(openAiCompatProblems.map(new ProviderReplyCutShortError())).toEqual({
      body: { code: 'provider_failed', message: 'Ответ модели упёрся в лимит токенов и оборвался.' },
      statusCode: 502,
    });
  });

  it('answers a provider error with an empty message under a fallback text instead of failing to build the problem', () => {
    expect(openAiCompatProblems.map(new ProviderGenerationError(''))).toEqual({
      body: { code: 'provider_failed', message: 'The provider failed to generate a reply.' },
      statusCode: 502,
    });
    expect(openAiCompatProblems.map(new GenerationProviderUnavailableError(''))).toEqual({
      body: { code: 'provider_unavailable', message: 'The provider is unavailable.' },
      statusCode: 503,
    });
  });
});

describe('toUnexpectedOpenAiProblem', () => {
  it('answers 500 with the error message, or a fallback text when there is none', () => {
    expect(toUnexpectedOpenAiProblem(new Error('EACCES: user-settings.json'))).toEqual({
      body: { code: 'internal_error', message: 'EACCES: user-settings.json' },
      statusCode: 500,
    });
    expect(toUnexpectedOpenAiProblem(new Error(''))).toEqual({
      body: { code: 'internal_error', message: 'Unexpected error.' },
      statusCode: 500,
    });
    expect(toUnexpectedOpenAiProblem('строка вместо ошибки')).toEqual({
      body: { code: 'internal_error', message: 'Unexpected error.' },
      statusCode: 500,
    });
  });
});
