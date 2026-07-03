import {
  GenerateChatTitleCommandSchema,
  type GenerateChatTitleResponse,
  GenerateChatTitleResponseSchema,
} from '@immersion/contracts/generation';

import { apiPost } from '../../../shared/api/client';

export function generateChatTitle(chatId: string): Promise<GenerateChatTitleResponse> {
  return apiPost(
    '/api/generation/chat-title',
    { chatId },
    GenerateChatTitleCommandSchema,
    GenerateChatTitleResponseSchema,
  );
}
