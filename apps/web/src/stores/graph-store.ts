/**
 * Graph Store — Knowledge graph viewport state.
 *
 * Controls camera, selection, overlays, and layout mode.
 * Not persisted — viewport resets on navigation.
 */

import { create } from 'zustand';
import type { OverlayType, LayoutMode } from '@noema/graph';

// Re-export so existing imports from this module continue to work
export type { OverlayType, LayoutMode };

interface IViewportCenter {
  x: number;
  y: number;
}

// ============================================================================
// State Shape
// ============================================================================

interface IGraphState {
  viewportCenter: IViewportCenter;
  zoom: number;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  activeOverlays: Set<OverlayType>;
  layoutMode: LayoutMode;
}

// ============================================================================
// Actions
// ============================================================================

interface IGraphActions {
  selectNode: (nodeId: string) => void;
  deselectNode: () => void;
  toggleOverlay: (overlay: OverlayType) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  resetViewport: () => void;
  setHoveredNode: (nodeId: string | null) => void;
}

// ============================================================================
// Store
// ============================================================================

const initialState: IGraphState = {
  viewportCenter: { x: 0, y: 0 },
  zoom: 1,
  selectedNodeId: null,
  hoveredNodeId: null,
  activeOverlays: new Set(), // NOTE: Set is not JSON-serializable; do not add persist() without a custom storage adapter
  layoutMode: 'force',
};

export const useGraphStore = create<IGraphState & IGraphActions>()((set) => ({
  ...initialState,

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },
  deselectNode: () => {
    set({ selectedNodeId: null });
  },

  toggleOverlay: (overlay) => {
    set((s) => {
      const next = new Set(s.activeOverlays);
      if (next.has(overlay)) {
        next.delete(overlay);
      } else {
        next.add(overlay);
      }
      return { activeOverlays: next };
    });
  },

  setLayoutMode: (mode) => {
    set({ layoutMode: mode });
  },

  resetViewport: () => {
    set({ viewportCenter: { x: 0, y: 0 }, zoom: 1, selectedNodeId: null, hoveredNodeId: null });
  },

  setHoveredNode: (nodeId) => {
    set({ hoveredNodeId: nodeId });
  },
}));
