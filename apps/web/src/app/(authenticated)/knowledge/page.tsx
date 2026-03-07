/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */

'use client';
/**
 * @noema/web — /knowledge
 *
 * Interactive PKG Explorer: full-viewport force-directed graph with
 * left control panel and node detail panel.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@noema/auth';
import { usePKGNodes, usePKGEdges, useKnowledgeFrontier, useBridgeNodes } from '@noema/api-client';
import type { IGraphNodeDto, IGraphEdgeDto } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { Loader2 } from 'lucide-react';
import { useGraphStore } from '@/stores/graph-store';
import { GraphCanvas } from '@/components/graph/graph-canvas';
import { GraphControls } from '@/components/graph/graph-controls';
import { NodeDetailPanel } from '@/components/graph/node-detail-panel';

export default function KnowledgePage(): React.JSX.Element {
  const router = useRouter();
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;

  const { data: nodesData, isLoading: nodesLoading } = usePKGNodes(userId);
  const { data: edgesData, isLoading: edgesLoading } = usePKGEdges(userId);
  const { data: frontierData } = useKnowledgeFrontier(userId);
  const { data: bridgesData } = useBridgeNodes(userId);

  const nodes: IGraphNodeDto[] = (nodesData as any) ?? [];
  const edges: IGraphEdgeDto[] = (edgesData as any) ?? [];

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
  const [hiddenTypes, setHiddenTypes] = React.useState<Set<string>>(new Set());
  const [neighborhoodHighlight, setNeighborhoodHighlight] = React.useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = React.useState<{
    node: IGraphNodeDto;
    x: number;
    y: number;
  } | null>(null);

  const isLoading = nodesLoading || edgesLoading;

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
    () => nodes.filter((n) => !hiddenTypes.has(String((n as any).type))),
    [nodes, hiddenTypes]
  );

  // Build highlighted node set from active overlays + search query + neighborhood
  const highlightedNodeIds = React.useMemo(() => {
    const set = new Set<string>();
    if (activeOverlays.has('frontier') && frontierData !== undefined) {
      const frontierNodes: any[] = (frontierData as any)?.data?.nodes ?? [];
      for (const n of frontierNodes) {
        set.add(String(n.id));
      }
    }
    if (activeOverlays.has('bridges') && bridgesData !== undefined) {
      const bridgeNodes: any[] = (bridgesData as any)?.data?.nodes ?? [];
      for (const n of bridgeNodes) {
        set.add(String(n.id));
      }
    }
    if (searchQuery !== '') {
      const q = searchQuery.toLowerCase();
      for (const n of nodes) {
        if (
          String((n as any).label)
            .toLowerCase()
            .includes(q)
        ) {
          set.add(String((n as any).id));
        }
      }
    }
    for (const id of neighborhoodHighlight) {
      set.add(id);
    }
    return set;
  }, [activeOverlays, frontierData, bridgesData, searchQuery, nodes, neighborhoodHighlight]);

  const selectedNode = React.useMemo(
    () => nodes.find((n) => String((n as any).id) === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );

  const handleNodeClick = React.useCallback(
    (node: IGraphNodeDto) => {
      const id = String((node as any).id);
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
      setHoveredNode(node !== null ? String((node as any).id) : null);
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
      selectNode(String((node as any).id));
    },
    [selectNode]
  );

  const handleViewPrerequisites = React.useCallback(
    (nodeId: string) => {
      selectNode(nodeId);
      toggleOverlay('prerequisites');
    },
    [selectNode, toggleOverlay]
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
              className="absolute z-50 min-w-[180px] rounded-lg border border-border bg-card py-1 shadow-lg"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {/* View card linked to this concept */}
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                onClick={() => {
                  router.push(`/cards?conceptId=${String((contextMenu.node as any).id)}` as never);
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
                  selectNode(String((contextMenu.node as any).id));
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
                  const nodeId = String((contextMenu.node as any).id);
                  const hop1 = new Set(
                    edges
                      .filter(
                        (e) =>
                          String((e as any).sourceId) === nodeId ||
                          String((e as any).targetId) === nodeId
                      )
                      .flatMap((e) => [String((e as any).sourceId), String((e as any).targetId)])
                  );
                  const hop2 = new Set([
                    ...hop1,
                    ...[...hop1].flatMap((id) =>
                      edges
                        .filter(
                          (e) =>
                            String((e as any).sourceId) === id || String((e as any).targetId) === id
                        )
                        .flatMap((e) => [String((e as any).sourceId), String((e as any).targetId)])
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
                  router.push(
                    `/knowledge/misconceptions?nodeId=${String((contextMenu.node as any).id)}` as never
                  );
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
                  router.push('/knowledge/comparison' as never);
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
