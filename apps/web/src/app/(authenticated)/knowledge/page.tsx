'use client';
/**
 * @noema/web — /knowledge
 *
 * Interactive PKG Explorer: full-viewport force-directed graph with
 * left control panel and node detail panel.
 */
import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@noema/auth';
import { usePKGNodes, usePKGEdges, useKnowledgeFrontier, useBridgeNodes } from '@noema/api-client';
import type { IGraphNodeDto, IGraphEdgeDto } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { Loader2 } from 'lucide-react';
import { Button } from '@noema/ui';
import { useGraphStore } from '@/stores/graph-store';
import { GraphCanvas } from '@/components/graph/graph-canvas';
import { GraphControls } from '@/components/graph/graph-controls';
import { NodeDetailPanel } from '@/components/graph/node-detail-panel';

export default function KnowledgePage(): React.JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;
  const selectedDomain = searchParams.get('domain') ?? undefined;

  const { data: nodesData, isLoading: nodesLoading } = usePKGNodes(userId);
  const { data: edgesData, isLoading: edgesLoading } = usePKGEdges(userId);
  const { data: frontierData } = useKnowledgeFrontier(userId, selectedDomain);
  const { data: bridgesData } = useBridgeNodes(userId, selectedDomain);

  const nodes: IGraphNodeDto[] = nodesData ?? [];
  const edges: IGraphEdgeDto[] = edgesData ?? [];

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const hoveredNodeId = useGraphStore((s) => s.hoveredNodeId);
  const activeOverlays = useGraphStore((s) => s.activeOverlays);
  const layoutMode = useGraphStore((s) => s.layoutMode); // LayoutMode from unbuilt @noema/graph → any
  const neighborhoodHighlight = useGraphStore((s) => s.neighborhoodHighlight);
  const selectNode = useGraphStore((s) => s.selectNode);
  const deselectNode = useGraphStore((s) => s.deselectNode);
  const toggleOverlay = useGraphStore((s) => s.toggleOverlay);
  const setLayoutMode = useGraphStore((s) => s.setLayoutMode);
  const setHoveredNode = useGraphStore((s) => s.setHoveredNode);
  const setNeighborhoodHighlight = useGraphStore((s) => s.setNeighborhoodHighlight);

  const [searchQuery, setSearchQuery] = React.useState('');
  const [hiddenTypes, setHiddenTypes] = React.useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = React.useState<{
    node: IGraphNodeDto;
    x: number;
    y: number;
  } | null>(null);

  const isLoading = nodesLoading || edgesLoading;

  // Select node from ?nodeId= query param once nodes are loaded
  const nodeIdParam = searchParams.get('nodeId');
  React.useEffect(() => {
    if (nodeIdParam !== null && nodes.length > 0 && selectedNodeId !== nodeIdParam) {
      selectNode(nodeIdParam);
    }
  }, [nodeIdParam, nodes.length, selectedNodeId, selectNode]);

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

  // Nodes visible after legend type filter
  const visibleNodes = React.useMemo(
    () => nodes.filter((n) => !hiddenTypes.has(n.type)),
    [nodes, hiddenTypes]
  );

  // Build highlighted node set from active overlays + search query + neighborhood
  const highlightedNodeIds = React.useMemo(() => {
    const set = new Set<string>();
    if (activeOverlays.has('frontier') && frontierData !== undefined) {
      const frontierNodes = frontierData.data.nodes;
      for (const n of frontierNodes) {
        set.add(n.id as string);
      }
    }
    if (activeOverlays.has('bridges') && bridgesData !== undefined) {
      const bridgeNodes = bridgesData.data.nodes;
      for (const n of bridgeNodes) {
        set.add(n.id as string);
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
    for (const id of neighborhoodHighlight) {
      set.add(id);
    }
    return set;
  }, [activeOverlays, frontierData, bridgesData, searchQuery, nodes, neighborhoodHighlight]);

  const selectedNode = React.useMemo(
    () => nodes.find((n) => (n.id as string) === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  const handleNodeClick = React.useCallback(
    (node: IGraphNodeDto) => {
      const id = node.id as string;
      if (selectedNodeId === id) {
        deselectNode();
      } else {
        selectNode(id);
      }
      setContextMenu(null);
    },
    [selectedNodeId, selectNode, deselectNode]
  );

  const handleNodeHover = React.useCallback(
    (node: IGraphNodeDto | null) => {
      setHoveredNode(node !== null ? (node.id as string) : null);
    },
    [setHoveredNode]
  );

  const handleNodeRightClick = React.useCallback((node: IGraphNodeDto, event: MouseEvent) => {
    event.preventDefault();
    setContextMenu({ node, x: event.clientX, y: event.clientY });
  }, []);

  const handleBackgroundClick = React.useCallback(() => {
    deselectNode();
    setContextMenu(null);
  }, [deselectNode]);

  const handleNodeSelect = React.useCallback(
    (node: IGraphNodeDto) => {
      selectNode(node.id as string);
    },
    [selectNode]
  );

  const handleViewPrerequisites = React.useCallback(
    (nodeId: string) => {
      selectNode(nodeId);
      // Enable prerequisites overlay idempotently — do not toggle off if already active
      if (!activeOverlays.has('prerequisites')) {
        toggleOverlay('prerequisites');
      }
    },
    [selectNode, toggleOverlay, activeOverlays]
  );

  const activeOverlaysArray = React.useMemo(() => [...activeOverlays], [activeOverlays]);

  React.useEffect(() => {
    if (contextMenu === null) return;
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <p className="text-muted-foreground">Your knowledge graph is empty.</p>
        <p className="text-sm text-muted-foreground">
          Complete study sessions to automatically build your PKG.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/session/new">Start Session</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sessions">View Sessions</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/knowledge/comparison">Compare with CKG</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      {/* Left control panel */}
      <GraphControls
        nodes={visibleNodes}
        layoutMode={layoutMode}
        activeOverlays={activeOverlays}
        searchQuery={searchQuery}
        hiddenTypes={hiddenTypes}
        onLayoutChange={setLayoutMode}
        onOverlayToggle={toggleOverlay}
        onSearchChange={setSearchQuery}
        onNodeSelect={handleNodeSelect}
        onToggleType={handleToggleType}
        selectedNodeId={selectedNodeId}
      />

      {/* Graph canvas */}
      <div className="relative flex-1 overflow-hidden">
        <GraphCanvas
          nodes={visibleNodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          hoveredNodeId={hoveredNodeId}
          activeOverlays={activeOverlaysArray}
          layoutMode={layoutMode}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
          onNodeRightClick={handleNodeRightClick}
          onBackgroundClick={handleBackgroundClick}
          highlightedNodeIds={highlightedNodeIds}
          className="h-full w-full"
        />

        {/* Node detail panel (bottom-left of canvas area) */}
        {selectedNode !== null && (
          <div className="absolute bottom-4 left-4 w-[480px] max-w-[calc(100%-2rem)]">
            <NodeDetailPanel
              node={selectedNode}
              allNodes={nodes}
              allEdges={edges}
              onClose={deselectNode}
              onViewPrerequisites={handleViewPrerequisites}
            />
          </div>
        )}

        {/* Context menu */}
        {contextMenu !== null && (
          <>
            {/* Click-away overlay */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => {
                setContextMenu(null);
              }}
            />
            <div
              className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-card py-1 shadow-lg"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {/* View card linked to this concept */}
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                onClick={() => {
                  router.push(`/cards?conceptId=${contextMenu.node.id as string}`);
                  setContextMenu(null);
                }}
              >
                View card linked to this concept
              </button>

              {/* Show prerequisite chain */}
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                onClick={() => {
                  setLayoutMode('hierarchical');
                  if (!activeOverlays.has('prerequisites')) {
                    toggleOverlay('prerequisites');
                  }
                  selectNode(contextMenu.node.id as string);
                  setContextMenu(null);
                }}
              >
                Show prerequisite chain
              </button>

              {/* Show neighborhood (2 hops) */}
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                onClick={() => {
                  const nodeId = contextMenu.node.id as string;
                  const hop1 = new Set(
                    edges
                      .filter(
                        (e) =>
                          (e.sourceId as string) === nodeId || (e.targetId as string) === nodeId
                      )
                      .flatMap((e) => [e.sourceId as string, e.targetId as string])
                  );
                  const hop2 = new Set([
                    ...hop1,
                    ...[...hop1].flatMap((id) =>
                      edges
                        .filter(
                          (e) => (e.sourceId as string) === id || (e.targetId as string) === id
                        )
                        .flatMap((e) => [e.sourceId as string, e.targetId as string])
                    ),
                  ]);
                  setNeighborhoodHighlight(hop2);
                  setContextMenu(null);
                }}
              >
                Show neighborhood (2 hops)
              </button>

              {/* Check for misconceptions */}
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                onClick={() => {
                  router.push(`/knowledge/misconceptions?nodeId=${contextMenu.node.id as string}`);
                  setContextMenu(null);
                }}
              >
                Check for misconceptions
              </button>

              {/* Compare with CKG */}
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                onClick={() => {
                  router.push('/knowledge/comparison');
                  setContextMenu(null);
                }}
              >
                Compare with CKG
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
