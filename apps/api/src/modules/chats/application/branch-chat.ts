import { randomUUID } from 'node:crypto';

import type { ChatSummaryDto } from '@immersion/contracts/chats';

import { FileChatRepository } from '../infrastructure/file-chat-repository.js';
import { ChatMessageNotFoundError, ChatNotFoundError } from './append-chat-messages.js';

interface BranchChatInput {
  now: () => Date;
  sourceChatId: string;
  throughIndex: number;
  title?: string;
}

const BRANCH_TITLE_SUFFIX = ' (ветка)';

function deriveBranchTitle(sourceTitle: string, requestedTitle?: string) {
  const trimmed = requestedTitle?.trim();
  if (trimmed && trimmed.length > 0) {
    return trimmed;
  }

  const baseTitle = sourceTitle.trim();
  if (!baseTitle) {
    return 'Новая ветка';
  }
  if (baseTitle.endsWith(BRANCH_TITLE_SUFFIX)) {
    return baseTitle;
  }
  return `${baseTitle}${BRANCH_TITLE_SUFFIX}`;
}

export async function branchChat({ now, sourceChatId, throughIndex, title }: BranchChatInput): Promise<ChatSummaryDto> {
  const chatRepository = new FileChatRepository();
  const sourceSession = await chatRepository.getGenericChatSession(sourceChatId);

  if (!sourceSession) {
    throw new ChatNotFoundError(sourceChatId);
  }

  if (throughIndex < 1 || throughIndex > sourceSession.messages.length) {
    throw new ChatMessageNotFoundError(sourceChatId, throughIndex);
  }

  const summary = await chatRepository.forkGenericChat({
    createdAt: now().toISOString(),
    newChatId: randomUUID(),
    sourceChatId,
    throughIndex,
    title: deriveBranchTitle(sourceSession.chat.title, title),
  });

  if (!summary) {
    throw new ChatMessageNotFoundError(sourceChatId, throughIndex);
  }

  return summary;
}
