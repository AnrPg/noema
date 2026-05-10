'use client';

import * as React from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  agentsApi,
  kgKeys,
  pkgEdgesApi,
  useApplyGraphAgentProposals,
  useApplyPkgExpansion,
  useBulkDeletePKGNodes,
  useBridgeNodes,
  useCreatePKGEdge,
  useCreatePKGNode,
  useDeletePKGNode,
  useKnowledgeFrontier,
  usePKGCKGComparison,
  usePKGEdges,
  usePKGNodes,
  useResetPKG,
  useUpdatePKGNode,
} from '@noema/api-client';
import type {
  ApplyPkgExpansionSelectionRequest,
  ApplyGraphAgentProposalSelectionRequest,
  EdgeType,
  IAgentBatchJob,
  IAgentRunRequest,
  IGraphEdgeDto,
  IGraphNodeDto,
  IPkgExpansionProposalBundleDto,
  IPkgExpansionProposalItemDto,
  IPkgExpansionRequest,
  NodeType,
  PkgExpansionScopeType,
} from '@noema/api-client';
import { useAuth } from '@noema/auth';
import type { EdgeId, NodeId, UserId } from '@noema/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Loader2, PanelLeft, PencilLine, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { Button, FieldLabel } from '@noema/ui';
import { useGraphStore } from '@/stores/graph-store';
import { GraphCanvas } from '@/components/graph/graph-canvas';
import { GraphControls } from '@/components/graph/graph-controls';
import { NodeDetailPanel } from '@/components/graph/node-detail-panel';
import { useActiveStudyMode } from '@/hooks/use-active-study-mode';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { formatApiErrorMessage } from '@/lib/api-errors';
import { resolveKnowledgeMultiSelect } from '@/lib/knowledge-selection';
import { getStudyModeDescription, getStudyModeLabel } from '@/lib/study-mode';
import {
  AgentActionButton,
  ProposalReviewPanel,
  ProposalJobStatusCard,
  extractBatchJobResultPayload,
  getAgentCapability,
  normalizeAgentBatchProposal,
  proposalJobPhase,
} from '@/features/agents';

const NODE_TYPE_OPTIONS: { value: NodeType; label: string }[] = [
  { value: 'notion', label: 'Notion' },
  { value: 'occupation', label: 'Occupation' },
  { value: 'skill', label: 'Skill' },
  { value: 'fact', label: 'Fact' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'principle', label: 'Principle' },
  { value: 'example', label: 'Example' },
];

const EDGE_TYPE_OPTIONS: { value: EdgeType; label: string }[] = [
  { value: 'subskill_of', label: 'Subskill of' },
  { value: 'has_subskill', label: 'Has subskill' },
  { value: 'prerequisite', label: 'Is prerequisite of' },
  { value: 'transferable_to', label: 'Transferable to' },
  { value: 'confusable_with', label: 'Confusable with' },
  { value: 'essential_for_occupation', label: 'Essential for occupation' },
  {
    value: 'occupation_requires_essential_skill',
    label: 'Occupation requires essential skill',
  },
  { value: 'optional_for_occupation', label: 'Optional for occupation' },
  {
    value: 'occupation_benefits_from_optional_skill',
    label: 'Occupation benefits from optional skill',
  },
  { value: 'related_to', label: 'Related' },
  { value: 'part_of', label: 'Part of' },
  { value: 'exemplifies', label: 'Example of' },
  { value: 'contradicts', label: 'Contradicts' },
];
const EDGE_TYPE_LABELS = new Map<EdgeType, string>(
  EDGE_TYPE_OPTIONS.map((option) => [option.value, option.label])
);

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
const DEFAULT_NODE_DOMAIN = 'general';
const EXPANSION_CATEGORY_LABELS: Record<string, string> = {
  expand_nodes: 'Expand graph',
  expand_edges: 'Expand graph',
  structural_optimization: 'Improve structure',
  semantic_optimization: 'Improve meaning',
  label_improvement: 'Improve wording',
  description_improvement: 'Improve wording',
};
const PKG_RESET_CONFIRMATION = 'DELETE_ALL_PKG_CONTENTS';
const EXPANSION_REVIEW_STORAGE_PREFIX = 'knowledge-expansion-consumed';
const GRAPH_REVIEW_STORAGE_PREFIX = 'knowledge-graph-review-consumed';

function formatExpansionError(error: unknown, action: string, fallback: string): string {
  return formatApiErrorMessage(error, {
    action,
    fallback,
  });
}

function buildProposalReviewStorageKey(prefix: string, jobId: string | null): string | null {
  return jobId === null || jobId.trim() === '' ? null : `${prefix}:${jobId}`;
}

function readStoredProposalIds(storageKey: string | null): Set<string> {
  if (storageKey === null || typeof window === 'undefined') {
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) {
      return new Set();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(
      parsed.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    );
  } catch {
    return new Set();
  }
}

function writeStoredProposalIds(storageKey: string | null, proposalIds: Set<string>): void {
  if (storageKey === null || typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...proposalIds]));
  } catch {
    // Ignore storage write failures and keep the in-memory review state.
  }
}

function buildEmptyExpansionBundle(request: IPkgExpansionRequest): IPkgExpansionProposalBundleDto {
  return {
    artifactKind: 'pkg_expansion_proposal_bundle',
    scope: {
      scopeType: request.scope.scopeType,
      nodeIds: request.scope.nodeIds,
      ...(request.scope.domain !== undefined ? { domain: request.scope.domain } : {}),
    },
    generatedAt: new Date().toISOString(),
    summary: {
      proposalCount: 0,
      nodeProposalCount: 0,
      edgeProposalCount: 0,
      wordingProposalCount: 0,
      canonicalCandidateCount: 0,
    },
    proposals: [],
  };
}

function extractExpansionBundleFromBatchJob(
  job: IAgentBatchJob | undefined
): IPkgExpansionProposalBundleDto | null {
  if (job === undefined || typeof job.result !== 'object' || job.result === null) {
    return null;
  }

  const nestedResult = 'result' in job.result ? job.result['result'] : job.result;
  if (typeof nestedResult !== 'object' || nestedResult === null) {
    return null;
  }
  const result = nestedResult as Record<string, unknown>;

  if (result['artifactKind'] !== 'pkg_expansion_proposal_bundle') {
    return null;
  }

  return result as unknown as IPkgExpansionProposalBundleDto;
}

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

interface IQuickEdgeMenuState {
  sourceNodeId: string;
  targetNodeId: string;
  x: number;
  y: number;
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
    type: node?.type ?? 'notion',
    description: node?.description ?? '',
    tags: node?.tags.join(', ') ?? '',
  };
}

function defaultCreateNodeForm(): INodeFormState {
  return { label: '', type: 'notion', description: '', tags: '' };
}

function defaultEdgeForm(): IEdgeFormState {
  return { targetId: '', type: 'related_to', weight: '1' };
}

function defaultQuickEdgeMenu(
  sourceNodeId: string,
  targetNodeId: string,
  x: number,
  y: number
): IQuickEdgeMenuState {
  return {
    sourceNodeId,
    targetNodeId,
    x,
    y,
    type: 'related_to',
    weight: '1',
  };
}

function getNodeDisplayLabel(nodes: IGraphNodeDto[], nodeId: string): string {
  return nodes.find((node) => String(node.id) === nodeId)?.label ?? nodeId;
}

function getEdgeTypeLabel(type: EdgeType): string {
  return EDGE_TYPE_LABELS.get(type) ?? type.replaceAll('_', ' ');
}

function getEdgeDirectionLabel(edge: IGraphEdgeDto, nodes: IGraphNodeDto[]): string {
  const source = getNodeDisplayLabel(nodes, String(edge.sourceId));
  const target = getNodeDisplayLabel(nodes, String(edge.targetId));
  return `${source} -> ${target}`;
}

function getPrerequisiteMeaning(edge: IGraphEdgeDto, nodes: IGraphNodeDto[]): string {
  const source = getNodeDisplayLabel(nodes, String(edge.sourceId));
  const target = getNodeDisplayLabel(nodes, String(edge.targetId));
  return `${source} is a prerequisite of ${target}`;
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
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel
        className="text-sm font-medium text-foreground"
        {...(required === true ? { required: true } : {})}
      >
        {label}
      </FieldLabel>
      {hint !== undefined && <span className="text-xs text-muted-foreground">{hint}</span>}
      {children}
    </label>
  );
}

