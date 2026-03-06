'use client';
/**
 * @noema/web-admin - MutationGraphDiff
 *
 * Mini graph visualization for a CKG mutation's affected subgraph.
 */
import * as React from 'react';
import { GraphCanvas } from '@noema/graph';
import { useCKGEdges, useCKGNodes } from '@noema/api-client';
import type { ICkgMutationDto } from '@noema/api-client';

export interface IMutationGraphDiffProps {
  mutation: ICkgMutationDto;
  className?: string;
}

export function MutationGraphDiff({
  mutation,
  className,
}: IMutationGraphDiffProps): React.JSX.Element {
  const { data: allNodes = [] } = useCKGNodes();
  const { data: allEdges = [] } = useCKGEdges();

  // Extract affected node IDs from payload
  const affectedNodeIds = React.useMemo(() => {
    const payload = mutation.payload;
    const ids = new Set<string>();
    if (typeof payload['nodeId'] === 'string') ids.add(payload['nodeId']);
    if (typeof payload['sourceId'] === 'string') ids.add(payload['sourceId']);
    if (typeof payload['targetId'] === 'string') ids.add(payload['targetId']);
    return ids;
  }, [mutation.payload]);

  // Subgraph: affected nodes + 1-hop neighbors
  const subgraphNodes = React.useMemo(() => {
    const neighborIds = new Set<string>(affectedNodeIds);
    for (const edge of allEdges) {
      const src = String(edge.sourceId);
      const tgt = String(edge.targetId);
      if (affectedNodeIds.has(src)) neighborIds.add(tgt);
      if (affectedNodeIds.has(tgt)) neighborIds.add(src);
    }
    return allNodes.filter((n) => neighborIds.has(String(n.id)));
  }, [allNodes, allEdges, affectedNodeIds]);

  const subgraphEdges = React.useMemo(() => {
    const ids = new Set(subgraphNodes.map((n) => String(n.id)));
    return allEdges.filter((e) => ids.has(String(e.sourceId)) && ids.has(String(e.targetId)));
  }, [subgraphNodes, allEdges]);

  const highlightedNodeIds = React.useMemo(
    () => new Set<string>(Array.from(affectedNodeIds)),
    [affectedNodeIds]
  );

  if (subgraphNodes.length === 0) {
    return (
      <div
        className={`flex items-center justify-center h-64 bg-muted/20 rounded-lg border ${className ?? ''}`}
      >
        <p className="text-sm text-muted-foreground">No graph data available for this mutation</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg overflow-hidden border ${className ?? 'h-80'}`}>
      <GraphCanvas
        nodes={subgraphNodes}
        edges={subgraphEdges}
        highlightedNodeIds={highlightedNodeIds}
        className="h-full w-full"
      />
    </div>
  );
}
