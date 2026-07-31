import {
  GenerateFirstMessageCommandSchema,
  type GenerateFirstMessageResponse,
  GenerateFirstMessageResponseSchema,
} from '@immersion/contracts/generation';

import { apiPost } from '../../../shared/api/client';

export function generateFirstMessage(chatId: string): Promise<GenerateFirstMessageResponse> {
  return apiPost(
    '/api/generation/first-message',
    { chatId },
    GenerateFirstMessageCommandSchema,
    GenerateFirstMessageResponseSchema,
  );
}
