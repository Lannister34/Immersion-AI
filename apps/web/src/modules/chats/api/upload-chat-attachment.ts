import {
  type UploadChatAttachmentCommand,
  UploadChatAttachmentCommandSchema,
  UploadChatAttachmentResponseSchema,
} from '@immersion/contracts/chats';

import { apiPost } from '../../../shared/api/client';

export function uploadChatAttachment(chatId: string, command: UploadChatAttachmentCommand) {
  return apiPost(
    `/api/chats/${encodeURIComponent(chatId)}/attachments`,
    command,
    UploadChatAttachmentCommandSchema,
    UploadChatAttachmentResponseSchema,
  );
}
