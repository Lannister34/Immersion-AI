import {
  type GenerateCharacterDraftCommand,
  GenerateCharacterDraftCommandSchema,
  type GenerateCharacterDraftResponse,
  GenerateCharacterDraftResponseSchema,
} from '@immersion/contracts/generation';

import { apiPost } from '../../../shared/api/client';

export function generateCharacterDraft(
  command: GenerateCharacterDraftCommand,
): Promise<GenerateCharacterDraftResponse> {
  return apiPost(
    '/api/generation/character',
    command,
    GenerateCharacterDraftCommandSchema,
    GenerateCharacterDraftResponseSchema,
  );
}
