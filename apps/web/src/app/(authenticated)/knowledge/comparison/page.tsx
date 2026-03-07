/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */

'use client';
/**
 * @noema/web — /knowledge/comparison
 *
 * PKG vs CKG side-by-side comparison:
 *   Left panel  = Personal Knowledge Graph (PKG)
 *   Right panel = Canonical Knowledge Graph (CKG)
 *   Synchronised: clicking a node in either panel selects it globally.
 *   Bottom action panel for resolving selected discrepancies.
 *
 * Note: The eslint-disable directives above suppress no-unsafe-* rules that
 * fire because the @noema/api-client package has not been built yet (no dist/).
 * Once packages are built these suppressions should be removed.
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

// ============================================================================
// KnowledgeComparisonPage
// ============================================================================

export default function KnowledgeComparisonPage(): React.JSX.Element {
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;

  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);

  // ── Data hooks ─────────────────────────────────────────────────────────────
  const { data: pkgNodesData, isLoading: pkgNodesLoading } = usePKGNodes(userId);
  const { data: pkgEdgesData, isLoading: pkgEdgesLoading } = usePKGEdges(userId);
  const { data: ckgNodesData, isLoading: ckgNodesLoading } = useCKGNodes();
  const { data: ckgEdgesData, isLoading: ckgEdgesLoading } = useCKGEdges();
  const { data: comparisonData, isLoading: compLoading } = usePKGCKGComparison(userId);
  const createNode = useCreatePKGNode(userId);

  const isLoading =
    pkgNodesLoading || pkgEdgesLoading || ckgNodesLoading || ckgEdgesLoading || compLoading;

  // ── Data extraction ────────────────────────────────────────────────────────
  const pkgNodes: IGraphNodeDto[] = (pkgNodesData as any) ?? [];
  const pkgEdges: IGraphEdgeDto[] = (pkgEdgesData as any) ?? [];
  const ckgNodes: IGraphNodeDto[] = (ckgNodesData as any) ?? [];
  const ckgEdges: IGraphEdgeDto[] = (ckgEdgesData as any) ?? [];

  const comparison: any = comparisonData ?? null;
  const missingFromPkg: IGraphNodeDto[] =
    (comparison?.missingFromPkg as IGraphNodeDto[] | undefined) ?? [];
  const extraInPkg: IGraphNodeDto[] = (comparison?.extraInPkg as IGraphNodeDto[] | undefined) ?? [];
  const alignmentScore: number = (comparison?.alignmentScore as number | undefined) ?? 0;

  // ── Derived sets ───────────────────────────────────────────────────────────
  // Ghost nodes: in CKG but not PKG — shown as highlights in the PKG panel
  // Stored as plain strings so they can be compared against selectedNodeId (string | null).
  const ghostNodeIds = React.useMemo(
    () => new Set(missingFromPkg.map((n) => String(n.id))),
    [missingFromPkg]
  );

  // Personal-only nodes: in PKG but not CKG — shown as highlights in the CKG panel
  const personalNodeIds = React.useMemo(
    () => new Set(extraInPkg.map((n) => String(n.id))),
    [extraInPkg]
  );

  // PKG panel shows its own nodes + ghost nodes from the CKG
  const pkgNodesWithGhosts: IGraphNodeDto[] = React.useMemo(
    () => [...pkgNodes, ...missingFromPkg],
    [pkgNodes, missingFromPkg]
  );

  // ── Stable callbacks ───────────────────────────────────────────────────────
  const handleNodeClick = React.useCallback((n: IGraphNodeDto) => {
    const id = String(n.id);
    setSelectedNodeId((prev) => (prev === id ? null : id));
  }, []);

  const handleBackgroundClick = React.useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // ── Selected node lookup ───────────────────────────────────────────────────
  const selectedNode: IGraphNodeDto | undefined =
    pkgNodesWithGhosts.find((n) => String(n.id) === selectedNodeId) ??
    ckgNodes.find((n) => String(n.id) === selectedNodeId);

  const isGhost = selectedNodeId !== null && ghostNodeIds.has(selectedNodeId);
  const isPersonalOnly = selectedNodeId !== null && personalNodeIds.has(selectedNodeId);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold">PKG / CKG Comparison</h1>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading graphs\u2026
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h1 className="text-2xl font-bold">PKG / CKG Comparison</h1>
          <p className="text-sm text-muted-foreground">
            Alignment score:{' '}
            <span className="font-medium text-foreground">
              {String(Math.round(alignmentScore * 100))}%
            </span>
            {' \u00b7 '}
            <span className="text-amber-500">{String(missingFromPkg.length)} missing from PKG</span>
            {' \u00b7 '}
            <span className="text-blue-500">{String(extraInPkg.length)} personal-only</span>
          </p>
        </div>
      </div>

      {/* ── Dual canvas ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-2 overflow-hidden" style={{ minHeight: 0 }}>
        {/* PKG panel */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border bg-card px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Personal Knowledge Graph (PKG)
          </div>
          <div className="flex-1 overflow-hidden">
            <GraphCanvas
              nodes={pkgNodesWithGhosts}
              edges={pkgEdges}
              selectedNodeId={selectedNodeId}
              onNodeClick={handleNodeClick}
              onBackgroundClick={handleBackgroundClick}
              highlightedNodeIds={ghostNodeIds}
              className="h-full w-full"
            />
          </div>
        </div>

        {/* CKG panel */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border bg-card px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Canonical Knowledge Graph (CKG)
          </div>
          <div className="flex-1 overflow-hidden">
            <GraphCanvas
              nodes={ckgNodes}
              edges={ckgEdges}
              selectedNodeId={selectedNodeId}
              onNodeClick={handleNodeClick}
              onBackgroundClick={handleBackgroundClick}
              highlightedNodeIds={personalNodeIds}
              className="h-full w-full"
            />
          </div>
        </div>
      </div>

      {/* ── Action panel (discrepancy selected) ────────────────────────────── */}
      {(isGhost || isPersonalOnly) && selectedNode !== undefined && (
        <div className="flex flex-shrink-0 items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{selectedNode.label}</p>
            <p className="text-xs text-muted-foreground">
              {isGhost
                ? 'This concept is in the CKG but not yet in your PKG.'
                : 'This concept is only in your PKG \u2014 not in the canonical graph.'}
            </p>
          </div>

          {isGhost && (
            <Button
              onClick={() => {
                void createNode.mutateAsync({
                  type: selectedNode.type,
                  label: selectedNode.label,
                  ...(selectedNode.description !== null
                    ? { description: selectedNode.description }
                    : {}),
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
            <Link href={'/session/new' as never}>Review This Concept</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
