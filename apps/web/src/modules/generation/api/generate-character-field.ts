import {
  type GenerateCharacterFieldCommand,
  GenerateCharacterFieldCommandSchema,
  type GenerateCharacterFieldResponse,
  GenerateCharacterFieldResponseSchema,
} from '@immersion/contracts/generation';

import { apiPost } from '../../../shared/api/client';

export function generateCharacterField(
  command: GenerateCharacterFieldCommand,
): Promise<GenerateCharacterFieldResponse> {
  return apiPost(
    '/api/generation/character-field',
    command,
    GenerateCharacterFieldCommandSchema,
    GenerateCharacterFieldResponseSchema,
  );
}
