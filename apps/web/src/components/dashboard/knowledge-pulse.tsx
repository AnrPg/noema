/**
 * Knowledge Pulse Mini-Graph
 *
 * Compact force-directed SVG preview of the user's PKG.
 * Uses usePKGNodes + usePKGEdges (not usePKGSubgraph which requires a rootNodeId).
 * Force layout computed synchronously in useMemo (100 iterations of repulsion + spring).
 */

'use client';

import { useMisconceptions, usePKGEdges, usePKGNodes } from '@noema/api-client';
import type { IGraphEdgeDto, IGraphNodeDto, UserDto } from '@noema/api-client';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from '@noema/ui';
import { Network } from 'lucide-react';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';

type UserId = UserDto['id'];

// ============================================================================
// Constants
// ============================================================================

const W = 300;
const H = 250;
const MAX_NODES = 50;
const ITERATIONS = 100;
const REPULSION = 800;
const SPRING_K = 0.05;
const SPRING_LEN = 60;
const GRAVITY = 0.02;
const DAMPING = 0.85;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Static node fill colors keyed by NodeType — never construct Tailwind classes dynamically
const NODE_FILL: Record<string, string> = {
  concept: 'fill-synapse-400',
  skill: 'fill-myelin-400',
  fact: 'fill-dendrite-400',
  procedure: 'fill-axon-400',
  principle: 'fill-cortex-400',
  example: 'fill-neuron-400',
};

// ============================================================================
// Force layout
// ============================================================================

interface INodePos {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function computeForceLayout(
  nodes: IGraphNodeDto[],
  edges: IGraphEdgeDto[]
): Map<string, { x: number; y: number }> {
  const positions: INodePos[] = nodes.map((n, i) => ({
    id: n.id,
    x: W / 2 + Math.cos((i / nodes.length) * Math.PI * 2) * (W / 3),
    y: H / 2 + Math.sin((i / nodes.length) * Math.PI * 2) * (H / 3),
    vx: 0,
    vy: 0,
  }));

  const posMap = new Map(positions.map((p) => [p.id, p]));

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const alpha = 1 - iter / ITERATIONS;

    // Repulsion between all pairs
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        if (a === undefined || b === undefined) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rawDist = Math.sqrt(dx * dx + dy * dy);
        const dist = rawDist === 0 ? 1 : rawDist;
        const force = (REPULSION / (dist * dist)) * alpha;
        a.vx -= (dx / dist) * force;
        a.vy -= (dy / dist) * force;
        b.vx += (dx / dist) * force;
        b.vy += (dy / dist) * force;
      }
    }

    // Spring attraction along edges
    for (const edge of edges) {
      const a = posMap.get(edge.sourceId);
      const b = posMap.get(edge.targetId);
      if (a === undefined || b === undefined) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rawDist = Math.sqrt(dx * dx + dy * dy);
      const dist = rawDist === 0 ? 1 : rawDist;
      const disp = (dist - SPRING_LEN) * SPRING_K;
      a.vx += (dx / dist) * disp;
      a.vy += (dy / dist) * disp;
      b.vx -= (dx / dist) * disp;
      b.vy -= (dy / dist) * disp;
    }

    // Gravity + integrate
    for (const p of positions) {
      p.vx += (W / 2 - p.x) * GRAVITY;
      p.vy += (H / 2 - p.y) * GRAVITY;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= DAMPING;
      p.vy *= DAMPING;
      p.x = Math.max(8, Math.min(W - 8, p.x));
      p.y = Math.max(8, Math.min(H - 8, p.y));
    }
  }

  return new Map(positions.map((p) => [p.id, { x: p.x, y: p.y }]));
}

// ============================================================================
// Component
// ============================================================================

export function KnowledgePulse({ userId }: { userId: UserId }): React.JSX.Element {
  const router = useRouter();
  const enabled = userId !== '';
  const nodes = usePKGNodes(userId, { enabled });
  const edges = usePKGEdges(userId, { enabled });
  const { data: miscData, isError: miscError } = useMisconceptions(userId, { enabled });

  const isLoading = nodes.isLoading || edges.isLoading;

  const visibleNodes = useMemo(() => {
    const all = nodes.data ?? [];
    return [...all]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, MAX_NODES);
  }, [nodes.data]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);

  const visibleEdges = useMemo(
    () =>
      (edges.data ?? []).filter(
        (e) => visibleNodeIds.has(e.sourceId) && visibleNodeIds.has(e.targetId)
      ),
    [edges.data, visibleNodeIds]
  );

  const layout = useMemo(
    () => computeForceLayout(visibleNodes, visibleEdges),
    [visibleNodes, visibleEdges]
  );

  const misconceptionNodeIds = useMemo(() => {
    const active = (miscData?.data ?? []).filter(
      (m) => m.status !== 'resolved' && m.status !== 'dismissed'
    );
    return new Set(active.map((m) => m.nodeId));
  }, [miscData]);

  const recentNodeIds = useMemo(() => {
    const now = Date.now();
    return new Set(
      visibleNodes
        .filter((n) => now - new Date(n.updatedAt).getTime() < SEVEN_DAYS_MS)
        .map((n) => n.id)
    );
  }, [visibleNodes]);

  if (isLoading) {
    return (
      <Card className="cursor-pointer">
        <CardHeader>
          <CardTitle className="text-sm">Knowledge Map</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton variant="graph-node" className="h-[250px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (visibleNodes.length === 0) {
    return (
      <Card
        className="cursor-pointer"
        onClick={() => {
          router.push('/knowledge');
        }}
      >
        <CardContent className="pt-6">
          <EmptyState
            icon={<Network className="h-8 w-8 text-muted-foreground" />}
            title="No knowledge map yet"
            description="Start learning to build your knowledge map"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="cursor-pointer transition-colors hover:border-synapse-400/50"
      onClick={() => {
        router.push('/knowledge');
      }}
    >
      <CardHeader className="pb-1">
        <CardTitle className="text-sm">Knowledge Map</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {miscError && (
          <p className="px-3 pb-1 text-xs text-muted-foreground">
            Misconception overlay unavailable.
          </p>
        )}
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${String(W)} ${String(H)}`}
          className="w-full"
          overflow="visible"
        >
          {/* Edges */}
          {visibleEdges.map((edge) => {
            const src = layout.get(edge.sourceId);
            const tgt = layout.get(edge.targetId);
            if (src === undefined || tgt === undefined) return null;
            return (
              <line
                key={edge.id}
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                className="stroke-border"
                strokeWidth={1}
                strokeOpacity={0.5}
              />
            );
          })}

          {/* Nodes */}
          {visibleNodes.map((node) => {
            const pos = layout.get(node.id);
            if (pos === undefined) return null;
            const fillClass = NODE_FILL[node.type] ?? 'fill-muted-foreground';
            const isMisc = misconceptionNodeIds.has(node.id);
            const isRecent = recentNodeIds.has(node.id);
            const r = 5;

            return (
              <g key={node.id}>
                {isMisc && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={r + 4}
                    className="fill-cortex-400/20 stroke-cortex-400"
                    strokeWidth={1}
                  />
                )}
                {isRecent && !isMisc && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={r + 3}
                    // animate-pulse forces Tailwind JIT to include @keyframes pulse
                    className="animate-pulse fill-none stroke-synapse-400/40"
                    strokeWidth={1.5}
                  />
                )}
                <circle cx={pos.x} cy={pos.y} r={r} className={fillClass} />
              </g>
            );
          })}
        </svg>
      </CardContent>
    </Card>
  );
}
