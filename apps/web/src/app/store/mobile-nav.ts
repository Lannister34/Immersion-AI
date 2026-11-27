import { create } from 'zustand';

interface MobileNavState {
  close: () => void;
  isOpen: boolean;
  open: () => void;
}

export const useMobileNavStore = create<MobileNavState>((set) => ({
  close: () => {
    set({ isOpen: false });
  },
  isOpen: false,
  open: () => {
    set({ isOpen: true });
  },
}));
