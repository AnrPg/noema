/**
 * @noema/knowledge-graph-service — Agent Hints Factory (4.5)
 *
 * Centralises all `createXxxHints` methods that were previously private
 * helpers on `KnowledgeGraphService`. Each factory method uses the fluent
 * `AgentHintsBuilder` to reduce per-method boilerplate and enforce a
 * consistent shape.
 *
 * Threshold constants are imported from `policies/analysis-thresholds.ts`
 * (4.6) so they can be tested and configured independently.
 */

import type {
  IAgentHints,
  IRelatedResource,
  IRiskFactor,
  ISuggestedAction,
  IWarning,
} from '@noema/contracts';
import type {
  IGraphEdge,
  IGraphNode,
  IMetacognitiveStageAssessment,
  IMisconceptionDetection,
  IStructuralHealthReport,
  IStructuralMetrics,
  ISubgraph,
} from '@noema/types';

import type { IMutationFilter } from './ckg-mutation-dsl.js';
import type { ICkgMutation } from './mutation.repository.js';
import type { IGraphComparison } from './value-objects/comparison.js';
import type {
  IBridgeNodesResult,
  ICentralityResult,
  ICommonAncestorsResult,
  ICoParentsResult,
  IKnowledgeFrontierResult,
  INeighborhoodResult,
  IPrerequisiteChainResult,
  ISiblingsResult,
} from './value-objects/graph.value-objects.js';

import {
  ABSTRACTION_DRIFT_WARNING,
  ATTRIBUTION_ACCURACY_WARNING,
  BRIDGE_BOTTLENECK_THRESHOLD,
  CENTRALITY_VARIANCE_RATIO,
  COMPARISON_DIVERGENCE_RISK_IMPACT,
  COMPARISON_DIVERGENCE_RISK_PROBABILITY,
  CRITICAL_HEALTH_RISK_IMPACT,
  CRITICAL_HEALTH_RISK_PROBABILITY,
  DELETION_ORPHAN_RISK_IMPACT,
  DELETION_ORPHAN_RISK_PROBABILITY,
  HEALTH_SCORE_HEALTHY,
  HEALTH_SCORE_WARNING,
  HIGH_CO_PARENT_THRESHOLD,
  HIGH_CONFIDENCE_MISCONCEPTION,
  LARGE_SIBLING_GROUP_THRESHOLD,
  METRICS_WARNING_RISK_IMPACT,
  METRICS_WARNING_RISK_PROBABILITY,
  MISCONCEPTION_RISK_IMPACT,
  MISCONCEPTION_RISK_PROBABILITY,
  SCOPE_LEAKAGE_WARNING,
  SIBLING_CONFUSION_WARNING,
  SPARSE_DENSITY_MIN_NODES,
  SPARSE_DENSITY_THRESHOLD,
  STRUCTURAL_HUB_EDGE_TYPES,
} from './policies/analysis-thresholds.js';

// ============================================================================
// AgentHintsBuilder — Fluent Builder (4.5)
// ============================================================================

/**
 * Fluent builder for `IAgentHints`.
 *
 * Eliminates the repetitive per-method boilerplate of specifying all 12+
 * required fields. Start with `AgentHintsBuilder.create()`, chain the
 * setters you need, and call `.build()`.
 *
 * Fields not explicitly set get sensible defaults (empty arrays, 1.0
 * confidence, 'high' quality, 'medium' validity).
 */
export class AgentHintsBuilder {
  private actions: ISuggestedAction[] = [];
  private resources: IRelatedResource[] = [];
  private conf = 1.0;
  private quality: IAgentHints['sourceQuality'] = 'high';
  private validity: IAgentHints['validityPeriod'] = 'medium';
  private context: string[] = [];
  private _assumptions: string[] = [];
  private risks: IRiskFactor[] = [];
  private deps: IAgentHints['dependencies'] = [];
  private impact: IAgentHints['estimatedImpact'] = { benefit: 0.5, effort: 0.1, roi: 5.0 };
  private alignment: IAgentHints['preferenceAlignment'] = [];
  private _reasoning?: string;
  private _warnings?: IWarning[];

  static create(): AgentHintsBuilder {
    return new AgentHintsBuilder();
  }

  withActions(actions: ISuggestedAction[]): this {
    this.actions = actions;
    return this;
  }

  addAction(action: ISuggestedAction): this {
    this.actions.push(action);
    return this;
  }

  withResources(resources: IRelatedResource[]): this {
    this.resources = resources;
    return this;
  }

  addResource(resource: IRelatedResource): this {
    this.resources.push(resource);
    return this;
  }

  withConfidence(confidence: number): this {
    this.conf = confidence;
    return this;
  }

  withSourceQuality(quality: IAgentHints['sourceQuality']): this {
    this.quality = quality;
    return this;
  }

  withValidityPeriod(period: IAgentHints['validityPeriod']): this {
    this.validity = period;
    return this;
  }

  withContextNeeded(context: string[]): this {
    this.context = context;
    return this;
  }

  withAssumptions(assumptions: string[]): this {
    this._assumptions = assumptions;
    return this;
  }

  withRiskFactors(risks: IRiskFactor[]): this {
    this.risks = risks;
    return this;
  }

  addRiskFactor(risk: IRiskFactor): this {
    this.risks.push(risk);
    return this;
  }

  withEstimatedImpact(benefit: number, effort: number, roi: number): this {
    this.impact = { benefit, effort, roi };
    return this;
  }

