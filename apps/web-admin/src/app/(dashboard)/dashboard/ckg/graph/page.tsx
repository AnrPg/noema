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
import { useAuth } from '@noema/auth';
import {
  useCKGNodes,
  useCKGEdges,
  useCKGMutations,
  usePreviewCkgEdgeAuthoring,
  usePreviewCkgNodeBatchAuthoring,
  useProposeCkgMutation,
} from '@noema/api-client/knowledge-graph';
import type {
  ICkgEdgeAuthoringOptionDto,
  ICkgEdgeAuthoringPreviewDto,
  ICkgNodeBatchAuthoringPreviewDto,
  ICkgNodeBatchAuthoringConflictDto,
  ICkgMutationDto,
  IGraphEdgeDto,
  IGraphNodeDto,
} from '@noema/api-client/knowledge-graph';
import { meApi } from '@noema/api-client/user';
import { Network, Loader2, Trash2 } from 'lucide-react';
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
const SUPPORTED_LANGUAGE_FALLBACK = 'en';
const SUPPORTED_LANGUAGE_CODES = new Set([
  'en',
  'es',
  'fr',
  'de',
  'zh',
  'ja',
  'ko',
  'pt',
  'el',
  'ar',
  'hi',
  'ru',
  'ch',
]);

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function decodeEscapedText(value: string): string {
  return value
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    );
}

function normalizeLanguageCode(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePreferredLanguage(value: string | null | undefined): string {
  if (typeof value !== 'string' || value.trim() === '') {
    return SUPPORTED_LANGUAGE_FALLBACK;
  }

  const normalized = normalizeLanguageCode(value);
  const baseLanguage = normalized.split('-')[0] ?? normalized;
  return SUPPORTED_LANGUAGE_CODES.has(baseLanguage) ? baseLanguage : SUPPORTED_LANGUAGE_FALLBACK;
}

function localizedTextFromRecord(
  record: Record<string, unknown>,
  preferredLanguage: string
): string | null {
  const exact = record[preferredLanguage];
  const base = record[preferredLanguage.split('-')[0] ?? preferredLanguage];
  const english = record['en'];
  const englishUs = record['en-us'];
  const fallbackLanguage = Object.entries(record).find(([key]) =>
    /^[a-z]{2}(-[a-z]{2})?$/u.test(key)
  );

  for (const candidate of [exact, base, english, englishUs, fallbackLanguage?.[1]]) {
    const text = extractLocalizedText(candidate, preferredLanguage);
    if (text !== null) {
      return text;
    }
  }

  return null;
}

function extractLocalizedText(value: unknown, preferredLanguage: string): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }

    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      const parsed = parseJsonRecord(trimmed);
      if (parsed !== null) {
        return extractLocalizedText(parsed, preferredLanguage);
      }
    }

    return decodeEscapedText(trimmed);
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = extractLocalizedText(entry, preferredLanguage);
      if (text !== null) {
        return text;
      }
    }
    return null;
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const localizedRecordText = localizedTextFromRecord(record, preferredLanguage);
  if (localizedRecordText !== null) {
    return localizedRecordText;
  }

  for (const key of ['literal', 'label', 'preferredLabel', 'title', 'name', 'description']) {
    const text = extractLocalizedText(record[key], preferredLanguage);
    if (text !== null) {
      return text;
    }
  }

  return null;
}

function isUriLike(value: string): boolean {
  return /^https?:\/\//u.test(value.trim());
}

function localizeNode(node: IGraphNodeDto, preferredLanguage: string): IGraphNodeDto {
  const metadata = node.metadata;

  const preferredLabel = [
    metadata['preferredLabel'],
    metadata['title'],
    metadata['name'],
    metadata['label'],
  ]
    .map((entry) => extractLocalizedText(entry, preferredLanguage))
    .find((entry): entry is string => entry !== null && entry !== '');

  const preferredDescription = [metadata['description'], node.description]
    .map((entry) => extractLocalizedText(entry, preferredLanguage))
    .find((entry): entry is string => entry !== null && entry !== '');

  return {
    ...node,
    label:
      preferredLabel ??
      (isUriLike(node.label)
        ? (node.label
            .split('/')
            .filter((segment) => segment !== '')
            .at(-1) ?? node.label)
        : node.label),
    description: preferredDescription ?? node.description,
  };
}

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

const CATEGORY_LABELS: Record<string, string> = {
  taxonomic: 'Taxonomic',
  mereological: 'Mereological',
  logical: 'Logical',
  causal_temporal: 'Causal / Temporal',
  associative: 'Associative',
  structural_pedagogical: 'Structural / Pedagogical',
};

