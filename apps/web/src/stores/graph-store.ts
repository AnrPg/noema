/**
 * Graph Store — Knowledge graph viewport state.
 * Not persisted — viewport resets on navigation.
 */

import { create } from 'zustand';

export type OverlayType =
  | 'centrality'
  | 'frontier'
  | 'misconceptions'
  | 'bridges'
  | 'prerequisites';
export type LayoutMode = 'force' | 'hierarchical' | 'radial';

interface IViewportCenter {
  x: number;
  y: number;
}

interface IGraphState {
  viewportCenter: IViewportCenter;
  zoom: number;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  activeOverlays: Set<OverlayType>;
  layoutMode: LayoutMode;
}

interface IGraphActions {
  selectNode: (nodeId: string) => void;
  deselectNode: () => void;
  toggleOverlay: (overlay: OverlayType) => void;
  setLayoutMode: (mode: LayoutMode) => void;
  resetViewport: () => void;
  setHoveredNode: (nodeId: string | null) => void;
}

const initialState: IGraphState = {
  viewportCenter: { x: 0, y: 0 },
  zoom: 1,
  selectedNodeId: null,
  hoveredNodeId: null,
  activeOverlays: new Set(),
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
