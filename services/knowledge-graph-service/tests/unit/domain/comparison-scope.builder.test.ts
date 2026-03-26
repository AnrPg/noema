import type { EdgeId, NodeId } from '@noema/types';
import { describe, expect, it } from 'vitest';

import {
  buildScopedGraphComparison,
  computeCoverageAlignmentScore,
} from '../../../src/domain/knowledge-graph-service/comparison-scope.builder.js';
import { graphEdge, graphNode } from '../../fixtures/index.js';

describe('comparison-scope.builder', () => {
  it('limits missing canonical concepts to the engaged x-hop neighborhood', () => {
    const pkgAlgebra = graphNode({
      graphType: 'pkg',
      nodeId: 'node_pkg_algebra_0001' as NodeId,
      label: 'Algebra',
      domain: 'mathematics',
    });

    const ckgAlgebra = graphNode({
      graphType: 'ckg',
      nodeId: 'node_ckg_algebra_0001' as NodeId,
      label: 'Algebra',
      domain: 'mathematics',
    });
    const ckgGroups = graphNode({
      graphType: 'ckg',
      nodeId: 'node_ckg_groups_0001' as NodeId,
      label: 'Groups',
      domain: 'mathematics',
    });
    const ckgRings = graphNode({
      graphType: 'ckg',
      nodeId: 'node_ckg_rings_0001' as NodeId,
      label: 'Rings',
      domain: 'mathematics',
    });
    const ckgTopology = graphNode({
      graphType: 'ckg',
      nodeId: 'node_ckg_topology_0001' as NodeId,
      label: 'Topology',
      domain: 'mathematics',
    });

    const algebraToGroups = graphEdge({
      graphType: 'ckg',
      edgeId: 'edge_ckg_alg_groups_0001' as EdgeId,
      sourceNodeId: ckgAlgebra.nodeId,
      targetNodeId: ckgGroups.nodeId,
      edgeType: 'related_to',
    });
    const groupsToRings = graphEdge({
      graphType: 'ckg',
      edgeId: 'edge_ckg_groups_rings_0001' as EdgeId,
      sourceNodeId: ckgGroups.nodeId,
      targetNodeId: ckgRings.nodeId,
      edgeType: 'related_to',
    });
    const ringsToTopology = graphEdge({
      graphType: 'ckg',
      edgeId: 'edge_ckg_rings_topology_0001' as EdgeId,
      sourceNodeId: ckgRings.nodeId,
      targetNodeId: ckgTopology.nodeId,
      edgeType: 'related_to',
    });

    const comparison = buildScopedGraphComparison(
      { nodes: [pkgAlgebra], edges: [] },
      {
        nodes: [ckgAlgebra, ckgGroups, ckgRings, ckgTopology],
        edges: [algebraToGroups, groupsToRings, ringsToTopology],
      },
      {
        domain: 'mathematics',
        scopeMode: 'engagement_hops',
        hopCount: 1,
        bootstrapWhenUnseeded: false,
      }
    );

    expect(comparison.scope?.seedNodeCount).toBe(1);
    expect(comparison.scope?.scopedCkgNodeCount).toBe(2);
    expect(comparison.unmatchedCkgNodes).toEqual([ckgGroups.nodeId]);
    expect(comparison.unmatchedCkgNodes).not.toContain(ckgRings.nodeId);
    expect(comparison.unmatchedCkgNodes).not.toContain(ckgTopology.nodeId);
    expect(computeCoverageAlignmentScore(comparison)).toBeCloseTo(0.5);
  });

  it('returns an empty canonical scope when nothing is engaged and bootstrap is off', () => {
    const comparison = buildScopedGraphComparison(
      { nodes: [], edges: [] },
      {
        nodes: [
          graphNode({ graphType: 'ckg', label: 'Algebra', domain: 'mathematics' }),
          graphNode({ graphType: 'ckg', label: 'Calculus', domain: 'mathematics' }),
        ],
        edges: [],
      },
      {
        domain: 'mathematics',
        scopeMode: 'engagement_hops',
        hopCount: 2,
        bootstrapWhenUnseeded: false,
      }
    );

    expect(comparison.ckgSubgraph.nodes).toHaveLength(0);
    expect(comparison.scope?.seedNodeCount).toBe(0);
    expect(comparison.scope?.scopedCkgNodeCount).toBe(0);
    expect(computeCoverageAlignmentScore(comparison)).toBe(0);
  });
});
