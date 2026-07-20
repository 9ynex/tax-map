import { create } from "zustand";

/**
 * Transient, non-shareable UI state only — hover and in-flight animation.
 * Income, country, filing status, pinned regions, and view mode all live in
 * the URL instead (docs/frontend.md: "URL is the source of truth"), so
 * nothing meaningful to a shared link belongs in here.
 */
interface UiState {
  hoveredJurisdictionId: string | null;
  setHovered: (id: string | null) => void;
  isTransitioning: boolean;
  setTransitioning: (value: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  hoveredJurisdictionId: null,
  setHovered: (id) => set({ hoveredJurisdictionId: id }),
  isTransitioning: false,
  setTransitioning: (value) => set({ isTransitioning: value }),
}));
