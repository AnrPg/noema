/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
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
import type { IGraphNodeDto, IGraphEdgeDto } from '@noema/api-client';
import type { UserId } from '@noema/types';
import { Loader2 } from 'lucide-react';
import { useGraphStore } from '@/stores/graph-store';
import { GraphCanvas } from '@/components/graph/graph-canvas';
import { GraphControls } from '@/components/graph/graph-controls';
import { NodeDetailPanel } from '@/components/graph/node-detail-panel';

export default function KnowledgePage(): React.JSX.Element {
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
  const [contextMenu, setContextMenu] = React.useState<{
    node: IGraphNodeDto;
    x: number;
    y: number;
  } | null>(null);

  const isLoading = nodesLoading === true || edgesLoading === true;

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

  // Build highlighted node set from active overlays + search query
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
    return set;
  }, [activeOverlays, frontierData, bridgesData, searchQuery, nodes]);

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
              {[
                'View card linked to this concept',
                'Show prerequisite chain',
                'Show neighborhood (2 hops)',
                'Check for misconceptions',
                'Compare with CKG',
              ].map((label) => (
                <button
                  key={label}
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                  onClick={() => {
                    setContextMenu(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
