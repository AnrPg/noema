/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @noema/graph — Graph / NodeCanvasDraw
 *
 * Canvas draw helper for PKG/CKG nodes.
 * Called by GraphCanvas inside ForceGraph2D nodeCanvasObject callback.
 */

import type { NodeType } from '@noema/api-client';

// ── Node type → fill color (Phase 0 palette CSS vars resolved to hex) ─────────
export const NODE_TYPE_COLOR: Record<string, string> = {
  concept: '#7c6ee6', // synapse-400
  occupation: '#fb923c', // solar-400
  skill: '#a78bfa', // synapse-300
  fact: '#e2e8f0', // axon-100
  procedure: '#22d3ee', // neuron-400
  principle: '#86efac', // dendrite-400
  example: '#fbbf24', // myelin-400
  counterexample: '#f472b6', // axon-400
  misconception: '#ec4899', // cortex-400
};

const FALLBACK_COLOR = '#6b7280';
const NODE_TYPE_ALIASES: Record<string, string> = {
  counter_example: 'counterexample',
};

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function normalizeNodeTypeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function collectNodeTypeSignals(
  metadata: Record<string, unknown>,
  semanticHints: string[]
): string[] {
  const ontologyImport =
    typeof metadata['ontologyImport'] === 'object' && metadata['ontologyImport'] !== null
      ? (metadata['ontologyImport'] as Record<string, unknown>)
      : {};
  const metadataSignals = [
    ...stringArrayValue(ontologyImport['sourceTypes']),
    ...stringArrayValue(semanticHints),
    ...(typeof metadata['className'] === 'string' ? [metadata['className']] : []),
    ...(typeof metadata['nodeType'] === 'string' ? [metadata['nodeType']] : []),
  ];

  return metadataSignals.map((signal) => normalizeNodeTypeToken(signal)).filter((signal) => signal !== '');
}

export function normalizeNodeType(
  type: unknown,
  metadata: Record<string, unknown> = {},
  semanticHints: string[] = []
): string {
  if (typeof type === 'string' && type.trim() !== '') {
    const normalizedType = normalizeNodeTypeToken(type);
    if (normalizedType in NODE_TYPE_COLOR) {
      return normalizedType;
    }

    const aliasedType = NODE_TYPE_ALIASES[normalizedType];
    if (aliasedType !== undefined) {
      return aliasedType;
    }
  }

  const lexicalSignals = collectNodeTypeSignals(metadata, semanticHints).join(' ');
  if (lexicalSignals.includes('occupation')) {
    return 'occupation';
  }
  if (lexicalSignals.includes('skill')) {
    return 'skill';
  }
  if (lexicalSignals.includes('procedure') || lexicalSignals.includes('method')) {
    return 'procedure';
  }
  if (
    lexicalSignals.includes('principle') ||
    lexicalSignals.includes('law') ||
    lexicalSignals.includes('rule')
  ) {
    return 'principle';
  }
  if (lexicalSignals.includes('counterexample') || lexicalSignals.includes('counter_example')) {
    return 'counterexample';
  }
  if (lexicalSignals.includes('misconception')) {
    return 'misconception';
  }
  if (lexicalSignals.includes('example')) {
    return 'example';
  }
  if (lexicalSignals.includes('fact') || lexicalSignals.includes('literal')) {
    return 'fact';
  }

  return 'concept';
}

export function getNodeColor(
  type: unknown,
  metadata: Record<string, unknown> = {},
  semanticHints: string[] = []
): string {
  const normalizedType = normalizeNodeType(type, metadata, semanticHints);
  return NODE_TYPE_COLOR[normalizedType] ?? FALLBACK_COLOR;
}

// Node data shape as seen by canvas callbacks — any-typed because @noema/api-client
// is not built and IGraphNodeDto resolves to any at this tsconfig level.
export interface INodeDrawOptions {
  node: any; // IGraphNodeDto & { x?: number; y?: number; __degree?: number }
  ctx: CanvasRenderingContext2D;
  globalScale: number;
  isSelected: boolean;
  isHovered: boolean;
  showLabel?: boolean;
  mastery?: number; // 0–1, undefined = not loaded
  recentlyActive?: boolean; // pulse animation
}

/** Returns node radius in graph units based on degree (min 9, max 34). */
export function nodeRadius(degree: number): number {
  return Math.max(9, Math.min(34, 9 + degree * 2.5));
}

/** Draws a single node onto the canvas context. */
export function drawNode({
  node,
  ctx,
  globalScale,
  isSelected,
  isHovered,
  showLabel = false,
  mastery = 0,
  recentlyActive = false,
}: INodeDrawOptions): void {
  const x: number = node.x ?? 0;
  const y: number = node.y ?? 0;
  const degree: number = node.__degree ?? 0;
  const r = nodeRadius(degree);
  const metadata =
    typeof node.metadata === 'object' && node.metadata !== null
      ? (node.metadata as Record<string, unknown>)
      : {};
  const semanticHints = stringArrayValue(node.semanticHints);
  const color: string = getNodeColor(node.type, metadata, semanticHints);

  // -- Glow for high mastery (mastery > 0.8) --
  if (mastery > 0.8) {
    ctx.save();
    const grd = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.2);
    grd.addColorStop(0, color + '60');
    grd.addColorStop(1, color + '00');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }

  // -- Pulse ring for recently active nodes --
  if (recentlyActive) {
    ctx.save();
    const now = Date.now();
    const pulse = 0.4 + 0.4 * Math.sin(now / 500);
    const alphaHex = Math.round(pulse * 255)
      .toString(16)
      .padStart(2, '0');
    ctx.strokeStyle = color + alphaHex;
    ctx.lineWidth = 2 / globalScale;
    ctx.beginPath();
    ctx.arc(x, y, r * (1.5 + 0.3 * Math.sin(now / 600)), 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  // -- Main fill circle (enlarged when selected) --
  const displayR = isSelected ? r * 1.35 : r;
  ctx.beginPath();
  ctx.arc(x, y, displayR, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();

  // -- Mastery ring (arc, clockwise, 0→1) --
  if (mastery > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, displayR + 2.5 / globalScale, -Math.PI / 2, -Math.PI / 2 + mastery * 2 * Math.PI);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 / globalScale;
    ctx.globalAlpha = 0.5 + mastery * 0.5;
    ctx.stroke();
    ctx.restore();
  }

  // -- Selection ring --
  if (isSelected) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, displayR + 5 / globalScale, 0, 2 * Math.PI);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5 / globalScale;
    ctx.stroke();
    ctx.restore();
  } else if (isHovered) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, displayR + 3 / globalScale, 0, 2 * Math.PI);
    ctx.strokeStyle = '#ffffff80';
    ctx.lineWidth = 1.5 / globalScale;
    ctx.stroke();
    ctx.restore();
  }

  // -- Label --
  if (showLabel) {
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