  withReasoning(reasoning: string): this {
    this._reasoning = reasoning;
    return this;
  }

  withWarnings(warnings: IWarning[]): this {
    this._warnings = warnings;
    return this;
  }

  build(): IAgentHints {
    const hints: IAgentHints = {
      suggestedNextActions: this.actions,
      relatedResources: this.resources,
      confidence: this.conf,
      sourceQuality: this.quality,
      validityPeriod: this.validity,
      contextNeeded: this.context,
      assumptions: this._assumptions,
      riskFactors: this.risks,
      dependencies: this.deps,
      estimatedImpact: this.impact,
      preferenceAlignment: this.alignment,
    };
    if (this._reasoning !== undefined) hints.reasoning = this._reasoning;
    if (this._warnings !== undefined) hints.warnings = this._warnings;
    return hints;
  }
}

// ============================================================================
// AgentHintsFactory
// ============================================================================

/**
 * Stateless factory that produces `IAgentHints` for every service operation.
 *
 * Instantiated once in the service bootstrap and injected into the facade.
 * Each method corresponds 1:1 with a former `private createXxxHints` method
 * on `KnowledgeGraphService`.
 */
export class AgentHintsFactory {
  // -----------------------------------------------------------------------
  // Category A — PKG Node/Edge CRUD
  // -----------------------------------------------------------------------

  createNodeHints(action: string, node: IGraphNode): IAgentHints {
    const builder = AgentHintsBuilder.create()
      .withResources([
        {
          type: 'KGNode',
          id: node.nodeId as string,
          label: `${node.nodeType} — ${node.label}`,
          relevance: 1.0,
        },
      ])
      .withEstimatedImpact(0.7, 0.2, 3.5)
      .withReasoning(`Node ${action} successfully in PKG`);

    switch (action) {
      case 'created':
        builder
          .addAction({
            action: 'create_edges',
            description: `Connect "${node.label}" to related concepts via edges`,
            priority: 'high',
            category: 'exploration',
          })
          .addAction({
            action: 'create_cards',
            description: `Create flashcards for "${node.label}"`,
            priority: 'medium',
            category: 'learning',
          });
        break;
      case 'retrieved':
        builder
          .addAction({
            action: 'get_subgraph',
            description: `Explore the neighborhood of "${node.label}"`,
            priority: 'medium',
            category: 'exploration',
          })
          .addAction({
            action: 'compare_with_ckg',
            description: `Compare your understanding against the canonical graph`,
            priority: 'low',
            category: 'optimization',
          });
        break;
      case 'updated':
        builder.addAction({
          action: 'verify_structure',
          description: `Verify edge consistency after updating "${node.label}"`,
          priority: 'medium',
          category: 'optimization',
        });
        break;
    }

    return builder.build();
  }

  createEdgeHints(
    action: string,
    edge: IGraphEdge,
    sourceNode: IGraphNode,
    targetNode: IGraphNode
  ): IAgentHints {
    const builder = AgentHintsBuilder.create()
      .withResources([
        {
          type: 'KGEdge',
          id: edge.edgeId as string,
          label: `${edge.edgeType}: ${sourceNode.label} → ${targetNode.label}`,
          relevance: 1.0,
        },
        {
          type: 'KGNode',
          id: sourceNode.nodeId as string,
          label: sourceNode.label,
          relevance: 0.8,
        },
        {
          type: 'KGNode',
          id: targetNode.nodeId as string,
          label: targetNode.label,
          relevance: 0.8,
        },
      ])
      .withAssumptions([
        `"${sourceNode.label}" genuinely ${edge.edgeType.replace(/_/g, ' ')}s "${targetNode.label}"`,
      ])
      .withEstimatedImpact(0.6, 0.1, 6.0)
      .withReasoning(
        `Edge ${action} — ${edge.edgeType} from "${sourceNode.label}" to "${targetNode.label}"`
      );

    if (action === 'created') {
      builder
        .addAction({
          action: 'get_subgraph',
          description: `Explore the updated neighborhood around "${sourceNode.label}"`,
          priority: 'medium',
          category: 'exploration',
        })
        .addAction({
          action: 'detect_misconceptions',
          description: `Check if this edge reveals any structural misconceptions`,
          priority: 'low',
          category: 'optimization',
        });
    }

    return builder.build();
  }

  createEdgeRetrievalHints(edge: IGraphEdge): IAgentHints {
    return AgentHintsBuilder.create()
      .withActions([
        {
          action: 'get_subgraph',
          description: 'Explore the source node neighborhood',
          priority: 'medium',
          category: 'exploration',
        },
      ])
      .withResources([
        {
          type: 'KGEdge',
          id: edge.edgeId as string,
          label: `${edge.edgeType}: ${edge.sourceNodeId as string} → ${edge.targetNodeId as string}`,
          relevance: 1.0,
        },
      ])
      .withEstimatedImpact(0.3, 0.1, 3.0)
      .withReasoning(`Edge retrieved: ${edge.edgeType}`)
      .build();
  }