export default function KnowledgePage(): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;
  const selectedDomain = searchParams.get('domain') ?? undefined;
  const activeDomain = selectedDomain ?? DEFAULT_NODE_DOMAIN;
  const activeStudyMode = useActiveStudyMode();
  const workspaceParam = searchParams.get('workspace');
  const reviewAgentParam = searchParams.get('agent');
  const reviewJobIdParam = searchParams.get('jobId');

  const { data: nodesData, isLoading: nodesLoading } = usePKGNodes(userId, {
    studyMode: activeStudyMode,
  });
  const { data: edgesData, isLoading: edgesLoading } = usePKGEdges(userId, {
    studyMode: activeStudyMode,
  });
  const { data: frontierData } = useKnowledgeFrontier(userId, selectedDomain, activeStudyMode);
  const { data: bridgesData } = useBridgeNodes(userId, selectedDomain, activeStudyMode);
  const { data: comparisonData, isLoading: comparisonLoading } = usePKGCKGComparison(userId, {
    domain: activeDomain,
    scopeMode: 'engagement_hops',
    hopCount: 2,
    bootstrapWhenUnseeded: true,
    studyMode: activeStudyMode,
  });

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
  const [showLabels, setShowLabels] = React.useState(false);
  const [hiddenTypes, setHiddenTypes] = React.useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = React.useState<{
    node: IGraphNodeDto;
    x: number;
    y: number;
  } | null>(null);
  const [quickEdgeMenu, setQuickEdgeMenu] = React.useState<IQuickEdgeMenuState | null>(null);
  const [createNodeForm, setCreateNodeForm] = React.useState<INodeFormState>(defaultCreateNodeForm);
  const [editNodeForm, setEditNodeForm] = React.useState<INodeFormState>(defaultCreateNodeForm);
  const [edgeForm, setEdgeForm] = React.useState<IEdgeFormState>(defaultEdgeForm);
  const [systemError, setSystemError] = React.useState<string | null>(null);
  const [managerError, setManagerError] = React.useState<string | null>(null);
  const [managerSuccess, setManagerSuccess] = React.useState<string | null>(null);
  const [isApplyingSuggestions, setIsApplyingSuggestions] = React.useState(false);
  const [isDeletingEdgeId, setIsDeletingEdgeId] = React.useState<string | null>(null);
  const [isControlsOpen, setIsControlsOpen] = React.useState(false);
  const [isNodeDetailOpen, setIsNodeDetailOpen] = React.useState(true);
  const [selectedNodeIds, setSelectedNodeIds] = React.useState<Set<string>>(new Set());
  const [expansionBundle, setExpansionBundle] =
    React.useState<IPkgExpansionProposalBundleDto | null>(null);
  const [selectedExpansionIds, setSelectedExpansionIds] = React.useState<Set<string>>(new Set());
  const [dismissedExpansionIds, setDismissedExpansionIds] = React.useState<Set<string>>(new Set());
  const [expansionError, setExpansionError] = React.useState<string | null>(null);
  const [expansionScopeType, setExpansionScopeType] =
    React.useState<PkgExpansionScopeType>('whole_pkg');
  const [expansionDomain, setExpansionDomain] = React.useState(activeDomain);
  const [activeWorkspacePanel, setActiveWorkspacePanel] = React.useState<
    'review' | 'create' | 'manage' | 'prerequisites' | null
  >(null);
  const [dismissedReviewProposalIds, setDismissedReviewProposalIds] = React.useState<Set<string>>(
    new Set()
  );
  const [reviewActionMessage, setReviewActionMessage] = React.useState<string | null>(null);
  const [reviewActionError, setReviewActionError] = React.useState<string | null>(null);
  const [applyingReviewProposalId, setApplyingReviewProposalId] = React.useState<string | null>(
    null
  );
  const workspacePanelRef = React.useRef<HTMLElement | null>(null);
  const reviewAgentName =
    reviewAgentParam === 'knowledge-graph-agent' ? 'knowledge-graph-agent' : null;
  const expansionReviewStorageKey = React.useMemo(
    () => buildProposalReviewStorageKey(EXPANSION_REVIEW_STORAGE_PREFIX, reviewJobIdParam),
    [reviewJobIdParam]
  );
  const graphReviewStorageKey = React.useMemo(
    () => buildProposalReviewStorageKey(GRAPH_REVIEW_STORAGE_PREFIX, reviewJobIdParam),
    [reviewJobIdParam]
  );

  const selectedNode = React.useMemo(
    () => nodes.find((n) => String(n.id) === selectedNodeId) ?? null,
    [nodes, selectedNodeId]
  );
  const showNodeDetailPanel =
    selectedNode !== null && isNodeDetailOpen && activeWorkspacePanel !== 'manage';
  const hasKnowledgeWorkspaceRail =
    showNodeDetailPanel || activeWorkspacePanel !== null;
  const selectedNodeIdForHooks = (selectedNode?.id ?? '') as unknown as NodeId;

  const createNode = useCreatePKGNode(userId);
  const updateNode = useUpdatePKGNode(userId, selectedNodeIdForHooks);
  const deleteNode = useDeletePKGNode(userId, selectedNodeIdForHooks);
  const bulkDeleteNodes = useBulkDeletePKGNodes(userId);
  const resetPkg = useResetPKG(userId);
  const createEdge = useCreatePKGEdge(userId);
  const applyPkgExpansion = useApplyPkgExpansion(userId);
  const applyGraphAgentProposals = useApplyGraphAgentProposals(userId);
  const generatePkgExpansion = useMutation({
    mutationFn: (request: IAgentRunRequest) =>
      agentsApi.runAgentAsync('knowledge-graph-agent', request),
  });
  const cancelReviewBatchJob = useMutation({
    mutationFn: () =>
      reviewJobIdParam === null ? Promise.resolve(null) : agentsApi.cancelBatchJob(reviewJobIdParam),
    onSuccess: (response) => {
      if (response === null) {
        return;
      }
      queryClient.setQueryData(
        ['knowledge-review-batch-job', reviewAgentName, reviewJobIdParam],
        response
      );
      setExpansionError(null);
      setExpansionBundle(null);
      setSelectedExpansionIds(new Set());
    },
    onError: (error) => {
      setExpansionError(
        formatExpansionError(
          error,
          'cancel this proposal request',
          'We could not cancel this proposal request.'
        )
      );
    },
  });
  const reviewBatchJobQuery = useQuery({
    queryKey: ['knowledge-review-batch-job', reviewAgentName, reviewJobIdParam],
    queryFn: () => agentsApi.getBatchJob(reviewJobIdParam ?? ''),
    enabled:
      activeWorkspacePanel === 'review' &&
      reviewAgentName === 'knowledge-graph-agent' &&
      reviewJobIdParam !== null &&
      userId !== '',
    refetchInterval: (query) => {
      const status = query.state.data?.data.job.status.toLowerCase();
      return status === 'queued' || status === 'submitted' || status === 'running' ? 3000 : false;
    },
  });

  const isLoading = nodesLoading || edgesLoading;

  React.useEffect(() => {
    setEditNodeForm(buildNodeForm(selectedNode));
    setEdgeForm((prev) => ({
      ...prev,
      targetId:
        selectedNode !== null && prev.targetId === String(selectedNode.id) ? '' : prev.targetId,
    }));
  }, [selectedNode]);

  React.useEffect(() => {
    if (selectedNode === null) {
      return;
    }

    if (activeWorkspacePanel === 'manage') {
      setActiveWorkspacePanel('manage');
    }
  }, [activeWorkspacePanel, selectedNode]);

  React.useEffect(() => {
    setExpansionDomain(activeDomain);
  }, [activeDomain]);

  const nodeIdParam = searchParams.get('nodeId');
  React.useEffect(() => {
    if (nodeIdParam !== null && nodes.length > 0 && selectedNodeId !== nodeIdParam) {
      selectNode(nodeIdParam);
    }
  }, [nodeIdParam, nodes.length, selectedNodeId, selectNode]);

  React.useEffect(() => {
    if (workspaceParam === 'review' && activeWorkspacePanel === null) {
      setActiveWorkspacePanel('review');
    }
  }, [activeWorkspacePanel, workspaceParam]);

  React.useEffect(() => {
    if (activeWorkspacePanel === null) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      workspacePanelRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest',
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeWorkspacePanel]);

  React.useEffect(() => {
    setDismissedReviewProposalIds(readStoredProposalIds(graphReviewStorageKey));
    setReviewActionMessage(null);
    setReviewActionError(null);
    setApplyingReviewProposalId(null);
    setExpansionBundle(null);
    setSelectedExpansionIds(new Set());
    setDismissedExpansionIds(readStoredProposalIds(expansionReviewStorageKey));
  }, [expansionReviewStorageKey, graphReviewStorageKey]);

  const markExpansionProposalsConsumed = React.useCallback(
    (proposalIds: readonly string[]) => {
      if (proposalIds.length === 0) {
        return;
      }
      setDismissedExpansionIds((current) => {
        const next = new Set(current);
        for (const proposalId of proposalIds) {
          if (proposalId.trim() !== '') {
            next.add(proposalId);
          }
        }
        writeStoredProposalIds(expansionReviewStorageKey, next);
        return next;
      });
    },
    [expansionReviewStorageKey]
  );

  const markReviewProposalsConsumed = React.useCallback(
    (proposalIds: readonly string[]) => {
      if (proposalIds.length === 0) {
        return;
      }
      setDismissedReviewProposalIds((current) => {
        const next = new Set(current);
        for (const proposalId of proposalIds) {
          if (proposalId.trim() !== '') {
            next.add(proposalId);
          }
        }
        writeStoredProposalIds(graphReviewStorageKey, next);
        return next;
      });
    },
    [graphReviewStorageKey]
  );

  const syncWorkspaceQuery = React.useCallback(
    (
      workspace: 'review' | null,
      reviewContext?: { agent?: string; jobId?: string; runId?: string } | null
    ) => {
      const params = new URLSearchParams(searchParams.toString());
      if (workspace === null) {
        params.delete('workspace');
        params.delete('agent');
        params.delete('jobId');
        params.delete('runId');
      } else {
        params.set('workspace', workspace);
        if (reviewContext === null) {
          params.delete('agent');
          params.delete('jobId');
          params.delete('runId');
        } else if (reviewContext !== undefined) {
          if (reviewContext.agent !== undefined && reviewContext.agent !== '') {
            params.set('agent', reviewContext.agent);
          }
          if (reviewContext.jobId !== undefined && reviewContext.jobId !== '') {
            params.set('jobId', reviewContext.jobId);
          }
          if (reviewContext.runId !== undefined && reviewContext.runId !== '') {
            params.set('runId', reviewContext.runId);
          }
        }
      }
      const next = params.toString();
      const nextUrl = (next === '' ? pathname : `${pathname}?${next}`) as Route;
      router.replace(nextUrl, { scroll: false });
    },
    [pathname, router, searchParams]
  );

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

  const visibleNodeIds = React.useMemo(
    () => new Set(visibleNodes.map((node) => String(node.id))),
    [visibleNodes]
  );

  const visibleEdges = React.useMemo(
    () =>
      edges.filter(
        (edge) =>
          visibleNodeIds.has(String(edge.sourceId)) && visibleNodeIds.has(String(edge.targetId))
      ),
    [edges, visibleNodeIds]
  );
  const reviewBatchJob = reviewBatchJobQuery.data?.data.job;
  const expansionBatchBundle = React.useMemo(
    () =>
      reviewAgentName === 'knowledge-graph-agent'
        ? extractExpansionBundleFromBatchJob(reviewBatchJob)
        : null,
    [reviewAgentName, reviewBatchJob]
  );
  const reviewBatchJobStatus = reviewBatchJob?.status.toLowerCase();
  const isReviewBatchJobRunning =
    reviewBatchJobStatus === 'queued' ||
    reviewBatchJobStatus === 'submitted' ||
    reviewBatchJobStatus === 'running';
  const canCancelReviewBatchJob = reviewBatchJob?.isCancellable === true;
  const reviewProposal = React.useMemo(
    () =>
      reviewAgentName === null
        ? null
        : normalizeAgentBatchProposal(reviewAgentName, reviewBatchJob),
    [reviewAgentName, reviewBatchJob]
  );
  const reviewBatchPayload = React.useMemo(
    () => (reviewBatchJob === undefined ? null : extractBatchJobResultPayload(reviewBatchJob)),
    [reviewBatchJob]
  );
  const isExpansionGenerationPending =
    generatePkgExpansion.isPending ||
    (reviewAgentName === 'knowledge-graph-agent' &&
      isReviewBatchJobRunning &&
      expansionBatchBundle === null);

  React.useEffect(() => {
    if (expansionBatchBundle !== null) {
      setExpansionBundle(expansionBatchBundle);
      setExpansionError(null);
      setSelectedExpansionIds(new Set());
    }
  }, [expansionBatchBundle]);

  React.useEffect(() => {
    if (
      reviewAgentName !== 'knowledge-graph-agent' ||
      reviewJobIdParam === null ||
      expansionBatchBundle !== null ||
      reviewBatchJob === undefined
    ) {
      return;
    }

    if (
      reviewBatchJobStatus === 'failed' ||
      reviewBatchJobStatus === 'finalization_failed'
    ) {
      setExpansionError(
        formatExpansionError(
          new Error(
            reviewBatchJob.errorMessage ??
              `Expansion proposal job ended with status ${reviewBatchJob.status}.`
          ),
          'generate expansion proposals',
          'We could not generate expansion proposals.'
        )
      );
    }
  }, [
    expansionBatchBundle,
    reviewAgentName,
    reviewBatchJob,
    reviewBatchJobStatus,
    reviewJobIdParam,
  ]);
  const reviewGraphProposals = React.useMemo(() => {
    const proposals = reviewBatchPayload?.['proposals'];
    if (!Array.isArray(proposals)) {
      return [];
    }
    return proposals.filter(
      (proposal): proposal is Record<string, unknown> =>
        typeof proposal === 'object' && proposal !== null
    );
  }, [reviewBatchPayload]);
  const visibleReviewGraphProposals = React.useMemo(
    () =>
      reviewGraphProposals.filter((proposal) => {
        const proposalId = proposal['proposalId'];
        return typeof proposalId !== 'string' || !dismissedReviewProposalIds.has(proposalId);
      }),
    [dismissedReviewProposalIds, reviewGraphProposals]
  );
  const knowledgeGraphCapability = React.useMemo(
    () => getAgentCapability('knowledge-graph-agent'),
    []
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

  const selectedNodePrerequisiteEdges = React.useMemo(() => {
    if (selectedNode === null) return [];
    const nodeId = String(selectedNode.id);
    return edges.filter(
      (edge) => edge.type === 'prerequisite' && String(edge.targetId) === nodeId
    );
  }, [edges, selectedNode]);

  const selectedNodeDependentEdges = React.useMemo(() => {
    if (selectedNode === null) return [];
    const nodeId = String(selectedNode.id);
    return edges.filter(
      (edge) => edge.type === 'prerequisite' && String(edge.sourceId) === nodeId
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
  const visibleExpansionProposals = React.useMemo(
    () =>
      (expansionBundle?.proposals ?? []).filter(
        (proposal: IPkgExpansionProposalItemDto) =>
          !dismissedExpansionIds.has(proposal.proposalId)
      ),
    [dismissedExpansionIds, expansionBundle]
  );
  const groupedExpansionProposals = React.useMemo(() => {
    const groups = new Map<string, IPkgExpansionProposalItemDto[]>();
    for (const proposal of visibleExpansionProposals) {
      const label = EXPANSION_CATEGORY_LABELS[proposal.category] ?? 'Other';
      groups.set(label, [...(groups.get(label) ?? []), proposal]);
    }
    return [...groups.entries()];
  }, [visibleExpansionProposals]);
  const graphAgentContext = React.useMemo(
    () => ({
      userId,
      conceptIds:
        selectedNode !== null
          ? [selectedNode.label]
          : suggestionPreview.map((node) => node.label).filter((label) => label.trim() !== ''),
      selectedNodeIds: selectedNodeId !== null ? [selectedNodeId] : [...selectedNodeIds],
      studyMode: activeStudyMode,
      payload: {
        surface: 'knowledge-map',
        domain: activeDomain,
        alignmentScore,
      },
    }),
    [
      activeDomain,
      activeStudyMode,
      alignmentScore,
      searchQuery,
      selectedNode,
      selectedNodeId,
      selectedNodeIds,
      suggestionPreview,
      userId,
    ]
  );

  const buildExpansionRequest = React.useCallback(
    (scopeType: PkgExpansionScopeType): IPkgExpansionRequest => ({
      scope: {
        scopeType,
        nodeIds: scopeType === 'node' && selectedNode !== null ? [String(selectedNode.id)] : [],
        ...(scopeType === 'domain'
          ? { domain: expansionDomain.trim() !== '' ? expansionDomain.trim() : activeDomain }
          : {}),
      },
      studyMode: activeStudyMode,
      limit: scopeType === 'whole_pkg' ? 24 : 12,
    }),
    [activeDomain, activeStudyMode, expansionDomain, selectedNode]
  );

  const buildExpansionAgentRequest = React.useCallback(
    (scopeType: PkgExpansionScopeType): IAgentRunRequest | null => {
      const request = buildExpansionRequest(scopeType);
      const limit = request.limit ?? 12;
      const scopedConceptIds =
        scopeType === 'node'
          ? selectedNode !== null && selectedNode.label.trim() !== ''
            ? [selectedNode.label]
            : []
          : nodes
              .filter((node) => {
                if (scopeType !== 'domain') {
                  return true;
                }
                const domain = request.scope.domain ?? activeDomain;
                return node.domain === domain;
              })
              .map((node) => node.label.trim())
              .filter((label) => label !== '')
              .slice(0, limit);

      if (scopedConceptIds.length === 0) {
        return null;
      }

      return {
        userId,
        conceptIds: scopedConceptIds,
        selectedNodeIds: request.scope.nodeIds,
        studyMode: request.studyMode ?? null,
        executionPreference: 'batch',
        requestTimeoutMs: 30 * 60 * 1000,
        allowFallback: true,
        operationName: 'expand_pkg',
        graphExpansionScope: request.scope,
        payload: {
          operationName: 'expand_pkg',
          proposalType: 'expand_pkg',
          operationType: 'expand_pkg',
          graphExpansionScope: request.scope,
          domain: request.scope.domain ?? activeDomain,
          surface: 'knowledge-map',
        },
      };
    },
    [activeDomain, buildExpansionRequest, nodes, selectedNode, userId]
  );

  const handleGenerateExpansion = React.useCallback(
    async (scopeType: PkgExpansionScopeType) => {
      setExpansionError(null);
      setExpansionScopeType(scopeType);
      setActiveWorkspacePanel('review');
      setExpansionBundle(null);
      setSelectedExpansionIds(new Set());
      setDismissedExpansionIds(new Set());
      const expansionRequest = buildExpansionRequest(scopeType);
      const agentRequest = buildExpansionAgentRequest(scopeType);
      if (agentRequest === null) {
        setExpansionBundle(buildEmptyExpansionBundle(expansionRequest));
        syncWorkspaceQuery('review', null);
        return;
      }
      try {
        const response = await generatePkgExpansion.mutateAsync(agentRequest);
        syncWorkspaceQuery('review', {
          agent: 'knowledge-graph-agent',
          jobId: response.data.jobId ?? '',
          runId: response.data.runId,
        });
      } catch (err) {
        setExpansionError(
          formatExpansionError(
            err,
            'generate expansion proposals',
            'We could not generate expansion proposals.'
          )
        );
      }
    },
    [buildExpansionAgentRequest, buildExpansionRequest, generatePkgExpansion, syncWorkspaceQuery]
  );

  const toggleExpansionSelection = React.useCallback((proposalId: string) => {
    setSelectedExpansionIds((current) => {
      const next = new Set(current);
      if (next.has(proposalId)) {
        next.delete(proposalId);
      } else {
        next.add(proposalId);
      }
      return next;
    });
  }, []);

  const dismissExpansionProposal = React.useCallback((proposalId: string) => {
    markExpansionProposalsConsumed([proposalId]);
    setSelectedExpansionIds((current) => {
      const next = new Set(current);
      next.delete(proposalId);
      return next;
    });
  }, [markExpansionProposalsConsumed]);

  const handleApplyExpansionSelection = React.useCallback(
    async (proposalIds: string[]) => {
      if (expansionBundle === null || proposalIds.length === 0) {
        return;
      }
      setExpansionError(null);
      try {
        const request: ApplyPkgExpansionSelectionRequest = {
          scope: expansionBundle.scope,
          selectedProposalIds: proposalIds,
          proposals: expansionBundle.proposals,
          forwardCanonical: true,
        };
        await applyPkgExpansion.mutateAsync(request);
        markExpansionProposalsConsumed(proposalIds);
        setSelectedExpansionIds(new Set());
        setManagerSuccess(`Applied ${String(proposalIds.length)} expansion proposal(s).`);
      } catch (err) {
        setExpansionError(
          formatExpansionError(
            err,
            'apply expansion proposals',
            'We could not apply the selected expansion proposals.'
          )
        );
      }
    },
    [applyPkgExpansion, expansionBundle, markExpansionProposalsConsumed]
  );

  const dismissReviewProposal = React.useCallback((proposalId: string) => {
    markReviewProposalsConsumed([proposalId]);
  }, [markReviewProposalsConsumed]);

  const handleApproveReviewProposal = React.useCallback(
    async (proposalId: string) => {
      const serializedProposals = reviewGraphProposals.reduce<
        ApplyGraphAgentProposalSelectionRequest['proposals']
      >((acc, proposal) => {
          const proposalOperation =
            typeof proposal['operation'] === 'object' && proposal['operation'] !== null
              ? (proposal['operation'] as Record<string, unknown>)
              : null;
          if (proposalOperation === null || typeof proposal['proposalId'] !== 'string') {
            return acc;
          }

          acc.push({
            proposalId: proposal['proposalId'],
            conceptId:
              typeof proposal['conceptId'] === 'string' ? proposal['conceptId'] : null,
            proposalType:
              typeof proposal['proposalType'] === 'string' ? proposal['proposalType'] : null,
            operation: proposalOperation,
            rationale:
              typeof proposal['rationale'] === 'string' ? proposal['rationale'] : null,
            confidenceScore:
              typeof proposal['confidenceScore'] === 'number'
                ? proposal['confidenceScore']
                : null,
            reviewState:
              typeof proposal['reviewState'] === 'string' ? proposal['reviewState'] : null,
            sourceDocumentIds: Array.isArray(proposal['sourceDocumentIds'])
              ? proposal['sourceDocumentIds'].filter(
                  (value): value is string => typeof value === 'string' && value !== ''
                )
              : [],
            candidateLabel:
              typeof proposal['candidateLabel'] === 'string'
                ? proposal['candidateLabel']
                : null,
            metadata:
              typeof proposal['metadata'] === 'object' && proposal['metadata'] !== null
                ? (proposal['metadata'] as Record<string, unknown>)
                : {},
            ckgOperations: Array.isArray(proposal['ckgOperations'])
              ? proposal['ckgOperations'].filter(
                  (value): value is Record<string, unknown> =>
                    typeof value === 'object' && value !== null
                )
              : [],
          });
          return acc;
        }, []);

      setReviewActionError(null);
      setReviewActionMessage(null);
      setApplyingReviewProposalId(proposalId);
      try {
        const response = await applyGraphAgentProposals.mutateAsync({
          selectedProposalIds: [proposalId],
          proposals: serializedProposals,
          forwardCanonical: true,
        });
        setReviewActionMessage(response.data.message);
        dismissReviewProposal(proposalId);
      } catch (error) {
        setReviewActionError(
          error instanceof Error ? error.message : 'Could not apply this graph suggestion.'
        );
      } finally {
        setApplyingReviewProposalId(null);
      }
    },
    [applyGraphAgentProposals, dismissReviewProposal, reviewGraphProposals]
  );

  const setSingleSelectedNode = React.useCallback(
    (nodeId: string) => {
      selectNode(nodeId);
      setSelectedNodeIds(new Set([nodeId]));
      setIsNodeDetailOpen(true);
    },
    [selectNode]
  );

  const clearGraphSelection = React.useCallback(() => {
    deselectNode();
    setSelectedNodeIds(new Set());
    setIsNodeDetailOpen(false);
  }, [deselectNode]);

  const handleNodeClick = React.useCallback(
    (node: IGraphNodeDto, event?: MouseEvent) => {
      const nodeId = String(node.id);
      const isMultiSelectGesture = event?.ctrlKey === true || event?.metaKey === true;

      if (!isMultiSelectGesture) {
        setSingleSelectedNode(nodeId);
        setContextMenu(null);
        setQuickEdgeMenu(null);
        return;
      }

      const nextSelection = resolveKnowledgeMultiSelect(selectedNodeIds, nodeId);
      setSelectedNodeIds(nextSelection.selectedNodeIds);

      if (nextSelection.primaryNodeId === null) {
        deselectNode();
        setIsNodeDetailOpen(false);
      } else {
        selectNode(nextSelection.primaryNodeId);
        setIsNodeDetailOpen(nextSelection.isNodeDetailOpen);
      }

      setContextMenu(null);
      setQuickEdgeMenu(null);
    },
    [deselectNode, selectNode, selectedNodeIds, setSingleSelectedNode]
  );

  const handleNodeHover = React.useCallback(
    (node: IGraphNodeDto | null) => {
      setHoveredNode(node !== null ? String(node.id) : null);
    },
    [setHoveredNode]
  );

  const handleNodeRightClick = React.useCallback(
    (node: IGraphNodeDto, event: MouseEvent) => {
      event.preventDefault();
      const targetNodeId = String(node.id);
      const hasSingleSourceSelection =
        selectedNodeIds.size === 1 &&
        selectedNodeId !== null &&
        selectedNodeIds.has(selectedNodeId) &&
        selectedNodeId !== targetNodeId;

      if (hasSingleSourceSelection) {
        setQuickEdgeMenu(
          defaultQuickEdgeMenu(selectedNodeId, targetNodeId, event.clientX, event.clientY)
        );
        setContextMenu(null);
        return;
      }

      setQuickEdgeMenu(null);
      setContextMenu({ node, x: event.clientX, y: event.clientY });
    },
    [selectedNodeId, selectedNodeIds]
  );

  const handleBackgroundClick = React.useCallback(() => {
    clearGraphSelection();
    setContextMenu(null);
    setQuickEdgeMenu(null);
  }, [clearGraphSelection]);

  const handleNodeSelect = React.useCallback(
    (node: IGraphNodeDto) => {
      setSingleSelectedNode(String(node.id));
    },
    [setSingleSelectedNode]
  );

  const handleViewPrerequisites = React.useCallback(
    (nodeId: string) => {
      selectNode(nodeId);
      setSelectedNodeIds(new Set([nodeId]));
      setIsNodeDetailOpen(true);
      setActiveWorkspacePanel('prerequisites');
      syncWorkspaceQuery(null);
      if (!activeOverlays.has('prerequisites')) {
        toggleOverlay('prerequisites');
      }
    },
    [activeOverlays, selectNode, syncWorkspaceQuery, toggleOverlay]
  );

  const activeOverlaysArray = React.useMemo(() => [...activeOverlays], [activeOverlays]);
  const selectedNodeCount = selectedNodeIds.size;
  const controlsDeleteActionLabel =
    selectedNodeCount > 1
      ? `Delete ${String(selectedNodeCount)} selected nodes`
      : selectedNode !== null
        ? 'Delete selected node'
        : undefined;
  const isDeleteSelectionPending =
    deleteNode.isPending || bulkDeleteNodes.isPending || selectedNodeCount === 0;
  const graphControlsDeleteProps =
    controlsDeleteActionLabel === undefined
      ? {}
      : {
          selectedNodeCount,
          deleteActionLabel: controlsDeleteActionLabel,
          deleteActionHint: 'Press Delete on your keyboard to remove the current selection.',
          isDeleteActionPending: isDeleteSelectionPending,
          onDeleteSelection: () => {
            if (selectedNodeCount > 1) {
              void handleDeleteSelectedNodes();
              return;
            }

            void handleDeleteSelectedNode();
          },
        };

  useKeyboardShortcuts([
    {
      key: 'Delete',
      label:
        selectedNodeCount > 1
          ? 'Delete selected nodes'
          : selectedNodeCount === 1
            ? 'Delete selected node'
            : 'Delete selected node(s)',
      when: () => selectedNodeCount > 0 && !isDeleteSelectionPending,
      handler: () => {
        if (selectedNodeCount > 1) {
          void handleDeleteSelectedNodes();
          return;
        }

        void handleDeleteSelectedNode();
      },
    },
  ]);

  React.useEffect(() => {
    if (contextMenu === null && quickEdgeMenu === null) return;
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setQuickEdgeMenu(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu, quickEdgeMenu]);

  React.useEffect(() => {
    if (selectedNodeId === null) {
      setSelectedNodeIds(new Set());
      return;
    }

    setSelectedNodeIds((prev) => {
      if (prev.size === 1 && prev.has(selectedNodeId)) {
        return prev;
      }
      return prev.size > 1 && prev.has(selectedNodeId) ? prev : new Set([selectedNodeId]);
    });
  }, [selectedNodeId]);

  async function handleApplySuggestion(node: IGraphNodeDto): Promise<void> {
    setSystemError(null);
    try {
      const response = await createNode.mutateAsync({
        label: node.label,
        type: node.type,
        domain: activeDomain,
        ...(node.description !== null ? { description: node.description } : {}),
        ...(node.tags.length > 0 ? { tags: node.tags } : {}),
        supportedStudyModes:
          node.supportedStudyModes.length > 0 ? node.supportedStudyModes : [activeStudyMode],
        ...(Object.keys(node.metadata).length > 0 ? { metadata: node.metadata } : {}),
      });
      setSingleSelectedNode(String(response.data.id));
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
          domain: activeDomain,
          ...(node.description !== null ? { description: node.description } : {}),
          ...(node.tags.length > 0 ? { tags: node.tags } : {}),
          supportedStudyModes:
            node.supportedStudyModes.length > 0 ? node.supportedStudyModes : [activeStudyMode],
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
        domain: activeDomain,
        ...(createNodeForm.description.trim() !== ''
          ? { description: createNodeForm.description.trim() }
          : {}),
        ...(parseTags(createNodeForm.tags).length > 0
          ? { tags: parseTags(createNodeForm.tags) }
          : {}),
        supportedStudyModes: [activeStudyMode],
      });
      setCreateNodeForm(defaultCreateNodeForm());
      setSingleSelectedNode(String(response.data.id));
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
    const connectedEdgeCount = selectedNodeEdges.length;
    const deletionConfirmed = window.confirm(
      connectedEdgeCount > 0
        ? `Permanently delete "${selectedNode.label}" and its ${String(connectedEdgeCount)} connected edge${
            connectedEdgeCount === 1 ? '' : 's'
          }? Linked cards will be unlinked automatically.`
        : `Permanently delete "${selectedNode.label}"? Linked cards will be unlinked automatically.`
    );
    if (!deletionConfirmed) {
      return;
    }
    setManagerError(null);
    setManagerSuccess(null);
    try {
      await deleteNode.mutateAsync();
      clearGraphSelection();
      setContextMenu(null);
      setQuickEdgeMenu(null);
      setManagerSuccess(
        connectedEdgeCount > 0
          ? `Deleted the selected PKG node and ${String(connectedEdgeCount)} connected edge${
              connectedEdgeCount === 1 ? '' : 's'
            }.`
          : 'Deleted the selected PKG node.'
      );
    } catch (err) {
      setManagerError(err instanceof Error ? err.message : 'Failed to delete node.');
    }
  }

  async function handleDeleteSelectedNodes(): Promise<void> {
    if (selectedNodeIds.size < 2) {
      return;
    }

    const selectedIds = Array.from(selectedNodeIds);
    const selectedLabels = nodes
      .filter((node) => selectedNodeIds.has(String(node.id)))
      .map((node) => node.label);
    const connectedEdgeCount = edges.filter(
      (edge) =>
        selectedNodeIds.has(String(edge.sourceId)) || selectedNodeIds.has(String(edge.targetId))
    ).length;
    const confirmed = window.confirm(
      `Permanently delete ${String(selectedIds.length)} selected nodes${connectedEdgeCount > 0 ? ` and ${String(connectedEdgeCount)} connected edge${connectedEdgeCount === 1 ? '' : 's'}` : ''}?\n\n${selectedLabels.slice(0, 6).join(', ')}${selectedLabels.length > 6 ? '…' : ''}`
    );

    if (!confirmed) {
      return;
    }

    setManagerError(null);
    setManagerSuccess(null);
    try {
      const response = await bulkDeleteNodes.mutateAsync({ nodeIds: selectedIds });
      clearGraphSelection();
      setContextMenu(null);
      setQuickEdgeMenu(null);
      setManagerSuccess(
        response.data.failed.length === 0
          ? `Deleted ${String(response.data.deletedNodeIds.length)} PKG nodes and ${String(response.data.deletedEdgeCount)} connected edge(s).`
          : `Deleted ${String(response.data.deletedNodeIds.length)} PKG nodes. ${String(response.data.failed.length)} deletion(s) still need attention.`
      );
    } catch (err) {
      setManagerError(err instanceof Error ? err.message : 'Failed to delete the selected nodes.');
    }
  }

  async function handleResetPkg(): Promise<void> {
    const confirmation = window.prompt(
      `Type ${PKG_RESET_CONFIRMATION} to permanently wipe your PKG, attached edges, and graph-side derived records.`
    );

    if (confirmation !== PKG_RESET_CONFIRMATION) {
      return;
    }

    setManagerError(null);
    setManagerSuccess(null);
    try {
      const response = await resetPkg.mutateAsync({
        confirmation: PKG_RESET_CONFIRMATION,
      });
      clearGraphSelection();
      setContextMenu(null);
      setQuickEdgeMenu(null);
      setManagerSuccess(
        `Reset your PKG. Removed ${String(response.data.deletedNeo4jPkgNodes)} node(s) and ${String(response.data.deletedNeo4jPkgEdges)} edge(s).`
      );
    } catch (err) {
      setManagerError(err instanceof Error ? err.message : 'Failed to reset your PKG.');
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
    if (Number.isNaN(parsedWeight) || parsedWeight <= 0 || parsedWeight > 1) {
      setManagerError('Edge weight must be between 0 and 1.');
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

  async function handleCreateQuickEdge(): Promise<void> {
    if (quickEdgeMenu === null) {
      return;
    }

    const parsedWeight = Number(quickEdgeMenu.weight);
    if (Number.isNaN(parsedWeight) || parsedWeight <= 0 || parsedWeight > 1) {
      setManagerError('Edge weight must be between 0 and 1.');
      return;
    }

    setManagerError(null);
    setManagerSuccess(null);
    try {
      await createEdge.mutateAsync({
        sourceId: quickEdgeMenu.sourceNodeId as NodeId,
        targetId: quickEdgeMenu.targetNodeId as NodeId,
        type: quickEdgeMenu.type,
        weight: parsedWeight,
      });
      setQuickEdgeMenu(null);
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
      await queryClient.invalidateQueries({ queryKey: kgKeys.pkg(userId) });
      await queryClient.invalidateQueries({ queryKey: ['kg', 'comparison', userId] });
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
                Suggested notions
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
                <p className="text-sm font-medium text-foreground">Suggested starting notions</p>
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
              No canonical suggestions are available yet. You can still create your PKG manually
              from the graph builder controls on this page.
            </p>
          )}

          {systemError !== null && <p className="text-sm text-destructive">{systemError}</p>}
        </Section>

        <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
          <Section
            title="Manual PKG Setup"
            subtitle="If you prefer, you can begin by creating your own first nodes."
          >
                <Field label="Label" required>
              <input
                name="createNodeLabel"
                type="text"
                value={createNodeForm.label}
                onChange={(e) => {
                  setCreateNodeForm((prev) => ({ ...prev, label: e.target.value }));
                }}
                placeholder="Mathematics"
                className={inputClass}
              />
            </Field>
                <Field label="Type" required>
              <select
                name="createNodeType"
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
                name="createNodeDescription"
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
                name="createNodeTags"
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
    <div className="flex h-full min-h-0 w-full flex-col bg-background xl:overflow-hidden">
      <div className="z-30 flex flex-shrink-0 flex-col gap-3 border-b border-border bg-background px-4 py-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setIsControlsOpen((prev) => !prev);
            }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            <PanelLeft className="h-4 w-4" aria-hidden="true" />
            {isControlsOpen ? 'Hide controls' : 'Show controls'}
          </button>

          <div className="hidden min-w-0 max-w-[42rem] text-sm text-muted-foreground md:block">
            <span className="font-medium">{getStudyModeLabel(activeStudyMode)}</span>
            <span>{`: ${getStudyModeDescription(activeStudyMode)}`}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              const next = activeWorkspacePanel === 'review' ? null : 'review';
              setActiveWorkspacePanel(next);
              syncWorkspaceQuery(next, next === 'review' ? null : undefined);
            }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {activeWorkspacePanel === 'review' ? 'Hide suggestions' : 'Review suggestions'}
          </button>

          <button
            type="button"
            onClick={() => {
              void handleGenerateExpansion('whole_pkg');
            }}
            disabled={isExpansionGenerationPending || applyPkgExpansion.isPending}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {isExpansionGenerationPending && expansionScopeType === 'whole_pkg'
              ? 'Expanding PKG…'
              : 'Expand PKG'}
          </button>

          <button
            type="button"
            onClick={() => {
              void handleGenerateExpansion('domain');
            }}
            disabled={isExpansionGenerationPending || applyPkgExpansion.isPending}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            <GitBranch className="h-4 w-4" aria-hidden="true" />
            {isExpansionGenerationPending && expansionScopeType === 'domain'
              ? 'Expanding domain…'
              : `Expand ${expansionDomain}`}
          </button>

          <AgentActionButton
            agentName="knowledge-graph-agent"
            context={graphAgentContext}
            label="Draft graph suggestions"
            executionPreference="batch"
            size="sm"
          />

          {canCancelReviewBatchJob && (
            <button
              type="button"
              onClick={() => {
                void cancelReviewBatchJob.mutateAsync();
              }}
              disabled={cancelReviewBatchJob.isPending}
              className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-amber-500/20 disabled:pointer-events-none disabled:opacity-50"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              {cancelReviewBatchJob.isPending ? 'Cancelling request…' : 'Cancel request'}
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 xl:overflow-hidden">
        <div className="flex h-full min-h-0 flex-col gap-4 xl:flex-row">
          {isControlsOpen && (
            <div className="order-2 min-h-0 w-full flex-shrink-0 overflow-hidden xl:order-none xl:w-[320px]">
              <GraphControls
                nodes={visibleNodes}
                layoutMode={layoutMode}
                activeOverlays={activeOverlays}
                showLabels={showLabels}
                searchQuery={searchQuery}
                hiddenTypes={hiddenTypes}
                onLayoutChange={setLayoutMode}
                onOverlayToggle={toggleOverlay}
                onToggleLabels={() => {
                  setShowLabels((prev) => !prev);
                }}
                onSearchChange={setSearchQuery}
                onNodeSelect={handleNodeSelect}
                onToggleType={handleToggleType}
                selectedNodeId={selectedNodeId}
                primaryActionLabel="Create Node"
                onPrimaryAction={() => {
                  setActiveWorkspacePanel('create');
                  syncWorkspaceQuery(null);
                }}
                {...graphControlsDeleteProps}
                onClose={() => {
                  setIsControlsOpen(false);
                }}
              />
            </div>
          )}

          <div className="order-1 relative min-h-[50vh] min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card xl:order-none xl:min-h-0">
            <GraphCanvas
              nodes={visibleNodes}
              edges={visibleEdges}
              selectedNodeId={selectedNodeId}
              selectedNodeIds={selectedNodeIds}
              hoveredNodeId={hoveredNodeId}
              activeOverlays={activeOverlaysArray}
              layoutMode={layoutMode}
              showLabels={showLabels}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              onNodeRightClick={handleNodeRightClick}
              onBackgroundClick={handleBackgroundClick}
              highlightedNodeIds={highlightedNodeIds}
              className="h-full w-full"
            />
            {contextMenu !== null && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => {
                    setContextMenu(null);
                  }}
                />
                <div
                  className="fixed z-50 min-w-[180px] max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-card py-1 shadow-lg"
                  style={
                    {
                      left: `max(0.75rem, min(${String(contextMenu.x)}px, calc(100vw - 13rem)))`,
                      top: `max(0.75rem, min(${String(contextMenu.y)}px, calc(100vh - 18rem)))`,
                    } as React.CSSProperties
                  }
                >
                  <button
                    type="button"
                    className="w-full px-3 py-1.5 text-left text-sm text-foreground hover:bg-muted"
                    onClick={() => {
                      router.push(`/cards?conceptId=${String(contextMenu.node.id)}`);
                      setContextMenu(null);
                    }}
                  >
                    View payload linked to this notion
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
                          .filter(
                            (e) => String(e.sourceId) === nodeId || String(e.targetId) === nodeId
                          )
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
                      router.push(
                        `/knowledge/misconceptions?nodeId=${String(contextMenu.node.id)}`
                      );
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
            {quickEdgeMenu !== null && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => {
                    setQuickEdgeMenu(null);
                  }}
                />
                <div
                  className="fixed z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-4 shadow-xl"
                  style={
                    {
                      left: `max(0.75rem, min(${String(quickEdgeMenu.x)}px, calc(100vw - 23rem)))`,
                      top: `max(0.75rem, min(${String(quickEdgeMenu.y)}px, calc(100vh - 28rem)))`,
                      maxHeight: 'calc(100vh - 1.5rem)',
                    } as React.CSSProperties
                  }
                >
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-foreground">Create edge</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Source:{' '}
                      <span className="font-medium text-foreground">
                        {getNodeDisplayLabel(nodes, quickEdgeMenu.sourceNodeId)}
                      </span>{' '}
                      {'->'} target:{' '}
                      <span className="font-medium text-foreground">
                        {getNodeDisplayLabel(nodes, quickEdgeMenu.targetNodeId)}
                      </span>
                      .
                    </p>
                    {quickEdgeMenu.type === 'prerequisite' && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Meaning:{' '}
                        <span className="font-medium text-foreground">
                          {getNodeDisplayLabel(nodes, quickEdgeMenu.sourceNodeId)}
                        </span>{' '}
                        is a prerequisite of{' '}
                        <span className="font-medium text-foreground">
                          {getNodeDisplayLabel(nodes, quickEdgeMenu.targetNodeId)}
                        </span>
                        .
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-3">
                    <Field label="Edge type" required>
                      <select
                        name="quickEdgeType"
                        value={quickEdgeMenu.type}
                        onChange={(e) => {
                          setQuickEdgeMenu((prev) =>
                            prev === null ? null : { ...prev, type: e.target.value as EdgeType }
                          );
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
                        name="quickEdgeWeight"
                        type="number"
                        min={0.1}
                        max={1}
                        step={0.1}
                        value={quickEdgeMenu.weight}
                        onChange={(e) => {
                          setQuickEdgeMenu((prev) =>
                            prev === null ? null : { ...prev, weight: e.target.value }
                          );
                        }}
                        className={inputClass}
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void handleCreateQuickEdge();
                        }}
                        disabled={createEdge.isPending}
                        className={primaryButtonClass}
                      >
                        <GitBranch className="h-4 w-4" />
                        {createEdge.isPending ? 'Creating edge…' : 'Create edge'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setQuickEdgeMenu(null);
                        }}
                        className={secondaryButtonClass}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="pointer-events-none absolute bottom-4 right-4 z-20">
              <div className="pointer-events-auto rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-sm">
                Drag, zoom, or pan the canvas.
              </div>
            </div>
          </div>

          {hasKnowledgeWorkspaceRail && (
            <div className="noema-scrollbar order-3 flex min-h-0 w-full flex-shrink-0 flex-col gap-4 overflow-visible xl:order-none xl:w-[min(44rem,42vw)] xl:overflow-y-auto">
              {showNodeDetailPanel && (
                <div className="min-h-0 flex-shrink-0">
                  <NodeDetailPanel
                    node={selectedNode}
                    allNodes={visibleNodes}
                    allEdges={visibleEdges}
                    headerActions={
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            void handleGenerateExpansion('node');
                          }}
                          disabled={isExpansionGenerationPending || applyPkgExpansion.isPending}
                        >
                          Expand around this node
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActiveWorkspacePanel('manage');
                            syncWorkspaceQuery(null);
                          }}
                        >
                          Manage node
                        </Button>
                      </div>
                    }
                    onClose={() => {
                      setIsNodeDetailOpen(false);
                    }}
                    onViewPrerequisites={handleViewPrerequisites}
                  />
                </div>
              )}

              {activeWorkspacePanel !== null && (
                <aside
                  ref={workspacePanelRef}
                  className="min-h-0 max-h-[min(80vh,60rem)] overflow-hidden rounded-xl border border-border bg-muted/20 shadow-sm xl:max-h-none"
                >
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
                          {activeWorkspacePanel === 'create'
                            ? 'Create Node'
                            : activeWorkspacePanel === 'manage'
                              ? 'Manage Node'
                              : activeWorkspacePanel === 'prerequisites'
                                ? 'Prerequisites'
                              : 'Review Suggestions'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activeWorkspacePanel === 'create'
                            ? 'Add a new notion to your personal knowledge graph.'
                            : activeWorkspacePanel === 'manage'
                              ? selectedNode !== null
                                ? `Edit ${selectedNode.label}, manage its edges, or remove it permanently.`
                                : 'Select a node from the graph first.'
                              : activeWorkspacePanel === 'prerequisites'
                                ? selectedNode !== null
                                  ? `Directed prerequisite edges for ${selectedNode.label}.`
                                  : 'Select a node to inspect its prerequisite direction.'
                              : 'Open graph suggestions, inspect the rationale, and apply only what fits your PKG.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveWorkspacePanel(null);
                          syncWorkspaceQuery(null);
                        }}
                        className="rounded-md border border-border bg-background p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Close workspace"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="noema-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                      {activeWorkspacePanel === 'review' && (
                        <div className="flex flex-col gap-3">
                          {reviewAgentName === 'knowledge-graph-agent' ? (
                            <>
                              <ProposalReviewPanel
                                proposal={reviewProposal}
                                capabilityTitle={knowledgeGraphCapability.title}
                                capabilityDescription={knowledgeGraphCapability.description}
                                capabilityPreparationDescription={
                                  knowledgeGraphCapability.preparationDescription
                                }
                                emptyTitle="No graph review draft yet"
                                emptyDescription="Open a completed graph-agent job from its review link to inspect the prepared suggestions."
                              />

                              <ProposalJobStatusCard
                                job={reviewBatchJob}
                                phase={proposalJobPhase(reviewBatchJob)}
                                canCancel={canCancelReviewBatchJob}
                                isCancelling={cancelReviewBatchJob.isPending}
                                onCancel={
                                  canCancelReviewBatchJob
                                    ? () => {
                                        void cancelReviewBatchJob.mutateAsync();
                                      }
                                    : undefined
                                }
                                title="Graph proposal request"
                              />

                              {reviewBatchJobQuery.isLoading && (
                                <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                  Loading graph draft…
                                </div>
                              )}

                              {reviewBatchJobQuery.isError && (
                                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                                  Could not load this graph draft for review.
                                </div>
                              )}

                              {reviewBatchJob !== undefined && (
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                  <div className="rounded-lg border border-border bg-background p-3">
                                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                      Status
                                    </p>
                                    <p className="mt-1 text-lg font-semibold capitalize">
                                      {reviewBatchJob.status.replaceAll('_', ' ')}
                                    </p>
                                  </div>
                                  <div className="rounded-lg border border-border bg-background p-3">
                                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                      Suggestions
                                    </p>
                                    <p className="mt-1 text-lg font-semibold">
                                      {String(visibleReviewGraphProposals.length)}
                                    </p>
                                  </div>
                                  <div className="rounded-lg border border-border bg-background p-3">
                                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                      Strategy
                                    </p>
                                    <p className="mt-1 text-lg font-semibold capitalize">
                                      {reviewBatchJob.executionStrategy.replaceAll('_', ' ')}
                                    </p>
                                  </div>
                                </div>
                              )}

                              {typeof reviewBatchPayload?.['notes'] === 'string' &&
                                reviewBatchPayload['notes'].trim() !== '' && (
                                  <div className="rounded-xl border border-border bg-background p-4">
                                    <p className="text-sm font-semibold text-foreground">
                                      Agent notes
                                    </p>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                      {reviewBatchPayload['notes']}
                                    </p>
                                  </div>
                                )}

                              {reviewActionMessage !== null && (
                                <div className="rounded-lg border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                                  {reviewActionMessage}
                                </div>
                              )}

                              {reviewActionError !== null && (
                                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                                  {reviewActionError}
                                </div>
                              )}

                              {visibleReviewGraphProposals.length > 0 && (
                                <div className="rounded-xl border border-border bg-background p-4">
                                  <div className="flex flex-col gap-4">
                                    <div>
                                      <p className="text-sm font-semibold text-foreground">
                                        Graph suggestions
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        Approve a suggestion to apply it immediately. Rejecting only removes it from this review session.
                                      </p>
                                    </div>

                                    {visibleReviewGraphProposals.map((proposal, index) => {
                                      const proposalId =
                                        typeof proposal['proposalId'] === 'string'
                                          ? proposal['proposalId']
                                          : `proposal-${String(index)}`;
                                      const operation =
                                        typeof proposal['operation'] === 'object' &&
                                        proposal['operation'] !== null
                                          ? (proposal['operation'] as Record<string, unknown>)
                                          : null;
                                      const candidateLabel =
                                        typeof proposal['candidateLabel'] === 'string' &&
                                        proposal['candidateLabel'].trim() !== ''
                                          ? proposal['candidateLabel']
                                          : operation !== null &&
                                              typeof operation['label'] === 'string' &&
                                              operation['label'].trim() !== ''
                                            ? operation['label']
                                          : typeof proposal['label'] === 'string' &&
                                              proposal['label'].trim() !== ''
                                            ? proposal['label']
                                            : typeof proposal['title'] === 'string' &&
                                                proposal['title'].trim() !== ''
                                              ? proposal['title']
                                              : `Suggestion ${String(index + 1)}`;
                                      const proposalType =
                                        typeof proposal['proposalType'] === 'string' &&
                                        proposal['proposalType'].trim() !== ''
                                          ? proposal['proposalType']
                                          : typeof proposal['operation'] === 'object' &&
                                              proposal['operation'] !== null &&
                                              typeof (proposal['operation'] as Record<string, unknown>)[
                                                'type'
                                              ] === 'string'
                                            ? String(
                                                (proposal['operation'] as Record<string, unknown>)[
                                                  'type'
                                                ]
                                              )
                                            : 'graph_change';
                                      const rationale =
                                        typeof proposal['rationale'] === 'string' &&
                                        proposal['rationale'].trim() !== ''
                                          ? proposal['rationale']
                                          : typeof proposal['reason'] === 'string' &&
                                              proposal['reason'].trim() !== ''
                                            ? proposal['reason']
                                            : typeof proposal['summary'] === 'string' &&
                                                proposal['summary'].trim() !== ''
                                              ? proposal['summary']
                                              : 'No rationale was included for this suggestion.';
                                      const confidence =
                                        typeof proposal['confidence'] === 'number' &&
                                        Number.isFinite(proposal['confidence'])
                                          ? proposal['confidence']
                                          : null;

                                      return (
                                        <div
                                          key={`${candidateLabel}-${proposalType}-${String(index)}`}
                                          className="rounded-xl border border-border bg-card p-3"
                                        >
                                          <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-semibold text-foreground">
                                                  {candidateLabel}
                                                </p>
                                                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                                                  {proposalType.replaceAll('_', ' ')}
                                                </span>
                                                {confidence !== null && (
                                                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                                                    {formatPercent(confidence)} confidence
                                                  </span>
                                                )}
                                              </div>
                                              <p className="mt-2 text-sm text-muted-foreground">
                                                {rationale}
                                              </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  void handleApproveReviewProposal(proposalId);
                                                }}
                                                disabled={
                                                  applyingReviewProposalId === proposalId ||
                                                  applyGraphAgentProposals.isPending
                                                }
                                                className={primaryButtonClass}
                                              >
                                                {applyingReviewProposalId === proposalId
                                                  ? 'Applying…'
                                                  : 'Approve'}
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  dismissReviewProposal(proposalId);
                                                }}
                                                disabled={
                                                  applyingReviewProposalId === proposalId ||
                                                  applyGraphAgentProposals.isPending
                                                }
                                                className={secondaryButtonClass}
                                              >
                                                Reject
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {reviewBatchJob !== undefined &&
                                visibleReviewGraphProposals.length === 0 &&
                                !reviewBatchJobQuery.isLoading &&
                                !reviewBatchJobQuery.isError &&
                                reviewBatchJob.status.toLowerCase() !== 'queued' &&
                                reviewBatchJob.status.toLowerCase() !== 'submitted' &&
                                reviewBatchJob.status.toLowerCase() !== 'running' && (
                                  <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                                    This batch finished without any reviewable graph suggestions.
                                  </div>
                                )}
                            </>
                          ) : (
                            <>
                              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                                <div className="flex flex-col gap-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleGenerateExpansion('whole_pkg');
                                      }}
                                      disabled={isExpansionGenerationPending || applyPkgExpansion.isPending}
                                      className={primaryButtonClass}
                                    >
                                      <Sparkles className="h-4 w-4" />
                                      Whole PKG
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void handleGenerateExpansion('domain');
                                      }}
                                      disabled={isExpansionGenerationPending || applyPkgExpansion.isPending}
                                      className={secondaryButtonClass}
                                    >
                                      <GitBranch className="h-4 w-4" />
                                      Expand this domain
                                    </button>
                                    {selectedNode !== null && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          void handleGenerateExpansion('node');
                                        }}
                                        disabled={isExpansionGenerationPending || applyPkgExpansion.isPending}
                                        className={secondaryButtonClass}
                                      >
                                        <Sparkles className="h-4 w-4" />
                                        Around selected node
                                      </button>
                                    )}
                                  </div>

                                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr),auto]">
                                    <Field
                                      label="Domain scope"
                                      hint="Used when you expand the active domain."
                                    >
                                      <input
                                        name="expansionDomain"
                                        type="text"
                                        value={expansionDomain}
                                        onChange={(event) => {
                                          setExpansionDomain(event.target.value);
                                        }}
                                        className={inputClass}
                                      />
                                    </Field>
                                    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                                      <p className="font-medium text-foreground">Current scope</p>
                                      <p className="mt-1">
                                        {expansionBundle?.scope.scopeType ?? expansionScopeType}
                                        {expansionBundle?.scope.scopeType === 'node' &&
                                        selectedNode !== null
                                          ? ` · ${selectedNode.label}`
                                          : ''}
                                        {(expansionBundle?.scope.domain ?? expansionDomain) !==
                                          '' &&
                                        (expansionBundle?.scope.scopeType ??
                                          expansionScopeType) === 'domain'
                                          ? ` · ${expansionBundle?.scope.domain ?? expansionDomain}`
                                          : ''}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {expansionBundle !== null && (
                                <div className="rounded-xl border border-border bg-background p-4">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-foreground">
                                        Expansion proposals
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        Review what to add, refine, or explain before changing your
                                        PKG.
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          void handleApplyExpansionSelection([
                                            ...selectedExpansionIds,
                                          ]);
                                        }}
                                        disabled={
                                          selectedExpansionIds.size === 0 ||
                                          applyPkgExpansion.isPending ||
                                          isExpansionGenerationPending
                                        }
                                        className={primaryButtonClass}
                                      >
                                        <Sparkles className="h-4 w-4" />
                                        {applyPkgExpansion.isPending
                                          ? 'Applying…'
                                          : 'Apply selected'}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                        Proposals
                                      </p>
                                      <p className="mt-1 text-lg font-semibold">
                                        {String(visibleExpansionProposals.length)}
                                      </p>
                                    </div>
                                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                        Nodes
                                      </p>
                                      <p className="mt-1 text-lg font-semibold">
                                        {String(expansionBundle.summary.nodeProposalCount)}
                                      </p>
                                    </div>
                                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                        Edges
                                      </p>
                                      <p className="mt-1 text-lg font-semibold">
                                        {String(expansionBundle.summary.edgeProposalCount)}
                                      </p>
                                    </div>
                                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                        Canonical
                                      </p>
                                      <p className="mt-1 text-lg font-semibold">
                                        {String(expansionBundle.summary.canonicalCandidateCount)}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="mt-4 flex flex-col gap-4">
                                    {groupedExpansionProposals.length === 0 ? (
                                      <p className="text-sm text-muted-foreground">
                                        No new expansion proposals are visible right now.
                                      </p>
                                    ) : (
                                      groupedExpansionProposals.map(([groupLabel, proposals]) => (
                                        <div key={groupLabel} className="flex flex-col gap-2">
                                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            {groupLabel}
                                          </p>
                                          {proposals.map((proposal) => (
                                            <div
                                              key={proposal.proposalId}
                                              className="rounded-xl border border-border bg-card p-3"
                                            >
                                              <div className="flex flex-wrap items-start justify-between gap-3">
                                                <label className="flex min-w-0 flex-1 items-start gap-3">
                                                  <input
                                                    type="checkbox"
                                                    checked={selectedExpansionIds.has(
                                                      proposal.proposalId
                                                    )}
                                                    onChange={() => {
                                                      toggleExpansionSelection(
                                                        proposal.proposalId
                                                      );
                                                    }}
                                                    className="mt-1 rounded border-border"
                                                  />
                                                  <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                      <p className="text-sm font-semibold text-foreground">
                                                        {proposal.title}
                                                      </p>
                                                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                                                        {proposal.confidenceLabel}
                                                      </span>
                                                      {proposal.canonicalSuggestion?.queued ===
                                                        true && (
                                                        <span className="rounded-full border border-amber-300/70 bg-amber-100/70 px-2 py-0.5 text-[11px] uppercase tracking-wide text-amber-900">
                                                          Also queue canonical review
                                                        </span>
                                                      )}
                                                    </div>
                                                    <p className="mt-1 text-sm text-foreground">
                                                      {proposal.summary}
                                                    </p>
                                                    <p className="mt-2 text-xs text-muted-foreground">
                                                      {proposal.whyThisHelps}
                                                    </p>
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                      {proposal.whatWillChange}
                                                    </p>
                                                    {proposal.preview !== undefined && (
                                                      <div className="mt-2 rounded-lg border border-border bg-muted/20 p-2 text-xs text-muted-foreground">
                                                        {proposal.preview.beforeLabel !==
                                                          undefined &&
                                                          proposal.preview.afterLabel !==
                                                            undefined && (
                                                            <p>
                                                              Label:{' '}
                                                              {proposal.preview.beforeLabel} →{' '}
                                                              {proposal.preview.afterLabel}
                                                            </p>
                                                          )}
                                                        {proposal.preview.beforeDescription !==
                                                          undefined &&
                                                          proposal.preview.afterDescription !==
                                                            undefined && (
                                                            <p className="mt-1">
                                                              Description:{' '}
                                                              {proposal.preview
                                                                .beforeDescription ?? 'None'}{' '}
                                                              →{' '}
                                                              {proposal.preview.afterDescription}
                                                            </p>
                                                          )}
                                                      </div>
                                                    )}
                                                    <p className="mt-2 text-xs text-muted-foreground">
                                                      Evidence: {proposal.evidenceSummary}
                                                    </p>
                                                  </div>
                                                </label>
                                                <div className="flex flex-wrap gap-2">
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      void handleApplyExpansionSelection([
                                                        proposal.proposalId,
                                                      ]);
                                                    }}
                                                    disabled={
                                                      applyPkgExpansion.isPending ||
                                                      isExpansionGenerationPending
                                                    }
                                                    className={secondaryButtonClass}
                                                  >
                                                    Apply
                                                  </button>
                                                  <button
                                                    type="button"
                                                    onClick={() => {
                                                      dismissExpansionProposal(
                                                        proposal.proposalId
                                                      );
                                                    }}
                                                    className={secondaryButtonClass}
                                                  >
                                                    Dismiss
                                                  </button>
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              )}

                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <div className="rounded-lg border border-border bg-background p-3">
                                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                    Alignment
                                  </p>
                                  <p className="mt-1 text-lg font-semibold">
                                    {formatPercent(alignmentScore)}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-border bg-background p-3">
                                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                    Missing
                                  </p>
                                  <p className="mt-1 text-lg font-semibold">
                                    {String(missingFromPkg.length)}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-border bg-background p-3">
                                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                    Personal
                                  </p>
                                  <p className="mt-1 text-lg font-semibold">
                                    {String(extraInPkg.length)}
                                  </p>
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
                                          <p className="truncate text-sm font-medium text-foreground">
                                            {node.label}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            {node.type}
                                          </p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            void handleApplySuggestion(node);
                                          }}
                                          disabled={
                                            createNode.isPending || isApplyingSuggestions
                                          }
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
                              {expansionError !== null && (
                                <p className="text-sm text-destructive">{expansionError}</p>
                              )}
                              {systemError !== null && (
                                <p className="text-sm text-destructive">{systemError}</p>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {activeWorkspacePanel === 'create' && (
                        <div className="flex flex-col gap-3">
                          <Field label="Label">
                            <input
                              name="guidedCreateNodeLabel"
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
                              name="guidedCreateNodeType"
                              value={createNodeForm.type}
                              onChange={(e) => {
                                setCreateNodeForm((prev) => ({
                                  ...prev,
                                  type: e.target.value as NodeType,
                                }));
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
                              name="guidedCreateNodeDescription"
                              value={createNodeForm.description}
                              onChange={(e) => {
                                setCreateNodeForm((prev) => ({
                                  ...prev,
                                  description: e.target.value,
                                }));
                              }}
                              rows={3}
                              placeholder="Optional description"
                              className={textareaClass}
                            />
                          </Field>
                          <Field label="Tags">
                            <input
                              name="guidedCreateNodeTags"
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
                          {managerError !== null && (
                            <p className="text-sm text-destructive">{managerError}</p>
                          )}
                          {managerSuccess !== null && (
                            <p className="text-sm text-emerald-600 dark:text-emerald-400">
                              {managerSuccess}
                            </p>
                          )}
                        </div>
                      )}

                      {activeWorkspacePanel === 'prerequisites' &&
                        (selectedNode === null ? (
                          <p className="text-sm text-muted-foreground">
                            Select a node to inspect prerequisite direction.
                          </p>
                        ) : (
                          <div className="flex flex-col gap-3">
                            <div className="rounded-lg border border-border bg-background p-3">
                              <p className="text-sm font-medium text-foreground">
                                Required before {selectedNode.label}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                These are incoming prerequisite edges. The source node is learned
                                before the selected target node.
                              </p>
                              {selectedNodePrerequisiteEdges.length === 0 ? (
                                <p className="mt-3 text-sm text-muted-foreground">
                                  No prerequisite edges point into this node.
                                </p>
                              ) : (
                                <div className="mt-3 flex flex-col gap-2">
                                  {selectedNodePrerequisiteEdges.map((edge) => (
                                    <div
                                      key={String(edge.id)}
                                      className="rounded-md border border-border px-3 py-2"
                                    >
                                      <p className="text-sm font-medium text-foreground">
                                        {getPrerequisiteMeaning(edge, nodes)}
                                      </p>
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        {getEdgeDirectionLabel(edge, nodes)} · weight{' '}
                                        {String(edge.weight)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="rounded-lg border border-border bg-background p-3">
                              <p className="text-sm font-medium text-foreground">
                                Depends on {selectedNode.label}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                These are outgoing prerequisite edges. The selected node is learned
                                before each target node.
                              </p>
                              {selectedNodeDependentEdges.length === 0 ? (
                                <p className="mt-3 text-sm text-muted-foreground">
                                  No prerequisite edges leave this node.
                                </p>
                              ) : (
                                <div className="mt-3 flex flex-col gap-2">
                                  {selectedNodeDependentEdges.map((edge) => (
                                    <div
                                      key={String(edge.id)}
                                      className="rounded-md border border-border px-3 py-2"
                                    >
                                      <p className="text-sm font-medium text-foreground">
                                        {getPrerequisiteMeaning(edge, nodes)}
                                      </p>
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        {getEdgeDirectionLabel(edge, nodes)} · weight{' '}
                                        {String(edge.weight)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}

                      {activeWorkspacePanel === 'manage' &&
                        (selectedNode === null ? (
                          selectedNodeIds.size > 1 ? (
                            <div className="space-y-3">
                              <p className="text-sm text-muted-foreground">
                                {String(selectedNodeIds.size)} nodes are selected. You can batch
                                delete them from here.
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  void handleDeleteSelectedNodes();
                                }}
                                disabled={bulkDeleteNodes.isPending}
                                className={secondaryButtonClass}
                              >
                                <Trash2 className="h-4 w-4" />
                                {bulkDeleteNodes.isPending
                                  ? 'Deleting selected nodes…'
                                  : `Delete ${String(selectedNodeIds.size)} selected nodes`}
                              </button>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              Select a node to rename it, update its description and tags, create
                              outgoing edges, or remove it from your PKG.
                            </p>
                          )
                        ) : (
                          <>
                            {selectedNodeIds.size > 1 && (
                              <div className="rounded-lg border border-border bg-background p-3">
                                <p className="text-sm font-medium text-foreground">
                                  Batch selection active
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {String(selectedNodeIds.size)} nodes are selected. The forms below
                                  still target the primary node, but you can batch delete the whole
                                  selection from here.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleDeleteSelectedNodes();
                                  }}
                                  disabled={bulkDeleteNodes.isPending}
                                  className={[secondaryButtonClass, 'mt-3'].join(' ')}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  {bulkDeleteNodes.isPending
                                    ? 'Deleting selected nodes…'
                                    : `Delete ${String(selectedNodeIds.size)} selected nodes`}
                                </button>
                              </div>
                            )}
                            <Field label="Label" required>
                              <input
                                name="editNodeLabel"
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
                              <input
                                type="text"
                                name="editNodeType"
                                value={selectedNode.type}
                                readOnly
                                className={inputClass}
                              />
                            </Field>
                            <Field label="Description">
                              <textarea
                                name="editNodeDescription"
                                value={editNodeForm.description}
                                onChange={(e) => {
                                  setEditNodeForm((prev) => ({
                                    ...prev,
                                    description: e.target.value,
                                  }));
                                }}
                                rows={3}
                                className={textareaClass}
                              />
                            </Field>
                            <Field label="Tags">
                              <input
                                name="editNodeTags"
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
                                {deleteNode.isPending
                                  ? 'Deleting…'
                                  : selectedNodeEdges.length > 0
                                    ? `Delete node + ${String(selectedNodeEdges.length)} edge${
                                        selectedNodeEdges.length === 1 ? '' : 's'
                                      }`
                                    : 'Delete node'}
                              </button>
                            </div>
                            <div className="rounded-lg border border-border bg-background p-3">
                              <div className="mb-3 flex items-center gap-2">
                                <GitBranch
                                  className="h-4 w-4 text-muted-foreground"
                                  aria-hidden="true"
                                />
                                <p className="text-sm font-medium text-foreground">
                                  Add edge from selected node
                                </p>
                              </div>
                              <div className="flex flex-col gap-3">
                                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                                  Source:{' '}
                                  <span className="font-medium text-foreground">
                                    {selectedNode.label}
                                  </span>
                                  {edgeForm.targetId !== '' && (
                                    <>
                                      {' '}
                                      {'->'} target:{' '}
                                      <span className="font-medium text-foreground">
                                        {getNodeDisplayLabel(nodes, edgeForm.targetId)}
                                      </span>
                                    </>
                                  )}
                                  {edgeForm.type === 'prerequisite' && edgeForm.targetId !== '' && (
                                    <p className="mt-1">
                                      Meaning:{' '}
                                      <span className="font-medium text-foreground">
                                        {selectedNode.label}
                                      </span>{' '}
                                      is a prerequisite of{' '}
                                      <span className="font-medium text-foreground">
                                        {getNodeDisplayLabel(nodes, edgeForm.targetId)}
                                      </span>
                                      .
                                    </p>
                                  )}
                                </div>
                                <Field label="Target node" required>
                                  <select
                                    name="edgeTargetId"
                                    value={edgeForm.targetId}
                                    onChange={(e) => {
                                      setEdgeForm((prev) => ({
                                        ...prev,
                                        targetId: e.target.value,
                                      }));
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
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <Field label="Edge type" required>
                                    <select
                                      name="edgeType"
                                      value={edgeForm.type}
                                      onChange={(e) => {
                                        setEdgeForm((prev) => ({
                                          ...prev,
                                          type: e.target.value as EdgeType,
                                        }));
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
                                      name="edgeWeight"
                                      type="number"
                                      min={0.1}
                                      max={1}
                                      step={0.1}
                                      value={edgeForm.weight}
                                      onChange={(e) => {
                                        setEdgeForm((prev) => ({
                                          ...prev,
                                          weight: e.target.value,
                                        }));
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
                                  No connected edges yet. Add one to start structuring this notion.
                                </p>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  {selectedNodeEdges.map((edge) => {
                                    const isOutgoing =
                                      String(edge.sourceId) === String(selectedNode.id);
                                    return (
                                      <div
                                        key={String(edge.id)}
                                        className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                                      >
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium text-foreground">
                                            {getEdgeTypeLabel(edge.type)} ·{' '}
                                            {isOutgoing ? 'outgoing' : 'incoming'}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            {getEdgeDirectionLabel(edge, nodes)} · weight{' '}
                                            {String(edge.weight)}
                                          </p>
                                          {edge.type === 'prerequisite' && (
                                            <p className="text-xs text-muted-foreground">
                                              {getPrerequisiteMeaning(edge, nodes)}
                                            </p>
                                          )}
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
                                          {isDeletingEdgeId === String(edge.id)
                                            ? 'Removing…'
                                            : 'Remove'}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                              <p className="text-sm font-medium text-destructive">Reset PKG</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Permanently wipe your PKG nodes, connected edges, operation log,
                                metric snapshots, staleness markers, misconceptions, and
                                aggregation evidence.
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  void handleResetPkg();
                                }}
                                disabled={resetPkg.isPending}
                                className={[secondaryButtonClass, 'mt-3 border-destructive/40'].join(
                                  ' '
                                )}
                              >
                                <Trash2 className="h-4 w-4" />
                                {resetPkg.isPending ? 'Resetting PKG…' : 'Wipe entire PKG'}
                              </button>
                            </div>
                          </>
                        ))}
                      {activeWorkspacePanel === 'manage' && managerError !== null && (
                        <p className="text-sm text-destructive">{managerError}</p>
                      )}
                      {activeWorkspacePanel === 'manage' && managerSuccess !== null && (
                        <p className="text-sm text-emerald-600 dark:text-emerald-400">
                          {managerSuccess}
                        </p>
                      )}
                    </div>
                  </div>
                </aside>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
