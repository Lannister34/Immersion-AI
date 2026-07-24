import { create } from 'zustand';

export type ChatRightPanelSection = 'settings' | 'sampler' | 'character' | 'lorebooks' | 'context' | null;

interface UiShellState {
  chatRightPanelOpen: boolean;
  chatRightPanelSection: ChatRightPanelSection;
  closeChatRightPanel: () => void;
  openChatRightPanelSection: (section: NonNullable<ChatRightPanelSection>) => void;
  setChatRightPanelSection: (section: ChatRightPanelSection) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUiShellStore = create<UiShellState>((set) => ({
  chatRightPanelOpen: true,
  chatRightPanelSection: 'settings',
  closeChatRightPanel: () => {
    set({ chatRightPanelOpen: false });
  },
  openChatRightPanelSection: (section) => {
    set({ chatRightPanelOpen: true, chatRightPanelSection: section });
  },
  setChatRightPanelSection: (section) => {
    set({ chatRightPanelSection: section });
  },
  sidebarCollapsed: false,
  toggleSidebar: () => {
    set((state) => ({
      sidebarCollapsed: !state.sidebarCollapsed,
    }));
  },
}));
