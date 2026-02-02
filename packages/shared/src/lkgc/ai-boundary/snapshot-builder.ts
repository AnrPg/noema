// =============================================================================
// SNAPSHOT BUILDER - Exports Read-Only Versioned Snapshots for AI Inference
// =============================================================================
// Creates immutable snapshots of LKGC state scoped by profile definitions.
//
// Core principles:
// - Profiles control scope — AI does not decide what it sees
// - Snapshots are immutable, versioned, and auditable
// - Budget and temporal constraints are enforced
// - Privacy rules filter sensitive data
//
// NO UI. NO REAL ML. LKGC IS AUTHORITATIVE.
// =============================================================================

import type {
  UserId,
  NodeId,
  EdgeId,
  SessionId,
  Timestamp,
  Confidence,
  NormalizedValue,
  RevisionNumber,
  Duration,
} from "../../types/lkgc/foundation";
import type { MasteryState } from "../../types/lkgc/mastery";
import type { BaseNode, NodeType } from "../../types/lkgc/nodes";
import type { BaseEdge, EdgeType } from "../../types/lkgc/edges";
import type {
  SnapshotProfileDefinition,
  SnapshotRequest,
  AISnapshot,
  SnapshotMetadata,
  SnapshotBudget,
  TemporalScope,
  GraphScope,
  SnapshotMasteryState,
  SnapshotNode,
  SnapshotEdge,
  SnapshotFeature,
  SnapshotContext,
  SnapshotStatistics,
  SnapshotWatermarks,
  ProfileBudgetBounds,
  ProfileTemporalBounds,
  MasterySignalScope,
  ContextSignalScope,
  SnapshotPrivacyRules,
  BudgetTier,
  SnapshotRequestContext,
} from "./snapshot-types";
import { generateSnapshotId, now } from "../id-generator";
import { getSnapshotProfile } from "./snapshot-profiles";

// =============================================================================
// STORE INTERFACES - Dependencies injected for isolation
// =============================================================================

/**
 * Read-only view of mastery state for a user
 */
export interface MasteryStateReader {
  /** Get all mastery states for a user */
  getMasteryStatesForUser(userId: UserId): ReadonlyMap<NodeId, MasteryState>;

  /** Get mastery state for specific node */
  getMasteryState(userId: UserId, nodeId: NodeId): MasteryState | undefined;

  /** Get current global revision */
  getCurrentRevision(): RevisionNumber;
}

/**
 * Read-only view of the knowledge graph
 */
export interface KnowledgeGraphReader {
  /** Get a node by ID */
  getNode(nodeId: NodeId): BaseNode | undefined;

  /** Get all nodes of specified types */
  getNodesByTypes(types: readonly NodeType[]): readonly BaseNode[];

  /** Get edges from a node, optionally filtered by type */
  getOutgoingEdges(
    nodeId: NodeId,
    edgeTypes?: readonly EdgeType[],
  ): readonly BaseEdge[];

  /** Get edges to a node, optionally filtered by type */
  getIncomingEdges(
    nodeId: NodeId,
    edgeTypes?: readonly EdgeType[],
  ): readonly BaseEdge[];

  /** Get an edge by ID */
  getEdge(edgeId: EdgeId): BaseEdge | undefined;

  /** Get N-hop neighborhood from a set of nodes */
  getNHopNeighborhood(
    rootNodes: readonly NodeId[],
    maxHops: number,
    allowedEdgeTypes: readonly EdgeType[],
    excludedEdgeTypes: readonly EdgeType[],
    allowedNodeTypes: readonly NodeType[],
    excludedNodeTypes: readonly NodeType[],
  ): {
    nodes: readonly BaseNode[];
    edges: readonly BaseEdge[];
  };
}

/**
 * Read-only view of session/attempt history
 */
export interface SessionHistoryReader {
  /** Get recent sessions for a user */
  getRecentSessions(userId: UserId, limit: number): readonly SessionSummary[];

