interface ComposerActionsInput {
  attachmentCount: number;
  blockReason: string | undefined;
  hasActiveJob: boolean;
  isEditingMessage: boolean;
  isGeneratingFirstMessage: boolean;
  isReplyStarting: boolean;
  isSendingMessage: boolean;
  isUploadingAttachment: boolean;
  modelAcceptsImages: boolean;
  text: string;
}

export interface ComposerActions {
  canAttachImages: boolean;
  canSend: boolean;
}

export function deriveComposerActions({
  attachmentCount,
  blockReason,
  hasActiveJob,
  isEditingMessage,
  isGeneratingFirstMessage,
  isReplyStarting,
  isSendingMessage,
  isUploadingAttachment,
  modelAcceptsImages,
  text,
}: ComposerActionsInput): ComposerActions {
  const hasContent = text.trim().length > 0 || attachmentCount > 0;

  return {
    canAttachImages: modelAcceptsImages && !blockReason && !isSendingMessage,
    canSend:
      hasContent &&
      !isUploadingAttachment &&
      !isReplyStarting &&
      !hasActiveJob &&
      !isGeneratingFirstMessage &&
      !isEditingMessage &&
      !blockReason,
  };
}
