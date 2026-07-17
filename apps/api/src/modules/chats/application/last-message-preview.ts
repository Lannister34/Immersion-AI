const LAST_MESSAGE_PREVIEW_MAX_LENGTH = 160;

/**
 * Chats own the summary preview rule: the preview is the last message's
 * content truncated to 160 characters, or null when there is no last message.
 */
export function deriveLastMessagePreview(lastMessageContent: string | null | undefined): string | null {
  if (lastMessageContent === null || lastMessageContent === undefined) {
    return null;
  }

  return lastMessageContent.slice(0, LAST_MESSAGE_PREVIEW_MAX_LENGTH);
}
