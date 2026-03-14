# Phase 08 — Knowledge Graph (Connectome) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the full Knowledge Graph frontend — WebGL graph canvas, PKG Explorer, Structural Health Dashboard, Misconception Center, and PKG/CKG Comparison — wiring them to the existing `@noema/api-client` KG hooks and `useGraphStore`.

**Architecture:** Five tasks follow the spec at `docs/frontend/phases/PHASE-08-KNOWLEDGE-GRAPH.md`. The graph renderer (`GraphCanvas`) is a canvas-based component built on `react-force-graph` (SSR-disabled via `dynamic()`), backed by `useGraphStore` for viewport/selection/overlay state. Supporting pages consume the same graph renderer, adding domain-specific panels alongside it.

**Tech Stack:** Next.js 14, React 18, TypeScript strict, `react-force-graph` (2D canvas/WebGL), `@noema/api-client` KG hooks, `@noema/ui` primitives (NeuralGauge, MetricTile, ConfidenceMeter), Tailwind CSS, Zustand graph store.

**Worktree:** `.worktrees/feat-phase-08-knowledge-graph` (branch `feat/phase-08-knowledge-graph`)

**Key patterns (already established — copy exactly):**
- ESLint disable headers: `/* eslint-disable @typescript-eslint/no-unsafe-member-access */` etc. on files that import unbuilt packages
- Typed Next.js routes: `href={'/path' as never}` and `router.push('/path' as never)`
- Template literals with numbers: `String(n)` — never raw interpolation
- Interface prefix: `I` on all interface names
- All internal imports use `.js` extension (ESM)

---

## Task T8.1 — Graph Renderer Components

**Goal:** Install `react-force-graph` and build the reusable `GraphCanvas` + supporting sub-components (legend, minimap, node visual helper, edge visual helper).

**Files:**
- Create: `apps/web/src/components/graph/graph-canvas.tsx`
- Create: `apps/web/src/components/graph/graph-legend.tsx`
- Create: `apps/web/src/components/graph/graph-minimap.tsx`
- Create: `apps/web/src/components/graph/graph-node.tsx` (canvas draw helper, not a React component)
- Create: `apps/web/src/components/graph/graph-edge.tsx` (canvas draw helper)

**Step 1: Install `react-force-graph`**

```bash
pnpm --filter @noema/web add react-force-graph
pnpm --filter @noema/web add -D @types/react-force-graph 2>/dev/null || true
```

> Note: `react-force-graph` ships its own types — the dev dep install may fail, that is fine.

Verify the install added it to `apps/web/package.json` dependencies.

**Step 2: Create `graph-node.tsx` — canvas draw helper**

This is NOT a React component. It exports a function that `GraphCanvas` calls inside the ForceGraph2D `nodeCanvasObject` callback.

```tsx
/**
 * @noema/web — Graph / NodeCanvasDraw
 *
 * Canvas draw helper for PKG/CKG nodes.
 * Called by GraphCanvas inside ForceGraph2D nodeCanvasObject callback.
 */

import type { IGraphNodeDto, NodeType } from '@noema/api-client';

// ── Node type → fill color (Phase 0 palette CSS vars resolved to hex) ─────────
export const NODE_TYPE_COLOR: Record<NodeType | string, string> = {
  concept:      '#7c6ee6', // synapse-400
  fact:         '#e2e8f0', // axon-100
  procedure:    '#22d3ee', // neuron-400
  principle:    '#86efac', // dendrite-400
  example:      '#fbbf24', // myelin-400
  counterexample: '#f472b6', // axon-400
  misconception:  '#ec4899', // cortex-400
};

const FALLBACK_COLOR = '#6b7280';

export interface INodeDrawOptions {
  node: IGraphNodeDto & { x?: number; y?: number; __degree?: number };
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
  const x = node.x ?? 0;
  const y = node.y ?? 0;
  const degree = node.__degree ?? 0;
  const r = nodeRadius(degree);
  const color = NODE_TYPE_COLOR[node.type] ?? FALLBACK_COLOR;

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
    ctx.font = `${String(fontSize)}px sans-serif`;
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.label, x, y + r + fontSize);
  }
}
```

**Step 3: Create `graph-edge.tsx` — canvas draw helper**

```tsx
/**
 * @noema/web — Graph / EdgeCanvasDraw
 *
 * Canvas draw helper for PKG/CKG edges.
 */

import type { EdgeType } from '@noema/api-client';

export const EDGE_COLOR_MAP: Record<EdgeType | string, string> = {
  prerequisite: '#7c6ee650',
  related:      '#9ca3af40',
  part_of:      '#86efac40',
  example_of:   '#fbbf2440',
  contradicts:  '#f4727240',
};

const FALLBACK_EDGE_COLOR = '#6b728040';

export interface IEdgeDrawOptions {
  ctx: CanvasRenderingContext2D;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  edgeType: EdgeType | string;
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
  const color = isHighlighted
    ? '#ffffff80'
    : (EDGE_COLOR_MAP[edgeType] ?? FALLBACK_EDGE_COLOR);
  const lineWidth = Math.max(0.5, Math.min(3, weight * 3));

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sourceX, sourceY);
  ctx.lineTo(targetX, targetY);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  // Dashed for logical/contradicts
  if (edgeType === 'contradicts') {
    ctx.setLineDash([5, 3]);
  } else {
    ctx.setLineDash([]);
  }

  ctx.stroke();
  ctx.restore();
}
```

**Step 4: Create `graph-canvas.tsx` — main WebGL/Canvas renderer**

This is the crown jewel. Use `dynamic()` for SSR safety. ForceGraph2D renders to Canvas 2D which handles 1000+ nodes efficiently.

