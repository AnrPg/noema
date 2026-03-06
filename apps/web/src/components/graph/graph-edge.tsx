/**
 * @noema/web — Graph / EdgeCanvasDraw
 *
 * Canvas draw helper for PKG/CKG edges.
 * Called by GraphCanvas inside ForceGraph2D linkCanvasObject callback.
 */

import type { EdgeType } from '@noema/api-client';

export const EDGE_COLOR_MAP: Record<string, string> = {
  prerequisite: '#7c6ee650',
  related: '#9ca3af40',
  part_of: '#86efac40',
  example_of: '#fbbf2440',
  contradicts: '#f4727240',
};

const FALLBACK_EDGE_COLOR = '#6b728040';

export interface IEdgeDrawOptions {
  ctx: CanvasRenderingContext2D;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  edgeType: string;
  weight: number;
  isHighlighted?: boolean;
}

export function drawEdge({
  ctx,
  sourceX,
  sourceY,
  targetX,
  targetY,
  edgeType,
  weight,
  isHighlighted = false,
}: IEdgeDrawOptions): void {
  const color = isHighlighted ? '#ffffff80' : (EDGE_COLOR_MAP[edgeType] ?? FALLBACK_EDGE_COLOR);
  const lineWidth = Math.max(0.5, Math.min(3, weight * 3));

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sourceX, sourceY);
  ctx.lineTo(targetX, targetY);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  if (edgeType === 'contradicts') {
    ctx.setLineDash([5, 3]);
  } else {
    ctx.setLineDash([]);
  }

  ctx.stroke();
  ctx.restore();
}

// Re-export EdgeType for consumers who import from this module
export type { EdgeType };
