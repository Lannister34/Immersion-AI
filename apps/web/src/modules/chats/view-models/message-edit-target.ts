import type { ChatMessageDto } from '@immersion/contracts/chats';

export interface MessageEditTarget {
  readonly baseContent: string;
  readonly messageIndex: number;
}

export function isEditTargetIntact(
  messages: readonly Pick<ChatMessageDto, 'content'>[],
  target: MessageEditTarget,
): boolean {
  return messages[target.messageIndex - 1]?.content === target.baseContent;
}