  createDeleteHints(entityType: string, entityId: string, domain: string): IAgentHints {
    return AgentHintsBuilder.create()
      .withActions([
        {
          action: 'verify_structure',
          description: `Verify graph integrity in domain "${domain}" after deletion`,
          priority: 'high',
          category: 'optimization',
        },
      ])
      .withValidityPeriod('short')
      .withRiskFactors([
        {
          type: 'accuracy',
          severity: 'low',
          description: `Deleted ${entityType} ${entityId} — may leave orphaned references`,
          probability: DELETION_ORPHAN_RISK_PROBABILITY,
          impact: DELETION_ORPHAN_RISK_IMPACT,
          mitigation: 'Run structural integrity check',
        },
      ])
      .withEstimatedImpact(0.5, 0.1, 5.0)
      .withReasoning(`${entityType} deleted from PKG`)
      .build();
  }

  createListHints(entityType: string, count: number, total: number): IAgentHints {
    return AgentHintsBuilder.create()
      .withActions(
        count < total
          ? [
              {
                action: 'paginate',
                description: `${String(total - count)} more ${entityType} available — adjust offset to see more`,
                priority: 'low',
                category: 'exploration',
              },
            ]
          : []
      )
      .withValidityPeriod('short')
      .withEstimatedImpact(0.3, 0.1, 3.0)
      .withReasoning(`Listed ${String(count)} of ${String(total)} ${entityType}`)
      .build();
  }

  // -----------------------------------------------------------------------
  // Category B — PKG Subgraph & Traversal
  // -----------------------------------------------------------------------

  createSubgraphHints(subgraph: ISubgraph, rootNode: IGraphNode): IAgentHints {
    const nodeCount = subgraph.nodes.length;
    const edgeCount = subgraph.edges.length;
    const density = nodeCount > 1 ? edgeCount / (nodeCount * (nodeCount - 1)) : 0;

    const builder = AgentHintsBuilder.create()
      .withResources([
        {
          type: 'KGNode',
          id: rootNode.nodeId as string,
          label: `Root: ${rootNode.label}`,
          relevance: 1.0,
        },
      ])
      .withValidityPeriod('short')
      .withEstimatedImpact(0.5, 0.1, 5.0)
      .withReasoning(
        `Subgraph from "${rootNode.label}": ${String(nodeCount)} nodes, ${String(edgeCount)} edges, density ${density.toFixed(2)}`
      );

    if (density < SPARSE_DENSITY_THRESHOLD && nodeCount > SPARSE_DENSITY_MIN_NODES) {
      builder.addAction({
        action: 'create_edges',
        description: 'Subgraph is sparsely connected — consider adding relationships',
        priority: 'medium',
        category: 'optimization',
      });
    }

    if (nodeCount === 1) {
      builder.addAction({
        action: 'create_nodes',
        description: `"${rootNode.label}" is isolated — add related concepts`,
        priority: 'high',
        category: 'exploration',
      });
    }

    return builder.build();
  }

  createTraversalHints(
    direction: string,
    results: IGraphNode[],
    originNode: IGraphNode
  ): IAgentHints {
    return AgentHintsBuilder.create()
      .withActions(
        results.length === 0
          ? [
              {
                action: 'create_edges',
                description: `No ${direction} found for "${originNode.label}" — consider adding structural edges`,
                priority: 'high',
                category: 'exploration',
              },
            ]
          : [
              {
                action: 'get_subgraph',
                description: `Explore the full neighborhood around "${originNode.label}"`,
                priority: 'medium',
                category: 'exploration',
              },
            ]
      )
      .withResources(
        results.map((node) => ({
          type: 'KGNode' as const,
          id: node.nodeId as string,
          label: node.label,
          relevance: 0.7,
        }))
      )
      .withValidityPeriod('short')
      .withEstimatedImpact(0.4, 0.1, 4.0)
      .withReasoning(`Found ${String(results.length)} ${direction} of "${originNode.label}"`)
      .build();
  }

  createPathHints(path: IGraphNode[], fromNode: IGraphNode, toNode: IGraphNode): IAgentHints {
    const pathExists = path.length > 0;

    return AgentHintsBuilder.create()
      .withActions(
        pathExists
          ? [
              {
                action: 'analyze_path',
                description: `Path has ${String(path.length)} nodes — review intermediate concepts`,
                priority: 'medium',
                category: 'exploration',
              },
            ]
          : [
              {
                action: 'create_edges',
                description: `No path from "${fromNode.label}" to "${toNode.label}" — consider adding connecting edges`,
                priority: 'high',
                category: 'optimization',
              },
            ]
      )
      .withResources(
        path.map((node) => ({
          type: 'KGNode' as const,
          id: node.nodeId as string,
          label: node.label,
          relevance: 0.8,
        }))
      )
      .withConfidence(pathExists ? 1.0 : 0.5)
      .withValidityPeriod('short')
      .withAssumptions(
        pathExists ? [`Path represents shortest connection between the two concepts`] : []
      )
      .withEstimatedImpact(pathExists ? 0.5 : 0.3, 0.1, pathExists ? 5.0 : 3.0)
      .withReasoning(
        pathExists
          ? `Shortest path: "${fromNode.label}" → ${String(path.length - 2)} intermediates → "${toNode.label}"`
          : `No path exists between "${fromNode.label}" and "${toNode.label}"`
      )
      .build();
  }

  // -----------------------------------------------------------------------
  // Category C — Advanced Graph-Structure
  // -----------------------------------------------------------------------