  /** Get recent attempts for a user within a time window */
  getRecentAttempts(
    userId: UserId,
    since: Timestamp,
    limit: number,
  ): readonly AttemptSummary[];

  /** Get attempts for specific nodes */
  getAttemptsForNodes(
    userId: UserId,
    nodeIds: readonly NodeId[],
    limit: number,
  ): ReadonlyMap<NodeId, readonly AttemptSummary[]>;
}

/**
 * Summary of a study session
 */
export interface SessionSummary {
  readonly sessionId: SessionId;
  readonly startedAt: Timestamp;
  readonly endedAt: Timestamp | null;
  readonly mode: string;
  readonly attemptCount: number;
  readonly correctCount: number;
}

/**
 * Summary of a single attempt/review
 */
export interface AttemptSummary {
  readonly nodeId: NodeId;
  readonly sessionId: SessionId;
  readonly timestamp: Timestamp;
  readonly outcome: string;
  readonly responseTime: number;
  readonly confidencePrediction?: NormalizedValue;
  readonly confidenceActual?: NormalizedValue;
}

// =============================================================================
// SNAPSHOT BUILDER CONFIGURATION
// =============================================================================

/**
 * Configuration for the snapshot builder
 */
export interface SnapshotBuilderConfig {
  readonly masteryReader: MasteryStateReader;
  readonly graphReader: KnowledgeGraphReader;
  readonly sessionReader: SessionHistoryReader;
}

/**
 * Result of snapshot building
 */
export interface SnapshotBuildResult {
  readonly success: true;
  readonly snapshot: AISnapshot;
  readonly statistics: SnapshotStatistics;
}

/**
 * Snapshot build error
 */
export interface SnapshotBuildError {
  readonly success: false;
  readonly error: SnapshotBuilderErrorCode;
  readonly message: string;
}

export type SnapshotBuilderErrorCode =
  | "unknown_profile"
  | "profile_inactive"
  | "profile_version_mismatch"
  | "budget_out_of_bounds"
  | "temporal_out_of_bounds"
  | "graph_out_of_bounds"
  | "user_not_found"
  | "no_targets_selected"
  | "internal_error";

export type SnapshotBuildOutcome = SnapshotBuildResult | SnapshotBuildError;

// =============================================================================
// SNAPSHOT BUILDER
// =============================================================================

/**
 * Builds read-only, versioned snapshots for AI inference
 *
 * The builder enforces profile constraints and produces immutable snapshots
 * that are auditable and reproducible.
 */
export class SnapshotBuilder {
  private readonly masteryReader: MasteryStateReader;
  private readonly graphReader: KnowledgeGraphReader;
  private readonly sessionReader: SessionHistoryReader;

  constructor(config: SnapshotBuilderConfig) {
    this.masteryReader = config.masteryReader;
    this.graphReader = config.graphReader;
    this.sessionReader = config.sessionReader;
  }

