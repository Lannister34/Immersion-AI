import {
  type CharacterDraftFields,
  GenerateCharacterAvatarPromptCommandSchema,
  type GenerateCharacterAvatarPromptResponse,
  GenerateCharacterAvatarPromptResponseSchema,
} from '@immersion/contracts/generation';

import { apiPost } from '../../../shared/api/client';

export function generateCharacterAvatarPrompt(
  card: CharacterDraftFields,
): Promise<GenerateCharacterAvatarPromptResponse> {
  return apiPost(
    '/api/generation/character-avatar-prompt',
    { card },
    GenerateCharacterAvatarPromptCommandSchema,
    GenerateCharacterAvatarPromptResponseSchema,
  );
}