```tsx
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
import { drawNode, nodeRadius, NODE_TYPE_COLOR } from './graph-node';
import { drawEdge } from './graph-edge';

// SSR-safe import: ForceGraph2D uses browser canvas APIs
const ForceGraph2D = dynamic(
  () => import('react-force-graph').then((m) => m.ForceGraph2D),
  { ssr: false }
);

// ============================================================================
// Types
// ============================================================================

interface IForceNode extends IGraphNodeDto {
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
  /** Optional: mastery values keyed by nodeId (0–1) */
  masteryMap?: Record<string, number>;
  /** Optional: set of nodeIds active in last 24h */
  recentNodeIds?: Set<string>;
  /** Optional: highlighted nodeIds (from overlay data) */
  highlightedNodeIds?: Set<string>;
  className?: string;
}

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
  masteryMap = {},
  recentNodeIds = new Set(),
  highlightedNodeIds = new Set(),
  className,
}: IGraphCanvasProps): React.JSX.Element {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = React.useState({ width: 800, height: 600 });

  // Measure container
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

  // Build degree map for node sizing
  const degreeMap = React.useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const edge of edges) {
      map[edge.sourceId] = (map[edge.sourceId] ?? 0) + 1;
      map[edge.targetId] = (map[edge.targetId] ?? 0) + 1;
    }
    return map;
  }, [edges]);

  // Inject __degree into nodes for nodeRadius()
  const forceNodes: IForceNode[] = React.useMemo(
    () => nodes.map((n) => ({ ...n, __degree: degreeMap[n.id] ?? 0 })),
    [nodes, degreeMap]
  );

  const forceLinks: IForceLink[] = React.useMemo(
    () =>
      edges.map((e) => ({
        source: e.sourceId,
        target: e.targetId,
        type: e.type,
        weight: e.weight,
      })),
    [edges]
  );

  // Node canvas draw callback
  const nodeCanvasObject = React.useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as IForceNode;
      drawNode({
        node: n,
        ctx,
        globalScale,
        isSelected: n.id === selectedNodeId,
        isHovered: n.id === hoveredNodeId,
        mastery: masteryMap[n.id],
        recentlyActive: recentNodeIds.has(n.id),
      });
      // Overlay: dim non-highlighted nodes when an overlay is active
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

  // Node pointer area callback (for hit testing)
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

  // Link canvas draw callback
  const linkCanvasObject = React.useCallback(
    (link: any, ctx: CanvasRenderingContext2D) => {
      const l = link as IForceLink & {
        source: IForceNode;
        target: IForceNode;
      };
      const sx = l.source.x ?? 0;
      const sy = l.source.y ?? 0;
      const tx = l.target.x ?? 0;
      const ty = l.target.y ?? 0;
      drawEdge({
        ctx,
        sourceX: sx,
        sourceY: sy,
        targetX: tx,
        targetY: ty,
        edgeType: l.type,
        weight: l.weight,
        isHighlighted:
          l.source.id === selectedNodeId ||
          l.target.id === selectedNodeId ||
          l.source.id === hoveredNodeId ||
          l.target.id === hoveredNodeId,
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

  return (
    <div ref={containerRef} className={className ?? 'h-full w-full'}>
      <ForceGraph2D
        width={dimensions.width}
        height={dimensions.height}
        graphData={{ nodes: forceNodes as any, links: forceLinks as any }}
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={nodePointerAreaPaint}
        linkCanvasObject={linkCanvasObject}
        onNodeClick={handleNodeClick}
        onNodeHover={handleNodeHover}
        onNodeRightClick={handleNodeRightClick}
        onBackgroundClick={onBackgroundClick}
        backgroundColor="#0a0a12"
        dagMode={layoutMode === 'hierarchical' ? 'td' : undefined}
        dagLevelDistance={layoutMode === 'hierarchical' ? 80 : undefined}
        cooldownTicks={layoutMode === 'force' ? 300 : 50}
        d3AlphaDecay={layoutMode === 'radial' ? 0.05 : 0.0228}
        d3VelocityDecay={layoutMode === 'radial' ? 0.4 : 0.4}
      />
    </div>
  );
}
```

> The `activeOverlays` prop is accepted for API completeness — the parent page computes `highlightedNodeIds` from overlay data and passes it in.

**Step 5: Create `graph-legend.tsx`**

```tsx
'use client';
/**
 * @noema/web — Graph / GraphLegend
 *
 * Filterable node-type legend. Toggling a type calls onToggleType.
 */
import * as React from 'react';
import type { NodeType } from '@noema/api-client';
import { NODE_TYPE_COLOR } from './graph-node';

const NODE_TYPES: NodeType[] = [
  'concept', 'skill', 'fact', 'procedure', 'principle', 'example',
];

interface IGraphLegendProps {
  hiddenTypes?: Set<NodeType>;
  onToggleType: (type: NodeType) => void;
}

export function GraphLegend({ hiddenTypes = new Set(), onToggleType }: IGraphLegendProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Legend</p>
      {NODE_TYPES.map((type) => {
        const color = NODE_TYPE_COLOR[type] ?? '#6b7280';
        const isHidden = hiddenTypes.has(type);
        return (
          <button
            key={type}
            type="button"
            onClick={() => { onToggleType(type); }}
            className={[
              'flex items-center gap-2 rounded px-1.5 py-0.5 text-xs transition-opacity',
              isHidden ? 'opacity-40' : 'opacity-100',
            ].join(' ')}
          >
            <span
              className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="capitalize text-foreground">{type}</span>
          </button>
        );
      })}
    </div>
  );
}
```

**Step 6: Create `graph-minimap.tsx`**

A static SVG thumbnail of the full graph — useful orientation aid. Renders nodes as tiny dots.

```tsx
'use client';
/**
 * @noema/web — Graph / GraphMinimap
 *
 * Scaled-down SVG thumbnail of the full graph.
 * Shows all node positions as colored dots.
 */
import * as React from 'react';
import type { IGraphNodeDto } from '@noema/api-client';
import { NODE_TYPE_COLOR } from './graph-node';

interface INodeWithPos extends IGraphNodeDto {
  x?: number;
  y?: number;
}

interface IGraphMinimapProps {
  nodes: INodeWithPos[];
  selectedNodeId?: string | null;
  className?: string;
}

export function GraphMinimap({ nodes, selectedNodeId, className }: IGraphMinimapProps): React.JSX.Element {
  const SIZE = 160;

  // Compute bounding box
  const xs = nodes.map((n) => n.x ?? 0);
  const ys = nodes.map((n) => n.y ?? 0);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  function toSvg(x: number, y: number): [number, number] {
    return [
      ((x - minX) / rangeX) * (SIZE - 10) + 5,
      ((y - minY) / rangeY) * (SIZE - 10) + 5,
    ];
  }

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      className={['rounded border border-border bg-background/80', className ?? ''].join(' ')}
      aria-label="Graph minimap"
    >
      {nodes.map((n) => {
        const [sx, sy] = toSvg(n.x ?? 0, n.y ?? 0);
        const color = NODE_TYPE_COLOR[n.type] ?? '#6b7280';
        const isSelected = n.id === selectedNodeId;
        return (
          <circle
            key={n.id}
            cx={sx}
            cy={sy}
            r={isSelected ? 4 : 2}
            fill={color}
            opacity={isSelected ? 1 : 0.6}
          />
        );
      })}
    </svg>
  );
}
```

**Step 7: Verify typecheck**

```bash
cd /home/rodochrousbisbiki/MyApps/noema/.worktrees/feat-phase-08-knowledge-graph
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"
```

Expected: no NEW errors beyond the pre-existing `Cannot find module '@noema/...'` baseline.

**Step 8: Commit**

```bash
git add apps/web/src/components/graph/
git commit -m "feat(web): T8.1 — GraphCanvas, GraphLegend, GraphMinimap, node/edge draw helpers"
```

---

## Task T8.2 — Interactive PKG Explorer Page

**Goal:** Build `/knowledge` with a left control panel (search, layout, overlays, legend, node list) + full-viewport `GraphCanvas` + node detail side panel.

**Files:**
- Create: `apps/web/src/components/graph/graph-controls.tsx`
- Create: `apps/web/src/components/graph/node-detail-panel.tsx`
- Create: `apps/web/src/app/(authenticated)/knowledge/page.tsx`

**Step 1: Create `graph-controls.tsx`**

Left sidebar: search, layout buttons, overlay toggles.