  /**
   * Build a snapshot from a request
   */
  build(request: SnapshotRequest): SnapshotBuildOutcome {
    const startTime = now();

    // 1. Resolve profile
    const profile = getSnapshotProfile(request.profileId);
    if (!profile) {
      return {
        success: false,
        error: "unknown_profile",
        message: `Unknown profile: ${request.profileId}`,
      };
    }

    if (!profile.isActive) {
      return {
        success: false,
        error: "profile_inactive",
        message: `Profile is inactive: ${request.profileId}`,
      };
    }

    if (
      request.profileVersion !== undefined &&
      request.profileVersion !== profile.version
    ) {
      return {
        success: false,
        error: "profile_version_mismatch",
        message: `Profile version mismatch: requested ${request.profileVersion}, available ${profile.version}`,
      };
    }

    // 2. Resolve effective budget
    const budgetResult = this.resolveEffectiveBudget(
      profile,
      request.budgetTier ?? "standard",
      request.budgetOverrides,
    );
    if (!budgetResult.success) {
      return budgetResult;
    }
    const effectiveBudget = budgetResult.budget;

    // 3. Resolve effective temporal scope
    const temporalResult = this.resolveEffectiveTemporalScope(
      profile,
      request.temporalOverrides,
    );
    if (!temporalResult.success) {
      return temporalResult;
    }
    const effectiveTemporal = temporalResult.temporal;

    // 4. Resolve effective graph scope
    const graphResult = this.resolveEffectiveGraphScope(
      profile,
      request.graphOverrides,
    );
    if (!graphResult.success) {
      return graphResult;
    }
    const effectiveGraph = graphResult.graph;

    // 5. Select target nodes
    const targetNodes = this.selectTargetNodes(
      request.userId,
      profile,
      request.explicitTargetIds,
    );
    if (targetNodes.length === 0) {
      return {
        success: false,
        error: "no_targets_selected",
        message: "No target nodes matched the selection criteria",
      };
    }

    // 6. Build graph data (N-hop neighborhood)
    const graphData = this.buildGraphData(
      targetNodes,
      effectiveGraph,
      effectiveBudget,
      profile.privacyRules,
    );

    // 7. Build mastery data
    const masteryData = this.buildMasteryData(
      request.userId,
      graphData.nodeIds,
      profile.signalScope.mastery,
      profile.privacyRules,
      effectiveBudget,
    );

    // 8. Build features (placeholder for now)
    const features: readonly SnapshotFeature[] = [];

    // 9. Build context
    const context = this.buildContextData(
      request.context,
      profile.signalScope.context,
    );

    // 10. Compute watermarks
    const currentRevision = this.masteryReader.getCurrentRevision();
    const timestamp = now();
    const watermarks: SnapshotWatermarks = {
      lastEventRevision: currentRevision,
      lastGraphRevision: currentRevision,
      lastMasteryRevision: currentRevision,
      oldestDataTimestamp: this.computeOldestTimestamp(masteryData.states),
      newestDataTimestamp: timestamp,
    };

    // 11. Compute statistics
    const nodesByType = this.countByType(graphData.nodes, "nodeType");
    const edgesByType = this.countByType(graphData.edges, "edgeType");
    const approximatePayloadBytes = this.estimatePayloadSize(
      graphData.nodes,
      graphData.edges,
      masteryData.states,
    );

    const statistics: SnapshotStatistics = {
      nodeCount: graphData.nodes.length,
      edgeCount: graphData.edges.length,
      masteryStateCount: masteryData.states.length,
      featureCount: features.length,
      approximatePayloadBytes,
      nodesByType,
      edgesByType,
      budgetUtilization: Math.max(
        graphData.nodes.length / effectiveBudget.maxNodes,
        graphData.edges.length / effectiveBudget.maxEdges,
        masteryData.states.length / effectiveBudget.maxMasteryStates,
      ) as NormalizedValue,
    };

    // 12. Build metadata
    const endTime = now();
    const metadata: SnapshotMetadata = {
      snapshotId: generateSnapshotId(),
      profileId: profile.profileId,
      profileVersion: profile.version,
      userId: request.userId,
      generatedAt: timestamp,
      requestId: request.requestId,
      budgetTier: request.budgetTier ?? "standard",
      effectiveBudget,
      effectiveTemporalScope: effectiveTemporal,
      effectiveGraphScope: effectiveGraph,
      appliedOverrides: {
        budget: request.budgetOverrides ?? {},
        temporal: request.temporalOverrides ?? {},
        graph: request.graphOverrides ?? {},
      },
      schemaVersion: 1,
      generationDuration: (endTime - startTime) as Duration,
      watermarks,
      statistics,
    };

    // 13. Create snapshot
    const snapshot: AISnapshot = {
      metadata,
      nodes: graphData.nodes,
      edges: graphData.edges,
      masteryStates: masteryData.states,
      features,
      context,
      targetNodeIds: [...targetNodes],
      profileDefinition: profile,
    };

    return {
      success: true,
      snapshot,
      statistics,
    };
  }

