/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-redundant-type-constituents */

/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

/**
 * @noema/web — Graph / GraphCanvas
 *
 * WebGL/Canvas force-directed graph renderer.
 * Wraps ForceGraph2D from react-force-graph with:
 *   - Node visual encoding (type color, mastery ring, glow, pulse)
 *   - Edge visual encoding (type style, weight thickness)
 *   - Selection + hover highlight
 *   - Three layout modes: force, hierarchical, radial
 */

import * as React from 'react';
import dynamic from 'next/dynamic';
import type { IGraphNodeDto, IGraphEdgeDto } from '@noema/api-client';
import type { OverlayType, LayoutMode } from '@/stores/graph-store';
import { drawNode, nodeRadius } from './graph-node.js';
import { drawEdge } from './graph-edge.js';

// SSR-safe import — ForceGraph2D uses browser canvas APIs
const ForceGraph2D = dynamic(() => import('react-force-graph').then((m) => m.ForceGraph2D), {
  ssr: false,
});

// ============================================================================
// Types
// ============================================================================

// IForceNode redeclares id as string because when @noema/api-client cannot be
// resolved, IGraphNodeDto is `any` — extending `any` does not inherit properties.
interface IForceNode {
  id: string;
  type: string;
  label: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  __degree?: number;
}

interface IForceLink {
  source: string;
  target: string;
  type: string;
  weight: number;
}

export interface IGraphCanvasProps {
  nodes: IGraphNodeDto[];
  edges: IGraphEdgeDto[];
  selectedNodeId?: string | null;
  hoveredNodeId?: string | null;
  activeOverlays?: OverlayType[];
  layoutMode?: LayoutMode;
  onNodeClick?: (node: IGraphNodeDto) => void;
  onNodeHover?: (node: IGraphNodeDto | null) => void;
  onNodeRightClick?: (node: IGraphNodeDto, event: MouseEvent) => void;
  onBackgroundClick?: () => void;
  masteryMap?: Record<string, number>;
  recentNodeIds?: Set<string>;
  highlightedNodeIds?: Set<string>;
  className?: string;
}

// ============================================================================
// Stable fallback constants — hoisted to module scope to avoid breaking
// useCallback memoisation when callers omit optional Set/object props.
// ============================================================================

const EMPTY_SET = new Set<string>();
const EMPTY_MASTERY_MAP: Record<string, number> = {};

// ============================================================================
// GraphCanvas
// ============================================================================

