import { ChatAttachmentMimeTypeSchema, type ChatMessageAttachmentDto } from '@immersion/contracts/chats';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { getApiErrorMessage } from '../../../shared/api/get-api-error-message';
import { readFileAsBase64 } from '../../../shared/lib/read-file-as-base64';
import { uploadChatAttachment } from '../api/upload-chat-attachment';

export const MAX_ATTACHMENTS_PER_MESSAGE = 4;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export interface ChatAttachmentsDraft {
  attach: (files: readonly File[]) => void;
  attachments: ChatMessageAttachmentDto[];
  clear: () => void;
  error: string | null;
  isUploading: boolean;
  remove: (attachmentId: string) => void;
}

/**
 * Картинки уходят на сервер сразу при выборе: к моменту отправки сообщения
 * остаётся только сослаться на них по id, а ошибка формата или размера
 * всплывает там же, где пользователь выбрал файл.
 */
export function useChatAttachments(chatId: string): ChatAttachmentsDraft {
  const [attachments, setAttachments] = useState<ChatMessageAttachmentDto[]>([]);
  const [pickError, setPickError] = useState<string | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const mimeType = ChatAttachmentMimeTypeSchema.parse(file.type);
      const contentBase64 = await readFileAsBase64(file);

      return uploadChatAttachment(chatId, { contentBase64, mimeType });
    },
    onSuccess: (response) => {
      setAttachments((current) => [...current, response.attachment]);
    },
  });

  const attach = (files: readonly File[]) => {
    setPickError(null);

    for (const file of files) {
      if (!ChatAttachmentMimeTypeSchema.safeParse(file.type).success) {
        setPickError('Поддерживаются только PNG, JPEG и WebP.');
        return;
      }

      if (file.size > MAX_ATTACHMENT_BYTES) {
        setPickError('Изображение больше 8 МБ.');
        return;
      }
    }

    const room = MAX_ATTACHMENTS_PER_MESSAGE - attachments.length;

    if (files.length > room) {
      setPickError(`К одному сообщению можно приложить не больше ${MAX_ATTACHMENTS_PER_MESSAGE} изображений.`);
      return;
    }

    for (const file of files) {
      uploadMutation.mutate(file);
    }
  };

  return {
    attach,
    attachments,
    clear: () => {
      setAttachments([]);
      setPickError(null);
      uploadMutation.reset();
    },
    error:
      pickError ??
      (uploadMutation.error ? getApiErrorMessage(uploadMutation.error, 'Не удалось загрузить изображение.') : null),
    isUploading: uploadMutation.isPending,
    remove: (attachmentId) => {
      setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
      setPickError(null);
    },
  };
}
