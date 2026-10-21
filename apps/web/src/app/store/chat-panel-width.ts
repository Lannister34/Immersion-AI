const CHAT_PANEL_MIN_WIDTH = 320;
const CHAT_PANEL_MAX_WIDTH = 520;
export const CHAT_PANEL_DEFAULT_WIDTH = 360;

export function clampChatPanelWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return CHAT_PANEL_DEFAULT_WIDTH;
  }
  return Math.round(Math.min(CHAT_PANEL_MAX_WIDTH, Math.max(CHAT_PANEL_MIN_WIDTH, width)));
}