  // ===========================================================================
  // PRIVATE: Budget Resolution
  // ===========================================================================

  private resolveEffectiveBudget(
    profile: SnapshotProfileDefinition,
    tier: BudgetTier,
    overrides?: Partial<SnapshotBudget>,
  ): { success: true; budget: SnapshotBudget } | SnapshotBuildError {
    const tieredBudget = profile.tieredBudgets[tier];
    const bounds = profile.budgetBounds;

    // Start with tier defaults
    let budget: SnapshotBudget = { ...tieredBudget };

    // Apply overrides (if within bounds)
    if (overrides) {
      const validationError = this.validateBudgetOverrides(overrides, bounds);
      if (validationError) {
        return validationError;
      }

      budget = {
        maxNodes: overrides.maxNodes ?? budget.maxNodes,
        maxEdges: overrides.maxEdges ?? budget.maxEdges,
        maxMasteryStates: overrides.maxMasteryStates ?? budget.maxMasteryStates,
        maxFeatures: overrides.maxFeatures ?? budget.maxFeatures,
        maxPayloadBytes: overrides.maxPayloadBytes ?? budget.maxPayloadBytes,
      };
    }

    return { success: true, budget };
  }

  private validateBudgetOverrides(
    overrides: Partial<SnapshotBudget>,
    bounds: ProfileBudgetBounds,
  ): SnapshotBuildError | null {
    const checks: Array<{
      key: keyof SnapshotBudget;
      value: number | undefined;
      bound: { min: number; max: number };
    }> = [
      { key: "maxNodes", value: overrides.maxNodes, bound: bounds.maxNodes },
      { key: "maxEdges", value: overrides.maxEdges, bound: bounds.maxEdges },
      {
        key: "maxMasteryStates",
        value: overrides.maxMasteryStates,
        bound: bounds.maxMasteryStates,
      },
      {
        key: "maxFeatures",
        value: overrides.maxFeatures,
        bound: bounds.maxFeatures,
      },
      {
        key: "maxPayloadBytes",
        value: overrides.maxPayloadBytes,
        bound: bounds.maxPayloadBytes,
      },
    ];

    for (const check of checks) {
      if (check.value !== undefined) {
        if (check.value < check.bound.min || check.value > check.bound.max) {
          return {
            success: false,
            error: "budget_out_of_bounds",
            message: `${check.key} override ${check.value} is outside bounds [${check.bound.min}, ${check.bound.max}]`,
          };
        }
      }
    }

    return null;
  }

  // ===========================================================================
  // PRIVATE: Temporal Scope Resolution
  // ===========================================================================

  private resolveEffectiveTemporalScope(
    profile: SnapshotProfileDefinition,
    overrides?: Partial<TemporalScope>,
  ): { success: true; temporal: TemporalScope } | SnapshotBuildError {
    const bounds = profile.temporalBounds;

    // Start with defaults
    let temporal: TemporalScope = {
      recentAttempts: bounds.recentAttempts.default,
      recentSessions: bounds.recentSessions.default,
      rollingWindowDays: bounds.rollingWindowDays.default,
      maxLookbackDays: bounds.maxLookbackDays.default,
    };

    // Apply overrides (if within bounds)
    if (overrides) {
      const validationError = this.validateTemporalOverrides(overrides, bounds);
      if (validationError) {
        return validationError;
      }

      temporal = {
        recentAttempts: overrides.recentAttempts ?? temporal.recentAttempts,
        recentSessions: overrides.recentSessions ?? temporal.recentSessions,
        rollingWindowDays:
          overrides.rollingWindowDays ?? temporal.rollingWindowDays,
        maxLookbackDays: overrides.maxLookbackDays ?? temporal.maxLookbackDays,
      };
    }

    return { success: true, temporal };
  }

