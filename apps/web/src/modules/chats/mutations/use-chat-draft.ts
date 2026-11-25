import { ChatAttachmentMimeTypeSchema, type ChatMessageAttachmentDto } from '@immersion/contracts/chats';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';

import { getApiErrorMessage } from '../../../shared/api/get-api-error-message';
import { readFileAsBase64 } from '../../../shared/lib/read-file-as-base64';
import { uploadChatAttachment } from '../api/upload-chat-attachment';
import {
  beginChatDraftSend,
  beginChatDraftUploads,
  type ChatDraftContent,
  type ChatDraftState,
  failChatDraftUpload,
  finishChatDraftSend,
  finishChatDraftUpload,
  refuseChatDraftFiles,
  removeChatDraftAttachment,
  restoreFailedChatDraftSend,
  setChatDraftText,
} from '../drafts/chat-draft';
import { useChatDraftStore } from '../drafts/use-chat-draft-store';
import { findAttachmentRefusal } from '../view-models/attachment-refusal';

export const SEND_FAILED_MESSAGE = 'Не удалось получить ответ модели. Проверьте API и повторите попытку.';

export type SendChatMessage = (text: string, attachments: ChatMessageAttachmentDto[]) => Promise<unknown>;

export interface ChatDraft extends ChatDraftState {
  attach: (files: readonly File[]) => void;
  remove: (attachmentId: string) => void;
  send: (sendMessage: SendChatMessage) => Promise<void>;
  setText: (text: string) => void;
}

export function useChatDraft(chatId: string): ChatDraft {
  const store = useChatDraftStore();
  const subscribe = useCallback((listener: () => void) => store.subscribe(chatId, listener), [chatId, store]);
  const read = useCallback(() => store.read(chatId), [chatId, store]);
  const state = useSyncExternalStore(subscribe, read);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      try {
        const mimeType = ChatAttachmentMimeTypeSchema.parse(file.type);
        const contentBase64 = await readFileAsBase64(file);
        const { attachment } = await uploadChatAttachment(chatId, { contentBase64, mimeType });
        store.update(chatId, (draft) => finishChatDraftUpload(draft, attachment));
      } catch (error) {
        const message = getApiErrorMessage(error, 'Не удалось загрузить изображение.');
        store.update(chatId, (draft) => failChatDraftUpload(draft, message));
      }
    },
  });

  const attach = (files: readonly File[]) => {
    const current = store.read(chatId);
    const refusal = findAttachmentRefusal({
      attachedCount: current.attachments.length,
      files,
      uploadingCount: current.uploadingCount,
    });

    if (refusal) {
      store.update(chatId, (draft) => refuseChatDraftFiles(draft, refusal));
      return;
    }

    store.update(chatId, (draft) => beginChatDraftUploads(draft, files.length));
    for (const file of files) {
      uploadMutation.mutate(file);
    }
  };

  const send = async (sendMessage: SendChatMessage) => {
    const current = store.read(chatId);
    const sent: ChatDraftContent = { attachments: current.attachments, text: current.text };
    store.update(chatId, beginChatDraftSend);

    try {
      await sendMessage(sent.text, [...sent.attachments]);
      store.update(chatId, finishChatDraftSend);
    } catch (error) {
      const message = getApiErrorMessage(error, SEND_FAILED_MESSAGE);
      store.update(chatId, (draft) => restoreFailedChatDraftSend(draft, sent, message));
    }
  };

  return {
    ...state,
    attach,
    remove: (attachmentId) => store.update(chatId, (draft) => removeChatDraftAttachment(draft, attachmentId)),
    send,
    setText: (text) => store.update(chatId, (draft) => setChatDraftText(draft, text)),
  };
}
