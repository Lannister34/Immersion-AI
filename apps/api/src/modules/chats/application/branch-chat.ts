import { randomUUID } from 'node:crypto';

import type { ChatSummaryDto } from '@immersion/contracts/chats';

import type { Clock } from '../../../platform/clock/clock.js';
import { ChatMessageNotFoundError, ChatNotFoundError } from './append-chat-messages.js';
import type { ChatRepository } from './chat-repository.js';
import { toChatSummaryDto } from './chat-session-response.js';

export interface BranchChatCommand {
  sourceChatId: string;
  throughIndex: number;
  title?: string;
}

export interface BranchChatDependencies {
  readonly chatRepository: Pick<ChatRepository, 'forkGenericChat' | 'getGenericChatSession'>;
  readonly clock: Clock;
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

export async function branchChat(
  { sourceChatId, throughIndex, title }: BranchChatCommand,
  { chatRepository, clock }: BranchChatDependencies,
): Promise<ChatSummaryDto> {
  const sourceSession = await chatRepository.getGenericChatSession(sourceChatId);

  if (!sourceSession) {
    throw new ChatNotFoundError(sourceChatId);
  }

  if (throughIndex < 1 || throughIndex > sourceSession.messages.length) {
    throw new ChatMessageNotFoundError(sourceChatId, throughIndex);
  }

  const summary = await chatRepository.forkGenericChat({
    createdAt: clock.now().toISOString(),
    newChatId: randomUUID(),
    sourceChatId,
    throughIndex,
    title: deriveBranchTitle(sourceSession.chat.title, title),
  });

  if (!summary) {
    throw new ChatMessageNotFoundError(sourceChatId, throughIndex);
  }

  return toChatSummaryDto(summary);
}