  private validateTemporalOverrides(
    overrides: Partial<TemporalScope>,
    bounds: ProfileTemporalBounds,
  ): SnapshotBuildError | null {
    const checks: Array<{
      key: keyof TemporalScope;
      value: number | undefined;
      bound: { min: number; max: number };
    }> = [
      {
        key: "recentAttempts",
        value: overrides.recentAttempts,
        bound: bounds.recentAttempts,
      },
      {
        key: "recentSessions",
        value: overrides.recentSessions,
        bound: bounds.recentSessions,
      },
      {
        key: "rollingWindowDays",
        value: overrides.rollingWindowDays,
        bound: bounds.rollingWindowDays,
      },
      {
        key: "maxLookbackDays",
        value: overrides.maxLookbackDays,
        bound: bounds.maxLookbackDays,
      },
    ];

    for (const check of checks) {
      if (check.value !== undefined) {
        if (check.value < check.bound.min || check.value > check.bound.max) {
          return {
            success: false,
            error: "temporal_out_of_bounds",
            message: `${check.key} override ${check.value} is outside bounds [${check.bound.min}, ${check.bound.max}]`,
          };
        }
      }
    }

    return null;
  }

  // ===========================================================================
  // PRIVATE: Graph Scope Resolution
  // ===========================================================================

  private resolveEffectiveGraphScope(
    profile: SnapshotProfileDefinition,
    overrides?: Partial<GraphScope>,
  ): { success: true; graph: GraphScope } | SnapshotBuildError {
    const bounds = profile.graphBounds;

    // Start with defaults
    let graph: GraphScope = {
      maxHops: bounds.maxHops.default,
      allowedEdgeTypes: [...bounds.allowableEdgeTypes],
      excludedEdgeTypes: [...bounds.mandatoryExcludedEdgeTypes],
      allowedNodeTypes: [...bounds.allowableNodeTypes],
      excludedNodeTypes: [...bounds.mandatoryExcludedNodeTypes],
      includeDeleted: false,
    };

    // Apply overrides (if within bounds)
    if (overrides) {
      // Validate maxHops
      if (overrides.maxHops !== undefined) {
        if (
          overrides.maxHops < bounds.maxHops.min ||
          overrides.maxHops > bounds.maxHops.max
        ) {
          return {
            success: false,
            error: "graph_out_of_bounds",
            message: `maxHops override ${overrides.maxHops} is outside bounds [${bounds.maxHops.min}, ${bounds.maxHops.max}]`,
          };
        }
        graph = { ...graph, maxHops: overrides.maxHops };
      }

      // Validate edge types (must be subset of allowable)
      if (overrides.allowedEdgeTypes) {
        const invalidEdges = overrides.allowedEdgeTypes.filter(
          (e) => !bounds.allowableEdgeTypes.includes(e),
        );
        if (invalidEdges.length > 0) {
          return {
            success: false,
            error: "graph_out_of_bounds",
            message: `Edge types not allowed by profile: ${invalidEdges.join(", ")}`,
          };
        }
        graph = {
          ...graph,
          allowedEdgeTypes: [...overrides.allowedEdgeTypes],
        };
      }

      // Validate node types (must be subset of allowable)
      if (overrides.allowedNodeTypes) {
        const invalidNodes = overrides.allowedNodeTypes.filter(
          (n) => !bounds.allowableNodeTypes.includes(n),
        );
        if (invalidNodes.length > 0) {
          return {
            success: false,
            error: "graph_out_of_bounds",
            message: `Node types not allowed by profile: ${invalidNodes.join(", ")}`,
          };
        }
        graph = {
          ...graph,
          allowedNodeTypes: [...overrides.allowedNodeTypes],
        };
      }

      // Excluded types must include mandatory exclusions
      if (overrides.excludedEdgeTypes) {
        const combined = new Set([
          ...bounds.mandatoryExcludedEdgeTypes,
          ...overrides.excludedEdgeTypes,
        ]);
        graph = { ...graph, excludedEdgeTypes: [...combined] };
      }

      if (overrides.excludedNodeTypes) {
        const combined = new Set([
          ...bounds.mandatoryExcludedNodeTypes,
          ...overrides.excludedNodeTypes,
        ]);
        graph = { ...graph, excludedNodeTypes: [...combined] };
      }
    }

    return { success: true, graph };
  }

