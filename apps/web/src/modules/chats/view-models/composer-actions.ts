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
  sendRefusal: string | null;
}

export const IMAGES_NEED_VISION_MODEL =
  'Загруженная модель работает только с текстом. Уберите изображения, чтобы отправить сообщение, или запустите модель, которая их принимает.';

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
  const imagesRefused = attachmentCount > 0 && !modelAcceptsImages;

  return {
    canAttachImages: modelAcceptsImages && !isSendingMessage,
    canSend:
      hasContent &&
      !imagesRefused &&
      !isUploadingAttachment &&
      !isReplyStarting &&
      !hasActiveJob &&
      !isGeneratingFirstMessage &&
      !isEditingMessage &&
      !blockReason,
    sendRefusal: imagesRefused ? IMAGES_NEED_VISION_MODEL : null,
  };
}