export function GraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  hoveredNodeId,
  activeOverlays = [],
  layoutMode = 'force',
  onNodeClick,
  onNodeHover,
  onNodeRightClick,
  onBackgroundClick,
  masteryMap = EMPTY_MASTERY_MAP,
  recentNodeIds = EMPTY_SET,
  highlightedNodeIds = EMPTY_SET,
  className,
}: IGraphCanvasProps): React.JSX.Element {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = React.useState({ width: 800, height: 600 });

  React.useEffect(() => {
    const el = containerRef.current;
    if (el === null) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, []);

  const degreeMap = React.useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const edge of edges) {
      const src: string = edge.sourceId as unknown as string;
      const tgt: string = edge.targetId as unknown as string;
      map[src] = (map[src] ?? 0) + 1;
      map[tgt] = (map[tgt] ?? 0) + 1;
    }
    return map;
  }, [edges]);

  const forceNodes = React.useMemo(
    () =>
      (nodes as unknown as IForceNode[]).map((n) => ({
        ...n,
        __degree: degreeMap[n.id] ?? 0,
      })),
    [nodes, degreeMap]
  );

  const forceLinks: IForceLink[] = React.useMemo(
    () =>
      (
        edges as unknown as { sourceId: string; targetId: string; type: string; weight: number }[]
      ).map((e) => ({
        source: e.sourceId,
        target: e.targetId,
        type: e.type,
        weight: e.weight,
      })),
    [edges]
  );

  const nodeCanvasObject = React.useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as IForceNode;
      const masteryVal: number | undefined = masteryMap[n.id];
      drawNode({
        node: n,
        ctx,
        globalScale,
        isSelected: n.id === selectedNodeId,
        isHovered: n.id === hoveredNodeId,
        ...(masteryVal !== undefined ? { mastery: masteryVal } : {}),
        recentlyActive: recentNodeIds.has(n.id),
      });
      if (highlightedNodeIds.size > 0 && !highlightedNodeIds.has(n.id)) {
        const r = nodeRadius(n.__degree ?? 0);
        ctx.beginPath();
        ctx.arc(n.x ?? 0, n.y ?? 0, r + 4, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(10,10,18,0.55)';
        ctx.fill();
      }
    },
    [selectedNodeId, hoveredNodeId, masteryMap, recentNodeIds, highlightedNodeIds]
  );

  const nodePointerAreaPaint = React.useCallback(
    (node: any, color: string, ctx: CanvasRenderingContext2D) => {
      const n = node as IForceNode;
      const r = nodeRadius(n.__degree ?? 0) + 4;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(n.x ?? 0, n.y ?? 0, r, 0, 2 * Math.PI);
      ctx.fill();
    },
    []
  );

  const linkCanvasObject = React.useCallback(
    (link: any, ctx: CanvasRenderingContext2D) => {
      // force-graph mutates source/target from string → resolved node object at runtime
      const src = link.source as IForceNode;
      const tgt = link.target as IForceNode;
      drawEdge({
        ctx,
        sourceX: src.x ?? 0,
        sourceY: src.y ?? 0,
        targetX: tgt.x ?? 0,
        targetY: tgt.y ?? 0,
        edgeType: String(link.type ?? 'related'),
        weight: Number(link.weight ?? 1),
        isHighlighted:
          src.id === selectedNodeId ||
          tgt.id === selectedNodeId ||
          src.id === hoveredNodeId ||
          tgt.id === hoveredNodeId,
      });
    },
    [selectedNodeId, hoveredNodeId]
  );

  const handleNodeClick = React.useCallback(
    (node: any) => {
      onNodeClick?.(node as IGraphNodeDto);
    },
    [onNodeClick]
  );

  const handleNodeHover = React.useCallback(
    (node: any) => {
      onNodeHover?.(node !== null ? (node as IGraphNodeDto) : null);
    },
    [onNodeHover]
  );

  const handleNodeRightClick = React.useCallback(
    (node: any, event: MouseEvent) => {
      onNodeRightClick?.(node as IGraphNodeDto, event);
    },
    [onNodeRightClick]
  );

  // Suppress unused warning — activeOverlays processed by parent into highlightedNodeIds
  void activeOverlays;

  return (
    <div ref={containerRef} className={className ?? 'h-full w-full'}>
      {/* Cast as any: react-force-graph ForceGraphProps conflicts with exactOptionalPropertyTypes */}
      {React.createElement(ForceGraph2D as any, {
        width: dimensions.width,
        height: dimensions.height,
        graphData: { nodes: forceNodes, links: forceLinks },
        nodeId: 'id',
        linkSource: 'source',
        linkTarget: 'target',
        nodeCanvasObject,
        nodePointerAreaPaint,
        linkCanvasObject,
        onNodeClick: handleNodeClick,
        onNodeHover: handleNodeHover,
        onNodeRightClick: handleNodeRightClick,
        onBackgroundClick,
        backgroundColor: '#0a0a12',
        dagMode:
          layoutMode === 'hierarchical' ? 'td' : layoutMode === 'radial' ? 'radialout' : undefined,
        dagLevelDistance: layoutMode === 'hierarchical' ? 80 : undefined,
        cooldownTicks: layoutMode === 'force' ? 300 : 50,
        d3AlphaDecay: layoutMode === 'radial' ? 0.05 : 0.0228,
        d3VelocityDecay: 0.4,
      })}
    </div>
  );
}
