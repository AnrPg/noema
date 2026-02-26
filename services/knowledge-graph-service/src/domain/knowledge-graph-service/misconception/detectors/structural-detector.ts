/**
 * @noema/knowledge-graph-service — Structural Misconception Detector
 *
 * Detects misconceptions by analysing graph topology patterns:
 * circular dependencies, orphaned subgraphs, inverted hierarchies,
 * missing prerequisites, duplicate concepts, and broken chains.
 */

import type { NodeId } from '@noema/types';
import { GraphEdgeType as EdgeType, MisconceptionPatternKind } from '@noema/types';

import type {
  IMisconceptionDetectionContext,
  IMisconceptionDetectionResult,
  IMisconceptionDetector,
} from '../types.js';

export class StructuralMisconceptionDetector implements IMisconceptionDetector {
  readonly kind = MisconceptionPatternKind.STRUCTURAL;

  detect(ctx: IMisconceptionDetectionContext): IMisconceptionDetectionResult[] {
    const structuralPatterns = ctx.patterns.filter((p) => p.kind === this.kind);
    if (structuralPatterns.length === 0) return [];

    const results: IMisconceptionDetectionResult[] = [];

    for (const pattern of structuralPatterns) {
      const config = pattern.config as Record<string, unknown>;
      const detectionType = config['detectionType'] as string | undefined;

      switch (detectionType ?? pattern.name) {
        case 'circular_dependency':
          results.push(
            ...this.detectCircularDependencies(ctx, pattern.patternId, pattern.threshold)
          );
          break;
        case 'orphaned_subgraph':
          results.push(...this.detectOrphanedSubgraphs(ctx, pattern.patternId, pattern.threshold));
          break;
        case 'inverted_hierarchy':
          results.push(
            ...this.detectInvertedHierarchies(ctx, pattern.patternId, pattern.threshold)
          );
          break;
        case 'missing_prerequisite':
          results.push(
            ...this.detectMissingPrerequisites(ctx, pattern.patternId, pattern.threshold)
          );
          break;
        case 'duplicate_concept':
          results.push(...this.detectDuplicateConcepts(ctx, pattern.patternId, pattern.threshold));
          break;
        case 'broken_chain':
          results.push(...this.detectBrokenChains(ctx, pattern.patternId, pattern.threshold));
          break;
        default:
          // Unknown structural pattern type — skip
          break;
      }
    }

    return results;
  }

  // ── Detection: Circular Dependencies ────────────────────────────────
  private detectCircularDependencies(
    ctx: IMisconceptionDetectionContext,
    patternId: string,
    _threshold: number
  ): IMisconceptionDetectionResult[] {
    const { pkgSubgraph } = ctx;

    // Build adjacency list for prerequisite edges
    const adj = new Map<NodeId, NodeId[]>();
    for (const edge of pkgSubgraph.edges) {
      if (edge.edgeType === EdgeType.PREREQUISITE) {
        const list = adj.get(edge.sourceNodeId) ?? [];
        list.push(edge.targetNodeId);
        adj.set(edge.sourceNodeId, list);
      }
    }

    // DFS cycle detection
    const visited = new Set<NodeId>();
    const inStack = new Set<NodeId>();
    const cycleNodes = new Set<NodeId>();

    const dfs = (nodeId: NodeId): void => {
      visited.add(nodeId);
      inStack.add(nodeId);

      for (const neighbour of adj.get(nodeId) ?? []) {
        if (inStack.has(neighbour)) {
          // Cycle detected
          cycleNodes.add(nodeId);
          cycleNodes.add(neighbour);
        } else if (!visited.has(neighbour)) {
          dfs(neighbour);
        }
      }

      inStack.delete(nodeId);
    };

    for (const node of pkgSubgraph.nodes) {
      if (!visited.has(node.nodeId)) {
        dfs(node.nodeId);
      }
    }

    if (cycleNodes.size === 0) return [];

    return [
      {
        patternId,
        confidence: 0.9,
        affectedNodeIds: [...cycleNodes],
        description: `Circular prerequisite dependency detected involving ${String(cycleNodes.size)} nodes.`,
      },
    ];
  }

