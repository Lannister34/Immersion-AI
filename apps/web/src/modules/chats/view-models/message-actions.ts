import type { ChatMessageDto } from '@immersion/contracts/chats';

import { isEditTargetIntact, type MessageEditTarget } from './message-edit-target';
import { findRegenerableMessageIndex } from './regenerable-message';

interface MessageActionsInput {
  blockReason: string | undefined;
  editing: MessageEditTarget | null;
  hasActiveJob: boolean;
  isGeneratingFirstMessage: boolean;
  isMutatingMessages: boolean;
  isReplyStarting: boolean;
  messages: readonly Pick<ChatMessageDto, 'content' | 'role'>[];
}

export interface MessageActions {
  canAnswer: boolean;
  canChangeMessages: boolean;
  canContinue: boolean;
  editingMessageIndex: number | null;
  isEditStale: boolean;
  regenerableMessageIndex: number | null;
}

export function deriveMessageActions({
  blockReason,
  editing,
  hasActiveJob,
  isGeneratingFirstMessage,
  isMutatingMessages,
  isReplyStarting,
  messages,
}: MessageActionsInput): MessageActions {
  const isGenerating = isReplyStarting || hasActiveJob || isGeneratingFirstMessage;
  const isEditing = editing !== null;
  const isEditShown = editing !== null && (isMutatingMessages || isEditTargetIntact(messages, editing));
  const canChangeMessages = !isGenerating && !isMutatingMessages && !isEditing;
  const canGenerate = !isGenerating && !isMutatingMessages && !isEditing && !blockReason;
  const lastMessage = messages.at(-1);
  const lastMessageHasContent = (lastMessage?.content.trim().length ?? 0) > 0;

  return {
    canAnswer: canGenerate && lastMessage?.role === 'user' && lastMessageHasContent,
    canChangeMessages,
    canContinue: canGenerate && lastMessage?.role === 'assistant' && lastMessageHasContent,
    editingMessageIndex: isEditShown ? editing.messageIndex : null,
    isEditStale: isEditing && !isEditShown,
    regenerableMessageIndex: canChangeMessages && !blockReason ? findRegenerableMessageIndex(messages) : null,
  };
}