  // ===========================================================================
  // PRIVATE: Target Node Selection
  // ===========================================================================

  private selectTargetNodes(
    userId: UserId,
    profile: SnapshotProfileDefinition,
    explicitIds?: readonly NodeId[],
  ): readonly NodeId[] {
    const targetSet = new Set<NodeId>();

    // Add explicit IDs
    if (explicitIds) {
      for (const id of explicitIds) {
        targetSet.add(id);
      }
    }

    // Get nodes by target type
    const criteria = profile.targetCriteria;
    const candidates = this.graphReader.getNodesByTypes(
      criteria.targetNodeTypes,
    );

    // Get mastery states for filtering
    const masteryStates = this.masteryReader.getMasteryStatesForUser(userId);
    const timestamp = now();

    for (const node of candidates) {
      const mastery = masteryStates.get(node.id);

      // Apply filters
      let matches = true;

      // Due filter
      if (criteria.dueFilter && mastery) {
        const dueDate = mastery.memory.dueDate;
        if (dueDate) {
          const dueDelta = dueDate - timestamp;
          const isDueOrOverdue =
            dueDelta <= criteria.dueFilter.dueWithin ||
            (dueDelta < 0 && -dueDelta <= criteria.dueFilter.overdueWithin);
          if (!isDueOrOverdue) {
            matches = false;
          }
        } else {
          matches = false; // No due date = not due
        }
      }

      // Failure filter
      if (criteria.failureFilter && mastery) {
        const lapses = mastery.memory.lapses ?? 0;
        const lastReview = mastery.memory.lastReview;
        if (
          lapses < criteria.failureFilter.minFailures ||
          !lastReview ||
          timestamp - lastReview > criteria.failureFilter.failedWithin
        ) {
          matches = false;
        }
      }

      // Interference filter
      if (criteria.interferenceFilter && mastery) {
        const interference = mastery.forgetting?.interferenceIndex ?? 0;
        if (interference < criteria.interferenceFilter.minInterferenceIndex) {
          matches = false;
        }
      }

      // Blocking filter - requires graph analysis
      if (criteria.blockingFilter) {
        const dependents = this.graphReader.getOutgoingEdges(node.id, [
          "prerequisite_of",
        ]);
        if (dependents.length < criteria.blockingFilter.minBlockedDependents) {
          matches = false;
        }
      }

      if (matches) {
        targetSet.add(node.id);
      }
    }

    return [...targetSet];
  }

  // ===========================================================================
  // PRIVATE: Graph Data Building
  // ===========================================================================

  private buildGraphData(
    targetNodes: readonly NodeId[],
    graphScope: GraphScope,
    budget: SnapshotBudget,
    privacyRules: SnapshotPrivacyRules,
  ): {
    nodes: readonly SnapshotNode[];
    edges: readonly SnapshotEdge[];
    nodeIds: readonly NodeId[];
  } {
    // Get N-hop neighborhood
    const neighborhood = this.graphReader.getNHopNeighborhood(
      targetNodes,
      graphScope.maxHops,
      graphScope.allowedEdgeTypes,
      graphScope.excludedEdgeTypes,
      graphScope.allowedNodeTypes,
      graphScope.excludedNodeTypes,
    );

    const availableNodes = neighborhood.nodes;
    const availableEdges = neighborhood.edges;

    // Apply budget limits
    const includedNodes =
      availableNodes.length > budget.maxNodes
        ? availableNodes.slice(0, budget.maxNodes)
        : availableNodes;
    const includedEdges =
      availableEdges.length > budget.maxEdges
        ? availableEdges.slice(0, budget.maxEdges)
        : availableEdges;

    // Convert to snapshot format
    const snapshotNodes: SnapshotNode[] = includedNodes.map((node) =>
      this.toSnapshotNode(node, privacyRules),
    );
    const snapshotEdges: SnapshotEdge[] = includedEdges.map((edge) =>
      this.toSnapshotEdge(edge),
    );

    const nodeIds = includedNodes.map((n) => n.id);

    return {
      nodes: snapshotNodes,
      edges: snapshotEdges,
      nodeIds,
    };
  }