const NODE_TYPE_OPTIONS: IGraphNodeDto['type'][] = [
  'concept',
  'skill',
  'fact',
  'procedure',
  'principle',
  'example',
  'counterexample',
  'misconception',
];

type GraphNodeId = IGraphNodeDto['id'];

interface IEdgeAuthoringMenuState {
  sourceNodeId: GraphNodeId;
  targetNodeId: GraphNodeId;
  x: number;
  y: number;
  preview: ICkgEdgeAuthoringPreviewDto | null;
  isLoading: boolean;
  error: string | null;
}

interface IEdgeProposalDraft {
  sourceNodeId: GraphNodeId;
  targetNodeId: GraphNodeId;
  sourceLabel: string;
  targetLabel: string;
  edgeType: IGraphEdgeDto['type'];
  defaultWeight: number;
}

interface INodeBatchUpdateDraft {
  nodeType: string;
  domain: string;
  tags: string;
}

interface INodeBatchPreviewState {
  preview: ICkgNodeBatchAuthoringPreviewDto | null;
  mode: 'delete' | 'update';
}

function groupAuthoringOptions(
  preview: ICkgEdgeAuthoringPreviewDto
): { category: string; options: ICkgEdgeAuthoringOptionDto[] }[] {
  const groups = new Map<string, ICkgEdgeAuthoringOptionDto[]>();

  for (const option of preview.options) {
    const existing = groups.get(option.category) ?? [];
    existing.push(option);
    groups.set(option.category, existing);
  }

  return [...groups.entries()].map(([category, options]) => ({
    category,
    options,
  }));
}

function parseTagDraft(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '')
    ),
  ];
}

function summarizeSelectedNodes(count: number): string {
  return count === 1 ? '1 node selected' : `${String(count)} nodes selected`;
}

// ============================================================================
// Page
// ============================================================================

