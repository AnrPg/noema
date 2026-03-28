'use client';

import type {
  EdgeType,
  ICreateNodeInput,
  IGraphNodeDto,
  IUpdateNodeInput,
  NodeType,
} from '@noema/api-client';
import {
  kgKeys,
  pkgEdgesApi,
  useCKGNodes,
  useCreatePKGEdge,
  useCreatePKGNode,
  usePKGEdges,
  usePKGNodes,
  useRefreshKnowledgeGraphAnalytics,
  useUpdatePKGNode,
} from '@noema/api-client';
import type { EdgeId, NodeId, StudyMode, UserId } from '@noema/types';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, GitBranch, Link2, PencilLine, Search } from 'lucide-react';
import * as React from 'react';
import { toast } from '@/hooks/use-toast';

const NODE_TYPES: { value: NodeType; label: string }[] = [
  { value: 'concept', label: 'Concept' },
  { value: 'occupation', label: 'Occupation' },
  { value: 'skill', label: 'Skill' },
  { value: 'fact', label: 'Fact' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'principle', label: 'Principle' },
  { value: 'example', label: 'Example' },
];

const EDGE_TYPES: { value: EdgeType; label: string }[] = [
  { value: 'subskill_of', label: 'Subskill of' },
  { value: 'has_subskill', label: 'Has subskill' },
  { value: 'prerequisite', label: 'Prerequisite' },
  { value: 'transferable_to', label: 'Transferable to' },
  { value: 'confusable_with', label: 'Confusable with' },
  { value: 'essential_for_occupation', label: 'Essential for occupation' },
  { value: 'occupation_requires_essential_skill', label: 'Occupation requires essential skill' },
  { value: 'optional_for_occupation', label: 'Optional for occupation' },
  {
    value: 'occupation_benefits_from_optional_skill',
    label: 'Occupation benefits from optional skill',
  },
  { value: 'related_to', label: 'Related to' },
  { value: 'part_of', label: 'Part of' },
  { value: 'exemplifies', label: 'Example of' },
  { value: 'contradicts', label: 'Contradicts' },
];

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';
const textareaClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';
const selectClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';
const primaryBtnClass =
  'inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none disabled:opacity-50';
const secondaryBtnClass =
  'inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none disabled:opacity-50';

function normalizeKnowledgeNodeIds(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,\n;]+/g)
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ];
}

function formatKnowledgeNodeIds(ids: readonly string[]): string {
  return ids.join(', ');
}

function defaultDomainForStudyMode(studyMode: StudyMode): string {
  return studyMode === 'language_learning' ? 'language' : 'general';
}

function canonicalRefKey(ref: { sourceId: string; externalId: string }): string {
  return `${ref.sourceId}:${ref.externalId}`.toLowerCase();
}

function findCopiedPkgNode(
  ckgNode: IGraphNodeDto,
  pkgNodes: readonly IGraphNodeDto[]
): IGraphNodeDto | null {
  const ckgId = String(ckgNode.id);
  const ckgRefKeys = new Set(ckgNode.canonicalExternalRefs.map(canonicalRefKey));

  for (const node of pkgNodes) {
    const copiedFromCkgNodeId = node.metadata['copiedFromCkgNodeId'];
    if (
      (typeof copiedFromCkgNodeId === 'string' || typeof copiedFromCkgNodeId === 'number') &&
      String(copiedFromCkgNodeId) === ckgId
    ) {
      return node;
    }

    if (node.canonicalExternalRefs.some((ref) => ckgRefKeys.has(canonicalRefKey(ref)))) {
      return node;
    }
  }

  return null;
}

function buildCreateInputFromCanonicalNode(
  node: IGraphNodeDto,
  studyMode: StudyMode
): ICreateNodeInput {
  return {
    type: node.type,
    label: node.label,
    ...(node.description !== null ? { description: node.description } : {}),
    domain: node.domain ?? defaultDomainForStudyMode(studyMode),
    ...(node.status !== null && node.status !== undefined ? { status: node.status } : {}),
    ...(node.aliases.length > 0 ? { aliases: node.aliases } : {}),
    ...(node.languages.length > 0 ? { languages: node.languages } : {}),
    ...(node.tags.length > 0 ? { tags: node.tags } : {}),
    ...(node.semanticHints.length > 0 ? { semanticHints: node.semanticHints } : {}),
    supportedStudyModes: [...new Set([...node.supportedStudyModes, studyMode])],
    ...(node.canonicalExternalRefs.length > 0
      ? { canonicalExternalRefs: node.canonicalExternalRefs }
      : {}),
    ...(node.ontologyMappings.length > 0 ? { ontologyMappings: node.ontologyMappings } : {}),
    ...(node.provenance.length > 0 ? { provenance: node.provenance } : {}),
    ...(node.reviewMetadata !== null ? { reviewMetadata: node.reviewMetadata } : {}),
    ...(node.sourceCoverage !== null ? { sourceCoverage: node.sourceCoverage } : {}),
    metadata: {
      ...node.metadata,
      copiedFromCkgNodeId: String(node.id),
      copiedFromWorkflow: 'card-node-authoring-panel',
    },
  };
}