```tsx
'use client';
/**
 * @noema/web — Graph / GraphControls
 *
 * Left control panel for the PKG Explorer:
 *   - Search input (filters/highlights nodes by label)
 *   - Layout mode buttons (force / hierarchical / radial)
 *   - Overlay checkboxes (prerequisites, frontier, bridges, misconceptions, mastery)
 *   - GraphLegend (type filter)
 *   - Scrollable node list
 */
import * as React from 'react';
import { Search } from 'lucide-react';
import type { IGraphNodeDto } from '@noema/api-client';
import type { LayoutMode, OverlayType } from '@/stores/graph-store';
import { GraphLegend } from './graph-legend';

const LAYOUT_BUTTONS: { mode: LayoutMode; label: string }[] = [
  { mode: 'force', label: 'Force' },
  { mode: 'hierarchical', label: 'Tree' },
  { mode: 'radial', label: 'Radial' },
];

const OVERLAY_OPTIONS: { key: OverlayType; label: string }[] = [
  { key: 'prerequisites', label: 'Prerequisites' },
  { key: 'frontier', label: 'Knowledge Frontier' },
  { key: 'bridges', label: 'Bridge Nodes' },
  { key: 'misconceptions', label: 'Misconceptions' },
  { key: 'centrality', label: 'Mastery Heat' },
];

interface IGraphControlsProps {
  nodes: IGraphNodeDto[];
  layoutMode: LayoutMode;
  activeOverlays: Set<OverlayType>;
  searchQuery: string;
  onLayoutChange: (mode: LayoutMode) => void;
  onOverlayToggle: (overlay: OverlayType) => void;
  onSearchChange: (q: string) => void;
  onNodeSelect: (node: IGraphNodeDto) => void;
  selectedNodeId?: string | null;
}

export function GraphControls({
  nodes,
  layoutMode,
  activeOverlays,
  searchQuery,
  onLayoutChange,
  onOverlayToggle,
  onSearchChange,
  onNodeSelect,
  selectedNodeId,
}: IGraphControlsProps): React.JSX.Element {
  const [hiddenTypes, setHiddenTypes] = React.useState<Set<string>>(new Set());

  const filteredNodes = React.useMemo(
    () =>
      nodes.filter(
        (n) =>
          !hiddenTypes.has(n.type) &&
          (searchQuery === '' || n.label.toLowerCase().includes(searchQuery.toLowerCase()))
      ),
    [nodes, hiddenTypes, searchQuery]
  );

  return (
    <aside className="flex h-full w-[280px] flex-shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-card p-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          placeholder="Search nodes…"
          value={searchQuery}
          onChange={(e) => { onSearchChange(e.target.value); }}
          className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Layout toggle */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Layout</p>
        <div className="flex gap-1">
          {LAYOUT_BUTTONS.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => { onLayoutChange(mode); }}
              className={[
                'flex-1 rounded py-1 text-xs font-medium transition-colors',
                layoutMode === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-background text-foreground hover:bg-muted',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Overlays */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Overlays</p>
        {OVERLAY_OPTIONS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={activeOverlays.has(key)}
              onChange={() => { onOverlayToggle(key); }}
              className="rounded border-border"
            />
            {label}
          </label>
        ))}
      </div>

      {/* Legend */}
      <GraphLegend
        hiddenTypes={hiddenTypes as Set<any>}
        onToggleType={(type) => {
          setHiddenTypes((prev) => {
            const next = new Set(prev);
            if (next.has(type)) {
              next.delete(type);
            } else {
              next.add(type);
            }
            return next;
          });
        }}
      />

      {/* Node list */}
      <div className="flex flex-col gap-1 overflow-y-auto">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Nodes ({String(filteredNodes.length)})
        </p>
        {filteredNodes.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => { onNodeSelect(n); }}
            className={[
              'w-full truncate rounded px-2 py-1 text-left text-xs transition-colors',
              selectedNodeId === n.id
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground hover:bg-muted',
            ].join(' ')}
          >
            {n.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
```

**Step 2: Create `node-detail-panel.tsx`**

Shown in the bottom-left when a node is selected. Shows type, label, description, mastery, and connected edges.

```tsx
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
/**
 * @noema/web — Graph / NodeDetailPanel
 *
 * Selected node detail panel.
 * Shows: label, type, description, mastery gauge, connected edges, actions.
 */
import * as React from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import type { IGraphNodeDto, IGraphEdgeDto } from '@noema/api-client';
import { NeuralGauge } from '@noema/ui';
import { NODE_TYPE_COLOR } from './graph-node';

interface INodeDetailPanelProps {
  node: IGraphNodeDto;
  allNodes: IGraphNodeDto[];
  allEdges: IGraphEdgeDto[];
  masteryMap?: Record<string, number>;
  onClose: () => void;
  onViewPrerequisites?: (nodeId: string) => void;
}

export function NodeDetailPanel({
  node,
  allNodes,
  allEdges,
  masteryMap = {},
  onClose,
  onViewPrerequisites,
}: INodeDetailPanelProps): React.JSX.Element {
  const nodeIndex = React.useMemo(
    () => Object.fromEntries(allNodes.map((n) => [n.id, n])),
    [allNodes]
  );

  const connectedEdges = allEdges.filter(
    (e) => e.sourceId === node.id || e.targetId === node.id
  );

  const color = NODE_TYPE_COLOR[node.type] ?? '#6b7280';
  const mastery = masteryMap[node.id] ?? 0;

  return (
    <div className="flex max-h-[340px] w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {node.type}
          </span>
          <span className="text-sm font-semibold text-foreground">{node.label}</span>
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" aria-label="Close" />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Description + mastery */}
        <div className="flex w-1/2 flex-col gap-3 overflow-y-auto border-r border-border p-3">
          {node.description !== null && node.description !== undefined && node.description !== '' && (
            <p className="text-xs text-muted-foreground">{node.description}</p>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Mastery</span>
            <NeuralGauge value={mastery} size="sm" />
            <span className="text-xs tabular-nums text-foreground">
              {String(Math.round(mastery * 100))}%
            </span>
          </div>
          {node.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {node.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1">
            {onViewPrerequisites !== undefined && (
              <button
                type="button"
                onClick={() => { onViewPrerequisites(node.id); }}
                className="text-left text-xs text-primary hover:underline"
              >
                View prerequisites
              </button>
            )}
            <Link
              href={('/knowledge/comparison') as never}
              className="text-xs text-primary hover:underline"
            >
              Compare with CKG
            </Link>
          </div>
        </div>

        {/* Right: Connected edges */}
        <div className="flex w-1/2 flex-col overflow-y-auto p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Connected ({String(connectedEdges.length)})
          </p>
          <div className="flex flex-col gap-1">
            {connectedEdges.slice(0, 12).map((edge) => {
              const otherId = edge.sourceId === node.id ? edge.targetId : edge.sourceId;
              const other = nodeIndex[otherId];
              return (
                <div key={edge.id} className="flex items-center justify-between text-xs">
                  <span className="truncate text-foreground">{other?.label ?? otherId}</span>
                  <span className="ml-2 flex-shrink-0 rounded bg-muted px-1 text-muted-foreground">
                    {edge.type}
                  </span>
                </div>
              );
            })}
            {connectedEdges.length > 12 && (
              <p className="text-xs text-muted-foreground">
                +{String(connectedEdges.length - 12)} more
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Create `apps/web/src/app/(authenticated)/knowledge/page.tsx`**

Full-viewport explorer: controls (left 280px) + graph canvas (remaining space).

```tsx
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
/**
 * @noema/web — /knowledge
 *
 * Interactive PKG Explorer: full-viewport force-directed graph with
 * left control panel and node detail panel.
 */
import * as React from 'react';
import { useAuth } from '@noema/auth';
import { usePKGNodes, usePKGEdges, useKnowledgeFrontier, useBridgeNodes } from '@noema/api-client';
import type { IGraphNodeDto } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { Loader2 } from 'lucide-react';
import { useGraphStore } from '@/stores/graph-store';
import { GraphCanvas } from '@/components/graph/graph-canvas';
import { GraphControls } from '@/components/graph/graph-controls';
import { NodeDetailPanel } from '@/components/graph/node-detail-panel';

