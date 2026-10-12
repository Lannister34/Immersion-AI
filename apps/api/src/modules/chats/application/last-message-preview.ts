const LAST_MESSAGE_PREVIEW_MAX_LENGTH = 160;

export function deriveLastMessagePreview(lastMessageContent: string | null | undefined): string | null {
  if (lastMessageContent === null || lastMessageContent === undefined) {
    return null;
  }

  return lastMessageContent.slice(0, LAST_MESSAGE_PREVIEW_MAX_LENGTH);
}