  createSiblingsHints(result: ISiblingsResult): IAgentHints {
    const groupCount = result.groups.length;
    const largestGroup = result.groups.reduce((max, g) => Math.max(max, g.totalInGroup), 0);

    const builder = AgentHintsBuilder.create()
      .withResources(
        result.groups.flatMap((g) =>
          g.siblings.slice(0, 3).map((node) => ({
            type: 'KGNode' as const,
            id: node.nodeId as string,
            label: node.label,
            relevance: 0.7,
          }))
        )
      )
      .withValidityPeriod('short')
      .withEstimatedImpact(0.5, 0.1, 5.0)
      .withReasoning(
        `Found ${String(result.totalSiblingCount)} sibling(s) across ${String(groupCount)} parent group(s) for "${result.originNode.label}" via ${result.edgeType}. Largest group: ${String(largestGroup)}.`
      );

    if (result.totalSiblingCount === 0) {
      builder.addAction({
        action: 'create_edges',
        description: `No siblings found for "${result.originNode.label}" via ${result.edgeType} — consider adding structural edges`,
        priority: 'high',
        category: 'exploration',
      });
    } else {
      builder.addAction({
        action: 'get_neighborhood',
        description: `Explore the full neighborhood around "${result.originNode.label}"`,
        priority: 'medium',
        category: 'exploration',
      });

      if (
        largestGroup > LARGE_SIBLING_GROUP_THRESHOLD &&
        (result.edgeType === 'is_a' || result.edgeType === 'part_of')
      ) {
        builder.addAction({
          action: 'review_sce',
          description: `Large sibling group (${String(largestGroup)} nodes) may indicate high sibling confusion entropy — review discrimination`,
          priority: 'medium',
          category: 'optimization',
        });
      }
    }

    return builder.build();
  }

  createCoParentsHints(result: ICoParentsResult): IAgentHints {
    const groupCount = result.groups.length;
    const largestGroup = result.groups.reduce((max, g) => Math.max(max, g.totalInGroup), 0);

    const builder = AgentHintsBuilder.create()
      .withResources(
        result.groups.flatMap((g) =>
          g.coParents.slice(0, 3).map((node) => ({
            type: 'KGNode' as const,
            id: node.nodeId as string,
            label: node.label,
            relevance: 0.7,
          }))
        )
      )
      .withValidityPeriod('short')
      .withEstimatedImpact(0.5, 0.1, 5.0)
      .withReasoning(
        `Found ${String(result.totalCoParentCount)} co-parent(s) across ${String(groupCount)} shared child group(s) for "${result.originNode.label}" via ${result.edgeType}. Largest group: ${String(largestGroup)}.`
      );

    if (result.totalCoParentCount === 0) {
      builder.addAction({
        action: 'create_edges',
        description: `No co-parents found for "${result.originNode.label}" via ${result.edgeType} — consider adding structural edges`,
        priority: 'high',
        category: 'exploration',
      });
    } else {
      builder.addAction({
        action: 'get_siblings',
        description: `Complement with a siblings query to see the full structural picture`,
        priority: 'medium',
        category: 'exploration',
      });

      if (largestGroup > HIGH_CO_PARENT_THRESHOLD) {
        builder.addAction({
          action: 'review_scope_overlap',
          description: `High co-parenting (${String(largestGroup)} co-parents for a single child) — potential scope overlap or redundancy`,
          priority: 'medium',
          category: 'optimization',
        });
      }
    }

    return builder.build();
  }

  createNeighborhoodHints(result: INeighborhoodResult): IAgentHints {
    const groupCount = result.groups.length;
    const edgeTypeDiversity = groupCount;

    const dominantGroup = result.groups.reduce<{ edgeType: string; total: number } | undefined>(
      (best, g) => {
        if (best === undefined || g.totalInGroup > best.total) {
          return { edgeType: g.edgeType, total: g.totalInGroup };
        }
        return best;
      },
      undefined
    );

    const builder = AgentHintsBuilder.create()
      .withResources(
        result.groups.flatMap((g) =>
          g.neighbors.slice(0, 3).map((node) => ({
            type: 'KGNode' as const,
            id: node.nodeId as string,
            label: node.label,
            relevance: 0.7,
          }))
        )
      )
      .withValidityPeriod('short')
      .withEstimatedImpact(0.6, 0.1, 6.0)
      .withReasoning(
        `Neighborhood of "${result.originNode.label}": ${String(result.totalNeighborCount)} neighbor(s) across ${String(groupCount)} edge-type group(s).${dominantGroup !== undefined ? ` Dominant: ${dominantGroup.edgeType} (${String(dominantGroup.total)}).` : ''}`
      );

    if (result.totalNeighborCount === 0) {
      builder.addAction({
        action: 'create_edges',
        description: `"${result.originNode.label}" is isolated — add relationships to build its neighborhood`,
        priority: 'high',
        category: 'exploration',
      });
    } else {
      if (edgeTypeDiversity >= STRUCTURAL_HUB_EDGE_TYPES) {
        builder.addAction({
          action: 'analyze_edge_distribution',
          description: `High edge-type diversity (${String(edgeTypeDiversity)} types) — node is a structural hub`,
          priority: 'medium',
          category: 'exploration',
        });
      }

      builder.addAction({
        action: 'get_subgraph',
        description: `Get the full subgraph for visualization around "${result.originNode.label}"`,
        priority: 'medium',
        category: 'exploration',
      });
    }

    return builder.build();
  }

  // -----------------------------------------------------------------------
  // Category D — Graph Analysis
  // -----------------------------------------------------------------------

