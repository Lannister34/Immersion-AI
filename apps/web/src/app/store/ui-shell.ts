import { create } from 'zustand';

import { NARROW_VIEWPORT_QUERY } from '../../shared/lib/media-queries';
import { CHAT_PANEL_DEFAULT_WIDTH, clampChatPanelWidth } from './chat-panel-width';

export type ChatRightPanelTab = 'model' | 'context';

const CHAT_PANEL_WIDTH_STORAGE_KEY = 'immersion.chat-panel-width';

function readStoredPanelWidth(): number {
  const stored = window.localStorage.getItem(CHAT_PANEL_WIDTH_STORAGE_KEY);
  return stored === null ? CHAT_PANEL_DEFAULT_WIDTH : clampChatPanelWidth(Number(stored));
}

function isNarrowViewport(): boolean {
  return window.matchMedia(NARROW_VIEWPORT_QUERY).matches;
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
  chatRightPanelOpen: !isNarrowViewport(),
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