export interface IPkgNodeAuthoringPanelProps {
  userId: UserId;
  studyMode: StudyMode;
  value: string;
  onChange: (nextValue: string) => void;
  title?: string;
  description?: string;
}

export function PkgNodeAuthoringPanel({
  userId,
  studyMode,
  value,
  onChange,
  title = 'Knowledge graph nodes',
  description = 'Attach an existing PKG node, copy a canonical CKG node into your PKG, or create a new local node when no suggestion fits.',
}: IPkgNodeAuthoringPanelProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const [searchValue, setSearchValue] = React.useState('');
  const deferredSearch = React.useDeferredValue(searchValue.trim());
  const [activeNodeId, setActiveNodeId] = React.useState('');
  const [panelError, setPanelError] = React.useState<string | null>(null);
  const [manualEntryOpen, setManualEntryOpen] = React.useState(false);
  const [createType, setCreateType] = React.useState<NodeType>('concept');
  const [createDomain, setCreateDomain] = React.useState(defaultDomainForStudyMode(studyMode));
  const [createDescription, setCreateDescription] = React.useState('');
  const [editLabel, setEditLabel] = React.useState('');
  const [editType, setEditType] = React.useState<NodeType>('concept');
  const [editDomain, setEditDomain] = React.useState(defaultDomainForStudyMode(studyMode));
  const [editDescription, setEditDescription] = React.useState('');
  const [edgeTargetSearch, setEdgeTargetSearch] = React.useState('');
  const [edgeTargetId, setEdgeTargetId] = React.useState('');
  const [edgeType, setEdgeType] = React.useState<EdgeType>('related_to');
  const [edgeWeight, setEdgeWeight] = React.useState('1');
  const [transientNodes, setTransientNodes] = React.useState<Record<string, IGraphNodeDto>>({});

  const attachedNodeIds = React.useMemo(() => normalizeKnowledgeNodeIds(value), [value]);
  const searchQueryOptions =
    deferredSearch === ''
      ? { searchMode: 'fulltext' as const, sortBy: 'relevance' as const, pageSize: 6, studyMode }
      : {
          search: deferredSearch,
          searchMode: 'fulltext' as const,
          sortBy: 'relevance' as const,
          pageSize: 6,
          studyMode,
        };
  const { data: basePkgNodes = [], isLoading: isLoadingPkgNodes } = usePKGNodes(userId);
  const { data: pkgSuggestions = [] } = usePKGNodes(userId, {
    ...searchQueryOptions,
    enabled: deferredSearch !== '',
  });
  const { data: ckgSuggestions = [] } = useCKGNodes({
    ...searchQueryOptions,
    enabled: deferredSearch !== '',
  });
  const { data: pkgEdges = [] } = usePKGEdges(userId, { studyMode });
  const createNode = useCreatePKGNode(userId);
  const updateNode = useUpdatePKGNode(userId, activeNodeId as NodeId);
  const createEdge = useCreatePKGEdge(userId);
  const refreshAnalytics = useRefreshKnowledgeGraphAnalytics(userId);

  const pkgNodes = React.useMemo(() => {
    const map = new Map<string, IGraphNodeDto>();
    Object.values(transientNodes).forEach((node) => map.set(String(node.id), node));
    basePkgNodes.forEach((node) => map.set(String(node.id), node));
    return Array.from(map.values());
  }, [basePkgNodes, transientNodes]);

  const pkgNodeMap = React.useMemo(() => {
    const map = new Map<string, IGraphNodeDto>();
    pkgNodes.forEach((node) => map.set(String(node.id), node));
    return map;
  }, [pkgNodes]);

  const attachedNodes = React.useMemo(
    () =>
      attachedNodeIds
        .map((id) => pkgNodeMap.get(id))
        .filter((node): node is IGraphNodeDto => node !== undefined),
    [attachedNodeIds, pkgNodeMap]
  );

  const activeNode =
    attachedNodes.find((node) => String(node.id) === activeNodeId) ?? attachedNodes[0] ?? null;

  const connectedEdges = React.useMemo(
    () =>
      activeNode === null
        ? []
        : pkgEdges.filter(
            (edge) =>
              String(edge.sourceId) === String(activeNode.id) ||
              String(edge.targetId) === String(activeNode.id)
          ),
    [pkgEdges, activeNode]
  );

  const edgeTargetSuggestions = React.useMemo(() => {
    const search = edgeTargetSearch.trim().toLowerCase();
    return pkgNodes
      .filter((node) => {
        if (activeNode !== null && String(node.id) === String(activeNode.id)) {
          return false;
        }
        return (
          search === '' ||
          node.label.toLowerCase().includes(search) ||
          node.type.toLowerCase().includes(search) ||
          String(node.id).toLowerCase().includes(search)
        );
      })
      .slice(0, 8);
  }, [pkgNodes, edgeTargetSearch, activeNode]);

  React.useEffect(() => {
    if (attachedNodeIds.length === 0) {
      setActiveNodeId('');
      return;
    }
    if (!attachedNodeIds.includes(activeNodeId)) {
      setActiveNodeId(attachedNodeIds[0] ?? '');
    }
  }, [attachedNodeIds, activeNodeId]);

  React.useEffect(() => {
    if (activeNode === null) {
      setEditLabel('');
      setEditType('concept');
      setEditDomain(defaultDomainForStudyMode(studyMode));
      setEditDescription('');
      return;
    }
    setEditLabel(activeNode.label);
    setEditType(activeNode.type);
    setEditDomain(activeNode.domain ?? defaultDomainForStudyMode(studyMode));
    setEditDescription(activeNode.description ?? '');
  }, [activeNode?.id, activeNode?.updatedAt, studyMode]);

  function setAttachedNodeIds(nextIds: string[]): void {
    onChange(formatKnowledgeNodeIds(nextIds));
  }

  function syncTransientNode(node: IGraphNodeDto): void {
    setTransientNodes((current) => ({ ...current, [String(node.id)]: node }));
  }

  function attachNode(nodeId: string): void {
    if (!attachedNodeIds.includes(nodeId)) {
      setAttachedNodeIds([...attachedNodeIds, nodeId]);
    }
    setActiveNodeId(nodeId);
  }

  function triggerAnalyticsRefresh(reason: string): void {
    void refreshAnalytics.mutateAsync({ studyMode }).catch(() => {
      toast.warning(`${reason} saved, but structural analytics did not refresh automatically.`);
    });
  }

  async function handleCreateLocalNode(): Promise<void> {
    const label = searchValue.trim();
    if (label === '') {
      setPanelError('Type a label before creating a new local node.');
      return;
    }

    setPanelError(null);
    toast.warning(
      'You are creating a brand-new PKG node. Prefer a canonical copy when one of the suggestions already fits.'
    );

    try {
      const response = await createNode.mutateAsync({
        label,
        type: createType,
        domain:
          createDomain.trim() === '' ? defaultDomainForStudyMode(studyMode) : createDomain.trim(),
        ...(createDescription.trim() !== '' ? { description: createDescription.trim() } : {}),
        supportedStudyModes: [studyMode],
        metadata: {
          authoringSource: 'card-node-authoring-panel',
          authoringWorkflow: 'create-local-node',
        },
      });

      syncTransientNode(response.data);
      attachNode(String(response.data.id));
      setSearchValue('');
      setCreateDescription('');
      setCreateType('concept');
      setCreateDomain(defaultDomainForStudyMode(studyMode));
      toast.success('New PKG node created and attached.');
      triggerAnalyticsRefresh('The local node');
    } catch (error) {
      setPanelError(
        error instanceof Error ? error.message : 'The local PKG node could not be created.'
      );
    }
  }

  async function handleCopyCanonicalNode(node: IGraphNodeDto): Promise<void> {
    setPanelError(null);
    toast.warning(
      'You are copying a canonical node into your PKG. Review the copied label, domain, and relations before you continue.'
    );

    const existing = findCopiedPkgNode(node, pkgNodes);
    if (existing !== null) {
      attachNode(String(existing.id));
      setSearchValue('');
      toast.success('Existing local copy attached to this card.');
      return;
    }

    try {
      const response = await createNode.mutateAsync(
        buildCreateInputFromCanonicalNode(node, studyMode)
      );
      syncTransientNode(response.data);
      attachNode(String(response.data.id));
      setSearchValue('');
      toast.success('Canonical node copied into your PKG and attached.');
      triggerAnalyticsRefresh('The canonical copy');
    } catch (error) {
      setPanelError(
        error instanceof Error ? error.message : 'The canonical node could not be copied.'
      );
    }
  }

  async function handleSaveNodeChanges(): Promise<void> {
    if (activeNode === null) {
      setPanelError('Attach a node before editing it.');
      return;
    }

    const updates: IUpdateNodeInput = {};
    const nextLabel = editLabel.trim();
    const nextDomain = editDomain.trim();
    const nextDescription = editDescription.trim();

    if (nextLabel === '') {
      setPanelError('The selected node needs a label.');
      return;
    }

    if (nextLabel !== activeNode.label) {
      updates.label = nextLabel;
    }
    if (editType !== activeNode.type) {
      updates.nodeType = editType;
    }
    if (
      nextDomain !== '' &&
      nextDomain !== (activeNode.domain ?? defaultDomainForStudyMode(studyMode))
    ) {
      updates.domain = nextDomain;
    }
    if (nextDescription !== (activeNode.description ?? '')) {
      updates.description = nextDescription === '' ? null : nextDescription;
    }

    if (Object.keys(updates).length === 0) {
      toast.info('No local PKG edits were pending for this node.');
      return;
    }

    setPanelError(null);
    toast.warning(
      'You are editing your PKG directly. These changes affect future cards and structural analytics immediately.'
    );

    try {
      const response = await updateNode.mutateAsync(updates);
      syncTransientNode(response.data);
      toast.success('Selected PKG node updated.');
      triggerAnalyticsRefresh('The node update');
    } catch (error) {
      setPanelError(
        error instanceof Error ? error.message : 'The selected node could not be updated.'
      );
    }
  }

  async function handleCreateEdge(): Promise<void> {
    if (activeNode === null) {
      setPanelError('Attach a node before creating a relation.');
      return;
    }
    if (edgeTargetId === '') {
      setPanelError('Choose a target node for the new relation.');
      return;
    }
    if (edgeTargetId === String(activeNode.id)) {
      setPanelError('A node cannot point to itself in this authoring panel.');
      return;
    }

    const parsedWeight = Number(edgeWeight);
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      setPanelError('Relation weight must be a positive number.');
      return;
    }

    setPanelError(null);
    toast.warning(
      'You are changing your local PKG structure. This relation can influence structural and metacognitive analytics.'
    );

    try {
      await createEdge.mutateAsync({
        sourceId: activeNode.id,
        targetId: edgeTargetId as NodeId,
        type: edgeType,
        weight: parsedWeight,
        metadata: {
          authoringSource: 'card-node-authoring-panel',
          authoringWorkflow: 'create-local-edge',
          activeCardNodeId: String(activeNode.id),
        },
      });

      await queryClient.invalidateQueries({ queryKey: kgKeys.pkg(userId) });
      setEdgeTargetId('');
      setEdgeTargetSearch('');
      setEdgeType('related_to');
      setEdgeWeight('1');
      toast.success('Local relation created.');
      triggerAnalyticsRefresh('The edge creation');
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : 'The relation could not be created.');
    }
  }

  async function handleDeleteEdge(edgeId: EdgeId): Promise<void> {
    setPanelError(null);
    toast.warning(
      'You are removing a local relation. Structural analytics will be recomputed from the new graph state.'
    );

    try {
      await pkgEdgesApi.delete(userId, edgeId);
      await queryClient.invalidateQueries({ queryKey: kgKeys.pkg(userId) });
      toast.success('Local relation removed.');
      triggerAnalyticsRefresh('The edge removal');
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : 'The relation could not be removed.');
    }
  }

  const selectedEdgeTarget = pkgNodeMap.get(edgeTargetId) ?? null;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          Changes here edit your PKG immediately for the current card node. Use the dedicated
          knowledge page for full-graph work.
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">Search PKG and CKG</span>
        <span className="text-xs text-muted-foreground">
          Typing uses typo-tolerant suggestions from existing nodes.
        </span>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            name="knowledgeNodeSearch"
            type="text"
            value={searchValue}
            onChange={(event) => {
              setSearchValue(event.target.value);
              setPanelError(null);
            }}
            placeholder="Search node label, type, or ID"
            className={['pl-9', inputClass].join(' ')}
          />
        </div>
      </label>

      {deferredSearch !== '' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr),minmax(0,0.85fr)]">
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
            <div className="space-y-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Your PKG
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {pkgSuggestions.filter((node) => !attachedNodeIds.includes(String(node.id)))
                    .length === 0 ? (
                    <p className="text-xs text-muted-foreground">No local match yet.</p>
                  ) : (
                    pkgSuggestions
                      .filter((node) => !attachedNodeIds.includes(String(node.id)))
                      .map((node) => (
                        <button
                          key={String(node.id)}
                          type="button"
                          onClick={() => {
                            attachNode(String(node.id));
                            setSearchValue('');
                            toast.success('Existing PKG node attached to this card.');
                          }}
                          className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-left hover:bg-muted"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {node.label}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {node.type}
                              {node.domain !== null ? ` · ${node.domain}` : ''}
                            </p>
                          </div>
                          <span className="text-xs font-medium text-primary">Attach</span>
                        </button>
                      ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Canonical CKG
                </p>
                <div className="mt-2 flex flex-col gap-2">
                  {ckgSuggestions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No canonical match yet.</p>
                  ) : (
                    ckgSuggestions.map((node) => (
                      <button
                        key={String(node.id)}
                        type="button"
                        onClick={() => {
                          void handleCopyCanonicalNode(node);
                        }}
                        className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-left hover:bg-muted"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {node.label}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {node.type}
                            {node.domain !== null ? ` · ${node.domain}` : ''}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-primary">
                          {findCopiedPkgNode(node, pkgNodes) === null
                            ? 'Copy to PKG'
                            : 'Upsert local copy'}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">Create a local node</p>
            </div>
            <p className="text-xs text-muted-foreground">
              If you do not choose a suggestion, the workflow becomes local-node creation in your
              PKG.
            </p>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Local node label</span>
              <input value={searchValue} readOnly className={inputClass} />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Node type</span>
                <select
                  value={createType}
                  onChange={(event) => {
                    setCreateType(event.target.value as NodeType);
                  }}
                  className={selectClass}
                >
                  {NODE_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Domain</span>
                <input
                  value={createDomain}
                  onChange={(event) => {
                    setCreateDomain(event.target.value);
                  }}
                  className={inputClass}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Description</span>
              <textarea
                value={createDescription}
                onChange={(event) => {
                  setCreateDescription(event.target.value);
                }}
                rows={3}
                className={textareaClass}
              />
            </label>

            <button
              type="button"
              onClick={() => {
                void handleCreateLocalNode();
              }}
              disabled={createNode.isPending}
              className={primaryBtnClass}
            >
              {createNode.isPending ? 'Creating node…' : 'Create and attach node'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Attached card nodes</p>
            <p className="text-xs text-muted-foreground">
              Select one to edit it locally or to add relations from it.
            </p>
          </div>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {String(attachedNodeIds.length)} attached
          </span>
        </div>

        {attachedNodeIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">No PKG node is attached to this card yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {attachedNodeIds.map((nodeId) => (
              <div
                key={nodeId}
                className={[
                  'flex items-center gap-1 rounded-full border px-2 py-1',
                  nodeId === String(activeNode?.id ?? '')
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-background',
                ].join(' ')}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveNodeId(nodeId);
                  }}
                  className="text-xs font-medium text-foreground"
                >
                  {pkgNodeMap.get(nodeId)?.label ?? nodeId}
                </button>
                <button
                  type="button"
                  aria-label={`Detach ${pkgNodeMap.get(nodeId)?.label ?? nodeId} from this card`}
                  onClick={() => {
                    setAttachedNodeIds(attachedNodeIds.filter((id) => id !== nodeId));
                    toast.warning(
                      'The node was detached from this card only. It still remains in your PKG.'
                    );
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeNode !== null && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
            <div className="flex items-center gap-2">
              <PencilLine className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">Edit selected node locally</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Saving here updates your local PKG immediately for this node.
            </p>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Label</span>
              <input
                value={editLabel}
                onChange={(event) => {
                  setEditLabel(event.target.value);
                }}
                className={inputClass}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Node type</span>
                <select
                  value={editType}
                  onChange={(event) => {
                    setEditType(event.target.value as NodeType);
                  }}
                  className={selectClass}
                >
                  {NODE_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Domain</span>
                <input
                  value={editDomain}
                  onChange={(event) => {
                    setEditDomain(event.target.value);
                  }}
                  className={inputClass}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Description</span>
              <textarea
                value={editDescription}
                onChange={(event) => {
                  setEditDescription(event.target.value);
                }}
                rows={4}
                className={textareaClass}
              />
            </label>

            <button
              type="button"
              onClick={() => {
                void handleSaveNodeChanges();
              }}
              disabled={updateNode.isPending}
              className={primaryBtnClass}
            >
              {updateNode.isPending ? 'Saving node…' : 'Save node changes'}
            </button>
          </div>

          <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">Add relation edge</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Create local structure around the current card node without opening the full graph
              page.
            </p>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Target node</span>
              <input
                value={edgeTargetSearch}
                onChange={(event) => {
                  setEdgeTargetSearch(event.target.value);
                }}
                placeholder="Search a local target node"
                className={inputClass}
              />
            </label>

            <div className="max-h-36 overflow-y-auto rounded-md border border-border bg-background">
              {edgeTargetSuggestions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No local target node matches that search.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {edgeTargetSuggestions.map((node) => (
                    <button
                      key={String(node.id)}
                      type="button"
                      onClick={() => {
                        setEdgeTargetId(String(node.id));
                        setEdgeTargetSearch(node.label);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{node.label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {node.type}
                          {node.domain !== null ? ` · ${node.domain}` : ''}
                        </p>
                      </div>
                      <span className="text-xs text-primary">
                        {edgeTargetId === String(node.id) ? 'Selected' : 'Use'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedEdgeTarget !== null && (
              <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                Relation target: {selectedEdgeTarget.label} · {selectedEdgeTarget.type}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Relation type</span>
                <select
                  value={edgeType}
                  onChange={(event) => {
                    setEdgeType(event.target.value as EdgeType);
                  }}
                  className={selectClass}
                >
                  {EDGE_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Weight</span>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={edgeWeight}
                  onChange={(event) => {
                    setEdgeWeight(event.target.value);
                  }}
                  className={inputClass}
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => {
                void handleCreateEdge();
              }}
              disabled={createEdge.isPending}
              className={primaryBtnClass}
            >
              {createEdge.isPending ? 'Creating edge…' : 'Create relation edge'}
            </button>
          </div>
        </div>
      )}

      {activeNode !== null && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
          <p className="text-sm font-semibold text-foreground">Connected local edges</p>
          {connectedEdges.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No connected edges yet. Add a relation above to start structuring this node locally.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {connectedEdges.map((edge) => {
                const isSource = String(edge.sourceId) === String(activeNode.id);
                const otherId = isSource ? String(edge.targetId) : String(edge.sourceId);
                const otherNode = pkgNodeMap.get(otherId);
                return (
                  <div
                    key={String(edge.id)}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {edge.type} {isSource ? '→' : '←'} {otherNode?.label ?? otherId}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">Weight {edge.weight}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void handleDeleteEdge(edge.id);
                      }}
                      className={secondaryBtnClass}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={() => {
            setManualEntryOpen((current) => !current);
          }}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {manualEntryOpen ? 'Hide advanced manual ID entry' : 'Show advanced manual ID entry'}
        </button>

        {manualEntryOpen && (
          <div className="mt-3 space-y-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Manual node IDs</span>
              <span className="text-xs text-muted-foreground">
                Advanced fallback only. The richer authoring workflow above remains the recommended
                path.
              </span>
              <textarea
                value={value}
                onChange={(event) => {
                  onChange(event.target.value);
                }}
                onBlur={(event) => {
                  onChange(formatKnowledgeNodeIds(normalizeKnowledgeNodeIds(event.target.value)));
                }}
                rows={3}
                placeholder="node_..., node_..."
                className={textareaClass}
              />
            </label>
          </div>
        )}
      </div>

      {(panelError !== null || createNode.error !== null || updateNode.error !== null) && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {panelError ??
            createNode.error?.message ??
            updateNode.error?.message ??
            'The PKG authoring panel hit an unexpected error.'}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        Current selection:{' '}
        {attachedNodeIds.length === 0 ? 'none' : formatKnowledgeNodeIds(attachedNodeIds)}
        {isLoadingPkgNodes ? ' · syncing local PKG nodes…' : ''}
      </div>
    </div>
  );
}