  // ── Detection: Orphaned Subgraphs ──────────────────────────────────
  private detectOrphanedSubgraphs(
    ctx: IMisconceptionDetectionContext,
    patternId: string,
    threshold: number
  ): IMisconceptionDetectionResult[] {
    const { pkgSubgraph } = ctx;
    if (pkgSubgraph.nodes.length <= 1) return [];

    // Build undirected adjacency
    const adj = new Map<NodeId, Set<NodeId>>();
    for (const node of pkgSubgraph.nodes) {
      adj.set(node.nodeId, new Set());
    }
    for (const edge of pkgSubgraph.edges) {
      adj.get(edge.sourceNodeId)?.add(edge.targetNodeId);
      adj.get(edge.targetNodeId)?.add(edge.sourceNodeId);
    }

    // Find connected components
    const visited = new Set<NodeId>();
    const components: NodeId[][] = [];

    for (const node of pkgSubgraph.nodes) {
      if (visited.has(node.nodeId)) continue;

      const component: NodeId[] = [];
      const queue = [node.nodeId];
      visited.add(node.nodeId);

      while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined) break;
        component.push(current);

        for (const neighbour of adj.get(current) ?? []) {
          if (!visited.has(neighbour)) {
            visited.add(neighbour);
            queue.push(neighbour);
          }
        }
      }