  private toSnapshotNode(
    node: BaseNode,
    privacyRules: SnapshotPrivacyRules,
  ): SnapshotNode {
    const properties = this.extractNodeProperties(node, privacyRules);

    return {
      nodeId: node.id,
      nodeType: node.nodeType,
      createdAt: node.provenance.createdAt,
      updatedAt: node.provenance.updatedAt,
      tags:
        privacyRules.allowStrategyTags &&
        "tags" in node &&
        Array.isArray((node as unknown as Record<string, unknown>).tags)
          ? ((node as unknown as Record<string, unknown>)
              .tags as readonly string[])
          : undefined,
      properties,
    };
  }

  private extractNodeProperties(
    node: BaseNode,
    privacyRules: SnapshotPrivacyRules,
  ): Readonly<Record<string, unknown>> {
    // Extract non-sensitive properties based on node type
    // This is a simplified implementation - production would be more nuanced
    const props: Record<string, unknown> = {};

    if ("title" in node && typeof node.title === "string") {
      const title = node.title;
      if (
        privacyRules.maxTextLength > 0 &&
        title.length > privacyRules.maxTextLength
      ) {
        props.title = title.slice(0, privacyRules.maxTextLength) + "...";
      } else {
        props.title = title;
      }
    }
    if ("difficulty" in node) {
      props.difficulty = node.difficulty;
    }

    return props;
  }

  private toSnapshotEdge(edge: BaseEdge): SnapshotEdge {
    return {
      edgeId: edge.id,
      edgeType: edge.edgeType,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      weight: edge.weight,
      confidence: 1.0 as Confidence, // Default confidence
      isInferred: false, // Default not inferred
      properties: {},
    };
  }

  // ===========================================================================
  // PRIVATE: Mastery Data Building
  // ===========================================================================

  private buildMasteryData(
    userId: UserId,
    nodeIds: readonly NodeId[],
    signalScope: MasterySignalScope,
    privacyRules: SnapshotPrivacyRules,
    budget: SnapshotBudget,
  ): {
    states: readonly SnapshotMasteryState[];
  } {
    const allStates = this.masteryReader.getMasteryStatesForUser(userId);
    const relevantStates: MasteryState[] = [];

    for (const nodeId of nodeIds) {
      const state = allStates.get(nodeId);
      if (state) {
        relevantStates.push(state);
      }
    }

    const includedStates =
      relevantStates.length > budget.maxMasteryStates
        ? relevantStates.slice(0, budget.maxMasteryStates)
        : relevantStates;

    // Filter states according to signal scope
    const filteredStates = includedStates.map((state) =>
      this.filterMasteryState(state, signalScope, privacyRules),
    );

    return {
      states: filteredStates,
    };
  }

