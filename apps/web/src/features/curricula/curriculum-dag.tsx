'use client';

import * as React from 'react';
import type { ICurriculum } from '@noema/api-client';

type CurriculumDagNode = NonNullable<ICurriculum['activeVersion']>['nodes'][number];
type CurriculumDagEdge = NonNullable<ICurriculum['activeVersion']>['edges'][number];

type CurriculumDagBadgeTone = 'neutral' | 'frontier' | 'complete' | 'frozen';

interface ICurriculumDagBadge {
  label: string;
  tone?: CurriculumDagBadgeTone;
}

interface ICurriculumDagNodeLayout {
  node: CurriculumDagNode;
  x: number;
  y: number;
}

export interface ICurriculumDagProps {
  nodes: CurriculumDagNode[];
  edges: CurriculumDagEdge[];
  selectedNodeId?: string | null;
  nodeBadgesById?: Record<string, ICurriculumDagBadge[] | undefined>;
  onNodeClick?: (node: CurriculumDagNode) => void;
  emptyMessage?: string;
  variant?: 'compact' | 'detail';
  className?: string;
}

const NODE_WIDTH = {
  compact: 184,
  detail: 228,
} as const;

const NODE_HEIGHT = {
  compact: 88,
  detail: 112,
} as const;

const COLUMN_GAP = {
  compact: 74,
  detail: 104,
} as const;

const ROW_GAP = {
  compact: 24,
  detail: 36,
} as const;

const PADDING = {
  compact: 16,
  detail: 24,
} as const;

function badgeToneClasses(tone: CurriculumDagBadgeTone | undefined): string {
  if (tone === 'frontier') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
  }

  if (tone === 'complete') {
    return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  }

  if (tone === 'frozen') {
    return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300';
  }

  return 'border-border bg-muted/50 text-muted-foreground';
}

function sortNodes(nodes: CurriculumDagNode[]): CurriculumDagNode[] {
  return [...nodes].sort((left, right) => left.label.localeCompare(right.label));
}

function buildDagLayout(
  nodes: CurriculumDagNode[],
  edges: CurriculumDagEdge[],
  variant: 'compact' | 'detail'
): {
  height: number;
  layouts: ICurriculumDagNodeLayout[];
  width: number;
} {
  const nodeWidth = NODE_WIDTH[variant];
  const nodeHeight = NODE_HEIGHT[variant];
  const columnGap = COLUMN_GAP[variant];
  const rowGap = ROW_GAP[variant];
  const padding = PADDING[variant];

  if (nodes.length === 0) {
    return { layouts: [], width: padding * 2, height: padding * 2 };
  }

  const sortedNodes = sortNodes(nodes);
  const nodeById = new Map(sortedNodes.map((node) => [String(node.id), node]));
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const depth = new Map<string, number>();

  for (const node of sortedNodes) {
    const nodeId = String(node.id);
    adjacency.set(nodeId, []);
    indegree.set(nodeId, 0);
    depth.set(nodeId, 0);
  }

  for (const edge of edges) {
    const fromNodeId = String(edge.fromNodeId);
    const toNodeId = String(edge.toNodeId);
    if (!nodeById.has(fromNodeId) || !nodeById.has(toNodeId)) continue;

    adjacency.get(fromNodeId)?.push(toNodeId);
    indegree.set(toNodeId, (indegree.get(toNodeId) ?? 0) + 1);
  }

  for (const entry of adjacency.values()) {
    entry.sort((left, right) => {
      const leftLabel = nodeById.get(left)?.label ?? left;
      const rightLabel = nodeById.get(right)?.label ?? right;
      return leftLabel.localeCompare(rightLabel);
    });
  }

  const queue = sortedNodes
    .map((node) => String(node.id))
    .filter((nodeId) => (indegree.get(nodeId) ?? 0) === 0);
  const visited = new Set<string>();
  const topologicalOrder: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    topologicalOrder.push(current);

    for (const next of adjacency.get(current) ?? []) {
      const nextDepth = Math.max(depth.get(next) ?? 0, (depth.get(current) ?? 0) + 1);
      depth.set(next, nextDepth);
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) {
        queue.push(next);
      }
    }
  }

  for (const node of sortedNodes) {
    const nodeId = String(node.id);
    if (!visited.has(nodeId)) {
      topologicalOrder.push(nodeId);
    }
  }

  const layers = new Map<number, string[]>();
  let maxDepth = 0;
  for (const nodeId of topologicalOrder) {
    const nodeDepth = depth.get(nodeId) ?? 0;
    maxDepth = Math.max(maxDepth, nodeDepth);
    const layer = layers.get(nodeDepth) ?? [];
    layer.push(nodeId);
    layers.set(nodeDepth, layer);
  }

  const layerKeys = [...layers.keys()].sort((left, right) => left - right);
  const maxLayerSize = Math.max(...layerKeys.map((key) => layers.get(key)?.length ?? 0));
  const width = padding * 2 + (maxDepth + 1) * nodeWidth + Math.max(0, maxDepth) * columnGap;
  const height = padding * 2 + maxLayerSize * nodeHeight + Math.max(0, maxLayerSize - 1) * rowGap;

  const layouts: ICurriculumDagNodeLayout[] = [];

  for (const layerKey of layerKeys) {
    const layerNodeIds = layers.get(layerKey) ?? [];
    const blockHeight =
      layerNodeIds.length * nodeHeight + Math.max(0, layerNodeIds.length - 1) * rowGap;
    const verticalOffset = padding + Math.max(0, (height - padding * 2 - blockHeight) / 2);

    layerNodeIds.forEach((nodeId, index) => {
      const node = nodeById.get(nodeId);
      if (node === undefined) return;

      layouts.push({
        node,
        x: padding + layerKey * (nodeWidth + columnGap),
        y: verticalOffset + index * (nodeHeight + rowGap),
      });
    });
  }

  return { layouts, width, height };
}