  createBridgeNodesHints(result: IBridgeNodesResult): IAgentHints {
    const bridgeCount = result.bridges.length;

    const builder = AgentHintsBuilder.create()
      .withResources(
        result.bridges.slice(0, 5).map((b) => ({
          type: 'KGNode' as const,
          id: b.node.nodeId as string,
          label: b.node.label,
          relevance: 0.9,
        }))
      )
      .withEstimatedImpact(0.7, 0.3, 2.3)
      .withReasoning(
        `Bridge analysis: ${String(bridgeCount)} articulation point(s) found in ${String(result.totalNodesAnalyzed)} nodes.`
      );

    if (bridgeCount === 0) {
      builder.addAction({
        action: 'analyze_robustness',
        description: 'No bridge nodes found — the graph is well-connected with redundant paths',
        priority: 'low',
        category: 'exploration',
      });
    } else {
      const topBridge = result.bridges[0];
      if (topBridge !== undefined) {
        builder.addAction({
          action: 'reinforce_bridge',
          description: `"${topBridge.node.label}" is the most critical bridge — add redundant edges to reduce fragility`,
          priority: 'high',
          category: 'optimization',
        });
      }

      if (bridgeCount >= BRIDGE_BOTTLENECK_THRESHOLD) {
        builder.addAction({
          action: 'review_graph_structure',
          description: `${String(bridgeCount)} bridge nodes detected — the graph has structural bottlenecks`,
          priority: 'medium',
          category: 'exploration',
        });
      }
    }

    return builder.build();
  }

  createFrontierHints(result: IKnowledgeFrontierResult): IAgentHints {
    const frontierCount = result.frontier.length;

    const builder = AgentHintsBuilder.create()
      .withResources(
        result.frontier.slice(0, 5).map((f) => ({
          type: 'KGNode' as const,
          id: f.node.nodeId as string,
          label: f.node.label,
          relevance: f.readinessScore,
        }))
      )
      .withValidityPeriod('short')
      .withAssumptions([`Mastery threshold set to ${String(result.masteryThreshold)}`])
      .withEstimatedImpact(0.8, 0.2, 4.0)
      .withReasoning(
        `Knowledge frontier for "${result.domain}": ${String(frontierCount)} concept(s) ready to learn. Mastery: ${result.summary.masteryPercentage.toFixed(1)}% (${String(result.summary.totalMastered)}/${String(result.summary.totalMastered + result.summary.totalUnmastered)}).`
      );

    if (frontierCount === 0) {
      if (result.summary.totalMastered === 0) {
        builder.addAction({
          action: 'start_learning',
          description: 'No mastered concepts yet — begin with foundational topics',
          priority: 'high',
          category: 'exploration',
        });
      } else {
        builder.addAction({
          action: 'deepen_mastery',
          description:
            'All frontier concepts already explored — deepen existing knowledge or branch to new domains',
          priority: 'medium',
          category: 'optimization',
        });
      }
    } else {
      const topNode = result.frontier[0];
      if (topNode !== undefined) {
        builder.addAction({
          action: 'study_next',
          description: `"${topNode.node.label}" has readiness ${topNode.readinessScore.toFixed(2)} — the best next study candidate`,
          priority: 'high',
          category: 'exploration',
        });
      }

      builder.addAction({
        action: 'schedule_study_session',
        description: `${String(frontierCount)} frontier concept(s) available — schedule a study session`,
        priority: 'medium',
        category: 'optimization',
      });
    }

    return builder.build();
  }

  createCommonAncestorsHints(result: ICommonAncestorsResult): IAgentHints {
    const ancestorCount = result.allCommonAncestors.length;
    const lcaCount = result.lowestCommonAncestors.length;

    const builder = AgentHintsBuilder.create()
      .withResources(
        result.allCommonAncestors.slice(0, 5).map((a) => ({
          type: 'KGNode' as const,
          id: a.node.nodeId as string,
          label: a.node.label,
          relevance: 1.0 / (1.0 + a.combinedDepth),
        }))
      )
      .withValidityPeriod('long')
      .withEstimatedImpact(0.5, 0.1, 5.0)
      .withReasoning(
        `Common ancestors of "${result.nodeA.label}" and "${result.nodeB.label}": ${String(ancestorCount)} shared ancestor(s), ${String(lcaCount)} LCA(s).${result.directlyConnected ? ' Nodes are directly connected.' : ''}`
      );

    if (ancestorCount === 0) {
      builder.addAction({
        action: 'explore_connections',
        description: `"${result.nodeA.label}" and "${result.nodeB.label}" share no common ancestors — they may belong to separate taxonomic branches`,
        priority: 'medium',
        category: 'exploration',
      });
    } else {
      const topLca = result.lowestCommonAncestors[0];
      if (topLca !== undefined) {
        builder.addAction({
          action: 'explore_ancestor',
          description: `Lowest common ancestor: "${topLca.label}" — explore its neighborhood for shared context`,
          priority: 'medium',
          category: 'exploration',
        });
      }

      if (result.directlyConnected) {
        builder.addAction({
          action: 'analyze_direct_link',
          description: `The two nodes are directly connected — their relationship may be more specific than the shared ancestry`,
          priority: 'low',
          category: 'exploration',
        });
      }
    }

    return builder.build();
  }

