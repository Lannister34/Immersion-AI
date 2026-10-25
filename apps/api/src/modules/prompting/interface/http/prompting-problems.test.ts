import { describe, expect, it } from 'vitest';

import { InvalidChatGenerationSettingsResolutionError } from '../../application/resolve-chat-generation-settings.js';
import { promptingProblems } from './prompting-problems.js';

describe('promptingProblems', () => {
  it('answers a chat bound to a missing sampler preset with 409 invalid_chat_generation_settings naming it', () => {
    expect(promptingProblems.map(new InvalidChatGenerationSettingsResolutionError('пресет-удалён'))).toEqual({
      statusCode: 409,
      body: { code: 'invalid_chat_generation_settings', message: 'Chat sampler preset not found: пресет-удалён' },
    });
  });

  it('leaves an error whose message only looks like a prompting one to the unexpected-error path', () => {
    expect(promptingProblems.map(new Error('Chat sampler preset not found: default'))).toBeNull();
  });
});
