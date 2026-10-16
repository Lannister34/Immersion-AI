export type MessageEditSavePlan = { kind: 'ignore' } | { kind: 'close' } | { content: string; kind: 'save' };

interface MessageEditSaveInput {
  draft: string;
  isSaving: boolean;
  savedContent: string;
}

export function planMessageEditSave({ draft, isSaving, savedContent }: MessageEditSaveInput): MessageEditSavePlan {
  if (isSaving) {
    return { kind: 'ignore' };
  }
  const content = draft.trim();
  if (!content || content === savedContent) {
    return { kind: 'close' };
  }
  return { content, kind: 'save' };
}
