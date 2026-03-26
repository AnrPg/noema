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
import { useCKGNodes, useCKGEdges, useCKGMutations } from '@noema/api-client';
import type { IGraphNodeDto, IGraphEdgeDto, ICkgMutationDto } from '@noema/api-client';
import { meApi } from '@noema/api-client/user';
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
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
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
  return SUPPORTED_LANGUAGE_CODES.has(baseLanguage)
    ? baseLanguage
    : SUPPORTED_LANGUAGE_FALLBACK;
}

function localizedTextFromRecord(
  record: Record<string, unknown>,
  preferredLanguage: string
): string | null {
  const exact = record[preferredLanguage];
  const base = record[preferredLanguage.split('-')[0] ?? preferredLanguage];
  const english = record['en'];
  const englishUs = record['en-us'];
  const fallbackLanguage = Object.entries(record).find(([key]) => /^[a-z]{2}(-[a-z]{2})?$/u.test(key));

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

    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
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
  const metadata =
    typeof node.metadata === 'object' && node.metadata !== null
      ? (node.metadata as Record<string, unknown>)
      : {};

  const preferredLabel = [metadata['preferredLabel'], metadata['title'], metadata['name'], metadata['label']]
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
        ? node.label.split('/').filter((segment) => segment !== '').at(-1) ?? node.label
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
      user === null ||
      user.username !== 'noema_admin' ||
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
  const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [hiddenTypes, setHiddenTypes] = React.useState<Set<string>>(new Set());
  const [showLabels, setShowLabels] = React.useState(false);
  const [isControlsOpen, setIsControlsOpen] = React.useState(false);
  const [isLegendOpen, setIsLegendOpen] = React.useState(false);
  const [isMinimapOpen, setIsMinimapOpen] = React.useState(false);
  const detailPanelRef = React.useRef<HTMLDivElement | null>(null);

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
    setIsControlsOpen(false);
    setSelectedNodeId((prev) => (prev === id ? null : id));
  }, []);

  const handleNodeHover = React.useCallback((node: IGraphNodeDto | null) => {
    setHoveredNodeId(node !== null ? (node.id as string) : null);
  }, []);

  const handleBackgroundClick = React.useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleNodeSelect = React.useCallback((node: IGraphNodeDto) => {
    setIsControlsOpen(false);
    setSelectedNodeId(node.id as string);
  }, []);

  const handleClose = React.useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  React.useEffect(() => {
    if (selectedNode === null) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent): void {
      if (detailPanelRef.current === null) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (!detailPanelRef.current.contains(target)) {
        setSelectedNodeId(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setSelectedNodeId(null);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedNode]);

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
            {isMinimapOpen && (
              <GraphMinimap
                nodes={visibleNodes}
                selectedNodeId={selectedNodeId}
              />
            )}
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
            hoveredNodeId={hoveredNodeId}
            showLabels={showLabels}
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
