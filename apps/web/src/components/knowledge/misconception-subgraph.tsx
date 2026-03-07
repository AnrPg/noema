'use client';
/**
 * @noema/web — Knowledge / MisconceptionSubgraph
 *
 * Mini GraphCanvas showing the 1-hop neighborhood of a misconception node.
 * The affected node is selected/highlighted.
 */
import * as React from 'react';
import { useAuth } from '@noema/auth';
import { usePKGSubgraph } from '@noema/api-client';
import type { UserId, NodeId } from '@noema/types';
import type { IGraphNodeDto, IGraphEdgeDto } from '@noema/api-client';
import { Loader2 } from 'lucide-react';
import { GraphCanvas } from '@/components/graph/graph-canvas';

export interface IMisconceptionSubgraphProps {
  /** The node ID at the center of the misconception subgraph */
  nodeId: string;
}

export function MisconceptionSubgraph({ nodeId }: IMisconceptionSubgraphProps): React.JSX.Element {
  const { user } = useAuth();
  const userId = (user?.id ?? '') as UserId;

  const { data: subgraphResponse, isLoading } = usePKGSubgraph(
    userId,
    { rootNodeId: nodeId as NodeId, depth: 1 },
    { enabled: userId !== '' && nodeId !== '' }
  );

  const subgraphData = subgraphResponse?.data ?? null;
  const nodes: IGraphNodeDto[] = subgraphData?.nodes ?? [];
  const edges: IGraphEdgeDto[] = subgraphData?.edges ?? [];

  const highlighted = React.useMemo(() => new Set([nodeId]), [nodeId]);

  if (isLoading) {
    return (
      <div className="flex h-44 items-center justify-center rounded-lg border border-border bg-muted/30">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center rounded-lg border border-border bg-muted/30">
        <p className="text-xs text-muted-foreground">No subgraph data available.</p>
      </div>
    );
  }

  return (
    <div
      className="h-44 overflow-hidden rounded-lg border border-border"
      aria-label="Misconception subgraph"
    >
      <GraphCanvas
        nodes={nodes}
        edges={edges}
        selectedNodeId={nodeId}
        highlightedNodeIds={highlighted}
        className="h-full w-full"
      />
    </div>
  );
}
