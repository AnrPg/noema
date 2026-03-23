'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  pkgEdgesApi,
  useBridgeNodes,
  useCreatePKGEdge,
  useCreatePKGNode,
  useDeletePKGNode,
  useKnowledgeFrontier,
  usePKGCKGComparison,
  usePKGEdges,
  usePKGNodes,
  useUpdatePKGNode,
} from '@noema/api-client';
import type { EdgeType, IGraphEdgeDto, IGraphNodeDto, NodeType } from '@noema/api-client';
import { useAuth } from '@noema/auth';
import type { EdgeId, NodeId, UserId } from '@noema/types';
import { useQueryClient } from '@tanstack/react-query';
import { GitBranch, Loader2, PencilLine, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@noema/ui';
import { useGraphStore } from '@/stores/graph-store';
import { GraphCanvas } from '@/components/graph/graph-canvas';
import { GraphControls } from '@/components/graph/graph-controls';
import { NodeDetailPanel } from '@/components/graph/node-detail-panel';

const NODE_TYPE_OPTIONS: { value: NodeType; label: string }[] = [
  { value: 'concept', label: 'Concept' },
  { value: 'skill', label: 'Skill' },
  { value: 'fact', label: 'Fact' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'principle', label: 'Principle' },
  { value: 'example', label: 'Example' },
];

const EDGE_TYPE_OPTIONS: { value: EdgeType; label: string }[] = [
  { value: 'prerequisite', label: 'Prerequisite' },
  { value: 'related', label: 'Related' },
  { value: 'part_of', label: 'Part of' },
  { value: 'example_of', label: 'Example of' },
  { value: 'contradicts', label: 'Contradicts' },
];

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0';
const textareaClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 resize-y';
const selectClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0';
const primaryButtonClass =
  'inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50';
const secondaryButtonClass =
  'inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50';

interface INodeFormState {
  label: string;
  type: NodeType;
  description: string;
  tags: string;
}

interface IEdgeFormState {
  targetId: string;
  type: EdgeType;
  weight: string;
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

function buildNodeForm(node?: IGraphNodeDto | null): INodeFormState {
  return {
    label: node?.label ?? '',
    type: node?.type ?? 'concept',
    description: node?.description ?? '',
    tags: node?.tags.join(', ') ?? '',
  };
}

function defaultCreateNodeForm(): INodeFormState {
  return { label: '', type: 'concept', description: '', tags: '' };
}

function defaultEdgeForm(): IEdgeFormState {
  return { targetId: '', type: 'related', weight: '1' };
}

function formatPercent(value: number): string {
  return `${String(Math.round(value * 100))}%`;
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">{title}</h2>
        {subtitle !== undefined && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hint !== undefined && <span className="text-xs text-muted-foreground">{hint}</span>}
      {children}
    </label>
  );
}

export default function KnowledgePage(): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;
  const selectedDomain = searchParams.get('domain') ?? undefined;

  const { data: nodesData, isLoading: nodesLoading } = usePKGNodes(userId);
  const { data: edgesData, isLoading: edgesLoading } = usePKGEdges(userId);
  const { data: frontierData } = useKnowledgeFrontier(userId, selectedDomain);
  const { data: bridgesData } = useBridgeNodes(userId, selectedDomain);
  const { data: comparisonData, isLoading: comparisonLoading } = usePKGCKGComparison(userId);

  const nodes: IGraphNodeDto[] = nodesData ?? [];
  const edges: IGraphEdgeDto[] = edgesData ?? [];
  const missingFromPkg = comparisonData?.missingFromPkg ?? [];
  const extraInPkg = comparisonData?.extraInPkg ?? [];
  const alignmentScore = comparisonData?.alignmentScore ?? 0;

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const hoveredNodeId = useGraphStore((s) => s.hoveredNodeId);
  const activeOverlays = useGraphStore((s) => s.activeOverlays);
  const layoutMode = useGraphStore((s) => s.layoutMode);
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
  const [createNodeForm, setCreateNodeForm] = React.useState<INodeFormState>(defaultCreateNodeForm);
  const [editNodeForm, setEditNodeForm] = React.useState<INodeFormState>(defaultCreateNodeForm);
  const [edgeForm, setEdgeForm] = React.useState<IEdgeFormState>(defaultEdgeForm);
  const [systemError, setSystemError] = React.useState<string | null>(null);
  const [managerError, setManagerError] = React.useState<string | null>(null);
  const [managerSuccess, setManagerSuccess] = React.useState<string | null>(null);
  const [isApplyingSuggestions, setIsApplyingSuggestions] = React.useState(false);
  const [isDeletingEdgeId, setIsDeletingEdgeId] = React.useState<string | null>(null);

  const selectedNode = React.useMemo(
    () => nodes.find((n) => String(n.id) === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );
  const selectedNodeIdForHooks = (selectedNode?.id ?? '') as unknown as NodeId;

  const createNode = useCreatePKGNode(userId);
  const updateNode = useUpdatePKGNode(userId, selectedNodeIdForHooks);
  const deleteNode = useDeletePKGNode(userId, selectedNodeIdForHooks);
  const createEdge = useCreatePKGEdge(userId);

  const isLoading = nodesLoading || edgesLoading;

  React.useEffect(() => {
    setEditNodeForm(buildNodeForm(selectedNode));
    setEdgeForm((prev) => ({
      ...prev,
      targetId:
        selectedNode !== null && prev.targetId === String(selectedNode.id) ? '' : prev.targetId,
    }));
  }, [selectedNode]);

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

  const visibleNodes = React.useMemo(
    () => nodes.filter((n) => !hiddenTypes.has(n.type)),
    [nodes, hiddenTypes]
  );

  const highlightedNodeIds = React.useMemo(() => {
    const set = new Set<string>();
    if (activeOverlays.has('frontier') && frontierData !== undefined) {
      for (const n of frontierData.data.nodes) set.add(String(n.id));
    }
    if (activeOverlays.has('bridges') && bridgesData !== undefined) {
      for (const n of bridgesData.data.nodes) set.add(String(n.id));
    }
    if (searchQuery !== '') {
      const q = searchQuery.toLowerCase();
      for (const n of nodes) {
        if (n.label.toLowerCase().includes(q)) set.add(String(n.id));
      }
    }
    for (const id of neighborhoodHighlight) set.add(id);
    return set;
  }, [activeOverlays, frontierData, bridgesData, searchQuery, nodes, neighborhoodHighlight]);

  const selectedNodeEdges = React.useMemo(() => {
    if (selectedNode === null) return [];
    const nodeId = String(selectedNode.id);
    return edges.filter(
      (edge) => String(edge.sourceId) === nodeId || String(edge.targetId) === nodeId
    );
  }, [edges, selectedNode]);

  const edgeTargets = React.useMemo(
    () =>
      nodes
        .filter((node) => selectedNode === null || String(node.id) !== String(selectedNode.id))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [nodes, selectedNode]
  );

  const suggestionPreview = React.useMemo(() => missingFromPkg.slice(0, 5), [missingFromPkg]);

  const handleNodeClick = React.useCallback(
    (node: IGraphNodeDto) => {
      const id = String(node.id);
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
      setHoveredNode(node !== null ? String(node.id) : null);
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
      selectNode(String(node.id));
    },
    [selectNode]
  );

  const handleViewPrerequisites = React.useCallback(
    (nodeId: string) => {
      selectNode(nodeId);
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

  async function handleApplySuggestion(node: IGraphNodeDto): Promise<void> {
    setSystemError(null);
    try {
      const response = await createNode.mutateAsync({
        label: node.label,
        type: node.type,
        ...(node.description !== null ? { description: node.description } : {}),
        ...(node.tags.length > 0 ? { tags: node.tags } : {}),
        ...(Object.keys(node.metadata).length > 0 ? { metadata: node.metadata } : {}),
      });
      selectNode(String(response.data.id));
    } catch (err) {
      setSystemError(err instanceof Error ? err.message : 'Failed to apply system suggestion.');
    }
  }

  async function handleApplySuggestedBaseline(): Promise<void> {
    if (suggestionPreview.length === 0) return;
    setSystemError(null);
    setIsApplyingSuggestions(true);
    try {
      for (const node of suggestionPreview) {
        await createNode.mutateAsync({
          label: node.label,
          type: node.type,
          ...(node.description !== null ? { description: node.description } : {}),
          ...(node.tags.length > 0 ? { tags: node.tags } : {}),
          ...(Object.keys(node.metadata).length > 0 ? { metadata: node.metadata } : {}),
        });
      }
      setManagerSuccess('Applied the next system-guided PKG suggestions.');
    } catch (err) {
      setSystemError(err instanceof Error ? err.message : 'Failed to apply suggested baseline.');
    } finally {
      setIsApplyingSuggestions(false);
    }
  }

  async function handleCreateNodeFromForm(): Promise<void> {
    if (createNodeForm.label.trim() === '') {
      setManagerError('Node label is required.');
      return;
    }
    setManagerError(null);
    setManagerSuccess(null);
    try {
      const response = await createNode.mutateAsync({
        label: createNodeForm.label.trim(),
        type: createNodeForm.type,
        ...(createNodeForm.description.trim() !== ''
          ? { description: createNodeForm.description.trim() }
          : {}),
        ...(parseTags(createNodeForm.tags).length > 0
          ? { tags: parseTags(createNodeForm.tags) }
          : {}),
      });
      setCreateNodeForm(defaultCreateNodeForm());
      selectNode(String(response.data.id));
      setManagerSuccess('Created a new PKG node.');
    } catch (err) {
      setManagerError(err instanceof Error ? err.message : 'Failed to create node.');
    }
  }

  async function handleUpdateSelectedNode(): Promise<void> {
    if (selectedNode === null) return;
    if (editNodeForm.label.trim() === '') {
      setManagerError('Selected node must have a label.');
      return;
    }
    setManagerError(null);
    setManagerSuccess(null);
    try {
      await updateNode.mutateAsync({
        label: editNodeForm.label.trim(),
        description:
          editNodeForm.description.trim() === '' ? null : editNodeForm.description.trim(),
        tags: parseTags(editNodeForm.tags),
      });
      setManagerSuccess('Updated the selected PKG node.');
    } catch (err) {
      setManagerError(err instanceof Error ? err.message : 'Failed to update node.');
    }
  }

  async function handleDeleteSelectedNode(): Promise<void> {
    if (selectedNode === null) return;
    setManagerError(null);
    setManagerSuccess(null);
    try {
      await deleteNode.mutateAsync();
      deselectNode();
      setManagerSuccess('Deleted the selected PKG node.');
    } catch (err) {
      setManagerError(err instanceof Error ? err.message : 'Failed to delete node.');
    }
  }

  async function handleCreateEdge(): Promise<void> {
    if (selectedNode === null) {
      setManagerError('Select a source node before creating an edge.');
      return;
    }
    if (edgeForm.targetId === '') {
      setManagerError('Choose a target node.');
      return;
    }
    const parsedWeight = Number(edgeForm.weight);
    if (Number.isNaN(parsedWeight) || parsedWeight <= 0) {
      setManagerError('Edge weight must be a positive number.');
      return;
    }
    setManagerError(null);
    setManagerSuccess(null);
    try {
      await createEdge.mutateAsync({
        sourceId: selectedNode.id,
        targetId: edgeForm.targetId as unknown as NodeId,
        type: edgeForm.type,
        weight: parsedWeight,
      });
      setEdgeForm(defaultEdgeForm());
      setManagerSuccess('Created a new edge in your PKG.');
    } catch (err) {
      setManagerError(err instanceof Error ? err.message : 'Failed to create edge.');
    }
  }

  async function handleDeleteEdge(edgeId: string): Promise<void> {
    setManagerError(null);
    setManagerSuccess(null);
    setIsDeletingEdgeId(edgeId);
    try {
      await pkgEdgesApi.delete(userId, edgeId as EdgeId);
      await queryClient.invalidateQueries({ queryKey: ['kg', userId, 'pkg', 'edges'] });
      setManagerSuccess('Removed the selected edge.');
    } catch (err) {
      setManagerError(err instanceof Error ? err.message : 'Failed to delete edge.');
    } finally {
      setIsDeletingEdgeId(null);
    }
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
      <div className="grid h-full gap-6 lg:grid-cols-[minmax(0,1fr),360px]">
        <Section
          title="System-Guided PKG"
          subtitle="Stage 1 means the system proposes structure first, and you review or adopt it."
        >
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-foreground">
                  Your PKG has not been built yet.
                </p>
                <p className="text-sm text-muted-foreground">
                  The system can scaffold an initial PKG from canonical concepts and then let you
                  review, edit, and refine it.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Alignment</p>
              <p className="mt-1 text-2xl font-semibold">{formatPercent(alignmentScore)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Suggested concepts
              </p>
              <p className="mt-1 text-2xl font-semibold">{String(missingFromPkg.length)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Personal-only</p>
              <p className="mt-1 text-2xl font-semibold">{String(extraInPkg.length)}</p>
            </div>
          </div>

          {comparisonLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading system suggestions…
            </div>
          ) : suggestionPreview.length > 0 ? (
            <>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-medium text-foreground">Suggested starting concepts</p>
                <div className="mt-3 flex flex-col gap-2">
                  {suggestionPreview.map((node) => (
                    <div
                      key={String(node.id)}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{node.label}</p>
                        <p className="text-xs text-muted-foreground">{node.type}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void handleApplySuggestion(node);
                        }}
                        disabled={createNode.isPending || isApplyingSuggestions}
                        className={secondaryButtonClass}
                      >
                        Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    void handleApplySuggestedBaseline();
                  }}
                  disabled={isApplyingSuggestions || createNode.isPending}
                  className={primaryButtonClass}
                >
                  <Sparkles className="h-4 w-4" />
                  {isApplyingSuggestions ? 'Building PKG…' : 'Build suggested PKG'}
                </button>
                <Button asChild variant="outline">
                  <Link href="/knowledge/comparison">Review in comparison view</Link>
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No canonical suggestions are available yet. You can still create your PKG manually or
              build it organically through study sessions.
            </p>
          )}

          {systemError !== null && <p className="text-sm text-destructive">{systemError}</p>}

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/session/new">Start Session</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/sessions">View Sessions</Link>
            </Button>
          </div>
        </Section>

        <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
          <Section
            title="Manual PKG Setup"
            subtitle="If you prefer, you can begin by creating your own first nodes."
          >
            <Field label="Label">
              <input
                type="text"
                value={createNodeForm.label}
                onChange={(e) => {
                  setCreateNodeForm((prev) => ({ ...prev, label: e.target.value }));
                }}
                placeholder="Mathematics"
                className={inputClass}
              />
            </Field>
            <Field label="Type">
              <select
                value={createNodeForm.type}
                onChange={(e) => {
                  setCreateNodeForm((prev) => ({ ...prev, type: e.target.value as NodeType }));
                }}
                className={selectClass}
              >
                {NODE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description">
              <textarea
                value={createNodeForm.description}
                onChange={(e) => {
                  setCreateNodeForm((prev) => ({ ...prev, description: e.target.value }));
                }}
                rows={3}
                placeholder="What does this node represent?"
                className={textareaClass}
              />
            </Field>
            <Field label="Tags" hint="Comma-separated tags such as domain, chapter, or theme">
              <input
                type="text"
                value={createNodeForm.tags}
                onChange={(e) => {
                  setCreateNodeForm((prev) => ({ ...prev, tags: e.target.value }));
                }}
                placeholder="algebra, foundations"
                className={inputClass}
              />
            </Field>
            <button
              type="button"
              onClick={() => {
                void handleCreateNodeFromForm();
              }}
              disabled={createNode.isPending}
              className={primaryButtonClass}
            >
              <Plus className="h-4 w-4" />
              {createNode.isPending ? 'Creating…' : 'Create first node'}
            </button>
            {managerError !== null && <p className="text-sm text-destructive">{managerError}</p>}
            {managerSuccess !== null && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">{managerSuccess}</p>
            )}
          </Section>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full overflow-hidden">
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
        {contextMenu !== null && (
          <>
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
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                onClick={() => {
                  router.push(`/cards?conceptId=${String(contextMenu.node.id)}`);
                  setContextMenu(null);
                }}
              >
                View card linked to this concept
              </button>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                onClick={() => {
                  setLayoutMode('hierarchical');
                  if (!activeOverlays.has('prerequisites')) {
                    toggleOverlay('prerequisites');
                  }
                  selectNode(String(contextMenu.node.id));
                  setContextMenu(null);
                }}
              >
                Show prerequisite chain
              </button>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                onClick={() => {
                  const nodeId = String(contextMenu.node.id);
                  const hop1 = new Set(
                    edges
                      .filter((e) => String(e.sourceId) === nodeId || String(e.targetId) === nodeId)
                      .flatMap((e) => [String(e.sourceId), String(e.targetId)])
                  );
                  const hop2 = new Set([
                    ...hop1,
                    ...[...hop1].flatMap((id) =>
                      edges
                        .filter((e) => String(e.sourceId) === id || String(e.targetId) === id)
                        .flatMap((e) => [String(e.sourceId), String(e.targetId)])
                    ),
                  ]);
                  setNeighborhoodHighlight(hop2);
                  setContextMenu(null);
                }}
              >
                Show neighborhood (2 hops)
              </button>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                onClick={() => {
                  router.push(`/knowledge/misconceptions?nodeId=${String(contextMenu.node.id)}`);
                  setContextMenu(null);
                }}
              >
                Check for misconceptions
              </button>
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
      <aside className="flex h-full w-[360px] flex-shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-muted/10 p-4">
        <Section
          title="System-Guided Review"
          subtitle="The system proposes structure from the canonical graph; you review and adopt what fits."
        >
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Alignment</p>
              <p className="mt-1 text-lg font-semibold">{formatPercent(alignmentScore)}</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Missing</p>
              <p className="mt-1 text-lg font-semibold">{String(missingFromPkg.length)}</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Personal</p>
              <p className="mt-1 text-lg font-semibold">{String(extraInPkg.length)}</p>
            </div>
          </div>
          {comparisonLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading comparison signals…
            </div>
          ) : suggestionPreview.length > 0 ? (
            <>
              <div className="flex flex-col gap-2">
                {suggestionPreview.map((node) => (
                  <div
                    key={String(node.id)}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{node.label}</p>
                      <p className="text-xs text-muted-foreground">{node.type}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void handleApplySuggestion(node);
                      }}
                      disabled={createNode.isPending || isApplyingSuggestions}
                      className={secondaryButtonClass}
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleApplySuggestedBaseline();
                  }}
                  disabled={isApplyingSuggestions || createNode.isPending}
                  className={primaryButtonClass}
                >
                  <Sparkles className="h-4 w-4" />
                  {isApplyingSuggestions ? 'Building…' : 'Apply next 5'}
                </button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/knowledge/comparison">Open comparison</Link>
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your current PKG already covers the available canonical suggestions.
            </p>
          )}
          {systemError !== null && <p className="text-sm text-destructive">{systemError}</p>}
        </Section>
        <Section
          title="Create Node"
          subtitle="Manual PKG authoring remains available even in system-guided mode."
        >
          <Field label="Label">
            <input
              type="text"
              value={createNodeForm.label}
              onChange={(e) => {
                setCreateNodeForm((prev) => ({ ...prev, label: e.target.value }));
              }}
              placeholder="Number theory"
              className={inputClass}
            />
          </Field>
          <Field label="Type">
            <select
              value={createNodeForm.type}
              onChange={(e) => {
                setCreateNodeForm((prev) => ({ ...prev, type: e.target.value as NodeType }));
              }}
              className={selectClass}
            >
              {NODE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description">
            <textarea
              value={createNodeForm.description}
              onChange={(e) => {
                setCreateNodeForm((prev) => ({ ...prev, description: e.target.value }));
              }}
              rows={3}
              placeholder="Optional description"
              className={textareaClass}
            />
          </Field>
          <Field label="Tags">
            <input
              type="text"
              value={createNodeForm.tags}
              onChange={(e) => {
                setCreateNodeForm((prev) => ({ ...prev, tags: e.target.value }));
              }}
              placeholder="algebra, chapter-2"
              className={inputClass}
            />
          </Field>
          <button
            type="button"
            onClick={() => {
              void handleCreateNodeFromForm();
            }}
            disabled={createNode.isPending}
            className={primaryButtonClass}
          >
            <Plus className="h-4 w-4" />
            {createNode.isPending ? 'Creating…' : 'Create node'}
          </button>
        </Section>
        <Section
          title="Manage Selected Node"
          subtitle={
            selectedNode !== null
              ? `Editing ${selectedNode.label}`
              : 'Select a node from the graph to edit it or manage its edges.'
          }
        >
          {selectedNode === null ? (
            <p className="text-sm text-muted-foreground">
              Select a node to rename it, update its description/tags, create outgoing edges, or
              remove it from your PKG.
            </p>
          ) : (
            <>
              <Field label="Label">
                <input
                  type="text"
                  value={editNodeForm.label}
                  onChange={(e) => {
                    setEditNodeForm((prev) => ({ ...prev, label: e.target.value }));
                  }}
                  className={inputClass}
                />
              </Field>
              <Field
                label="Type"
                hint="Node type is set at creation time and shown here for review."
              >
                <input type="text" value={selectedNode.type} readOnly className={inputClass} />
              </Field>
              <Field label="Description">
                <textarea
                  value={editNodeForm.description}
                  onChange={(e) => {
                    setEditNodeForm((prev) => ({ ...prev, description: e.target.value }));
                  }}
                  rows={3}
                  className={textareaClass}
                />
              </Field>
              <Field label="Tags">
                <input
                  type="text"
                  value={editNodeForm.tags}
                  onChange={(e) => {
                    setEditNodeForm((prev) => ({ ...prev, tags: e.target.value }));
                  }}
                  className={inputClass}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleUpdateSelectedNode();
                  }}
                  disabled={updateNode.isPending}
                  className={primaryButtonClass}
                >
                  <PencilLine className="h-4 w-4" />
                  {updateNode.isPending ? 'Saving…' : 'Save node'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDeleteSelectedNode();
                  }}
                  disabled={deleteNode.isPending}
                  className={secondaryButtonClass}
                >
                  <Trash2 className="h-4 w-4" />
                  {deleteNode.isPending ? 'Deleting…' : 'Delete node'}
                </button>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <div className="mb-3 flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm font-medium text-foreground">Add edge from selected node</p>
                </div>
                <div className="flex flex-col gap-3">
                  <Field label="Target node">
                    <select
                      value={edgeForm.targetId}
                      onChange={(e) => {
                        setEdgeForm((prev) => ({ ...prev, targetId: e.target.value }));
                      }}
                      className={selectClass}
                    >
                      <option value="">Choose a target…</option>
                      {edgeTargets.map((node) => (
                        <option key={String(node.id)} value={String(node.id)}>
                          {node.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Edge type">
                      <select
                        value={edgeForm.type}
                        onChange={(e) => {
                          setEdgeForm((prev) => ({ ...prev, type: e.target.value as EdgeType }));
                        }}
                        className={selectClass}
                      >
                        {EDGE_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Weight">
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={edgeForm.weight}
                        onChange={(e) => {
                          setEdgeForm((prev) => ({ ...prev, weight: e.target.value }));
                        }}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleCreateEdge();
                    }}
                    disabled={createEdge.isPending}
                    className={primaryButtonClass}
                  >
                    <GitBranch className="h-4 w-4" />
                    {createEdge.isPending ? 'Creating edge…' : 'Create edge'}
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="mb-3 text-sm font-medium text-foreground">
                  Connected edges ({String(selectedNodeEdges.length)})
                </p>
                {selectedNodeEdges.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No connected edges yet. Add one to start structuring this concept.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {selectedNodeEdges.map((edge) => {
                      const isSource = String(edge.sourceId) === String(selectedNode.id);
                      const otherNode = nodes.find(
                        (node) =>
                          String(node.id) ===
                          (isSource ? String(edge.targetId) : String(edge.sourceId))
                      );
                      return (
                        <div
                          key={String(edge.id)}
                          className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {edge.type} →{' '}
                              {otherNode?.label ??
                                (isSource ? String(edge.targetId) : String(edge.sourceId))}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              weight {String(edge.weight)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              void handleDeleteEdge(String(edge.id));
                            }}
                            disabled={isDeletingEdgeId === String(edge.id)}
                            className={secondaryButtonClass}
                          >
                            <Trash2 className="h-4 w-4" />
                            {isDeletingEdgeId === String(edge.id) ? 'Removing…' : 'Remove'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
          {managerError !== null && <p className="text-sm text-destructive">{managerError}</p>}
          {managerSuccess !== null && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">{managerSuccess}</p>
          )}
        </Section>
      </aside>
    </div>
  );
}
