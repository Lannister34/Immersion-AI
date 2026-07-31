import { create } from 'zustand';

export type ChatRightPanelTab = 'model' | 'context';

export const CHAT_PANEL_MIN_WIDTH = 320;
export const CHAT_PANEL_MAX_WIDTH = 520;
const CHAT_PANEL_DEFAULT_WIDTH = 360;
const CHAT_PANEL_WIDTH_STORAGE_KEY = 'immersion.chat-panel-width';

export function clampChatPanelWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return CHAT_PANEL_DEFAULT_WIDTH;
  }
  return Math.round(Math.min(CHAT_PANEL_MAX_WIDTH, Math.max(CHAT_PANEL_MIN_WIDTH, width)));
}

// Ширина панели — вкус пользователя, а не состояние сервера: держим её в
// localStorage, чтобы переживала перезагрузку и не ездила между вкладками.
function readStoredPanelWidth(): number {
  const stored = window.localStorage.getItem(CHAT_PANEL_WIDTH_STORAGE_KEY);
  return stored === null ? CHAT_PANEL_DEFAULT_WIDTH : clampChatPanelWidth(Number(stored));
}

interface UiShellState {
  chatPanelWidth: number;
  chatRightPanelOpen: boolean;
  chatRightPanelTab: ChatRightPanelTab;
  closeChatRightPanel: () => void;
  openChatRightPanelTab: (tab: ChatRightPanelTab) => void;
  setChatPanelWidth: (width: number) => void;
  setChatRightPanelTab: (tab: ChatRightPanelTab) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUiShellStore = create<UiShellState>((set) => ({
  chatPanelWidth: readStoredPanelWidth(),
  chatRightPanelOpen: true,
  chatRightPanelTab: 'model',
  closeChatRightPanel: () => {
    set({ chatRightPanelOpen: false });
  },
  openChatRightPanelTab: (tab) => {
    set({ chatRightPanelOpen: true, chatRightPanelTab: tab });
  },
  setChatPanelWidth: (width) => {
    const next = clampChatPanelWidth(width);
    window.localStorage.setItem(CHAT_PANEL_WIDTH_STORAGE_KEY, String(next));
    set({ chatPanelWidth: next });
  },
  setChatRightPanelTab: (tab) => {
    set({ chatRightPanelTab: tab });
  },
  sidebarCollapsed: false,
  toggleSidebar: () => {
    set((state) => ({
      sidebarCollapsed: !state.sidebarCollapsed,
    }));
  },
}));