export function CurriculumDag({
  nodes,
  edges,
  selectedNodeId = null,
  nodeBadgesById,
  onNodeClick,
  emptyMessage = 'No curriculum graph is available yet.',
  variant = 'detail',
  className,
}: ICurriculumDagProps): React.JSX.Element {
  const layout = React.useMemo(
    () => buildDagLayout(nodes, edges, variant),
    [edges, nodes, variant]
  );
  const nodeLayouts = React.useMemo(
    () => new Map(layout.layouts.map((entry) => [String(entry.node.id), entry])),
    [layout.layouts]
  );
  const nodeWidth = NODE_WIDTH[variant];
  const nodeHeight = NODE_HEIGHT[variant];

  if (nodes.length === 0) {
    return (
      <div
        className={[
          'rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground',
          className ?? '',
        ].join(' ')}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className={[
        'rounded-xl border border-border bg-card/80',
        variant === 'detail' ? 'p-3' : 'p-2.5',
        className ?? '',
      ].join(' ')}
    >
      <div className="overflow-x-auto overflow-y-hidden">
        <div
          className="relative min-w-full"
          style={{
            width: `${String(layout.width)}px`,
            height: `${String(layout.height)}px`,
          }}
        >
          <svg
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${String(layout.width)} ${String(layout.height)}`}
          >
            {edges.map((edge) => {
              const source = nodeLayouts.get(String(edge.fromNodeId));
              const target = nodeLayouts.get(String(edge.toNodeId));
              if (source === undefined || target === undefined) return null;

              const startX = source.x + nodeWidth;
              const startY = source.y + nodeHeight / 2;
              const endX = target.x;
              const endY = target.y + nodeHeight / 2;
              const controlOffset = Math.max(24, (endX - startX) / 2);

              return (
                <path
                  key={String(edge.id)}
                  d={`M ${String(startX)} ${String(startY)} C ${String(startX + controlOffset)} ${String(startY)}, ${String(endX - controlOffset)} ${String(endY)}, ${String(endX)} ${String(endY)}`}
                  fill="none"
                  stroke="currentColor"
                  strokeDasharray={edge.type === 'prerequisite' ? undefined : '6 4'}
                  strokeLinecap="round"
                  strokeWidth={variant === 'detail' ? 2 : 1.5}
                  className="text-border"
                />
              );
            })}
          </svg>

          {layout.layouts.map(({ node, x, y }) => {
            const isSelected = selectedNodeId !== null && String(node.id) === selectedNodeId;
            const badges = nodeBadgesById?.[String(node.id)] ?? [];

            return (
              <button
                key={String(node.id)}
                type="button"
                onClick={() => {
                  onNodeClick?.(node);
                }}
                className={[
                  'absolute flex cursor-pointer flex-col justify-between rounded-xl border bg-background text-left shadow-sm transition',
                  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-primary/10'
                    : 'border-border hover:border-primary/40 hover:bg-muted/30',
                ].join(' ')}
                style={{
                  left: `${String(x)}px`,
                  top: `${String(y)}px`,
                  width: `${String(nodeWidth)}px`,
                  height: `${String(nodeHeight)}px`,
                  padding: variant === 'detail' ? '14px' : '12px',
                }}
                aria-pressed={isSelected}
                aria-label={`Curriculum node ${node.label}`}
              >
                <div className="space-y-1">
                  <p className="line-clamp-2 text-sm font-semibold text-foreground">{node.label}</p>
                  {variant === 'detail' &&
                    node.learningObjective !== undefined &&
                    node.learningObjective !== '' && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {node.learningObjective}
                      </p>
                    )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {badges.slice(0, 3).map((badge) => (
                    <span
                      key={`${String(node.id)}-${badge.label}`}
                      className={[
                        'rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                        badgeToneClasses(badge.tone),
                      ].join(' ')}
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