  createPrerequisiteChainHints(result: IPrerequisiteChainResult): IAgentHints {
    const layerCount = result.layers.length;
    const totalNodes = result.totalPrerequisites;

    const builder = AgentHintsBuilder.create()
      .withResources(
        result.topologicalOrder.slice(0, 5).map((e) => ({
          type: 'KGNode' as const,
          id: e.node.nodeId as string,
          label: e.node.label,
          relevance: 0.8,
        }))
      )
      .withValidityPeriod('long')
      .withEstimatedImpact(0.7, 0.2, 3.5)
      .withReasoning(
        `Prerequisite chain for "${result.targetNode.label}": ${String(layerCount)} layer(s), ${String(totalNodes)} concept(s). Max depth: ${String(result.maxChainDepth)}.`
      );

    if (layerCount === 0) {
      builder.addAction({
        action: 'explore_prerequisites',
        description: `"${result.targetNode.label}" has no prerequisite chain — it may be a foundational concept`,
        priority: 'low',
        category: 'exploration',
      });
    } else {
      const firstLayer = result.layers[0];
      const firstEntry = firstLayer?.nodes[0];
      if (firstEntry !== undefined) {
        builder.addAction({
          action: 'start_from_foundation',
          description: `Start with "${firstEntry.node.label}" (layer ${String(firstLayer?.depth ?? 0)}) — the deepest prerequisite`,
          priority: 'high',
          category: 'exploration',
        });
      }

      if (result.gaps.length > 0) {
        builder.addAction({
          action: 'address_gaps',
          description: `${String(result.gaps.length)} prerequisite gap(s) detected — review and reinforce weak prerequisites`,
          priority: 'high',
          category: 'optimization',
        });
      }
    }

    return builder.build();
  }

  createCentralityHints(result: ICentralityResult): IAgentHints {
    const entryCount = result.ranking.length;

    const builder = AgentHintsBuilder.create()
      .withResources(
        result.ranking.slice(0, 5).map((e) => ({
          type: 'KGNode' as const,
          id: e.node.nodeId as string,
          label: e.node.label,
          relevance: e.score,
        }))
      )
      .withAssumptions([`Algorithm: ${result.algorithm}`, `Top-K: ${String(entryCount)}`])
      .withEstimatedImpact(0.6, 0.2, 3.0)
      .withReasoning(
        `Centrality ranking (${result.algorithm}): ${String(entryCount)} node(s). Mean: ${result.statistics.mean.toFixed(3)}, StdDev: ${result.statistics.standardDeviation.toFixed(3)}.`
      );

    if (entryCount === 0) {
      builder.addAction({
        action: 'add_concepts',
        description: 'No nodes found for centrality analysis — add concepts to the domain',
        priority: 'medium',
        category: 'exploration',
      });
    } else {
      const topEntry = result.ranking[0];
      if (topEntry !== undefined) {
        builder.addAction({
          action: 'focus_on_central',
          description: `"${topEntry.node.label}" is the most central concept (${result.algorithm}, score: ${topEntry.score.toFixed(3)}) — prioritize for study`,
          priority: 'high',
          category: 'optimization',
        });
      }

      if (
        result.statistics.standardDeviation >
        result.statistics.mean * CENTRALITY_VARIANCE_RATIO
      ) {
        builder.addAction({
          action: 'balance_graph',
          description:
            'High centrality variance — some concepts dominate; consider adding connections to peripheral nodes',
          priority: 'medium',
          category: 'optimization',
        });
      }
    }

    return builder.build();
  }

  // -----------------------------------------------------------------------
  // Category E — CKG Node
  // -----------------------------------------------------------------------

  createCkgNodeHints(node: IGraphNode): IAgentHints {
    return AgentHintsBuilder.create()
      .withActions([
        {
          action: 'compare_with_pkg',
          description: `Compare this canonical node with your personal understanding`,
          priority: 'medium',
          category: 'optimization',
        },
        {
          action: 'get_ckg_subgraph',
          description: `Explore the canonical neighborhood of "${node.label}"`,
          priority: 'medium',
          category: 'exploration',
        },
      ])
      .withResources([
        {
          type: 'CKGNode',
          id: node.nodeId as string,
          label: `CKG: ${node.label}`,
          relevance: 1.0,
        },
      ])
      .withValidityPeriod('long')
      .withAssumptions(['CKG represents expert-curated canonical knowledge'])
      .withEstimatedImpact(0.5, 0.1, 5.0)
      .withReasoning(`CKG node "${node.label}" (${node.nodeType}) in domain "${node.domain}"`)
      .build();
  }

  // -----------------------------------------------------------------------
  // Category F — CKG Mutation Pipeline
  // -----------------------------------------------------------------------