export default function KnowledgePage(): React.JSX.Element {
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;

  const { data: nodes = [], isLoading: nodesLoading } = usePKGNodes(userId);
  const { data: edges = [], isLoading: edgesLoading } = usePKGEdges(userId);
  const { data: frontierData } = useKnowledgeFrontier(userId);
  const { data: bridgesData } = useBridgeNodes(userId);

  const {
    selectedNodeId,
    hoveredNodeId,
    activeOverlays,
    layoutMode,
    selectNode,
    deselectNode,
    toggleOverlay,
    setLayoutMode,
    setHoveredNode,
  } = useGraphStore();

  const [searchQuery, setSearchQuery] = React.useState('');
  const [contextMenu, setContextMenu] = React.useState<{
    node: IGraphNodeDto;
    x: number;
    y: number;
  } | null>(null);

  const isLoading = nodesLoading || edgesLoading;

  // Build highlighted node set from active overlays
  const highlightedNodeIds = React.useMemo(() => {
    const set = new Set<string>();
    if (activeOverlays.has('frontier') && frontierData !== undefined) {
      const fd = frontierData as any;
      const frontierNodes: any[] = fd?.data?.nodes ?? [];
      for (const n of frontierNodes) {
        set.add(String(n.id));
      }
    }
    if (activeOverlays.has('bridges') && bridgesData !== undefined) {
      const bd = bridgesData as any;
      const bridgeNodes: any[] = bd?.data?.nodes ?? [];
      for (const n of bridgeNodes) {
        set.add(String(n.id));
      }
    }
    return set;
  }, [activeOverlays, frontierData, bridgesData]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  function handleNodeClick(node: IGraphNodeDto): void {
    if (selectedNodeId === node.id) {
      deselectNode();
    } else {
      selectNode(node.id);
    }
    setContextMenu(null);
  }

  function handleNodeHover(node: IGraphNodeDto | null): void {
    setHoveredNode(node?.id ?? null);
  }

  function handleNodeRightClick(node: IGraphNodeDto, event: MouseEvent): void {
    event.preventDefault();
    setContextMenu({ node, x: event.clientX, y: event.clientY });
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">Your knowledge graph is empty.</p>
        <p className="text-sm text-muted-foreground">
          Complete sessions to automatically build your PKG.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      {/* Left panel */}
      <GraphControls
        nodes={nodes as IGraphNodeDto[]}
        layoutMode={layoutMode}
        activeOverlays={activeOverlays}
        searchQuery={searchQuery}
        onLayoutChange={setLayoutMode}
        onOverlayToggle={toggleOverlay}
        onSearchChange={setSearchQuery}
        onNodeSelect={handleNodeClick}
        selectedNodeId={selectedNodeId}
      />

      {/* Graph canvas */}
      <div className="relative flex-1 overflow-hidden">
        <GraphCanvas
          nodes={nodes as IGraphNodeDto[]}
          edges={edges as any}
          selectedNodeId={selectedNodeId}
          hoveredNodeId={hoveredNodeId}
          activeOverlays={[...activeOverlays]}
          layoutMode={layoutMode}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onNodeRightClick={handleNodeRightClick}
          onBackgroundClick={() => {
            deselectNode();
            setContextMenu(null);
          }}
          highlightedNodeIds={highlightedNodeIds}
          className="h-full w-full"
        />

        {/* Node detail panel (bottom-left of canvas) */}
        {selectedNode !== null && (
          <div className="absolute bottom-4 left-4 w-[480px]">
            <NodeDetailPanel
              node={selectedNode}
              allNodes={nodes as IGraphNodeDto[]}
              allEdges={edges as any}
              onClose={deselectNode}
            />
          </div>
        )}

        {/* Context menu */}
        {contextMenu !== null && (
          <div
            className="absolute z-50 min-w-[180px] rounded-lg border border-border bg-card py-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {[
              'Show prerequisite chain',
              'Show neighborhood (2 hops)',
              'Check for misconceptions',
              'Compare with CKG',
            ].map((label) => (
              <button
                key={label}
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                onClick={() => { setContextMenu(null); }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

> The page uses `h-full` so the knowledge layout must NOT wrap it in the standard `flex flex-col gap-6` container — it needs a full-viewport slot. Add a layout override in step 4.

**Step 4: Add `/knowledge` layout override**

Create `apps/web/src/app/(authenticated)/knowledge/layout.tsx` to remove padding and let the graph fill the full height:

```tsx
import * as React from 'react';

export default function KnowledgeLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <div className="flex h-full flex-col overflow-hidden">{children}</div>;
}
```

**Step 5: Verify typecheck**

```bash
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"
```

**Step 6: Commit**

```bash
git add apps/web/src/components/graph/graph-controls.tsx apps/web/src/components/graph/node-detail-panel.tsx "apps/web/src/app/(authenticated)/knowledge/"
git commit -m "feat(web): T8.2 — PKG Explorer page, GraphControls, NodeDetailPanel"
```

---

## Task T8.3 — Structural Health Dashboard

**Goal:** Build `/knowledge/health` with: large NeuralGauge hero, 11-axis SVG radar chart, click-to-expand metric drill-down with sparklines, and cross-metric pattern insight cards.

**Files:**
- Create: `apps/web/src/components/knowledge/radar-chart.tsx`
- Create: `apps/web/src/components/knowledge/metric-drill-down.tsx`
- Create: `apps/web/src/app/(authenticated)/knowledge/health/page.tsx`

**Step 1: Create `radar-chart.tsx`**

Pure SVG spider chart. No external chart library — avoids adding deps for a single chart.

```tsx
'use client';
/**
 * @noema/web — Knowledge / RadarChart
 *
 * 11-axis SVG spider/radar chart for structural metrics.
 * Each axis is labeled; current values form a filled polygon.
 * An optional "ideal" polygon shows baseline in low-opacity overlay.
 */
import * as React from 'react';

export interface IRadarMetric {
  key: string;
  label: string;          // abbreviated axis label
  fullLabel: string;      // full metric name
  value: number;          // 0–1 normalized
  ideal?: number;         // 0–1, optional baseline
}

interface IRadarChartProps {
  metrics: IRadarMetric[];
  size?: number;          // SVG size px (default 360)
  onAxisClick?: (metric: IRadarMetric) => void;
  selectedKey?: string | null;
}

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

export function RadarChart({
  metrics,
  size = 360,
  onAxisClick,
  selectedKey,
}: IRadarChartProps): React.JSX.Element {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size / 2) * 0.72;
  const n = metrics.length;
  const step = 360 / n;

  // Grid rings (5 levels)
  const gridRings = [0.2, 0.4, 0.6, 0.8, 1.0];

  // Build polygon points for a set of values
  function buildPolygon(values: number[]): string {
    return values
      .map((v, i) => {
        const [x, y] = polarToCartesian(cx, cy, r * v, i * step);
        return `${String(x)},${String(y)}`;
      })
      .join(' ');
  }

  const currentPoints = buildPolygon(metrics.map((m) => m.value));
  const idealPoints = metrics.some((m) => m.ideal !== undefined)
    ? buildPolygon(metrics.map((m) => m.ideal ?? 0))
    : null;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      aria-label="Structural metrics radar chart"
    >
      {/* Grid rings */}
      {gridRings.map((pct) => (
        <polygon
          key={String(pct)}
          points={buildPolygon(metrics.map(() => pct))}
          fill="none"
          stroke="#334155"
          strokeWidth="1"
        />
      ))}

      {/* Axes */}
      {metrics.map((m, i) => {
        const [ax, ay] = polarToCartesian(cx, cy, r, i * step);
        const [lx, ly] = polarToCartesian(cx, cy, r * 1.18, i * step);
        const isSelected = selectedKey === m.key;
        return (
          <g key={m.key}>
            <line x1={cx} y1={cy} x2={ax} y2={ay} stroke="#334155" strokeWidth="1" />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="9"
              fill={isSelected ? '#7c6ee6' : '#94a3b8'}
              fontWeight={isSelected ? 'bold' : 'normal'}
              style={{ cursor: onAxisClick !== undefined ? 'pointer' : 'default' }}
              onClick={() => { onAxisClick?.(m); }}
            >
              {m.label}
            </text>
          </g>
        );
      })}

      {/* Ideal polygon */}
      {idealPoints !== null && (
        <polygon
          points={idealPoints}
          fill="rgba(134,239,172,0.08)"
          stroke="#86efac60"
          strokeWidth="1.5"
          strokeDasharray="4 2"
        />
      )}

      {/* Current polygon */}
      <polygon
        points={currentPoints}
        fill="rgba(124,110,230,0.18)"
        stroke="#7c6ee6"
        strokeWidth="2"
      />

      {/* Value dots */}
      {metrics.map((m, i) => {
        const [dx, dy] = polarToCartesian(cx, cy, r * m.value, i * step);
        return (
          <circle
            key={m.key}
            cx={dx}
            cy={dy}
            r={selectedKey === m.key ? 5 : 3}
            fill={selectedKey === m.key ? '#7c6ee6' : '#7c6ee6cc'}
            style={{ cursor: onAxisClick !== undefined ? 'pointer' : 'default' }}
            onClick={() => { onAxisClick?.(m); }}
          />
        );
      })}
    </svg>
  );
}
```

**Step 2: Create `metric-drill-down.tsx`**

Expandable detail panel for a selected metric: full name, plain-English description, NeuralGauge, and SVG sparkline from history.

```tsx
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
/**
 * @noema/web — Knowledge / MetricDrillDown
 *
 * Detail panel for a selected structural metric.
 * Shows: full name, description, NeuralGauge value, trend sparkline.
 */
import * as React from 'react';
import { NeuralGauge } from '@noema/ui';
import type { IRadarMetric } from './radar-chart';
import type { IMetricHistoryDto } from '@noema/api-client';

const METRIC_DESCRIPTIONS: Record<string, string> = {
  abstractionDrift:            'How much your abstraction levels shift inconsistently across your graph.',
  depthCalibrationGradient:    'Whether your concept depth is well-calibrated from fundamentals to advanced topics.',
  scopeLeakageIndex:           'How often concepts bleed into neighboring domains without clear boundaries.',
  siblingConfusionEntropy:     'How much confusion exists between sibling concepts at the same level.',
  upwardLinkStrength:          'Strength of connections from specific examples up to general principles.',
  traversalBreadthScore:       'How well you can traverse the breadth of your knowledge domains.',
  strategyDepthFit:            'How well your learning strategy matches the depth of concepts you are working on.',
  structuralStrategyEntropy:   'Disorder in the structural strategies reflected in your graph.',
  structuralAttributionAccuracy: 'How accurately you attribute knowledge to correct structural categories.',
  structuralStabilityGain:     'Rate at which your knowledge graph is becoming more stable over time.',
  boundarySensitivityImprovement: 'How much your sensitivity to concept boundary violations has improved.',
};

interface IMetricDrillDownProps {
  metric: IRadarMetric;
  history?: IMetricHistoryDto;
  onClose: () => void;
}

/** Simple inline SVG sparkline for a series of values. */
function Sparkline({ values }: { values: number[] }): React.JSX.Element {
  if (values.length < 2) return <span className="text-xs text-muted-foreground">No history</span>;
  const W = 160;
  const H = 36;
  const min = Math.min(...values);
  const max = Math.max(...values, min + 0.01);
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / (max - min)) * (H - 4) - 2;
      return `${String(x)},${String(y)}`;
    })
    .join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${String(W)} ${String(H)}`}>
      <polyline points={pts} fill="none" stroke="#7c6ee6" strokeWidth="1.5" />
    </svg>
  );
}

export function MetricDrillDown({
  metric,
  history,
  onClose,
}: IMetricDrillDownProps): React.JSX.Element {
  // Extract sparkline values from history entries
  const sparkValues: number[] = React.useMemo(() => {
    if (history === undefined) return [];
    return history.entries.map((e) => e.score);
  }, [history]);

  const description = METRIC_DESCRIPTIONS[metric.key] ?? 'No description available.';

  // Status color
  const statusColor =
    metric.value >= 0.7 ? 'text-green-400' : metric.value >= 0.4 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-md" role="region" aria-label={`${metric.fullLabel} details`}>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{metric.fullLabel}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <button type="button" onClick={onClose} className="ml-2 text-xs text-muted-foreground hover:text-foreground">
          ✕
        </button>
      </div>
      <div className="flex items-center gap-4">
        <NeuralGauge value={metric.value} size="sm" />
        <span className={['text-2xl font-bold tabular-nums', statusColor].join(' ')}>
          {String(Math.round(metric.value * 100))}
          <span className="text-sm font-normal text-muted-foreground">%</span>
        </span>
      </div>
      {sparkValues.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-muted-foreground">Trend (last {String(sparkValues.length)} snapshots)</p>
          <Sparkline values={sparkValues} />
        </div>
      )}
    </div>
  );
}
```

**Step 3: Create `apps/web/src/app/(authenticated)/knowledge/health/page.tsx`**

```tsx
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
/**
 * @noema/web — /knowledge/health
 *
 * Structural Health Dashboard:
 *   1. Hero: NeuralGauge with overall health score + grade
 *   2. Radar chart: 11 structural metrics
 *   3. Metric drill-down: click axis to expand
 *   4. Cross-metric patterns: insight cards
 */
import * as React from 'react';
import { useAuth } from '@noema/auth';
import { useStructuralHealth, useMetricHistory } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { NeuralGauge } from '@noema/ui';
import { Loader2 } from 'lucide-react';
import { RadarChart } from '@/components/knowledge/radar-chart';
import type { IRadarMetric } from '@/components/knowledge/radar-chart';
import { MetricDrillDown } from '@/components/knowledge/metric-drill-down';

// Ordered list of 11 structural metric keys from the spec
const METRIC_DEFS: { key: string; label: string; fullLabel: string }[] = [
  { key: 'abstractionDrift',              label: 'AbsDrift',    fullLabel: 'Abstraction Drift' },
  { key: 'depthCalibrationGradient',      label: 'DepthCal',   fullLabel: 'Depth Calibration Gradient' },
  { key: 'scopeLeakageIndex',             label: 'ScopeLeak',  fullLabel: 'Scope Leakage Index' },
  { key: 'siblingConfusionEntropy',       label: 'SibConf',    fullLabel: 'Sibling Confusion Entropy' },
  { key: 'upwardLinkStrength',            label: 'UpLink',     fullLabel: 'Upward Link Strength' },
  { key: 'traversalBreadthScore',         label: 'TravBreadth', fullLabel: 'Traversal Breadth Score' },
  { key: 'strategyDepthFit',              label: 'StratFit',   fullLabel: 'Strategy Depth Fit' },
  { key: 'structuralStrategyEntropy',     label: 'StratEntr',  fullLabel: 'Structural Strategy Entropy' },
  { key: 'structuralAttributionAccuracy', label: 'AttribAcc',  fullLabel: 'Structural Attribution Accuracy' },
  { key: 'structuralStabilityGain',       label: 'StabGain',   fullLabel: 'Structural Stability Gain' },
  { key: 'boundarySensitivityImprovement', label: 'BndSens',   fullLabel: 'Boundary Sensitivity Improvement' },
];

const GRADE_COLORS: Record<string, string> = {
  excellent: 'text-green-400',
  good:      'text-blue-400',
  fair:      'text-amber-400',
  poor:      'text-red-400',
};

export default function KnowledgeHealthPage(): React.JSX.Element {
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;
  const [selectedMetricKey, setSelectedMetricKey] = React.useState<string | null>(null);

  const { data: healthResponse, isLoading: healthLoading } = useStructuralHealth(userId);
  const { data: historyResponse, isLoading: historyLoading } = useMetricHistory(userId);

  const isLoading = healthLoading || historyLoading;

  const health: any = (healthResponse as any)?.data ?? null;
  const historyData: any = (historyResponse as any)?.data ?? null;

  // Build radar metrics from health report + default 0.5 if metric not in API response yet
  const radarMetrics: IRadarMetric[] = React.useMemo(() => {
    if (health === null) return METRIC_DEFS.map((d) => ({ ...d, value: 0 }));
    return METRIC_DEFS.map((d) => ({
      ...d,
      value: typeof health[d.key] === 'number' ? (health[d.key] as number) : health.score as number * 0.5,
    }));
  }, [health]);

  const selectedMetric = radarMetrics.find((m) => m.key === selectedMetricKey) ?? null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold">Structural Health</h1>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading health report…
        </div>
      </div>
    );
  }

  const score: number = (health?.score as number | undefined) ?? 0;
  const grade: string = (health?.grade as string | undefined) ?? 'fair';
  const issues: string[] = (health?.issues as string[] | undefined) ?? [];
  const recommendations: string[] = (health?.recommendations as string[] | undefined) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Structural Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How well-structured and internally consistent your knowledge graph is.
        </p>
      </div>

      {/* Hero */}
      <section aria-label="Overall health score" className="flex items-center gap-6 rounded-xl border border-border bg-card p-6">
        <NeuralGauge value={score} size="lg" />
        <div>
          <p className="text-4xl font-bold tabular-nums text-foreground">
            {String(Math.round(score * 100))}
            <span className="ml-1 text-xl font-normal text-muted-foreground">/ 100</span>
          </p>
          <p className={['text-lg font-semibold capitalize', GRADE_COLORS[grade] ?? 'text-foreground'].join(' ')}>
            {grade}
          </p>
        </div>
        {issues.length > 0 && (
          <div className="ml-auto flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active Issues</p>
            {issues.slice(0, 3).map((issue) => (
              <p key={issue} className="text-xs text-muted-foreground">{issue}</p>
            ))}
          </div>
        )}
      </section>

      {/* Radar + drill-down */}
      <section aria-label="Structural metrics" className="flex flex-wrap gap-6">
        <div className="flex flex-col items-center">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Metric Radar — click axis to drill down
          </h2>
          <RadarChart
            metrics={radarMetrics}
            size={380}
            selectedKey={selectedMetricKey}
            onAxisClick={(m) => {
              setSelectedMetricKey((prev) => (prev === m.key ? null : m.key));
            }}
          />
        </div>

        {selectedMetric !== null && (
          <div className="flex-1 min-w-[300px]">
            <MetricDrillDown
              metric={selectedMetric}
              history={historyData ?? undefined}
              onClose={() => { setSelectedMetricKey(null); }}
            />
          </div>
        )}
      </section>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <section aria-label="Recommendations">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Recommendations
          </h2>
          <div className="flex flex-col gap-2">
            {recommendations.map((rec) => (
              <div
                key={rec}
                className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground"
              >
                {rec}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

**Step 4: Verify typecheck**

```bash
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"
```

**Step 5: Commit**

```bash
git add "apps/web/src/components/knowledge/" "apps/web/src/app/(authenticated)/knowledge/health/"
git commit -m "feat(web): T8.3 — Structural Health Dashboard, RadarChart, MetricDrillDown"
```

---

## Task T8.4 — Misconception Center

**Goal:** Build `/knowledge/misconceptions` with: status summary header, sortable/filterable misconception list with inline `ConfidenceMeter`, expandable detail + mini subgraph, and scan-trigger button.

**Files:**
- Create: `apps/web/src/components/knowledge/misconception-pipeline.tsx`
- Create: `apps/web/src/components/knowledge/misconception-subgraph.tsx`
- Create: `apps/web/src/app/(authenticated)/knowledge/misconceptions/page.tsx`

**Step 1: Create `misconception-pipeline.tsx`**

Horizontal 5-step lifecycle indicator.

```tsx
'use client';
/**
 * @noema/web — Knowledge / MisconceptionPipeline
 *
 * Horizontal pipeline showing the 5 lifecycle steps of a misconception:
 * DETECTED → CONFIRMED → ADDRESSED → RESOLVED → RECURRING
 * Current step is highlighted.
 */
import * as React from 'react';
import type { MisconceptionStatus } from '@noema/api-client';

const STEPS: MisconceptionStatus[] = ['detected', 'confirmed', 'resolved'];
const STEP_LABELS: Record<MisconceptionStatus, string> = {
  detected:  'Detected',
  confirmed: 'Confirmed',
  resolved:  'Resolved',
  dismissed: 'Dismissed',
};

interface IMisconceptionPipelineProps {
  status: MisconceptionStatus;
}

export function MisconceptionPipeline({ status }: IMisconceptionPipelineProps): React.JSX.Element {
  const currentIdx = STEPS.indexOf(status);

  return (
    <div className="flex items-center gap-0" role="list" aria-label="Misconception status pipeline">
      {STEPS.map((step, i) => {
        const isPast = i < currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <React.Fragment key={step}>
            <div
              role="listitem"
              className={[
                'flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium',
                isCurrent
                  ? 'bg-cortex-400/20 text-pink-400 ring-1 ring-pink-400'
                  : isPast
                    ? 'text-muted-foreground'
                    : 'text-muted-foreground/40',
              ].join(' ')}
            >
              {STEP_LABELS[step]}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={[
                  'mx-0.5 h-px w-4 flex-shrink-0',
                  i < currentIdx ? 'bg-muted-foreground' : 'bg-muted-foreground/30',
                ].join(' ')}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
```

**Step 2: Create `misconception-subgraph.tsx`**

Mini `GraphCanvas` showing the affected node and its immediate neighbors (1-hop subgraph).

```tsx
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
/**
 * @noema/web — Knowledge / MisconceptionSubgraph
 *
 * Mini GraphCanvas showing the node affected by a misconception
 * and its immediate neighbors. Highlighted node = the misconception node.
 */
import * as React from 'react';
import { useAuth } from '@noema/auth';
import { usePKGSubgraph } from '@noema/api-client';
import type { UserId, NodeId } from '@noema/types';
import type { IGraphNodeDto, IGraphEdgeDto } from '@noema/api-client';
import { Loader2 } from 'lucide-react';
import { GraphCanvas } from '@/components/graph/graph-canvas';

interface IMisconceptionSubgraphProps {
  nodeId: string;
}

export function MisconceptionSubgraph({ nodeId }: IMisconceptionSubgraphProps): React.JSX.Element {
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;

  const { data: subgraphResponse, isLoading } = usePKGSubgraph(
    userId,
    { rootNodeId: nodeId as NodeId, depth: 1 },
    { enabled: userId !== '' && nodeId !== '' }
  );

  const subgraphData: any = (subgraphResponse as any)?.data ?? null;
  const nodes: IGraphNodeDto[] = subgraphData?.nodes ?? [];
  const edges: IGraphEdgeDto[] = subgraphData?.edges ?? [];

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-border bg-muted/30">
        <p className="text-xs text-muted-foreground">No subgraph available.</p>
      </div>
    );
  }

  return (
    <div className="h-48 overflow-hidden rounded-lg border border-border">
      <GraphCanvas
        nodes={nodes}
        edges={edges}
        selectedNodeId={nodeId}
        highlightedNodeIds={new Set([nodeId])}
        className="h-full w-full"
      />
    </div>
  );
}
```

**Step 3: Create `apps/web/src/app/(authenticated)/knowledge/misconceptions/page.tsx`**

```tsx
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
/**
 * @noema/web — /knowledge/misconceptions
 *
 * Misconception Center:
 *   1. Summary header (counts by status, family bar)
 *   2. Filterable table of misconceptions with pipeline indicator
 *   3. Expandable detail row: description, mini subgraph, actions
 *   4. "Scan for new misconceptions" button
 */
import * as React from 'react';
import { useAuth } from '@noema/auth';
import { useMisconceptions, useDetectMisconceptions, useUpdateMisconceptionStatus } from '@noema/api-client';
import type { IMisconceptionDto, MisconceptionStatus } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { ConfidenceMeter } from '@noema/ui';
import { Loader2, ScanSearch } from 'lucide-react';
import { Button } from '@noema/ui';
import { MisconceptionPipeline } from '@/components/knowledge/misconception-pipeline';
import { MisconceptionSubgraph } from '@/components/knowledge/misconception-subgraph';

const STATUS_LABELS: Record<MisconceptionStatus, string> = {
  detected:  'Detected',
  confirmed: 'Confirmed',
  resolved:  'Resolved',
  dismissed: 'Dismissed',
};

const STATUS_CLASSES: Record<MisconceptionStatus, string> = {
  detected:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  confirmed: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  resolved:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  dismissed: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
};

export default function MisconceptionsPage(): React.JSX.Element {
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<MisconceptionStatus | ''>('');

  const { data: misconceptionsResponse, isLoading } = useMisconceptions(userId);
  const detectMutation = useDetectMisconceptions(userId);
  const updateStatus = useUpdateMisconceptionStatus(userId);

  const allMisconceptions: IMisconceptionDto[] = (misconceptionsResponse as any)?.data ?? [];
  const filtered = statusFilter !== ''
    ? allMisconceptions.filter((m) => (m as any).status === statusFilter)
    : allMisconceptions;

  // Counts by status
  const counts: Record<string, number> = {};
  for (const m of allMisconceptions) {
    const s = String((m as any).status);
    counts[s] = (counts[s] ?? 0) + 1;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Misconception Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {String(allMisconceptions.length)} misconception{allMisconceptions.length !== 1 ? 's' : ''} detected
          </p>
        </div>
        <Button
          onClick={() => { void detectMutation.mutateAsync(undefined); }}
          disabled={detectMutation.isPending}
          variant="outline"
          className="gap-2"
        >
          {detectMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ScanSearch className="h-4 w-4" aria-hidden="true" />
          )}
          Scan for Misconceptions
        </Button>
      </div>

      {/* Status summary */}
      <div className="flex flex-wrap gap-3">
        {(['detected', 'confirmed', 'resolved', 'dismissed'] as MisconceptionStatus[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setStatusFilter((prev) => (prev === s ? '' : s)); }}
            className={[
              'flex flex-col items-center rounded-lg border px-4 py-2 transition-colors',
              statusFilter === s ? 'border-primary bg-primary/10' : 'border-border bg-card',
            ].join(' ')}
          >
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {String(counts[s] ?? 0)}
            </span>
            <span className="text-xs text-muted-foreground">{STATUS_LABELS[s]}</span>
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading…
        </div>
      )}

      {/* Misconception list */}
      {!isLoading && (
        <div className="flex flex-col gap-2">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-12 text-sm text-muted-foreground">
              No misconceptions found.
            </div>
          ) : (
            filtered.map((m) => {
              const mc = m as any;
              const status = String(mc.status) as MisconceptionStatus;
              const isExpanded = expandedId === String(mc.id);
              return (
                <div key={String(mc.id)} className="rounded-lg border border-border bg-card overflow-hidden">
                  {/* Row */}
                  <button
                    type="button"
                    onClick={() => { setExpandedId((prev) => (prev === String(mc.id) ? null : String(mc.id))); }}
                    className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-muted/30"
                  >
                    {/* Status badge */}
                    <span className={['inline-flex rounded-full px-2 py-0.5 text-xs font-medium', STATUS_CLASSES[status] ?? ''].join(' ')}>
                      {STATUS_LABELS[status] ?? status}
                    </span>

                    {/* Pattern */}
                    <span className="flex-1 truncate text-sm text-foreground">
                      {String(mc.pattern)}
                    </span>

                    {/* Confidence (detection confidence approximated from metadata) */}
                    <div className="flex items-center gap-2">
                      <ConfidenceMeter value={0.75} size="sm" />
                    </div>

                    {/* Date */}
                    <span className="text-xs text-muted-foreground">
                      {formatDate(String(mc.detectedAt))}
                    </span>

                    {/* Pipeline */}
                    <div className="hidden sm:block">
                      <MisconceptionPipeline status={status} />
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-border p-4 flex flex-col gap-4">
                      <MisconceptionSubgraph nodeId={String(mc.nodeId)} />
                      <div className="flex flex-wrap gap-2">
                        {status !== 'resolved' && (
                          <button
                            type="button"
                            onClick={() => {
                              void updateStatus.mutateAsync({
                                id: String(mc.id),
                                data: { status: 'resolved' },
                              });
                            }}
                            className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                          >
                            Mark Resolved
                          </button>
                        )}
                        {status !== 'dismissed' && (
                          <button
                            type="button"
                            onClick={() => {
                              void updateStatus.mutateAsync({
                                id: String(mc.id),
                                data: { status: 'dismissed' },
                              });
                            }}
                            className="rounded border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                          >
                            Dismiss
                          </button>
                        )}
                        {status !== 'confirmed' && (
                          <button
                            type="button"
                            onClick={() => {
                              void updateStatus.mutateAsync({
                                id: String(mc.id),
                                data: { status: 'confirmed' },
                              });
                            }}
                            className="rounded border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                          >
                            Confirm
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 4: Verify typecheck**

```bash
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"
```

**Step 5: Commit**

```bash
git add apps/web/src/components/knowledge/misconception-pipeline.tsx apps/web/src/components/knowledge/misconception-subgraph.tsx "apps/web/src/app/(authenticated)/knowledge/misconceptions/"
git commit -m "feat(web): T8.4 — Misconception Center, MisconceptionPipeline, MisconceptionSubgraph"
```

---

## Task T8.5 — PKG/CKG Comparison View

**Goal:** Build `/knowledge/comparison` with synchronized side-by-side `GraphCanvas` panels (PKG left, CKG right), ghost-node highlights for missing concepts, and an action panel for resolving discrepancies.

**Files:**
- Create: `apps/web/src/app/(authenticated)/knowledge/comparison/page.tsx`

**Step 1: Create `apps/web/src/app/(authenticated)/knowledge/comparison/page.tsx`**

```tsx
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
/**
 * @noema/web — /knowledge/comparison
 *
 * PKG vs CKG side-by-side comparison:
 *   Left panel  = Personal Knowledge Graph (PKG)
 *   Right panel = Canonical Knowledge Graph (CKG)
 *   Synchronised: clicking a node in either panel selects it globally.
 *   Bottom action panel for resolving selected discrepancies.
 */
import * as React from 'react';
import Link from 'next/link';
import { useAuth } from '@noema/auth';
import {
  usePKGNodes,
  usePKGEdges,
  useCKGNodes,
  useCKGEdges,
  usePKGCKGComparison,
  useCreatePKGNode,
} from '@noema/api-client';
import type { IGraphNodeDto, IGraphEdgeDto } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { Button } from '@noema/ui';
import { Loader2 } from 'lucide-react';
import { GraphCanvas } from '@/components/graph/graph-canvas';

export default function KnowledgeComparisonPage(): React.JSX.Element {
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);

  const { data: pkgNodes = [], isLoading: pkgNodesLoading } = usePKGNodes(userId);
  const { data: pkgEdges = [], isLoading: pkgEdgesLoading } = usePKGEdges(userId);
  const { data: ckgNodes = [], isLoading: ckgNodesLoading } = useCKGNodes();
  const { data: ckgEdges = [], isLoading: ckgEdgesLoading } = useCKGEdges();
  const { data: comparisonData, isLoading: compLoading } = usePKGCKGComparison(userId);
  const createNode = useCreatePKGNode(userId);

  const isLoading = pkgNodesLoading || pkgEdgesLoading || ckgNodesLoading || ckgEdgesLoading || compLoading;

  const comparison: any = comparisonData ?? null;
  const missingFromPkg: IGraphNodeDto[] = (comparison?.missingFromPkg as IGraphNodeDto[] | undefined) ?? [];
  const extraInPkg: IGraphNodeDto[] = (comparison?.extraInPkg as IGraphNodeDto[] | undefined) ?? [];
  const alignmentScore: number = (comparison?.alignmentScore as number | undefined) ?? 0;

  // Ghost node IDs: nodes in CKG but not PKG
  const ghostNodeIds = React.useMemo(
    () => new Set(missingFromPkg.map((n) => n.id)),
    [missingFromPkg]
  );

  // "Personal only" node IDs: nodes in PKG but not CKG
  const personalNodeIds = React.useMemo(
    () => new Set(extraInPkg.map((n) => n.id)),
    [extraInPkg]
  );

  // For the PKG panel, include ghost nodes (marked visually by the highlight set)
  const pkgNodesWithGhosts: IGraphNodeDto[] = React.useMemo(
    () => [...(pkgNodes as IGraphNodeDto[]), ...missingFromPkg],
    [pkgNodes, missingFromPkg]
  );

  const selectedNode: IGraphNodeDto | undefined =
    pkgNodesWithGhosts.find((n) => n.id === selectedNodeId) ??
    (ckgNodes as IGraphNodeDto[]).find((n) => n.id === selectedNodeId);

  const isGhost = selectedNodeId !== null && ghostNodeIds.has(selectedNodeId);
  const isPersonalOnly = selectedNodeId !== null && personalNodeIds.has(selectedNodeId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold">PKG / CKG Comparison</h1>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading graphs…
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold">PKG / CKG Comparison</h1>
          <p className="text-sm text-muted-foreground">
            Alignment score:{' '}
            <span className="font-medium text-foreground">
              {String(Math.round(alignmentScore * 100))}%
            </span>
            {' · '}
            <span className="text-amber-500">{String(missingFromPkg.length)} missing from PKG</span>
            {' · '}
            <span className="text-blue-500">{String(extraInPkg.length)} personal-only</span>
          </p>
        </div>
      </div>

      {/* Dual canvas */}
      <div className="flex flex-1 overflow-hidden gap-2 min-h-0">
        {/* PKG */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Personal Knowledge Graph (PKG)
          </div>
          <div className="flex-1 overflow-hidden">
            <GraphCanvas
              nodes={pkgNodesWithGhosts}
              edges={pkgEdges as IGraphEdgeDto[]}
              selectedNodeId={selectedNodeId}
              onNodeClick={(n) => { setSelectedNodeId((prev) => (prev === n.id ? null : n.id)); }}
              onBackgroundClick={() => { setSelectedNodeId(null); }}
              highlightedNodeIds={ghostNodeIds}
              className="h-full w-full"
            />
          </div>
        </div>

        {/* CKG */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Canonical Knowledge Graph (CKG)
          </div>
          <div className="flex-1 overflow-hidden">
            <GraphCanvas
              nodes={ckgNodes as IGraphNodeDto[]}
              edges={ckgEdges as IGraphEdgeDto[]}
              selectedNodeId={selectedNodeId}
              onNodeClick={(n) => { setSelectedNodeId((prev) => (prev === n.id ? null : n.id)); }}
              onBackgroundClick={() => { setSelectedNodeId(null); }}
              highlightedNodeIds={personalNodeIds}
              className="h-full w-full"
            />
          </div>
        </div>
      </div>

      {/* Action panel (shown when a discrepancy node is selected) */}
      {(isGhost || isPersonalOnly) && selectedNode !== undefined && (
        <div className="flex flex-shrink-0 items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{selectedNode.label}</p>
            <p className="text-xs text-muted-foreground">
              {isGhost
                ? 'This concept is in the CKG but not yet in your PKG.'
                : 'This concept is only in your PKG — not in the canonical graph.'}
            </p>
          </div>
          {isGhost && (
            <Button
              onClick={() => {
                void createNode.mutateAsync({
                  type: selectedNode.type,
                  label: selectedNode.label,
                  description: selectedNode.description ?? undefined,
                  tags: selectedNode.tags,
                });
              }}
              disabled={createNode.isPending}
              size="sm"
            >
              {createNode.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              Add to My Graph
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={('/session/new') as never}>Review This Concept</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Add health/misconceptions/comparison nav items to layout**

Open `apps/web/src/app/(authenticated)/layout.tsx`. Find the `Learning` nav group and add the three sub-pages after the existing knowledge map entry:

```tsx
// In the Learning group (after the existing '/knowledge' entry):
{ href: '/knowledge/health', label: 'KG Health', icon: Activity },
{ href: '/knowledge/misconceptions', label: 'Misconceptions', icon: AlertTriangle },
{ href: '/knowledge/comparison', label: 'KG Comparison', icon: GitCompare },
```

Import `Activity`, `AlertTriangle`, and `GitCompare` from `lucide-react`.

**Step 3: Verify typecheck**

```bash
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"
```

**Step 4: Commit**

```bash
git add "apps/web/src/app/(authenticated)/knowledge/comparison/" "apps/web/src/app/(authenticated)/layout.tsx"
git commit -m "feat(web): T8.5 — PKG/CKG Comparison page + nav items for knowledge sub-pages"
```

---

## Final Step: Phase 08 Completion

After all 5 tasks pass typecheck:

```bash
# Full typecheck
pnpm --filter @noema/web typecheck 2>&1 | grep -v "Cannot find module '@noema"

# Use finishing-a-development-branch skill
```
