/* eslint-disable @typescript-eslint/no-unsafe-member-access */

/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

/**
 * @noema/graph — Graph / GraphCanvas
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
import type { OverlayType, LayoutMode } from './types.js';
import { drawNode, nodeRadius } from './graph-node.js';
import { drawEdge } from './graph-edge.js';

// SSR-safe import — ForceGraph2D uses browser canvas APIs.
// react-force-graph's package entrypoint also wires VR helpers that expect a
// global AFRAME object, so preload aframe in the client before importing it.
const ForceGraph2D = dynamic(
  async () => {
    await import('aframe');
    const forceGraphModule = await import('react-force-graph');
    return forceGraphModule.ForceGraph2D;
  },
  {
    ssr: false,
  }
);

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
  vx?: number;
  vy?: number;
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
  showLabels?: boolean;
  activeOverlays?: OverlayType[];
  layoutMode?: LayoutMode;
  onNodeClick?: (node: IGraphNodeDto) => void;
  onNodeHover?: (node: IGraphNodeDto | null) => void;
  onNodeRightClick?: (node: IGraphNodeDto, event: MouseEvent) => void;
  onBackgroundClick?: () => void;
  onPositionSnapshot?: (nodes: Array<{ id: string; type: string; x: number; y: number }>) => void;
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

function seededNodePosition(index: number, total: number): { x: number; y: number } {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const spacing = total > 220 ? 72 : total > 120 ? 86 : 98;
  const radius = Math.sqrt(index + 1) * spacing;
  const angle = index * goldenAngle;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

// ============================================================================
// GraphCanvas
// ============================================================================

export function GraphCanvas({
  nodes,
  edges,
  selectedNodeId,
  hoveredNodeId,
  showLabels = false,
  activeOverlays = [],
  layoutMode = 'force',
  onNodeClick,
  onNodeHover,
  onNodeRightClick,
  onBackgroundClick,
  onPositionSnapshot,
  masteryMap = EMPTY_MASTERY_MAP,
  recentNodeIds = EMPTY_SET,
  highlightedNodeIds = EMPTY_SET,
  className,
}: IGraphCanvasProps): React.JSX.Element {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const graphRef = React.useRef<any>(undefined);
  const [dimensions, setDimensions] = React.useState({ width: 800, height: 600 });
  const basePositionMapRef = React.useRef<Map<string, { x: number; y: number }>>(new Map());
  const interactionFocusId = selectedNodeId ?? hoveredNodeId ?? null;

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

  const graphData = React.useMemo(
    () => ({ nodes: forceNodes, links: forceLinks }),
    [forceLinks, forceNodes]
  );

  React.useEffect(() => {
    const basePositions = basePositionMapRef.current;
    forceNodes.forEach((node, index) => {
      const savedPosition = basePositions.get(node.id);
      if (savedPosition !== undefined && layoutMode === 'force') {
        node.x = savedPosition.x;
        node.y = savedPosition.y;
        node.fx = savedPosition.x;
        node.fy = savedPosition.y;
        node.vx = 0;
        node.vy = 0;
      } else if (layoutMode === 'force') {
        const seededPosition = seededNodePosition(index, forceNodes.length);
        node.x = seededPosition.x;
        node.y = seededPosition.y;
        node.fx = null;
        node.fy = null;
      } else {
        node.fx = null;
        node.fy = null;
      }
    });

    graphRef.current?.d3ReheatSimulation?.();
  }, [forceNodes, layoutMode]);

  const emitPositionSnapshot = React.useCallback(() => {
    if (onPositionSnapshot === undefined) {
      return;
    }

    onPositionSnapshot(
      forceNodes
        .filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y))
        .map((node) => ({
          id: node.id,
          type: node.type,
          x: node.x ?? 0,
          y: node.y ?? 0,
        }))
    );
  }, [forceNodes, onPositionSnapshot]);

  const hoveredNodeRef = React.useRef<string | null>(interactionFocusId);

  React.useEffect(() => {
    hoveredNodeRef.current = interactionFocusId;
  }, [interactionFocusId]);

  const hoverRepelForce = React.useMemo(() => {
    let simulationNodes: IForceNode[] = [];

    const force = ((alpha: number) => {
      const hoveredId = hoveredNodeRef.current;
      if (hoveredId === null) {
        return;
      }

      const hoveredNode = simulationNodes.find((node) => node.id === hoveredId);
      if (
        hoveredNode === undefined ||
        typeof hoveredNode.x !== 'number' ||
        typeof hoveredNode.y !== 'number'
      ) {
        return;
      }

      for (const node of simulationNodes) {
        if (
          node.id === hoveredId ||
          typeof node.x !== 'number' ||
          typeof node.y !== 'number'
        ) {
          continue;
        }

        const dx = node.x - hoveredNode.x;
        const dy = node.y - hoveredNode.y;
        const distance = Math.hypot(dx, dy);
        const effectRadius = 140 + nodeRadius(node.__degree ?? 0) * 6;
        if (distance === 0 || distance > effectRadius) {
          continue;
        }

        const unitX = dx / distance;
        const unitY = dy / distance;
        const impulse = (1 - distance / effectRadius) * alpha * 18;
        node.vx = (node.vx ?? 0) + unitX * impulse;
        node.vy = (node.vy ?? 0) + unitY * impulse;
      }

      hoveredNode.vx = 0;
      hoveredNode.vy = 0;
    }) as ((alpha: number) => void) & { initialize?: (nodes: IForceNode[]) => void };

    force.initialize = (nodes: IForceNode[]) => {
      simulationNodes = nodes;
    };

    return force;
  }, []);

  const spacingForce = React.useMemo(() => {
    let simulationNodes: IForceNode[] = [];

    const force = ((alpha: number) => {
      for (let index = 0; index < simulationNodes.length; index += 1) {
        const currentNode = simulationNodes[index];
        if (currentNode === undefined) {
          continue;
        }
        if (typeof currentNode.x !== 'number' || typeof currentNode.y !== 'number') {
          continue;
        }

        for (let innerIndex = index + 1; innerIndex < simulationNodes.length; innerIndex += 1) {
          const otherNode = simulationNodes[innerIndex];
          if (otherNode === undefined) {
            continue;
          }
          if (typeof otherNode.x !== 'number' || typeof otherNode.y !== 'number') {
            continue;
          }

          const dx = otherNode.x - currentNode.x;
          const dy = otherNode.y - currentNode.y;
          const distance = Math.hypot(dx, dy) || 0.001;
          const baseSpacing =
            nodeRadius(currentNode.__degree ?? 0) + nodeRadius(otherNode.__degree ?? 0);
          const labelPadding = nodes.length > 220 ? 64 : nodes.length > 120 ? 48 : 32;
          const minDistance = baseSpacing + labelPadding;
          if (distance >= minDistance) {
            continue;
          }

          const overlap = (minDistance - distance) / minDistance;
          const unitX = dx / distance;
          const unitY = dy / distance;
          const impulse = overlap * alpha * 28;

          currentNode.vx = (currentNode.vx ?? 0) - unitX * impulse;
          currentNode.vy = (currentNode.vy ?? 0) - unitY * impulse;
          otherNode.vx = (otherNode.vx ?? 0) + unitX * impulse;
          otherNode.vy = (otherNode.vy ?? 0) + unitY * impulse;
        }
      }
    }) as ((alpha: number) => void) & { initialize?: (nodes: IForceNode[]) => void };

    force.initialize = (nodes: IForceNode[]) => {
      simulationNodes = nodes;
    };

    return force;
  }, [nodes.length]);

  React.useEffect(() => {
    const graph = graphRef.current;
    if (graph === undefined) {
      return;
    }

    graph.d3Force?.('hover-repel', hoverRepelForce);
    graph.d3Force?.('spacing', spacingForce);
    graph
      .d3Force?.('charge')
      ?.strength?.(nodes.length > 220 ? -460 : nodes.length > 120 ? -360 : nodes.length > 60 ? -240 : -170);
    graph.d3ReheatSimulation?.();
  }, [hoverRepelForce, spacingForce, nodes.length]);

  React.useEffect(() => {
    const basePositions = basePositionMapRef.current;
    const focusNode =
      interactionFocusId !== null
        ? forceNodes.find((node) => node.id === interactionFocusId)
        : undefined;
    const focusAnchor =
      interactionFocusId !== null ? basePositions.get(interactionFocusId) : undefined;
    const selectedFocusActive =
      selectedNodeId !== null &&
      interactionFocusId !== null &&
      interactionFocusId === selectedNodeId;

    for (const node of forceNodes) {
      const basePosition = basePositions.get(node.id);
      if (basePosition === undefined) {
        continue;
      }

      if (focusNode === undefined || focusAnchor === undefined) {
        node.fx = basePosition.x;
        node.fy = basePosition.y;
        continue;
      }

      if (node.id === focusNode.id) {
        node.fx = focusAnchor.x;
        node.fy = focusAnchor.y;
        node.vx = 0;
        node.vy = 0;
        continue;
      }

      const dx = basePosition.x - focusAnchor.x;
      const dy = basePosition.y - focusAnchor.y;
      const distance = Math.hypot(dx, dy) || 0.001;
      const effectRadius =
        (selectedFocusActive ? 420 : 320) + nodeRadius(node.__degree ?? 0) * 8;

      if (distance > effectRadius) {
        node.fx = basePosition.x;
        node.fy = basePosition.y;
        continue;
      }

      const unitX = dx / distance;
      const unitY = dy / distance;
      const push = (1 - distance / effectRadius) * (selectedFocusActive ? 160 : 104);
      node.fx = basePosition.x + unitX * push;
      node.fy = basePosition.y + unitY * push;
      node.vx = (node.vx ?? 0) + unitX * (selectedFocusActive ? 4.5 : 2.8);
      node.vy = (node.vy ?? 0) + unitY * (selectedFocusActive ? 4.5 : 2.8);
    }

    graphRef.current?.d3ReheatSimulation?.();
  }, [forceNodes, interactionFocusId, selectedNodeId]);

  const nodeCanvasObject = React.useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as IForceNode;
      const masteryVal: number | undefined = masteryMap[n.id];
      const isFocusNode = n.id === interactionFocusId;
      const shouldShowLabel =
        !isFocusNode &&
        (showLabels ||
          n.id === selectedNodeId ||
          n.id === hoveredNodeId ||
          highlightedNodeIds.has(n.id) ||
          recentNodeIds.has(n.id));
      drawNode({
        node: n,
        ctx,
        globalScale,
        isSelected: n.id === selectedNodeId,
        isHovered: n.id === hoveredNodeId,
        showLabel: shouldShowLabel,
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
    [
      selectedNodeId,
      hoveredNodeId,
      masteryMap,
      recentNodeIds,
      highlightedNodeIds,
      showLabels,
      interactionFocusId,
    ]
  );

  const nodePointerAreaPaint = React.useCallback(
    (node: any, color: string, ctx: CanvasRenderingContext2D) => {
      const n = node as IForceNode;
      const r = Math.max(nodeRadius(n.__degree ?? 0) + 12, 20);
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
        ref: graphRef,
        width: dimensions.width,
        height: dimensions.height,
        graphData,
        nodeId: 'id',
        linkSource: 'source',
        linkTarget: 'target',
        nodeCanvasObject,
        nodePointerAreaPaint,
        linkCanvasObject,
        onRenderFramePost: (ctx: CanvasRenderingContext2D, globalScale: number) => {
          if (interactionFocusId === null) {
            return;
          }

          const focusNode = forceNodes.find((node) => node.id === interactionFocusId);
          if (
            focusNode === undefined ||
            typeof focusNode.x !== 'number' ||
            typeof focusNode.y !== 'number'
          ) {
            return;
          }

          const radius =
            nodeRadius(focusNode.__degree ?? 0) *
            (focusNode.id === selectedNodeId ? 1.35 : 1);
          const fontSize = Math.max(9, 12 / globalScale);
          const labelX = focusNode.x;
          const labelY = focusNode.y + radius + fontSize;

          ctx.save();
          ctx.font = `${String(fontSize)}px sans-serif`;
          const measuredWidth = ctx.measureText(focusNode.label).width;
          const paddingX = 8 / globalScale;
          const paddingY = 5 / globalScale;

          ctx.fillStyle = 'rgba(10, 10, 18, 0.88)';
          ctx.beginPath();
          ctx.roundRect(
            labelX - measuredWidth / 2 - paddingX,
            labelY - fontSize / 2 - paddingY,
            measuredWidth + paddingX * 2,
            fontSize + paddingY * 2,
            8 / globalScale
          );
          ctx.fill();

          ctx.fillStyle = '#f8fafc';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(focusNode.label, labelX, labelY);
          ctx.restore();
        },
        onNodeClick: handleNodeClick,
        onNodeHover: handleNodeHover,
        onNodeRightClick: handleNodeRightClick,
        onBackgroundClick,
        backgroundColor: '#0a0a12',
        dagMode:
          layoutMode === 'hierarchical' ? 'td' : layoutMode === 'radial' ? 'radialout' : undefined,
        dagLevelDistance: layoutMode === 'hierarchical' ? 80 : undefined,
        cooldownTicks: layoutMode === 'force' ? 260 : 80,
        d3AlphaDecay: layoutMode === 'radial' ? 0.05 : 0.03,
        d3VelocityDecay: 0.22,
        enableNodeDrag: false,
        onEngineStop: () => {
          if (layoutMode === 'force' && interactionFocusId === null) {
            const nextBasePositions = new Map<string, { x: number; y: number }>();
            for (const node of forceNodes) {
              if (typeof node.x === 'number' && typeof node.y === 'number') {
                nextBasePositions.set(node.id, { x: node.x, y: node.y });
                node.fx = node.x;
                node.fy = node.y;
              }
            }
            if (nextBasePositions.size > 0) {
              basePositionMapRef.current = nextBasePositions;
            }
          }
          emitPositionSnapshot();
        },
      })}
    </div>
  );
}
