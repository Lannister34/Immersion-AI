import { ChatAttachmentMimeTypeSchema } from '@immersion/contracts/chats';
import {
  CHAT_MESSAGE_MAX_ATTACHMENTS,
  IMAGE_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_MAX_MEGABYTES,
} from '@immersion/contracts/common';

export interface AttachmentRefusalInput {
  attachedCount: number;
  files: readonly Pick<File, 'size' | 'type'>[];
  uploadingCount: number;
}

export function findAttachmentRefusal({ attachedCount, files, uploadingCount }: AttachmentRefusalInput): string | null {
  for (const file of files) {
    if (!ChatAttachmentMimeTypeSchema.safeParse(file.type).success) {
      return 'Поддерживаются только PNG, JPEG и WebP.';
    }

    if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
      return `Изображение больше ${IMAGE_UPLOAD_MAX_MEGABYTES} МБ.`;
    }
  }

  if (files.length > CHAT_MESSAGE_MAX_ATTACHMENTS - attachedCount - uploadingCount) {
    return `К одному сообщению можно приложить не больше ${CHAT_MESSAGE_MAX_ATTACHMENTS} изображений.`;
  }

  return null;
}
