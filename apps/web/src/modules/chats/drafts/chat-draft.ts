import type { ChatMessageAttachmentDto } from '@immersion/contracts/chats';

export interface ChatDraftContent {
  attachments: readonly ChatMessageAttachmentDto[];
  text: string;
}

export interface ChatDraftState extends ChatDraftContent {
  attachmentsError: string | null;
  isSending: boolean;
  sendError: string | null;
  uploadingCount: number;
}

export const EMPTY_CHAT_DRAFT: ChatDraftState = {
  attachments: [],
  attachmentsError: null,
  isSending: false,
  sendError: null,
  text: '',
  uploadingCount: 0,
};

export function isEmptyChatDraft(draft: ChatDraftState): boolean {
  return (
    draft.text.length === 0 &&
    draft.attachments.length === 0 &&
    draft.attachmentsError === null &&
    !draft.isSending &&
    draft.sendError === null &&
    draft.uploadingCount === 0
  );
}

export function setChatDraftText(draft: ChatDraftState, text: string): ChatDraftState {
  return { ...draft, text };
}

export function refuseChatDraftFiles(draft: ChatDraftState, message: string): ChatDraftState {
  return { ...draft, attachmentsError: message };
}

export function beginChatDraftUploads(draft: ChatDraftState, count: number): ChatDraftState {
  return { ...draft, attachmentsError: null, uploadingCount: draft.uploadingCount + count };
}

export function finishChatDraftUpload(draft: ChatDraftState, attachment: ChatMessageAttachmentDto): ChatDraftState {
  return {
    ...draft,
    attachments: [...draft.attachments, attachment],
    uploadingCount: Math.max(0, draft.uploadingCount - 1),
  };
}

export function failChatDraftUpload(draft: ChatDraftState, message: string): ChatDraftState {
  return { ...draft, attachmentsError: message, uploadingCount: Math.max(0, draft.uploadingCount - 1) };
}

export function removeChatDraftAttachment(draft: ChatDraftState, attachmentId: string): ChatDraftState {
  return {
    ...draft,
    attachments: draft.attachments.filter((attachment) => attachment.id !== attachmentId),
    attachmentsError: null,
  };
}

export function beginChatDraftSend(draft: ChatDraftState): ChatDraftState {
  return { ...draft, attachments: [], attachmentsError: null, isSending: true, sendError: null, text: '' };
}

export function finishChatDraftSend(draft: ChatDraftState): ChatDraftState {
  return { ...draft, isSending: false };
}

function joinDraftText(sent: string, typedSince: string): string {
  if (sent.trim().length === 0) return typedSince;
  if (typedSince.trim().length === 0) return sent;
  return `${sent}\n${typedSince}`;
}

export function restoreFailedChatDraftSend(
  draft: ChatDraftState,
  sent: ChatDraftContent,
  error: string,
): ChatDraftState {
  return {
    ...draft,
    attachments: [...sent.attachments, ...draft.attachments],
    isSending: false,
    sendError: error,
    text: joinDraftText(sent.text, draft.text),
  };
}