export default function CKGGraphBrowserPage(): React.JSX.Element {
  const { user, refreshUser } = useAuth();
  // --- Data ---
  const { data: nodesData = [], isLoading: nodesLoading, isError: nodesError } = useCKGNodes();
  const { data: edgesData = [], isLoading: edgesLoading, isError: edgesError } = useCKGEdges();

  const preferredLanguage = React.useMemo(() => {
    const primary =
      user?.username === 'noema_admin'
        ? SUPPORTED_LANGUAGE_FALLBACK
        : typeof user?.language === 'string' && user.language !== ''
          ? user.language
          : Array.isArray(user?.languages) && user.languages.length > 0
            ? (user.languages[0] ?? SUPPORTED_LANGUAGE_FALLBACK)
            : SUPPORTED_LANGUAGE_FALLBACK;
    return normalizePreferredLanguage(primary);
  }, [user]);

  React.useEffect(() => {
    if (
      user?.username !== 'noema_admin' ||
      normalizePreferredLanguage(user.language) === SUPPORTED_LANGUAGE_FALLBACK
    ) {
      return;
    }

    let cancelled = false;

    void meApi
      .updateProfile({ languages: [SUPPORTED_LANGUAGE_FALLBACK] }, user.version)
      .then(async () => {
        if (!cancelled) {
          await refreshUser();
        }
      })
      .catch(() => {
        // Non-fatal: the graph still falls back to English locally.
      });

    return () => {
      cancelled = true;
    };
  }, [refreshUser, user]);

  const nodes: IGraphNodeDto[] = React.useMemo(
    () => nodesData.map((node) => localizeNode(node, preferredLanguage)),
    [nodesData, preferredLanguage]
  );
  const edges: IGraphEdgeDto[] = edgesData;

  // --- Local graph state ---
  const [layoutMode, setLayoutMode] = React.useState<LayoutMode>('force');
  const [activeOverlays, setActiveOverlays] = React.useState<Set<OverlayType>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = React.useState<Set<string>>(new Set());
  const [relationSourceNodeId, setRelationSourceNodeId] = React.useState<GraphNodeId | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [hiddenTypes, setHiddenTypes] = React.useState<Set<string>>(new Set());
  const [showLabels, setShowLabels] = React.useState(false);
  const [isControlsOpen, setIsControlsOpen] = React.useState(false);
  const [isLegendOpen, setIsLegendOpen] = React.useState(false);
  const [isMinimapOpen, setIsMinimapOpen] = React.useState(false);
  const [edgeAuthoringMessage, setEdgeAuthoringMessage] = React.useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = React.useState<string | null>(null);
  const [edgeAuthoringMenu, setEdgeAuthoringMenu] = React.useState<IEdgeAuthoringMenuState | null>(
    null
  );
  const [edgeProposalDraft, setEdgeProposalDraft] = React.useState<IEdgeProposalDraft | null>(null);
  const [edgeProposalRationale, setEdgeProposalRationale] = React.useState('');
  const [nodeBatchUpdateDraft, setNodeBatchUpdateDraft] = React.useState<INodeBatchUpdateDraft>({
    nodeType: '',
    domain: '',
    tags: '',
  });
  const [nodeBatchPreviewState, setNodeBatchPreviewState] =
    React.useState<INodeBatchPreviewState | null>(null);
  const detailPanelRef = React.useRef<HTMLDivElement | null>(null);
  const previewEdgeAuthoring = usePreviewCkgEdgeAuthoring();
  const previewNodeBatchAuthoring = usePreviewCkgNodeBatchAuthoring();
  const proposeCkgMutation = useProposeCkgMutation();

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
  const selectedNodes = React.useMemo(
    () => nodes.filter((node) => selectedNodeIds.has(node.id as string)),
    [nodes, selectedNodeIds]
  );
  const nodeBatchPreview = nodeBatchPreviewState?.preview ?? null;
  const nodeBatchPreviewMode = nodeBatchPreviewState?.mode ?? null;
  const relationSourceNode = React.useMemo(
    () => nodes.find((node) => (node.id as string) === relationSourceNodeId) ?? null,
    [nodes, relationSourceNodeId]
  );
  const selectedEdge = React.useMemo(
    () => edges.find((edge) => (edge.id as string) === selectedEdgeId) ?? null,
    [edges, selectedEdgeId]
  );
  const selectedEdgeSource = React.useMemo(
    () => nodes.find((node) => (node.id as string) === (selectedEdge?.sourceId as string)) ?? null,
    [nodes, selectedEdge]
  );
  const selectedEdgeTarget = React.useMemo(
    () => nodes.find((node) => (node.id as string) === (selectedEdge?.targetId as string)) ?? null,
    [nodes, selectedEdge]
  );

  // --- Handlers ---

  const handleNodeClick = React.useCallback((node: IGraphNodeDto, event?: MouseEvent) => {
    const id = node.id as string;
    const isMultiSelectIntent = event?.ctrlKey === true || event?.metaKey === true;
    setIsControlsOpen(false);
    setSelectedEdgeId(null);
    setEdgeAuthoringMenu(null);
    setEdgeProposalDraft(null);
    setNodeBatchPreviewState(null);
    setEdgeAuthoringMessage(null);

    if (isMultiSelectIntent) {
      setSelectedNodeIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        const nextPrimary = next.has(id) ? node.id : ([...next][0] ?? null);
        setSelectedNodeId(nextPrimary);
        setRelationSourceNodeId(nextPrimary);
        return next;
      });
      return;
    }

    setSelectedNodeId(node.id as string);
    setSelectedNodeIds(new Set([id]));
    setRelationSourceNodeId(node.id);
  }, []);

  const handleNodeHover = React.useCallback((node: IGraphNodeDto | null) => {
    setHoveredNodeId(node !== null ? (node.id as string) : null);
  }, []);

  const handleBackgroundClick = React.useCallback(() => {
    setSelectedNodeId(null);
    setSelectedNodeIds(new Set());
    setRelationSourceNodeId(null);
    setSelectedEdgeId(null);
    setEdgeAuthoringMenu(null);
    setEdgeProposalDraft(null);
    setNodeBatchPreviewState(null);
    setEdgeAuthoringMessage(null);
  }, []);

  const handleNodeSelect = React.useCallback((node: IGraphNodeDto) => {
    setIsControlsOpen(false);
    setSelectedNodeId(node.id as string);
    setSelectedNodeIds(new Set([node.id as string]));
    setRelationSourceNodeId(node.id);
    setSelectedEdgeId(null);
    setEdgeAuthoringMenu(null);
    setEdgeProposalDraft(null);
    setNodeBatchPreviewState(null);
    setEdgeAuthoringMessage(null);
  }, []);

  const handleClose = React.useCallback(() => {
    setSelectedNodeId(null);
    setSelectedNodeIds(new Set());
    setRelationSourceNodeId(null);
    setSelectedEdgeId(null);
    setEdgeAuthoringMenu(null);
    setEdgeProposalDraft(null);
    setNodeBatchPreviewState(null);
    setEdgeAuthoringMessage(null);
  }, []);

  const handleNodeRightClick = React.useCallback(
    (node: IGraphNodeDto, event: MouseEvent) => {
      event.preventDefault();

      const targetNodeId = node.id;
      const sourceNodeId = relationSourceNodeId;
      setEdgeAuthoringMessage(null);

      if (sourceNodeId === null || sourceNodeId === targetNodeId) {
        setSelectedNodeId(targetNodeId);
        setSelectedNodeIds(new Set([targetNodeId as string]));
        setRelationSourceNodeId(targetNodeId);
        setEdgeAuthoringMenu(null);
        setEdgeProposalDraft(null);
        setNodeBatchPreviewState(null);
        setEdgeAuthoringMessage(
          'Source node selected. Right-click a different node to create a canonical relation.'
        );
        return;
      }

      const initialMenuState: IEdgeAuthoringMenuState = {
        sourceNodeId,
        targetNodeId,
        x: event.clientX,
        y: event.clientY,
        preview: null,
        isLoading: true,
        error: null,
      };

      setEdgeProposalDraft(null);
      setNodeBatchPreviewState(null);
      setEdgeAuthoringMenu(initialMenuState);

      void (async () => {
        try {
          const response = await previewEdgeAuthoring.mutateAsync({
            sourceNodeId,
            targetNodeId,
          });
          setEdgeAuthoringMenu({
            ...initialMenuState,
            preview: response.data,
            isLoading: false,
          });
        } catch (error) {
          setEdgeAuthoringMenu({
            ...initialMenuState,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to load relation options.',
          });
        }
      })();
    },
    [previewEdgeAuthoring, relationSourceNodeId]
  );

  const handleSelectRelationOption = React.useCallback(
    (option: ICkgEdgeAuthoringOptionDto, preview: ICkgEdgeAuthoringPreviewDto) => {
      setEdgeAuthoringMenu(null);
      setEdgeProposalDraft({
        sourceNodeId: preview.source.nodeId,
        targetNodeId: preview.target.nodeId,
        sourceLabel: preview.source.label,
        targetLabel: preview.target.label,
        edgeType: option.edgeType,
        defaultWeight: option.defaultWeight,
      });
      setEdgeProposalRationale(
        `${preview.source.label} ${option.edgeType} ${preview.target.label}`
      );
    },
    []
  );

  const handleSubmitEdgeProposal = React.useCallback(async () => {
    if (edgeProposalDraft === null) {
      return;
    }

    const rationale =
      edgeProposalRationale.trim() !== ''
        ? edgeProposalRationale.trim()
        : `Create ${edgeProposalDraft.edgeType} relation between "${edgeProposalDraft.sourceLabel}" and "${edgeProposalDraft.targetLabel}".`;

    try {
      await proposeCkgMutation.mutateAsync({
        operations: [
          {
            type: 'add_edge',
            edgeType: edgeProposalDraft.edgeType,
            sourceNodeId: edgeProposalDraft.sourceNodeId,
            targetNodeId: edgeProposalDraft.targetNodeId,
            weight: edgeProposalDraft.defaultWeight,
            rationale,
          },
        ],
        rationale,
      });
      setEdgeProposalDraft(null);
      setEdgeProposalRationale('');
      setEdgeAuthoringMessage('Relation proposal submitted to the CKG mutation review queue.');
    } catch (error) {
      setEdgeAuthoringMessage(
        error instanceof Error ? error.message : 'Failed to submit the relation proposal.'
      );
    }
  }, [edgeProposalDraft, edgeProposalRationale, proposeCkgMutation]);

  const handlePreviewNodeBatchDelete = React.useCallback(async () => {
    const nodeIds = [...selectedNodeIds] as GraphNodeId[];
    if (nodeIds.length === 0) {
      return;
    }

    try {
      const response = await previewNodeBatchAuthoring.mutateAsync({
        nodeIds,
        action: 'delete',
      });
      setNodeBatchPreviewState({
        mode: 'delete',
        preview: response.data,
      });
      setEdgeAuthoringMessage(null);
    } catch (error) {
      setEdgeAuthoringMessage(
        error instanceof Error ? error.message : 'Failed to preview node deletion.'
      );
    }
  }, [previewNodeBatchAuthoring, selectedNodeIds]);

  const handlePreviewNodeBatchUpdate = React.useCallback(async () => {
    const nodeIds = [...selectedNodeIds] as GraphNodeId[];
    if (nodeIds.length === 0) {
      return;
    }

    const updates = {
      ...(nodeBatchUpdateDraft.nodeType !== ''
        ? { nodeType: nodeBatchUpdateDraft.nodeType as IGraphNodeDto['type'] }
        : {}),
      ...(nodeBatchUpdateDraft.domain.trim() !== ''
        ? { domain: nodeBatchUpdateDraft.domain.trim() }
        : {}),
      ...(nodeBatchUpdateDraft.tags.trim() !== ''
        ? { tags: parseTagDraft(nodeBatchUpdateDraft.tags) }
        : {}),
    };

    try {
      const response = await previewNodeBatchAuthoring.mutateAsync({
        nodeIds,
        action: 'update',
        ...(Object.keys(updates).length > 0 ? { updates } : {}),
      });
      setNodeBatchPreviewState({
        mode: 'update',
        preview: response.data,
      });
      setEdgeAuthoringMessage(null);
    } catch (error) {
      setEdgeAuthoringMessage(
        error instanceof Error ? error.message : 'Failed to preview batch node changes.'
      );
    }
  }, [nodeBatchUpdateDraft, previewNodeBatchAuthoring, selectedNodeIds]);

  const handleSubmitNodeBatchProposal = React.useCallback(async () => {
    const preview = nodeBatchPreviewState?.preview;
    if (preview?.proposal === null || preview?.proposal === undefined) {
      return;
    }

    try {
      await proposeCkgMutation.mutateAsync(preview.proposal);
      setNodeBatchPreviewState(null);
      setSelectedNodeId(null);
      setSelectedNodeIds(new Set());
      setRelationSourceNodeId(null);
      setEdgeAuthoringMessage('Batch node mutation proposal submitted to the CKG review queue.');
    } catch (error) {
      setEdgeAuthoringMessage(
        error instanceof Error ? error.message : 'Failed to submit the batch node proposal.'
      );
    }
  }, [nodeBatchPreviewState, proposeCkgMutation]);

  const handleEdgeClick = React.useCallback((edge: IGraphEdgeDto) => {
    setSelectedEdgeId(edge.id as string);
    setSelectedNodeId(null);
    setSelectedNodeIds(new Set());
    setRelationSourceNodeId(null);
    setEdgeAuthoringMenu(null);
    setEdgeProposalDraft(null);
    setNodeBatchPreviewState(null);
    setEdgeAuthoringMessage(
      'Edge selected. You can propose removal here, then recreate a replacement relation through the node-to-node authoring flow if needed.'
    );
  }, []);

  const handleSubmitEdgeRemovalProposal = React.useCallback(async () => {
    if (selectedEdge === null) {
      return;
    }

    const sourceLabel = selectedEdgeSource?.label ?? String(selectedEdge.sourceId);
    const targetLabel = selectedEdgeTarget?.label ?? String(selectedEdge.targetId);
    const rationale = `Remove ${selectedEdge.type} relation between "${sourceLabel}" and "${targetLabel}".`;

    try {
      await proposeCkgMutation.mutateAsync({
        operations: [
          {
            type: 'remove_edge',
            edgeId: selectedEdge.id,
            rationale,
          },
        ],
        rationale,
      });
      setSelectedEdgeId(null);
      setEdgeAuthoringMessage('Edge removal proposal submitted to the CKG review queue.');
    } catch (error) {
      setEdgeAuthoringMessage(
        error instanceof Error ? error.message : 'Failed to submit the edge removal proposal.'
      );
    }
  }, [proposeCkgMutation, selectedEdge, selectedEdgeSource, selectedEdgeTarget]);

  React.useEffect(() => {
    if (selectedNodeIds.size === 0 || nodeBatchUpdateDraft.nodeType === '') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void handlePreviewNodeBatchUpdate();
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [handlePreviewNodeBatchUpdate, nodeBatchUpdateDraft.nodeType, selectedNodeIds.size]);

  React.useEffect(() => {
    if (
      selectedNode === null &&
      edgeAuthoringMenu === null &&
      edgeProposalDraft === null &&
      nodeBatchPreviewState === null
    ) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setSelectedNodeId(null);
        setSelectedNodeIds(new Set());
        setRelationSourceNodeId(null);
        setSelectedEdgeId(null);
        setEdgeAuthoringMenu(null);
        setEdgeProposalDraft(null);
        setNodeBatchPreviewState(null);
        setEdgeAuthoringMessage(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [edgeAuthoringMenu, edgeProposalDraft, nodeBatchPreviewState, selectedNode]);

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
        <span className="text-xs text-muted-foreground">Ctrl/Cmd+click to multi-select nodes</span>
        {selectedNodes.length > 0 && (
          <span className="rounded-full border border-border bg-background/70 px-2 py-0.5 text-xs text-foreground">
            {summarizeSelectedNodes(selectedNodes.length)}
          </span>
        )}
        {relationSourceNode !== null && (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary">
            Source: {relationSourceNode.label}
          </span>
        )}
        {edgeAuthoringMessage !== null && (
          <span className="text-xs text-muted-foreground">{edgeAuthoringMessage}</span>
        )}
      </div>

      {selectedNodes.length > 0 && (
        <div className="flex flex-shrink-0 flex-wrap items-end gap-3 border-b border-border/80 bg-background/80 px-4 py-3">
          <div className="min-w-[12rem]">
            <p className="text-xs font-medium text-muted-foreground">Batch node type</p>
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              value={nodeBatchUpdateDraft.nodeType}
              onChange={(event) => {
                setNodeBatchUpdateDraft((current) => ({
                  ...current,
                  nodeType: event.target.value,
                }));
              }}
            >
              <option value="">Keep current type</option>
              {NODE_TYPE_OPTIONS.map((nodeType) => (
                <option key={nodeType} value={nodeType}>
                  {nodeType}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[12rem]">
            <p className="text-xs font-medium text-muted-foreground">Batch domain</p>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              value={nodeBatchUpdateDraft.domain}
              onChange={(event) => {
                setNodeBatchUpdateDraft((current) => ({
                  ...current,
                  domain: event.target.value,
                }));
              }}
              placeholder="Set domain"
            />
          </div>
          <div className="min-w-[16rem] flex-1">
            <p className="text-xs font-medium text-muted-foreground">Batch tags</p>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              value={nodeBatchUpdateDraft.tags}
              onChange={(event) => {
                setNodeBatchUpdateDraft((current) => ({
                  ...current,
                  tags: event.target.value,
                }));
              }}
              placeholder="tag-one, tag-two"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                void handlePreviewNodeBatchUpdate();
              }}
              disabled={previewNodeBatchAuthoring.isPending}
            >
              Preview batch edit
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void handlePreviewNodeBatchDelete();
              }}
              disabled={previewNodeBatchAuthoring.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Delete selected
            </Button>
          </div>
        </div>
      )}

      {/* Graph area */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Left control panel — includes layout, overlays (with pending_mutations), node list */}
        {isControlsOpen && (
          <div className="relative z-10">
            <GraphControls
              nodes={visibleNodes}
              layoutMode={layoutMode}
              showLabels={showLabels}
              activeOverlays={activeOverlays}
              searchQuery={searchQuery}
              hiddenTypes={hiddenTypes}
              onLayoutChange={setLayoutMode}
              onToggleLabels={() => {
                setShowLabels((current) => !current);
              }}
              onOverlayToggle={handleOverlayToggle}
              onSearchChange={setSearchQuery}
              onNodeSelect={handleNodeSelect}
              onToggleType={handleToggleType}
              selectedNodeId={selectedNodeId}
              onClose={() => {
                setIsControlsOpen(false);
              }}
            />
          </div>
        )}

        {/* Canvas + overlaid panels */}
        <div className="relative flex-1 overflow-hidden">
          <div className="absolute left-4 top-4 z-10 flex flex-col gap-2">
            {!isControlsOpen && (
              <button
                type="button"
                onClick={() => {
                  setIsControlsOpen(true);
                }}
                className="rounded border border-border bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
              >
                Controls
              </button>
            )}
          </div>

          <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsMinimapOpen((current) => !current);
              }}
              className="rounded border border-border bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              {isMinimapOpen ? 'Hide map' : 'Show map'}
            </button>
            {isMinimapOpen && <GraphMinimap nodes={visibleNodes} selectedNodeId={selectedNodeId} />}
          </div>

          <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsLegendOpen((current) => !current);
              }}
              className="rounded border border-border bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
            >
              {isLegendOpen ? 'Hide legend' : 'Show legend'}
            </button>
            {isLegendOpen && (
              <div className="rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
                <GraphLegend hiddenTypes={hiddenTypes} onToggleType={handleToggleType} />
              </div>
            )}
          </div>

          {pendingMutationsActive && pendingMutationsLoading && (
            <div className="absolute left-2 top-2 z-10">
              <span className="text-xs text-muted-foreground">(loading…)</span>
            </div>
          )}
          <GraphCanvas
            nodes={visibleNodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            selectedNodeIds={selectedNodeIds}
            selectedEdgeId={selectedEdgeId}
            hoveredNodeId={hoveredNodeId}
            showLabels={showLabels}
            activeOverlays={activeOverlaysArray}
            layoutMode={layoutMode}
            onNodeClick={handleNodeClick}
            onEdgeClick={handleEdgeClick}
            onNodeHover={handleNodeHover}
            onNodeRightClick={handleNodeRightClick}
            onBackgroundClick={handleBackgroundClick}
            highlightedNodeIds={highlightedNodeIds.size > 0 ? highlightedNodeIds : EMPTY_SET}
            className="h-full w-full"
          />

          {nodeBatchPreview !== null && nodeBatchPreviewMode !== null && (
            <div className="absolute left-4 top-20 z-30 w-[28rem] rounded-xl border border-border bg-background/95 p-4 shadow-2xl backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {nodeBatchPreviewMode === 'delete'
                      ? 'Confirm node deletion'
                      : 'Confirm batch node update'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {summarizeSelectedNodes(nodeBatchPreview.nodes.length)} ·{' '}
                    {String(nodeBatchPreview.affectedEdgeCount)} attached edge(s)
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setNodeBatchPreviewState(null);
                  }}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                {nodeBatchPreview.warnings.map((warning: string) => (
                  <div
                    key={warning}
                    className="rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200"
                  >
                    {warning}
                  </div>
                ))}

                {nodeBatchPreview.updates !== null && (
                  <div className="rounded-md border border-border bg-background/60 p-3 text-xs text-muted-foreground">
                    {nodeBatchPreview.updates.nodeType !== undefined && (
                      <p>Requested type: {nodeBatchPreview.updates.nodeType}</p>
                    )}
                    {nodeBatchPreview.updates.domain !== undefined && (
                      <p>Requested domain: {nodeBatchPreview.updates.domain}</p>
                    )}
                    {nodeBatchPreview.updates.tags !== undefined && (
                      <p>Requested tags: {nodeBatchPreview.updates.tags.join(', ')}</p>
                    )}
                  </div>
                )}

                {nodeBatchPreview.conflicts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Retyping conflicts
                    </p>
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {nodeBatchPreview.conflicts.map(
                        (conflict: ICkgNodeBatchAuthoringConflictDto) => (
                          <div
                            key={`${conflict.nodeId}-${conflict.edgeId}-${conflict.direction}`}
                            className="rounded-md border border-destructive/30 bg-destructive/10 p-3"
                          >
                            <p className="text-xs font-medium text-foreground">
                              {conflict.message}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              Other endpoint: {conflict.otherNodeLabel} · Edge {conflict.edgeType} (
                              {conflict.edgeId})
                            </p>
                            <div className="mt-2 space-y-1 text-[11px] text-amber-200">
                              {conflict.suggestions.map((suggestion: string) => (
                                <p key={suggestion}>{suggestion}</p>
                              ))}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setNodeBatchPreviewState(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      void handleSubmitNodeBatchProposal();
                    }}
                    disabled={!nodeBatchPreview.canProceed || proposeCkgMutation.isPending}
                  >
                    Submit mutation proposal
                  </Button>
                </div>
              </div>
            </div>
          )}

          {edgeAuthoringMenu !== null && (
            <div
              className="absolute z-30 w-[24rem] rounded-xl border border-border bg-background/95 p-4 shadow-2xl backdrop-blur"
              style={{
                left: Math.max(16, edgeAuthoringMenu.x - 40),
                top: Math.max(72, edgeAuthoringMenu.y - 24),
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Create relation</p>
                  <p className="text-xs text-muted-foreground">
                    {relationSourceNode?.label ?? edgeAuthoringMenu.sourceNodeId} →{' '}
                    {nodes.find((entry) => (entry.id as string) === edgeAuthoringMenu.targetNodeId)
                      ?.label ?? edgeAuthoringMenu.targetNodeId}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setEdgeAuthoringMenu(null);
                  }}
                >
                  Close
                </button>
              </div>

              {edgeAuthoringMenu.isLoading ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading relation options…
                </div>
              ) : edgeAuthoringMenu.error !== null ? (
                <p className="mt-4 text-sm text-destructive">{edgeAuthoringMenu.error}</p>
              ) : edgeAuthoringMenu.preview !== null ? (
                <div className="mt-4 space-y-4">
                  {edgeAuthoringMenu.preview.warnings.length > 0 && (
                    <div className="rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                      {edgeAuthoringMenu.preview.warnings.join(' ')}
                    </div>
                  )}
                  {groupAuthoringOptions(edgeAuthoringMenu.preview).map((group) => (
                    <div key={group.category} className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {CATEGORY_LABELS[group.category] ?? group.category}
                      </p>
                      <div className="space-y-2">
                        {group.options.map((option) => (
                          <button
                            key={option.edgeType}
                            type="button"
                            disabled={!option.enabled}
                            onClick={() => {
                              const preview = edgeAuthoringMenu.preview;
                              if (!option.enabled) {
                                return;
                              }
                              if (preview === null) {
                                return;
                              }
                              handleSelectRelationOption(option, preview);
                            }}
                            className={`w-full rounded-md border p-3 text-left transition ${
                              option.enabled
                                ? 'border-border bg-background/60 hover:border-primary/40 hover:bg-primary/5'
                                : 'cursor-not-allowed border-border/60 bg-muted/30 text-muted-foreground'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium">{option.edgeType}</p>
                              <span className="text-[11px] text-muted-foreground">
                                weight {option.defaultWeight.toFixed(2)}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {option.description}
                            </p>
                            {option.blockedReasons.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {option.blockedReasons.map((reason) => (
                                  <p
                                    key={`${option.edgeType}-${reason.code}`}
                                    className="text-[11px] text-amber-300"
                                  >
                                    {reason.message}
                                  </p>
                                ))}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {edgeProposalDraft !== null && (
            <div className="absolute right-4 top-16 z-30 w-[26rem] rounded-xl border border-border bg-background/95 p-4 shadow-2xl backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Confirm relation proposal</p>
                  <p className="text-xs text-muted-foreground">
                    {edgeProposalDraft.sourceLabel} {edgeProposalDraft.edgeType}{' '}
                    {edgeProposalDraft.targetLabel}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setEdgeProposalDraft(null);
                  }}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <label
                  className="block text-xs font-medium text-muted-foreground"
                  htmlFor="edge-rationale"
                >
                  Rationale
                </label>
                <textarea
                  id="edge-rationale"
                  className="min-h-28 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary"
                  value={edgeProposalRationale}
                  onChange={(event) => {
                    setEdgeProposalRationale(event.target.value);
                  }}
                  placeholder="Explain why this relation is semantically appropriate."
                />
                <div className="rounded-md border border-border bg-background/60 p-3 text-xs text-muted-foreground">
                  This will create a normal `add_edge` mutation proposal and send it to the
                  canonical review queue. Nothing is written directly to the CKG from this screen.
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEdgeProposalDraft(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      void handleSubmitEdgeProposal();
                    }}
                    disabled={proposeCkgMutation.isPending}
                  >
                    {proposeCkgMutation.isPending ? 'Submitting…' : 'Submit mutation'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {selectedEdge !== null && (
            <div className="absolute bottom-4 right-4 z-30 w-[24rem] rounded-xl border border-border bg-background/95 p-4 shadow-2xl backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Selected relation</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedEdgeSource?.label ?? selectedEdge.sourceId} {selectedEdge.type}{' '}
                    {selectedEdgeTarget?.label ?? selectedEdge.targetId}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSelectedEdgeId(null);
                  }}
                >
                  Close
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-md border border-border bg-background/60 p-3 text-xs text-muted-foreground">
                  <p>Edge id: {selectedEdge.id}</p>
                  <p>Weight: {selectedEdge.weight}</p>
                  <p>Created: {new Date(selectedEdge.createdAt).toLocaleString()}</p>
                </div>
                <div className="rounded-md border border-border bg-background/60 p-3 text-xs text-muted-foreground">
                  To change this relation semantically, remove it first and then use the existing
                  node-to-node relation authoring flow to propose the replacement edge.
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedEdgeId(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void handleSubmitEdgeRemovalProposal();
                    }}
                    disabled={proposeCkgMutation.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    {proposeCkgMutation.isPending ? 'Submitting…' : 'Propose removal'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Node detail panel + "View pending mutations" link */}
          {selectedNode !== null && (
            <div
              ref={detailPanelRef}
              className="absolute bottom-4 left-4 top-4 z-20 flex w-[min(32rem,calc(100%-2rem))] max-w-[calc(100%-2rem)] flex-col"
            >
              <NodeDetailPanel
                node={selectedNode}
                allNodes={nodes}
                allEdges={edges}
                onClose={handleClose}
              />
              <div className="mt-1 flex flex-shrink-0 justify-end px-1">
                <Link
                  href={`/dashboard/ckg/mutations?nodeId=${String(selectedNodeId)}`}
                  className="text-xs text-primary hover:underline"
                >
                  View pending mutations for this node
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
