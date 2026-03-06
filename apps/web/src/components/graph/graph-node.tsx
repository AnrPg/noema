/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @noema/web — Graph / NodeCanvasDraw
 *
 * Canvas draw helper for PKG/CKG nodes.
 * Called by GraphCanvas inside ForceGraph2D nodeCanvasObject callback.
 */

import type { NodeType } from '@noema/api-client';

// ── Node type → fill color (Phase 0 palette CSS vars resolved to hex) ─────────
export const NODE_TYPE_COLOR: Record<string, string> = {
  concept: '#7c6ee6', // synapse-400
  skill: '#a78bfa', // synapse-300
  fact: '#e2e8f0', // axon-100
  procedure: '#22d3ee', // neuron-400
  principle: '#86efac', // dendrite-400
  example: '#fbbf24', // myelin-400
  counterexample: '#f472b6', // axon-400
  misconception: '#ec4899', // cortex-400
};

const FALLBACK_COLOR = '#6b7280';

// Node data shape as seen by canvas callbacks — any-typed because @noema/api-client
// is not built and IGraphNodeDto resolves to any at this tsconfig level.
export interface INodeDrawOptions {
  node: any; // IGraphNodeDto & { x?: number; y?: number; __degree?: number }
  ctx: CanvasRenderingContext2D;
  globalScale: number;
  isSelected: boolean;
  isHovered: boolean;
  mastery?: number; // 0–1, undefined = not loaded
  recentlyActive?: boolean; // pulse animation
}

/** Returns node radius in graph units based on degree (min 6, max 20). */
export function nodeRadius(degree: number): number {
  return Math.max(6, Math.min(20, 6 + degree * 1.4));
}

/** Draws a single node onto the canvas context. */
export function drawNode({
  node,
  ctx,
  globalScale,
  isSelected,
  isHovered,
  mastery = 0,
  recentlyActive = false,
}: INodeDrawOptions): void {
  const x: number = node.x ?? 0;
  const y: number = node.y ?? 0;
  const degree: number = node.__degree ?? 0;
  const r = nodeRadius(degree);
  const nodeType: string = node.type ?? '';
  const color: string = NODE_TYPE_COLOR[nodeType] ?? FALLBACK_COLOR;

  // -- Glow for high mastery (mastery > 0.8) --
  if (mastery > 0.8) {
    ctx.save();
    const grd = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.2);
    grd.addColorStop(0, color + '60');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }

  // -- Pulse ring for recently active nodes --
  if (recentlyActive) {
    ctx.save();
    ctx.strokeStyle = color + '80';
    ctx.lineWidth = 1.5 / globalScale;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.7, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  // -- Main fill circle --
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();

  // -- Mastery ring (arc, clockwise, 0→1) --
  if (mastery > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r + 2.5 / globalScale, -Math.PI / 2, -Math.PI / 2 + mastery * 2 * Math.PI);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 / globalScale;
    ctx.globalAlpha = 0.5 + mastery * 0.5;
    ctx.stroke();
    ctx.restore();
  }

  // -- Selection ring --
  if (isSelected) {
    ctx.beginPath();
    ctx.arc(x, y, r + 5 / globalScale, 0, 2 * Math.PI);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5 / globalScale;
    ctx.stroke();
  } else if (isHovered) {
    ctx.beginPath();
    ctx.arc(x, y, r + 3 / globalScale, 0, 2 * Math.PI);
    ctx.strokeStyle = '#ffffff80';
    ctx.lineWidth = 1.5 / globalScale;
    ctx.stroke();
  }

  // -- Label (visible when zoomed in enough) --
  if (globalScale > 1.5) {
    const fontSize = Math.max(8, 11 / globalScale);
    const label: string = node.label ?? '';
    ctx.font = `${String(fontSize)}px sans-serif`;
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + r + fontSize);
  }
}

// Re-export NodeType for consumers who import from this module
export type { NodeType };