  createMutationHints(action: string, mutation: ICkgMutation): IAgentHints {
    const isTerminal = mutation.state === 'committed' || mutation.state === 'rejected';

    const builder = AgentHintsBuilder.create()
      .withResources([
        {
          type: 'CKGMutation',
          id: mutation.mutationId as string,
          label: `Mutation ${mutation.mutationId} (${mutation.state})`,
          relevance: 1.0,
        },
      ])
      .withValidityPeriod('short')
      .withAssumptions(
        isTerminal ? [] : ['Mutation is processing asynchronously — state may change']
      )
      .withEstimatedImpact(0.6, 0.2, 3.0)
      .withReasoning(
        `CKG mutation ${action}: ${mutation.mutationId} is in state "${mutation.state}"`
      );

    if (action === 'proposed') {
      builder.addAction({
        action: 'get_mutation',
        description: 'Check the mutation status — it is processing asynchronously',
        priority: 'medium',
        category: 'exploration',
      });
    }

    if (mutation.state === 'rejected') {
      builder
        .addAction({
          action: 'retry_mutation',
          description: 'Retry this mutation if the rejection reason is resolvable',
          priority: 'medium',
          category: 'exploration',
        })
        .addAction({
          action: 'get_mutation_audit_log',
          description: 'Review the audit trail to understand why it was rejected',
          priority: 'high',
          category: 'exploration',
        });
    }

    if (mutation.state === 'pending_review') {
      builder
        .addAction({
          action: 'approve_escalated_mutation',
          description: 'Approve this mutation to override ontological conflicts',
          priority: 'high',
          category: 'exploration',
        })
        .addAction({
          action: 'reject_escalated_mutation',
          description: 'Reject this mutation to confirm ontological conflicts',
          priority: 'high',
          category: 'exploration',
        })
        .addAction({
          action: 'get_mutation_audit_log',
          description: 'Review the audit trail to understand the conflicts',
          priority: 'medium',
          category: 'exploration',
        });
    }

    if (!isTerminal && mutation.state !== 'proposed') {
      builder.addAction({
        action: 'cancel_mutation',
        description: 'Cancel this mutation if it should not proceed',
        priority: 'low',
        category: 'exploration',
      });
    }

    return builder.build();
  }

  createMutationListHints(mutations: ICkgMutation[], filters: IMutationFilter): IAgentHints {
    const stateCounts = new Map<string, number>();
    for (const m of mutations) {
      stateCounts.set(m.state, (stateCounts.get(m.state) ?? 0) + 1);
    }

    const stateBreakdown = [...stateCounts.entries()]
      .map(([state, count]) => `${state}: ${String(count)}`)
      .join(', ');

    const builder = AgentHintsBuilder.create()
      .withResources(
        mutations.slice(0, 5).map((m) => ({
          type: 'CKGMutation' as const,
          id: m.mutationId as string,
          label: `Mutation ${m.mutationId} (${m.state})`,
          relevance: 0.8,
        }))
      )
      .withValidityPeriod('short')
      .withEstimatedImpact(0.3, 0.1, 3.0);

    builder.addAction({
      action: 'propose_mutation',
      description: 'Create a new CKG mutation proposal',
      priority: 'low',
      category: 'exploration',
    });

    if (filters.state === 'rejected') {
      builder.addAction({
        action: 'retry_mutation',
        description: 'Retry a rejected mutation after resolving issues',
        priority: 'medium',
        category: 'correction',
      });
    } else if (filters.state === 'pending_review') {
      builder.addAction({
        action: 'approve_mutation',
        description: 'Review and approve a mutation pending review',
        priority: 'high',
        category: 'correction',
      });
    }

    const filterDescription =
      filters.state !== undefined
        ? ` (filtered by state: ${filters.state})`
        : filters.proposedBy !== undefined && filters.proposedBy !== ''
          ? ` (filtered by proposer: ${filters.proposedBy})`
          : '';

    builder.withReasoning(
      `Found ${String(mutations.length)} mutation(s)${filterDescription}: ${stateBreakdown}`
    );

    return builder.build();
  }

  // -----------------------------------------------------------------------
  // Category G — Phase 7: Metrics & Misconceptions
  // -----------------------------------------------------------------------

  createMetricsHints(metrics: IStructuralMetrics, domain: string): IAgentHints {
    const warningMetrics: string[] = [];
    if (metrics.abstractionDrift > ABSTRACTION_DRIFT_WARNING)
      warningMetrics.push('abstractionDrift');
    if (metrics.scopeLeakageIndex > SCOPE_LEAKAGE_WARNING) warningMetrics.push('scopeLeakageIndex');
    if (metrics.siblingConfusionEntropy > SIBLING_CONFUSION_WARNING)
      warningMetrics.push('siblingConfusionEntropy');
    if (metrics.structuralAttributionAccuracy < ATTRIBUTION_ACCURACY_WARNING)
      warningMetrics.push('structuralAttributionAccuracy');

    const builder = AgentHintsBuilder.create()
      .withConfidence(0.95)
      .withValidityPeriod('short')
      .withAssumptions(['Metrics computed from current graph state'])
      .withEstimatedImpact(0.6, 0.1, 6.0)
      .withReasoning(
        `Computed 11 structural metrics for domain "${domain}". ${warningMetrics.length > 0 ? `Warning metrics: ${warningMetrics.join(', ')}` : 'All metrics within healthy range.'}`
      );

    builder
      .addAction({
        action: 'get_structural_health',
        description: 'Get full health report with trends',
        priority: 'medium',
        category: 'exploration',
      })
      .addAction({
        action: 'get_metacognitive_stage',
        description: 'Assess metacognitive development stage',
        priority: 'medium',
        category: 'exploration',
      });

    if (warningMetrics.length > 0) {
      builder
        .addAction({
          action: 'detect_misconceptions',
          description: `Run misconception detection — warning metrics: ${warningMetrics.join(', ')}`,
          priority: 'high',
          category: 'correction',
        })
        .addRiskFactor({
          type: 'accuracy',
          severity: 'medium',
          description: `${String(warningMetrics.length)} metric(s) in warning range`,
          probability: METRICS_WARNING_RISK_PROBABILITY,
          impact: METRICS_WARNING_RISK_IMPACT,
        });
    }

    return builder.build();
  }

