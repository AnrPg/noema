'use client';
/**
 * @noema/web-admin — /dashboard/ckg/graph
 *
 * Admin read-only CKG Graph Browser.
 * Renders the full Canonical Knowledge Graph with layout controls,
 * overlay toggles (including the admin-only `pending_mutations` overlay),
 * node detail panel, legend, and minimap.
 */
import * as React from 'react';
import Link from 'next/link';
import { useCKGNodes, useCKGEdges, useCKGMutations } from '@noema/api-client';
import type { IGraphNodeDto, IGraphEdgeDto, ICkgMutationDto } from '@noema/api-client';
import { Network, Loader2 } from 'lucide-react';
import { Button } from '@noema/ui';
import {
  GraphCanvas,
  GraphControls,
  GraphLegend,
  GraphMinimap,
  NodeDetailPanel,
} from '@noema/graph';
import type { LayoutMode, OverlayType } from '@noema/graph';

// ============================================================================
// Stable fallback — avoids passing `undefined` with exactOptionalPropertyTypes
// ============================================================================

const EMPTY_SET = new Set<string>();

// ============================================================================
// Helpers
// ============================================================================

function extractMutationNodeIds(mutations: ICkgMutationDto[]): Set<string> {
  const ids = new Set<string>();
  for (const m of mutations) {
    const p = m.payload;
    if (typeof p['nodeId'] === 'string') ids.add(p['nodeId']);
    if (typeof p['sourceId'] === 'string') ids.add(p['sourceId']);
    if (typeof p['targetId'] === 'string') ids.add(p['targetId']);
  }
  return ids;
}

// ============================================================================
// Page
// ============================================================================

