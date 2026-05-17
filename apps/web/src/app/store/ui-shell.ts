import { create } from 'zustand';

export type ChatRightPanelSection = 'settings' | 'character' | 'lorebooks' | 'context' | null;

interface UiShellState {
  chatRightPanelSection: ChatRightPanelSection;
  setChatRightPanelSection: (section: ChatRightPanelSection) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUiShellStore = create<UiShellState>((set) => ({
  chatRightPanelSection: 'settings',
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