      components.push(component);
    }

    // If there's only one component (or none), no orphans
    if (components.length <= 1) return [];

    // Find the largest component (main graph)
    const sorted = components.sort((a, b) => b.length - a.length);
    const orphanedComponents = sorted.slice(1);

    const results: IMisconceptionDetectionResult[] = [];

    for (const component of orphanedComponents) {
      const fraction = component.length / pkgSubgraph.nodes.length;
      if (fraction < threshold) continue; // Too small to be significant

      results.push({
        patternId,
        confidence: Math.min(0.95, 0.5 + fraction),
        affectedNodeIds: component,
        description: `Orphaned subgraph with ${String(component.length)} disconnected node(s).`,
      });
    }

    return results;
  }

  // ── Detection: Inverted Hierarchies ────────────────────────────────
  private detectInvertedHierarchies(
    ctx: IMisconceptionDetectionContext,
    patternId: string,
    _threshold: number
  ): IMisconceptionDetectionResult[] {
    const { pkgSubgraph, comparison } = ctx;
    const alignment = comparison.nodeAlignment;
    const results: IMisconceptionDetectionResult[] = [];

    // Check is_a/part_of edges: if the PKG has child→parent but CKG has parent→child
    for (const edge of pkgSubgraph.edges) {
      if (edge.edgeType !== EdgeType.IS_A && edge.edgeType !== EdgeType.PART_OF) continue;

      const ckgSource = alignment.get(edge.sourceNodeId);
      const ckgTarget = alignment.get(edge.targetNodeId);

      if (!ckgSource || !ckgTarget) continue;

      // Check if CKG has the REVERSE edge
      const ckgHasReverse = ctx.ckgSubgraph.edges.some(
        (e) =>
          (e.edgeType === EdgeType.IS_A || e.edgeType === EdgeType.PART_OF) &&
          e.sourceNodeId === ckgTarget &&
          e.targetNodeId === ckgSource
      );

      if (ckgHasReverse) {
        results.push({
          patternId,
          confidence: 0.85,
          affectedNodeIds: [edge.sourceNodeId, edge.targetNodeId],
          description: `Inverted hierarchy: student has "${edge.sourceNodeId as string}" → "${edge.targetNodeId as string}" but CKG expects the reverse.`,
        });
      }
    }

    return results;
  }

  // ── Detection: Missing Prerequisites ──────────────────────────────
  private detectMissingPrerequisites(
    ctx: IMisconceptionDetectionContext,
    patternId: string,
    _threshold: number
  ): IMisconceptionDetectionResult[] {
    const { ckgSubgraph, comparison } = ctx;
    const alignment = comparison.nodeAlignment;

    // Build inverse alignment: CKG → PKG
    const inverseAlignment = new Map<NodeId, NodeId>();
    for (const [pkgId, ckgId] of alignment) {
      inverseAlignment.set(ckgId, pkgId);
    }

    const results: IMisconceptionDetectionResult[] = [];

    // For each CKG prerequisite edge between aligned nodes, check if PKG has it
    for (const edge of ckgSubgraph.edges) {
      if (edge.edgeType !== EdgeType.PREREQUISITE) continue;

      const pkgSource = inverseAlignment.get(edge.sourceNodeId);
      const pkgTarget = inverseAlignment.get(edge.targetNodeId);

      if (!pkgSource || !pkgTarget) continue;

      // Check if PKG has this prerequisite edge
      const pkgHasEdge = ctx.pkgSubgraph.edges.some(
        (e) =>
          e.edgeType === EdgeType.PREREQUISITE &&
          e.sourceNodeId === pkgSource &&
          e.targetNodeId === pkgTarget
      );

      if (!pkgHasEdge) {
        results.push({
          patternId,
          confidence: 0.7,
          affectedNodeIds: [pkgSource, pkgTarget],
          description: `Missing prerequisite edge: "${pkgSource as string}" should be prerequisite of "${pkgTarget as string}".`,
        });
      }
    }

    return results;
  }

  // ── Detection: Duplicate Concepts ─────────────────────────────────
  private detectDuplicateConcepts(
    ctx: IMisconceptionDetectionContext,
    patternId: string,
    _threshold: number
  ): IMisconceptionDetectionResult[] {
    const { pkgSubgraph } = ctx;

    // Group nodes by normalised label
    const labelGroups = new Map<string, NodeId[]>();
    for (const node of pkgSubgraph.nodes) {
      const normalised = node.label.toLowerCase().trim().replace(/\s+/g, ' ');
      const group = labelGroups.get(normalised) ?? [];
      group.push(node.nodeId);
      labelGroups.set(normalised, group);
    }

    const results: IMisconceptionDetectionResult[] = [];

    for (const [label, nodeIds] of labelGroups) {
      if (nodeIds.length > 1) {
        results.push({
          patternId,
          confidence: 0.8,
          affectedNodeIds: nodeIds,
          description: `${String(nodeIds.length)} nodes share the label "${label}" — possible duplicate concepts.`,
        });
      }
    }

    return results;
  }

  // ── Detection: Broken Chains ──────────────────────────────────────
  private detectBrokenChains(
    ctx: IMisconceptionDetectionContext,
    patternId: string,
    _threshold: number
  ): IMisconceptionDetectionResult[] {
    const { pkgSubgraph } = ctx;

    // Find nodes with only outgoing prerequisite edges (leaves)
    // that should have incoming edges based on node type
    const inDegree = new Map<NodeId, number>();
    const outDegree = new Map<NodeId, number>();

    for (const node of pkgSubgraph.nodes) {
      inDegree.set(node.nodeId, 0);
      outDegree.set(node.nodeId, 0);
    }

    for (const edge of pkgSubgraph.edges) {
      if (edge.edgeType === EdgeType.PREREQUISITE) {
        inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1);
        outDegree.set(edge.sourceNodeId, (outDegree.get(edge.sourceNodeId) ?? 0) + 1);
      }
    }

    // Nodes with outgoing prerequisite edges but no incoming ones AND
    // not at depth 0 (root nodes legitimately have no incoming)
    const suspectNodes: NodeId[] = [];
    for (const node of pkgSubgraph.nodes) {
      const out = outDegree.get(node.nodeId) ?? 0;
      const inc = inDegree.get(node.nodeId) ?? 0;

      // Should have incoming prerequisites but doesn't
      if (out > 0 && inc === 0 && pkgSubgraph.nodes.length > 2) {
        // Check if there's a CKG expectation for an incoming edge
        const ckgNodeId = ctx.comparison.nodeAlignment.get(node.nodeId);
        if (ckgNodeId) {
          const ckgHasIncoming = ctx.ckgSubgraph.edges.some(
            (e) => e.edgeType === EdgeType.PREREQUISITE && e.targetNodeId === ckgNodeId
          );
          if (ckgHasIncoming) {
            suspectNodes.push(node.nodeId);
          }
        }
      }
    }

    if (suspectNodes.length === 0) return [];

    return [
      {
        patternId,
        confidence: 0.6,
        affectedNodeIds: suspectNodes,
        description: `${String(suspectNodes.length)} node(s) appear to be missing incoming prerequisite links (broken chain).`,
      },
    ];
  }
}