  createComparisonHints(comparison: IGraphComparison): IAgentHints {
    const builder = AgentHintsBuilder.create()
      .withActions([
        {
          action: 'compute_metrics',
          description: 'Compute structural metrics from this comparison',
          priority: 'medium',
          category: 'exploration',
        },
      ])
      .withConfidence(0.9)
      .withValidityPeriod('short')
      .withAssumptions(['Comparison computed from current graph state'])
      .withEstimatedImpact(0.5, 0.1, 5.0)
      .withReasoning(
        `Comparison: ${String(comparison.nodeAlignment.size)} aligned nodes, ${String(comparison.unmatchedPkgNodes.length)} PKG-only, ${String(comparison.unmatchedCkgNodes.length)} CKG-only, ${String(comparison.structuralDivergences.length)} divergences.`
      );

    if (comparison.structuralDivergences.length > 0) {
      builder.addRiskFactor({
        type: 'accuracy',
        severity: 'medium',
        description: `${String(comparison.structuralDivergences.length)} divergence(s) found between PKG and CKG`,
        probability: COMPARISON_DIVERGENCE_RISK_PROBABILITY,
        impact: COMPARISON_DIVERGENCE_RISK_IMPACT,
      });
    }

    return builder.build();
  }

  createMisconceptionHints(detections: IMisconceptionDetection[]): IAgentHints {
    const highConfidence = detections.filter(
      (d) => (d.confidence as number) >= HIGH_CONFIDENCE_MISCONCEPTION
    );

    const builder = AgentHintsBuilder.create()
      .withResources(
        detections.slice(0, 5).map((d) => ({
          type: 'Misconception' as const,
          id: d.patternId as string,
          label: `${d.misconceptionType} (confidence: ${(d.confidence as number).toFixed(2)})`,
          relevance: d.confidence as number,
        }))
      )
      .withConfidence(0.85)
      .withValidityPeriod('short')
      .withAssumptions(['Detection run against current graph state'])
      .withEstimatedImpact(0.7, 0.3, 2.3)
      .withReasoning(
        `Detected ${String(detections.length)} misconception(s): ${String(highConfidence.length)} high-confidence, ${String(detections.length - highConfidence.length)} low-confidence.`
      );

    if (highConfidence.length > 0) {
      builder
        .addAction({
          action: 'review_misconceptions',
          description: `Review ${String(highConfidence.length)} high-confidence misconception(s)`,
          priority: 'high',
          category: 'correction',
        })
        .addRiskFactor({
          type: 'accuracy',
          severity: 'high',
          description: `${String(highConfidence.length)} high-confidence misconception(s) requiring attention`,
          probability: MISCONCEPTION_RISK_PROBABILITY,
          impact: MISCONCEPTION_RISK_IMPACT,
        });
    }

    builder.addAction({
      action: 'get_structural_health',
      description: 'Check overall structural health',
      priority: 'medium',
      category: 'exploration',
    });

    return builder.build();
  }

  createHealthHints(report: IStructuralHealthReport): IAgentHints {
    const status =
      report.overallScore >= HEALTH_SCORE_HEALTHY
        ? 'healthy'
        : report.overallScore >= HEALTH_SCORE_WARNING
          ? 'warning'
          : 'critical';

    const builder = AgentHintsBuilder.create()
      .withConfidence(0.9)
      .withValidityPeriod('short')
      .withAssumptions(['Health report computed from latest metrics'])
      .withEstimatedImpact(0.5, 0.1, 5.0)
      .withReasoning(
        `Structural health: ${status} (score: ${report.overallScore.toFixed(2)}). Domain: ${report.domain}.`
      );

    builder.addAction({
      action: 'get_metacognitive_stage',
      description: 'Check metacognitive development stage',
      priority: 'medium',
      category: 'exploration',
    });

    if (status !== 'healthy') {
      builder.addAction({
        action: 'detect_misconceptions',
        description: 'Run misconception detection for unhealthy graph',
        priority: 'high',
        category: 'correction',
      });
    }

    if (status === 'critical') {
      builder.addRiskFactor({
        type: 'accuracy',
        severity: 'critical',
        description: 'Graph health is critical — intervention recommended',
        probability: CRITICAL_HEALTH_RISK_PROBABILITY,
        impact: CRITICAL_HEALTH_RISK_IMPACT,
      });
    }

    return builder.build();
  }

  createStageHints(assessment: IMetacognitiveStageAssessment): IAgentHints {
    const builder = AgentHintsBuilder.create()
      .withConfidence(0.85)
      .withAssumptions(['Stage assessment from latest metrics'])
      .withEstimatedImpact(0.5, 0.1, 5.0)
      .withReasoning(
        `Metacognitive stage: ${assessment.currentStage}. ${assessment.regressionDetected ? 'Regression detected. ' : ''}${String(assessment.nextStageGaps.length)} gap(s) to next stage.`
      );

    builder.addAction({
      action: 'get_structural_health',
      description: 'Get full structural health report',
      priority: 'medium',
      category: 'exploration',
    });

    if (assessment.nextStageGaps.length > 0) {
      builder.addAction({
        action: 'address_stage_gaps',
        description: `Address ${String(assessment.nextStageGaps.length)} gap(s) to reach next stage`,
        priority: 'medium',
        category: 'optimization',
      });
    }

    if (assessment.regressionDetected) {
      builder.addRiskFactor({
        type: 'accuracy',
        severity: 'high',
        description: 'Stage regression detected — review recent changes',
        probability: 0.8,
        impact: 0.6,
      });
    }

    return builder.build();
  }
}