export default function CKGGraphBrowserPage(): React.JSX.Element {
  // --- Data ---
  const { data: nodesData = [], isLoading: nodesLoading, isError: nodesError } = useCKGNodes();
  const { data: edgesData = [], isLoading: edgesLoading, isError: edgesError } = useCKGEdges();

  const nodes: IGraphNodeDto[] = nodesData;
  const edges: IGraphEdgeDto[] = edgesData;

  // --- Local graph state ---
  const [layoutMode, setLayoutMode] = React.useState<LayoutMode>('force');
  const [activeOverlays, setActiveOverlays] = React.useState<Set<OverlayType>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [hiddenTypes, setHiddenTypes] = React.useState<Set<string>>(new Set());

  // --- pending_mutations overlay ---
  const pendingMutationsActive = activeOverlays.has('pending_mutations');
  const { data: pendingMutations = [], isLoading: pendingMutationsLoading } = useCKGMutations(
    { state: 'pending_review' },
    { enabled: pendingMutationsActive }
  );

  // --- Derived state ---

  const handleOverlayToggle = React.useCallback((overlay: OverlayType) => {
    setActiveOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(overlay)) {
        next.delete(overlay);
      } else {
        next.add(overlay);
      }
      return next;
    });
  }, []);

  const handleToggleType = React.useCallback((type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  const visibleNodes = React.useMemo(
    () => nodes.filter((n) => !hiddenTypes.has(n.type)),
    [nodes, hiddenTypes]
  );

  // Build highlighted node set from active overlays
  const highlightedNodeIds = React.useMemo(() => {
    const set = new Set<string>();
    if (pendingMutationsActive && pendingMutations.length > 0) {
      for (const id of extractMutationNodeIds(pendingMutations)) {
        set.add(id);
      }
    }
    if (searchQuery !== '') {
      const q = searchQuery.toLowerCase();
      for (const n of nodes) {
        if (n.label.toLowerCase().includes(q)) {
          set.add(n.id as string);
        }
      }
    }
    return set;
  }, [pendingMutationsActive, pendingMutations, searchQuery, nodes]);

  const activeOverlaysArray = React.useMemo(() => [...activeOverlays], [activeOverlays]);

  const selectedNode = React.useMemo(
    () => nodes.find((n) => (n.id as string) === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  // --- Handlers ---

  const handleNodeClick = React.useCallback((node: IGraphNodeDto) => {
    const id = node.id as string;
    setSelectedNodeId((prev) => (prev === id ? null : id));
  }, []);

  const handleNodeHover = React.useCallback((node: IGraphNodeDto | null) => {
    setHoveredNodeId(node !== null ? (node.id as string) : null);
  }, []);

  const handleBackgroundClick = React.useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleNodeSelect = React.useCallback((node: IGraphNodeDto) => {
    setSelectedNodeId(node.id as string);
  }, []);

  const handleClose = React.useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // --- Loading / empty states ---

  if (nodesError || edgesError) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <p className="text-sm text-destructive">Failed to load CKG data.</p>
      </div>
    );
  }

  const isLoading = nodesLoading || edgesLoading;

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-3 text-center">
        <Network className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
        <p className="text-muted-foreground">The Canonical Knowledge Graph is empty.</p>
        <p className="max-w-xl text-sm text-muted-foreground">
          The graph is filled by approved canonical mutations and, soon, ontology import workflows.
          Until those pipelines are fully wired, use the workspace and mutation queue to manage the
          next steps instead of landing on a blank screen.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/dashboard/ckg">Open CKG workspace</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/ckg/mutations">Review mutation queue</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Page heading */}
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <Network className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-lg font-semibold">CKG Graph Browser</h1>
        <span className="ml-2 text-xs text-muted-foreground">
          {nodes.length} nodes · {edges.length} edges
        </span>
      </div>

      {/* Graph area */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left control panel — includes layout, overlays (with pending_mutations), node list */}
        <GraphControls
          nodes={visibleNodes}
          layoutMode={layoutMode}
          activeOverlays={activeOverlays}
          searchQuery={searchQuery}
          hiddenTypes={hiddenTypes}
          onLayoutChange={setLayoutMode}
          onOverlayToggle={handleOverlayToggle}
          onSearchChange={setSearchQuery}
          onNodeSelect={handleNodeSelect}
          onToggleType={handleToggleType}
          selectedNodeId={selectedNodeId}
        />

        {/* Canvas + overlaid panels */}
        <div className="relative flex-1 overflow-hidden">
          {pendingMutationsActive && pendingMutationsLoading && (
            <div className="absolute left-2 top-2 z-10">
              <span className="text-xs text-muted-foreground">(loading…)</span>
            </div>
          )}
          <GraphCanvas
            nodes={visibleNodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            hoveredNodeId={hoveredNodeId}
            activeOverlays={activeOverlaysArray}
            layoutMode={layoutMode}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            onBackgroundClick={handleBackgroundClick}
            highlightedNodeIds={highlightedNodeIds.size > 0 ? highlightedNodeIds : EMPTY_SET}
            className="h-full w-full"
          />

          {/* Node detail panel + "View pending mutations" link */}
          {selectedNode !== null && (
            <div className="absolute bottom-4 left-4 w-[480px] max-w-[calc(100%-2rem)]">
              <NodeDetailPanel
                node={selectedNode}
                allNodes={nodes}
                allEdges={edges}
                onClose={handleClose}
              />
              <div className="mt-1 flex justify-end px-1">
                <Link
                  href={`/dashboard/ckg/mutations?nodeId=${String(selectedNodeId)}`}
                  className="text-xs text-primary hover:underline"
                >
                  View pending mutations for this node
                </Link>
              </div>
            </div>
          )}

          {/* Legend — bottom-right corner */}
          <div className="absolute bottom-4 right-4">
            <GraphLegend hiddenTypes={hiddenTypes} onToggleType={handleToggleType} />
          </div>

          {/* Minimap — top-right corner */}
          <div className="absolute right-4 top-4">
            <GraphMinimap nodes={nodes} selectedNodeId={selectedNodeId} />
          </div>
        </div>
      </div>
    </div>
  );
}
