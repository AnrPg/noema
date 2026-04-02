/**
 * @noema/graph - Shared graph visualization package
 *
 * Canvas-based force-directed graph components and types for both
 * apps/web (learner app) and apps/web-admin (admin app).
 */

// Types
export type { OverlayType, LayoutMode } from './types.js';

// Canvas draw helpers (exported for consumers needing canvas primitives)
export { drawNode, nodeRadius, NODE_TYPE_COLOR, normalizeNodeType, getNodeColor } from './graph-node.js';
export type { INodeDrawOptions, NodeType } from './graph-node.js';
export { drawEdge, EDGE_COLOR_MAP } from './graph-edge.js';
export type { IEdgeDrawOptions, EdgeType } from './graph-edge.js';

// Components
export { GraphCanvas } from './graph-canvas.js';
export type { IGraphCanvasProps } from './graph-canvas.js';
export { GraphControls } from './graph-controls.js';
export type { IGraphControlsProps } from './graph-controls.js';
export { GraphLegend } from './graph-legend.js';
export type { IGraphLegendProps } from './graph-legend.js';
export { GraphMinimap } from './graph-minimap.js';
export { NodeDetailPanel } from './node-detail-panel.js';
export type { INodeDetailPanelEditDraft, INodeDetailPanelProps } from './node-detail-panel.js';
