interface ComposerActionsInput {
  attachmentCount: number;
  blockReason: string | undefined;
  hasActiveJob: boolean;
  isEditingMessage: boolean;
  isGeneratingFirstMessage: boolean;
  isReplyStarting: boolean;
  isUploadingAttachment: boolean;
  text: string;
}

export interface ComposerActions {
  canSend: boolean;
  hint: string | null;
}

export function deriveComposerActions({
  attachmentCount,
  blockReason,
  hasActiveJob,
  isEditingMessage,
  isGeneratingFirstMessage,
  isReplyStarting,
  isUploadingAttachment,
  text,
}: ComposerActionsInput): ComposerActions {
  const hasText = text.trim().length > 0;

  return {
    canSend:
      hasText &&
      !isUploadingAttachment &&
      !isReplyStarting &&
      !hasActiveJob &&
      !isGeneratingFirstMessage &&
      !isEditingMessage &&
      !blockReason,
    hint: !hasText && attachmentCount > 0 ? 'Добавьте текст к изображению' : null,
  };
}