  private filterMasteryState(
    state: MasteryState,
    scope: MasterySignalScope,
    privacy: SnapshotPrivacyRules,
  ): SnapshotMasteryState {
    // Convert to snapshot format with filtering
    const filtered: SnapshotMasteryState = {
      nodeId: state.nodeId,
      granularity: state.granularity,
      stateVersion: state.provenance.schemaVersion,
      computedAt: state.computedAt,
      memory: scope.includeMemory
        ? {
            stability: state.memory.stability,
            difficulty: state.memory.difficulty,
            retrievability: state.memory.retrievability,
            halfLife: state.memory.halfLife,
            learningState: state.memory.learningState,
            dueDate: state.memory.dueDate,
            lastReview: state.memory.lastReview,
            reps: state.memory.reps,
            lapses: state.memory.lapses,
          }
        : undefined,
      evidence: scope.includeEvidence
        ? {
            totalReviews: state.evidence.totalReviews,
            reviewsByOutcome: state.evidence.reviewsByOutcome,
            avgResponseTime: state.evidence.avgResponseTime,
          }
        : undefined,
      metacognition:
        scope.includeMetacognition && state.metacognition
          ? {
              calibration: privacy.allowConfidencePredictions
                ? state.metacognition.calibration
                : undefined,
            }
          : undefined,
      forgetting:
        scope.includeForgetting && state.forgetting
          ? {
              interferenceIndex: state.forgetting.interferenceIndex,
            }
          : undefined,
      generalization:
        scope.includeGeneralization && state.generalization
          ? {
              transferScore: state.generalization.transferScore,
              coverage: state.generalization.coverage,
            }
          : undefined,
      cognitiveLoad:
        scope.includeCognitiveLoad && state.cognitiveLoad
          ? state.cognitiveLoad
          : undefined,
      affect: scope.includeAffect && state.affect ? state.affect : undefined,
      trust: scope.includeTrust && state.trust ? state.trust : undefined,
    };

    return filtered;
  }

  // ===========================================================================
  // PRIVATE: Context Data Building
  // ===========================================================================

  private buildContextData(
    requestContext: SnapshotRequestContext | undefined,
    contextScope: ContextSignalScope,
  ): SnapshotContext {
    if (!requestContext) {
      return {};
    }

    const context: SnapshotContext = {};

    if (contextScope.includeMode && requestContext.mode) {
      (context as Record<string, unknown>).mode = requestContext.mode;
    }
    if (contextScope.includeTimeBudget && requestContext.timeBudget) {
      (context as Record<string, unknown>).timeBudget =
        requestContext.timeBudget;
    }
    if (contextScope.includeFatigueMotivation) {
      if (requestContext.fatigue !== undefined) {
        (context as Record<string, unknown>).fatigue = requestContext.fatigue;
      }
      if (requestContext.motivation !== undefined) {
        (context as Record<string, unknown>).motivation =
          requestContext.motivation;
      }
    }
    if (contextScope.includeDevice && requestContext.device) {
      (context as Record<string, unknown>).device = requestContext.device;
    }
    if (contextScope.includeGoals && requestContext.activeGoalIds) {
      (context as Record<string, unknown>).activeGoalIds = [
        ...requestContext.activeGoalIds,
      ];
    }

    return context;
  }

  // ===========================================================================
  // PRIVATE: Utility Methods
  // ===========================================================================

  private computeOldestTimestamp(
    states: readonly SnapshotMasteryState[],
  ): Timestamp {
    if (states.length === 0) {
      return now();
    }

    let oldest = states[0].computedAt;
    for (const state of states) {
      if (state.computedAt < oldest) {
        oldest = state.computedAt;
      }
    }
    return oldest;
  }

  private countByType<T extends { [K in P]: string }, P extends keyof T>(
    items: readonly T[],
    property: P,
  ): Readonly<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const type = item[property];
      counts[type] = (counts[type] ?? 0) + 1;
    }
    return counts;
  }

  private estimatePayloadSize(
    nodes: readonly SnapshotNode[],
    edges: readonly SnapshotEdge[],
    states: readonly SnapshotMasteryState[],
  ): number {
    // Rough estimation: ~500 bytes per node, ~200 per edge, ~300 per state
    const NODE_SIZE = 500;
    const EDGE_SIZE = 200;
    const STATE_SIZE = 300;

    return (
      nodes.length * NODE_SIZE +
      edges.length * EDGE_SIZE +
      states.length * STATE_SIZE
    );
  }
}
