// =============================================================================
// MASTERY MATERIALIZER - MasteryState Computation Service
// =============================================================================
// Materializes MasteryState records from:
// - FeatureStore (attempt/session/day/rolling aggregates)
// - GraphStore (prerequisites, confusions, strategy links)
// - Session context (pacing, interruptions)
//
// Design principles:
// - Deterministic: same inputs → same outputs
// - Replayable: can recompute from scratch
// - Auditable: every update traceable to rules and source data
// - Incremental: only process new data since last watermark
//
// NO UI. NO AI. NO SCHEDULING.
// =============================================================================

import type {
  EntityId,
  NodeId,
  Timestamp,
  RevisionNumber,
  NormalizedValue,
  BipolarScore,
  DeviceId,
} from "../types/lkgc/foundation";
import type {
  MasteryState,
  MasteryStateDelta,
  MasteryGranularity,
  MemoryState,
  EvidenceAggregate,
  MetacognitionState,
  ForgettingState,
  GeneralizationState,
  CognitiveLoadState,
  AffectState,
  TrustState,
  MasteryUpdateReason,
  ReviewOutcomeCounts,
} from "../types/lkgc/mastery";
import type { AttemptFeatures } from "../types/lkgc/aggregation";
import type { FeatureStore } from "./feature-store";
import type { GraphStore } from "./graph-store";
import type {
  MasteryStateStore,
  UpsertMasteryStateInput,
  MaterializationMetadata,
  MaterializationWatermark,
} from "./mastery-state-store";
import type {
  RuleRegistry,
  RuleContext,
  RuleOutput,
  RuleFeatureInputs,
  RuleGraphContext,
  RuleSessionContext,
  FeatureAggregates,
} from "./rule-registry";
import {
  generateEntityId,
  now as nowFn,
  revision,
  normalized,
  confidence,
  duration,
} from "./id-generator";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a BipolarScore (value in [-1, 1])
 */
function bipolar(value: number): BipolarScore {
  return Math.max(-1, Math.min(1, value)) as BipolarScore;
}

// =============================================================================
// MATERIALIZATION CONFIGURATION
// =============================================================================

/**
 * Configuration for the MasteryMaterializer
 */
export interface MasteryMaterializerConfig {
  /** Model version string for audit (e.g., "heuristic-v0") */
  readonly modelVersion: string;

  /** Maximum number of recent attempts to consider */
  readonly maxRecentAttempts: number;

  /** Default device ID (for provenance) */
  readonly defaultDeviceId: DeviceId;

  /** App version (for provenance) */
  readonly appVersion: string;

  /** Schema version */
  readonly schemaVersion: number;

  /** Whether to store deltas (increases storage but improves audit) */
  readonly storeDeltas: boolean;

  /** Batch size for processing */
  readonly batchSize: number;
}

/**
 * Default configuration
 */
export const DEFAULT_MATERIALIZER_CONFIG: MasteryMaterializerConfig = {
  modelVersion: "heuristic-v0",
  maxRecentAttempts: 20,
  defaultDeviceId: "dev_default" as DeviceId,
  appVersion: "1.0.0",
  schemaVersion: 1,
  storeDeltas: true,
  batchSize: 100,
};

// =============================================================================
// MATERIALIZATION RESULT
// =============================================================================

/**
 * Result of materializing a single node's mastery state
 */
export interface MaterializationResult {
  /** Node ID that was materialized */
  readonly nodeId: NodeId;

  /** Granularity */
  readonly granularity: MasteryGranularity;

  /** Whether the operation succeeded */
  readonly success: boolean;

  /** The resulting state (if successful) */
  readonly state?: MasteryState;

  /** New revision (if successful) */
  readonly rev?: RevisionNumber;

  /** Error message (if failed) */
  readonly error?: string;

  /** Rules that were applied */
  readonly appliedRules: readonly string[];

  /** Duration of computation (ms) */
  readonly duration: number;

  /** Whether this was a full recomputation or incremental */
  readonly isFullRecomputation: boolean;
}

/**
 * Result of a batch materialization
 */
export interface BatchMaterializationResult {
  /** Individual results */
  readonly results: readonly MaterializationResult[];

  /** Number of successful materializations */
  readonly successCount: number;

  /** Number of failed materializations */
  readonly failureCount: number;

  /** Total duration (ms) */
  readonly totalDuration: number;

  /** New watermark after processing */
  readonly newWatermark: MaterializationWatermark;
}

// =============================================================================
// MATERIALIZATION TRIGGER
// =============================================================================

/**
 * What triggered the materialization
 */
export interface MaterializationTrigger {
  /** Reason for materialization */
  readonly reason: MasteryUpdateReason;

  /** Triggering event ID (if event-driven) */
  readonly eventId?: EntityId;

  /** Triggering session ID (if session-driven) */
  readonly sessionId?: EntityId;

  /** Whether this is a full recomputation */
  readonly isFullRecomputation: boolean;
}

// =============================================================================
// MASTERY MATERIALIZER INTERFACE
// =============================================================================

/**
 * MasteryMaterializer - Service that computes MasteryState from features + graph
 */
export interface MasteryMaterializer {
  // ---------------------------------------------------------------------------
  // SINGLE NODE MATERIALIZATION
  // ---------------------------------------------------------------------------

  /**
   * Materialize mastery state for a single node
   * This is the core operation - gathers context and applies rules
   */
  materialize(
    nodeId: NodeId,
    granularity: MasteryGranularity,
    trigger: MaterializationTrigger,
  ): Promise<MaterializationResult>;

  /**
   * Materialize with explicit feature/graph inputs (for testing)
   */
  materializeWithInputs(
    nodeId: NodeId,
    granularity: MasteryGranularity,
    features: RuleFeatureInputs,
    graphContext: RuleGraphContext,
    sessionContext: RuleSessionContext | null,
    trigger: MaterializationTrigger,
  ): Promise<MaterializationResult>;

  // ---------------------------------------------------------------------------
  // BATCH MATERIALIZATION
  // ---------------------------------------------------------------------------

  /**
   * Materialize multiple nodes in batch
   */
  materializeBatch(
    nodes: readonly { nodeId: NodeId; granularity: MasteryGranularity }[],
    trigger: MaterializationTrigger,
  ): Promise<BatchMaterializationResult>;

  /**
   * Materialize all nodes of a specific granularity
   */
  materializeByGranularity(
    granularity: MasteryGranularity,
    trigger: MaterializationTrigger,
  ): Promise<BatchMaterializationResult>;

  // ---------------------------------------------------------------------------
  // INCREMENTAL PROCESSING
  // ---------------------------------------------------------------------------

  /**
   * Process incremental updates since last watermark
   * Only processes nodes that have new features
   */
  processIncremental(): Promise<BatchMaterializationResult>;

  /**
   * Recompute all mastery states from scratch
   * WARNING: This is expensive and should be used sparingly
   */
  recomputeAll(): Promise<BatchMaterializationResult>;

  // ---------------------------------------------------------------------------
  // CONTEXT BUILDING
  // ---------------------------------------------------------------------------

  /**
   * Build feature inputs for a node
   */
  buildFeatureInputs(
    nodeId: NodeId,
    granularity: MasteryGranularity,
  ): Promise<RuleFeatureInputs>;

  /**
   * Build graph context for a node
   */
  buildGraphContext(
    nodeId: NodeId,
    granularity: MasteryGranularity,
  ): Promise<RuleGraphContext>;

  // ---------------------------------------------------------------------------
  // STATISTICS
  // ---------------------------------------------------------------------------

  /**
   * Get materialization statistics
   */
  getStatistics(): Promise<MaterializationStatistics>;
}

/**
 * Materialization statistics
 */
export interface MaterializationStatistics {
  /** Total materializations performed */
  readonly totalMaterializations: number;

  /** Success rate */
  readonly successRate: NormalizedValue;

  /** Average duration (ms) */
  readonly avgDuration: number;

  /** Last materialization timestamp */
  readonly lastMaterializedAt: Timestamp | null;

  /** Current watermark */
  readonly currentWatermark: MaterializationWatermark;

  /** Rules applied (count by rule ID) */
  readonly ruleApplications: Readonly<Record<string, number>>;
}

// =============================================================================
// DEFAULT IMPLEMENTATION
// =============================================================================

/**
 * Default implementation of MasteryMaterializer
 */
export class DefaultMasteryMaterializer implements MasteryMaterializer {
  private readonly featureStore: FeatureStore;
  private readonly graphStore: GraphStore;
  private readonly masteryStore: MasteryStateStore;
  private readonly ruleRegistry: RuleRegistry;
  private readonly config: MasteryMaterializerConfig;

  // Statistics tracking
  private totalMaterializations = 0;
  private successfulMaterializations = 0;
  private totalDuration = 0;
  private ruleApplicationCounts: Record<string, number> = {};

  constructor(
    featureStore: FeatureStore,
    graphStore: GraphStore,
    masteryStore: MasteryStateStore,
    ruleRegistry: RuleRegistry,
    config: Partial<MasteryMaterializerConfig> = {},
  ) {
    this.featureStore = featureStore;
    this.graphStore = graphStore;
    this.masteryStore = masteryStore;
    this.ruleRegistry = ruleRegistry;
    this.config = { ...DEFAULT_MATERIALIZER_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // SINGLE NODE MATERIALIZATION
  // ---------------------------------------------------------------------------

  async materialize(
    nodeId: NodeId,
    granularity: MasteryGranularity,
    trigger: MaterializationTrigger,
  ): Promise<MaterializationResult> {
    const startTime = Date.now();

    try {
      // Build context
      const features = await this.buildFeatureInputs(nodeId, granularity);
      const graphContext = await this.buildGraphContext(nodeId, granularity);
      const sessionContext = null; // TODO: Get from active session if available

      return await this.materializeWithInputs(
        nodeId,
        granularity,
        features,
        graphContext,
        sessionContext,
        trigger,
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      this.totalMaterializations++;
      this.totalDuration += duration;

      return {
        nodeId,
        granularity,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        appliedRules: [],
        duration,
        isFullRecomputation: trigger.isFullRecomputation,
      };
    }
  }

  async materializeWithInputs(
    nodeId: NodeId,
    granularity: MasteryGranularity,
    features: RuleFeatureInputs,
    graphContext: RuleGraphContext,
    sessionContext: RuleSessionContext | null,
    trigger: MaterializationTrigger,
  ): Promise<MaterializationResult> {
    const startTime = Date.now();
    const now = nowFn();

    try {
      // Get previous state
      const previousRecord = await this.masteryStore.get(nodeId, granularity);
      const previousState = previousRecord?.state ?? null;

      // Build rule context
      const context: RuleContext = {
        nodeId,
        granularity,
        now,
        previousState,
        features,
        graphContext,
        sessionContext,
      };

      // Get applicable rules in priority order
      const rules = this.ruleRegistry
        .getActiveRules()
        .filter((r) =>
          r.metadata.applicableGranularities.includes(granularity),
        );

      // Apply rules and collect outputs
      const outputs: RuleOutput[] = [];
      const appliedRuleIds: string[] = [];

      for (const rule of rules) {
        if (rule.applies(context)) {
          const output = rule.compute(context);
          outputs.push(output);
          if (!output.skipped) {
            appliedRuleIds.push(output.ruleId);
            this.ruleApplicationCounts[output.ruleId] =
              (this.ruleApplicationCounts[output.ruleId] ?? 0) + 1;
          }
        }
      }

      // Merge outputs into new state
      const newState = this.mergeOutputsIntoState(
        previousState,
        outputs,
        nodeId,
        granularity,
        now,
      );

      // Build delta for audit
      const delta = this.config.storeDeltas
        ? this.buildDelta(previousState, newState, nodeId, trigger.reason, now)
        : undefined;

      // Get rule versions
      const ruleVersions: Record<string, number> = {};
      for (const ruleId of appliedRuleIds) {
        const version = this.ruleRegistry.getRuleVersion(ruleId);
        if (version !== null) {
          ruleVersions[ruleId] = version;
        }
      }

      // Get source feature IDs (simplified - just use recent attempt IDs)
      const sourceFeatureIds: EntityId[] = features.recentAttempts.map(
        (a) => a.id as EntityId,
      );

      // Build materialization metadata
      const watermark = await this.masteryStore.getWatermark();
      const materialization: MaterializationMetadata = {
        lastFeatureRevision: watermark.featureRevision,
        lastGraphRevision: watermark.graphRevision,
        appliedRuleIds,
        ruleVersions,
        sourceFeatureIds,
        isFullRecomputation: trigger.isFullRecomputation,
        materializationDuration: Date.now() - startTime,
        modelVersion: this.config.modelVersion,
      };

      // Upsert the state
      const input: UpsertMasteryStateInput = {
        nodeId,
        granularity,
        state: newState,
        expectedRev: previousRecord?.rev,
        materialization,
        delta,
      };

      const result = await this.masteryStore.upsert(input);

      const duration = Date.now() - startTime;
      this.totalMaterializations++;
      this.totalDuration += duration;

      if (result.success) {
        this.successfulMaterializations++;
        return {
          nodeId,
          granularity,
          success: true,
          state: newState,
          rev: result.rev,
          appliedRules: appliedRuleIds,
          duration,
          isFullRecomputation: trigger.isFullRecomputation,
        };
      } else {
        return {
          nodeId,
          granularity,
          success: false,
          error: result.error,
          appliedRules: appliedRuleIds,
          duration,
          isFullRecomputation: trigger.isFullRecomputation,
        };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      this.totalMaterializations++;
      this.totalDuration += duration;

      return {
        nodeId,
        granularity,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        appliedRules: [],
        duration,
        isFullRecomputation: trigger.isFullRecomputation,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // BATCH MATERIALIZATION
  // ---------------------------------------------------------------------------

  async materializeBatch(
    nodes: readonly { nodeId: NodeId; granularity: MasteryGranularity }[],
    trigger: MaterializationTrigger,
  ): Promise<BatchMaterializationResult> {
    const startTime = Date.now();
    const results: MaterializationResult[] = [];

    // Process in batches to avoid overwhelming resources
    for (let i = 0; i < nodes.length; i += this.config.batchSize) {
      const batch = nodes.slice(i, i + this.config.batchSize);

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map((n) => this.materialize(n.nodeId, n.granularity, trigger)),
      );
      results.push(...batchResults);
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;
    const totalDuration = Date.now() - startTime;

    // Update watermark
    const watermark = await this.masteryStore.getWatermark();
    const newWatermark: MaterializationWatermark = {
      ...watermark,
      materializedAt: nowFn(),
      statesUpdated: successCount,
    };
    await this.masteryStore.setWatermark(newWatermark);

    return {
      results,
      successCount,
      failureCount,
      totalDuration,
      newWatermark,
    };
  }

  async materializeByGranularity(
    granularity: MasteryGranularity,
    trigger: MaterializationTrigger,
  ): Promise<BatchMaterializationResult> {
    // Get all nodes of this granularity from the graph store
    // For cards: nodeType === "card"
    // For concepts: nodeType === "concept"
    // For skills: nodeType === "skill" or "procedure"
    const nodeTypes = this.getNodeTypesForGranularity(granularity);

    const nodes: { nodeId: NodeId; granularity: MasteryGranularity }[] = [];
    for (const nodeType of nodeTypes) {
      const graphNodes = await this.graphStore.getNodesByType(nodeType);
      for (const node of graphNodes) {
        nodes.push({ nodeId: node.id, granularity });
      }
    }

    return this.materializeBatch(nodes, trigger);
  }

  // ---------------------------------------------------------------------------
  // INCREMENTAL PROCESSING
  // ---------------------------------------------------------------------------

  async processIncremental(): Promise<BatchMaterializationResult> {
    const startTime = Date.now();
    const watermark = await this.masteryStore.getWatermark();

    // Get features since last watermark
    // This is simplified - in practice you'd query by revision or timestamp
    const _latestFeatures = await this.featureStore.getLatestFeatures();

    // For now, just return empty if nothing to process
    // Real implementation would track which nodes have new features
    const newWatermark: MaterializationWatermark = {
      ...watermark,
      materializedAt: nowFn(),
      statesUpdated: 0,
    };

    return {
      results: [],
      successCount: 0,
      failureCount: 0,
      totalDuration: Date.now() - startTime,
      newWatermark,
    };
  }

  async recomputeAll(): Promise<BatchMaterializationResult> {
    const trigger: MaterializationTrigger = {
      reason: "model_recalculation",
      isFullRecomputation: true,
    };

    // Materialize all granularities
    const cardResult = await this.materializeByGranularity("card", trigger);
    const conceptResult = await this.materializeByGranularity(
      "concept",
      trigger,
    );
    const skillResult = await this.materializeByGranularity("skill", trigger);

    // Combine results
    const results = [
      ...cardResult.results,
      ...conceptResult.results,
      ...skillResult.results,
    ];
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;
    const totalDuration =
      cardResult.totalDuration +
      conceptResult.totalDuration +
      skillResult.totalDuration;

    return {
      results,
      successCount,
      failureCount,
      totalDuration,
      newWatermark: skillResult.newWatermark, // Use last watermark
    };
  }

  // ---------------------------------------------------------------------------
  // CONTEXT BUILDING
  // ---------------------------------------------------------------------------

  async buildFeatureInputs(
    nodeId: NodeId,
    _granularity: MasteryGranularity,
  ): Promise<RuleFeatureInputs> {
    // Get recent attempt features for this node
    const nodeFeatureHistory = await this.featureStore.getNodeFeatureHistory(
      nodeId,
      { limit: this.config.maxRecentAttempts },
    );

    const recentAttempts = nodeFeatureHistory.features.map((r) => r.feature);
    const latestAttempt = recentAttempts.length > 0 ? recentAttempts[0] : null;

    // Get latest session features
    const latestFeatures = await this.featureStore.getLatestFeatures();
    const latestSession = latestFeatures.latestSession?.feature ?? null;

    // Compute aggregates
    const aggregates = this.computeAggregates(recentAttempts);

    return {
      latestAttempt,
      recentAttempts,
      latestSession,
      aggregates,
    };
  }

  async buildGraphContext(
    nodeId: NodeId,
    _granularity: MasteryGranularity,
  ): Promise<RuleGraphContext> {
    // Get prerequisites
    const prereqNodes = await this.graphStore.getPrerequisites(nodeId);
    const prerequisites = prereqNodes.map((n) => n.id);

    // Get prerequisite mastery levels
    const prerequisiteMasteryLevels: {
      nodeId: NodeId;
      retrievability: NormalizedValue;
    }[] = [];
    for (const prereq of prereqNodes) {
      const masteryRecord = await this.masteryStore.get(prereq.id, "card");
      prerequisiteMasteryLevels.push({
        nodeId: prereq.id,
        retrievability:
          masteryRecord?.state.memory.retrievability ?? normalized(0),
      });
    }

    // Get confusions
    const confusionNodes = await this.graphStore.getConfusions(nodeId);
    const confusions = confusionNodes.map((n) => n.id);

    // Placeholder confusion counts (would come from actual lapse analysis)
    const confusionCounts: Record<string, number> = {};
    for (const c of confusions) {
      confusionCounts[c] = 1; // Placeholder
    }

    // Get strategies
    const strategyNodes = await this.graphStore.getStrategiesForNode(nodeId);
    const strategies = strategyNodes.map((n) => n.id);

    // Get parts (for concepts/skills)
    const parts: NodeId[] = [];
    const partMasteryLevels: {
      nodeId: NodeId;
      retrievability: NormalizedValue;
    }[] = [];

    // Get outgoing "part_of" edges would give us parts
    const outgoingEdges = await this.graphStore.getOutgoingEdges(nodeId, {
      edgeTypes: ["part_of"],
    });
    for (const edge of outgoingEdges) {
      parts.push(edge.targetId);
      const masteryRecord = await this.masteryStore.get(edge.targetId, "card");
      partMasteryLevels.push({
        nodeId: edge.targetId,
        retrievability:
          masteryRecord?.state.memory.retrievability ?? normalized(0),
      });
    }

    // Get dependents
    const dependentNodes = await this.graphStore.getDependents(nodeId);
    const dependents = dependentNodes.map((n) => n.id);

    return {
      prerequisites,
      prerequisiteMasteryLevels,
      confusions,
      confusionCounts,
      strategies,
      parts,
      partMasteryLevels,
      dependents,
    };
  }

  // ---------------------------------------------------------------------------
  // STATISTICS
  // ---------------------------------------------------------------------------

  async getStatistics(): Promise<MaterializationStatistics> {
    const watermark = await this.masteryStore.getWatermark();

    return {
      totalMaterializations: this.totalMaterializations,
      successRate:
        this.totalMaterializations > 0
          ? normalized(
              this.successfulMaterializations / this.totalMaterializations,
            )
          : normalized(0),
      avgDuration:
        this.totalMaterializations > 0
          ? this.totalDuration / this.totalMaterializations
          : 0,
      lastMaterializedAt: watermark.materializedAt || null,
      currentWatermark: watermark,
      ruleApplications: { ...this.ruleApplicationCounts },
    };
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  private computeAggregates(
    attempts: readonly AttemptFeatures[],
  ): FeatureAggregates {
    if (attempts.length === 0) {
      return {
        totalReviews: 0,
        successRate: normalized(0),
        avgResponseTime: duration(0),
        responseTimeVariance: 0,
        lapses: 0,
        totalHints: 0,
        hintDependency: normalized(0),
        answerChangeRate: normalized(0),
        outcomeDistribution: { again: 0, hard: 0, good: 0, easy: 0 },
        daysSinceLastReview: Infinity,
        elapsedDays: 0,
        contextCount: 0,
      };
    }

    const totalReviews = attempts.length;
    const successes = attempts.filter((a) => a.performance.success).length;
    const successRate = normalized(successes / totalReviews);

    // Response time stats
    const responseTimes = attempts.map(
      (a) => a.performance.responseTime as number,
    );
    const avgResponseTime = duration(
      responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length,
    );
    const variance =
      responseTimes.reduce(
        (sum, t) => sum + (t - (avgResponseTime as number)) ** 2,
        0,
      ) / responseTimes.length;

    // Hints
    const totalHints = attempts.reduce(
      (sum, a) => sum + a.performance.hintCount,
      0,
    );
    const hintDependency = normalized(
      attempts.filter((a) => a.performance.hintCount > 0).length / totalReviews,
    );

    // Answer changes
    const _answerChanges = attempts.reduce(
      (sum, a) => sum + a.performance.changeCount,
      0,
    );
    const answerChangeRate = normalized(
      attempts.filter((a) => a.performance.changeCount > 0).length /
        totalReviews,
    );

    // Outcome distribution (simplified - would need actual outcome data)
    const outcomeDistribution: ReviewOutcomeCounts = {
      again: attempts.filter((a) => !a.performance.success).length,
      hard: 0,
      good: attempts.filter((a) => a.performance.success).length,
      easy: 0,
    };

    // Days since last review
    const latestAttempt = attempts[0];
    const daysSinceLastReview = latestAttempt
      ? (Date.now() - (latestAttempt.periodEnd as number)) /
        (1000 * 60 * 60 * 24)
      : Infinity;

    // Elapsed days (from first to now)
    const firstAttempt = attempts[attempts.length - 1];
    const elapsedDays = firstAttempt
      ? (Date.now() - (firstAttempt.periodStart as number)) /
        (1000 * 60 * 60 * 24)
      : 0;

    // Context count (unique sessions)
    const uniqueSessions = new Set(attempts.map((a) => a.sessionId));
    const contextCount = uniqueSessions.size;

    // Lapses (would need actual lapse tracking)
    const lapses = 0; // Placeholder

    return {
      totalReviews,
      successRate,
      avgResponseTime,
      responseTimeVariance: variance,
      lapses,
      totalHints,
      hintDependency,
      answerChangeRate,
      outcomeDistribution,
      daysSinceLastReview,
      elapsedDays,
      contextCount,
    };
  }

  private mergeOutputsIntoState(
    previousState: MasteryState | null,
    outputs: readonly RuleOutput[],
    nodeId: NodeId,
    granularity: MasteryGranularity,
    now: Timestamp,
  ): MasteryState {
    // Start with default state or previous state
    const baseState =
      previousState ?? this.createDefaultState(nodeId, granularity, now);

    // Merge each output's updates
    let memory = { ...baseState.memory };
    let evidence = { ...baseState.evidence };
    let metacognition = { ...baseState.metacognition };
    let forgetting = { ...baseState.forgetting };
    let generalization = { ...baseState.generalization };
    let cognitiveLoad = { ...baseState.cognitiveLoad };
    let affect = { ...baseState.affect };
    let trust = { ...baseState.trust };

    for (const output of outputs) {
      if (output.skipped) continue;

      if (output.updates.memory) {
        memory = { ...memory, ...output.updates.memory };
      }
      if (output.updates.evidence) {
        evidence = { ...evidence, ...output.updates.evidence };
      }
      if (output.updates.metacognition) {
        metacognition = this.deepMerge(
          metacognition,
          output.updates.metacognition,
        ) as MetacognitionState;
      }
      if (output.updates.forgetting) {
        forgetting = { ...forgetting, ...output.updates.forgetting };
      }
      if (output.updates.generalization) {
        generalization = {
          ...generalization,
          ...output.updates.generalization,
        };
      }
      if (output.updates.cognitiveLoad) {
        cognitiveLoad = { ...cognitiveLoad, ...output.updates.cognitiveLoad };
      }
      if (output.updates.affect) {
        affect = this.deepMerge(affect, output.updates.affect) as AffectState;
      }
      if (output.updates.trust) {
        trust = { ...trust, ...output.updates.trust };
      }
    }

    return {
      ...baseState,
      memory: memory as MemoryState,
      evidence: evidence as EvidenceAggregate,
      metacognition: metacognition as MetacognitionState,
      forgetting: forgetting as ForgettingState,
      generalization: generalization as GeneralizationState,
      cognitiveLoad: cognitiveLoad as CognitiveLoadState,
      affect: affect as AffectState,
      trust: trust as TrustState,
      computedAt: now,
      stateVersion: (previousState?.stateVersion ?? 0) + 1,
    };
  }

  private deepMerge(target: object, source: object): object {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      const sourceValue = (source as Record<string, unknown>)[key];
      const targetValue = (result as Record<string, unknown>)[key];
      if (
        sourceValue &&
        typeof sourceValue === "object" &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === "object" &&
        !Array.isArray(targetValue)
      ) {
        (result as Record<string, unknown>)[key] = this.deepMerge(
          targetValue as object,
          sourceValue as object,
        );
      } else {
        (result as Record<string, unknown>)[key] = sourceValue;
      }
    }
    return result;
  }

  private createDefaultState(
    nodeId: NodeId,
    granularity: MasteryGranularity,
    now: Timestamp,
  ): MasteryState {
    const defaultNormalized = normalized(0);
    const defaultConfidence = confidence(0);
    const defaultDuration = duration(0);

    return {
      id: generateEntityId(),
      nodeId,
      granularity,
      provenance: {
        source: "system",
        sourceId: "mastery-materializer",
        confidence: confidence(1),
        createdAt: now,
        updatedAt: now,
        deviceId: this.config.defaultDeviceId,
        appVersion: this.config.appVersion,
        schemaVersion: this.config.schemaVersion,
      },
      privacy: {
        privacyLevel: "private",
        telemetryConsent: {
          events: true,
          text: false,
          audio: false,
          performance: true,
          errors: true,
          usagePatterns: true,
        },
      },
      sync: {
        rev: revision(1),
        mergeStrategy: "lww",
        pendingSync: true,
      },
      memory: {
        stability: 1,
        difficulty: normalized(0.5),
        retrievability: normalized(1),
        halfLife: 1,
        learningState: "new",
        reps: 0,
        lapses: 0,
        streak: 0,
        elapsedDays: 0,
        scheduledDays: 1,
        dueDate: now,
        targetRetention: normalized(0.9),
      },
      evidence: {
        totalReviews: 0,
        reviewsByOutcome: { again: 0, hard: 0, good: 0, easy: 0 },
        avgResponseTime: defaultDuration,
        responseTimeTrend: bipolar(0),
        recentAccuracy: defaultNormalized,
        accuracyTrend: bipolar(0),
        totalStudyTime: defaultDuration,
        daysSinceLastReview: 0,
        hintUsageCount: 0,
        hintDependencyRatio: defaultNormalized,
        answerChangeCount: 0,
        contextCount: 0,
        performanceByTimeOfDay: {
          morning: defaultNormalized,
          afternoon: defaultNormalized,
          evening: defaultNormalized,
          night: defaultNormalized,
        },
      },
      metacognition: {
        calibration: {
          brierScore: defaultNormalized,
          ece: defaultNormalized,
          bias: bipolar(0),
          resolution: defaultNormalized,
          metacognitiveSensitivity: defaultNormalized,
          dunningKrugerIndicator: defaultNormalized,
          confidenceAccuracyCorrelation: bipolar(0),
        },
        strategyUsage: {
          strategyDiversity: defaultNormalized,
          strategyAdherence: defaultNormalized,
          strategyEfficacyUplift: bipolar(0),
          topStrategies: [],
          selectionAppropriatenessScore: defaultNormalized,
        },
        selfRegulation: {
          sessionConsistency: defaultNormalized,
          fatigueIndex: defaultNormalized,
          flowProxy: defaultNormalized,
          frictionScore: defaultNormalized,
          goalAlignmentScore: defaultNormalized,
          breakTimingScore: defaultNormalized,
        },
        reflection: {
          completionRate: defaultNormalized,
          averageQuality: defaultNormalized,
          planFollowThroughScore: defaultNormalized,
          insightRate: defaultNormalized,
          daysSinceLastReflection: 0,
        },
      },
      forgetting: {
        interferenceIndex: defaultNormalized,
        contextVariability: defaultNormalized,
        forgettingCurveFitError: defaultNormalized,
        proactiveInterference: defaultNormalized,
        retroactiveInterference: defaultNormalized,
        consolidationEstimate: defaultNormalized,
        confusionSet: [],
      },
      generalization: {
        transferScore: defaultNormalized,
        coverage: defaultNormalized,
        crossContextRobustness: defaultNormalized,
        nearTransfer: defaultNormalized,
        farTransfer: defaultNormalized,
        abstractionLevel: defaultNormalized,
        analogicalReasoning: defaultNormalized,
      },
      cognitiveLoad: {
        intrinsicLoad: defaultNormalized,
        extraneousLoad: defaultNormalized,
        germaneLoad: defaultNormalized,
        totalLoad: defaultNormalized,
        remainingCapacity: normalized(1),
        optimalChallengePoint: normalized(0.5),
        difficultyAlignment: bipolar(0),
      },
      affect: {
        frustration: {
          inferred: defaultNormalized,
          combined: defaultNormalized,
          confidence: defaultConfidence,
          lastUpdated: now,
        },
        flow: {
          inferred: defaultNormalized,
          combined: defaultNormalized,
          confidence: defaultConfidence,
          lastUpdated: now,
        },
        boredom: {
          inferred: defaultNormalized,
          combined: defaultNormalized,
          confidence: defaultConfidence,
          lastUpdated: now,
        },
        anxiety: {
          inferred: defaultNormalized,
          combined: defaultNormalized,
          confidence: defaultConfidence,
          lastUpdated: now,
        },
        interest: {
          inferred: defaultNormalized,
          combined: defaultNormalized,
          confidence: defaultConfidence,
          lastUpdated: now,
        },
        selfEfficacy: defaultNormalized,
        motivationType: "mixed",
        streakHealth: defaultNormalized,
      },
      trust: {
        dataQualityScore: defaultNormalized,
        modelDisagreement: defaultNormalized,
        predictionConfidence: defaultConfidence,
        evidenceRecency: defaultNormalized,
        evidenceSufficiency: defaultNormalized,
        outlierProportion: defaultNormalized,
        humanOverrideCount: 0,
        isStale: true,
        reviewsUntilConfident: 5,
      },
      computedAt: now,
      stateVersion: 0,
    };
  }

  private buildDelta(
    previousState: MasteryState | null,
    newState: MasteryState,
    nodeId: NodeId,
    reason: MasteryUpdateReason,
    now: Timestamp,
  ): MasteryStateDelta {
    // For simplicity, we don't compute granular changes here
    // A real implementation would diff the states
    return {
      nodeId,
      timestamp: now,
      previousStateVersion: previousState?.stateVersion ?? 0,
      newStateVersion: newState.stateVersion,
      changes: {
        memory: {
          stability: newState.memory.stability,
          difficulty: newState.memory.difficulty,
          retrievability: newState.memory.retrievability,
        },
      },
      reason,
    };
  }

  /**
   * Map mastery granularity to corresponding graph node types.
   *
   * Note: MasteryGranularity values like "skill", "topic", "domain" don't have
   * direct NodeType equivalents. We map them to related types:
   * - skill → procedure (procedural knowledge)
   * - topic → learning_path (topic-level organization)
   * - domain → learning_path, goal (domain-level aggregation)
   */
  private getNodeTypesForGranularity(
    granularity: MasteryGranularity,
  ): readonly import("../types/lkgc/nodes").NodeType[] {
    switch (granularity) {
      case "card":
        return ["card"];
      case "concept":
        return ["concept"];
      case "skill":
        // Skills map to procedural node types
        return ["procedure"];
      case "topic":
        // Topics map to learning paths (topic-level organization)
        return ["learning_path"];
      case "domain":
        // Domains aggregate across learning paths and goals
        return ["learning_path", "goal"];
      default:
        return [];
    }
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new MasteryMaterializer
 */
export function createMasteryMaterializer(
  featureStore: FeatureStore,
  graphStore: GraphStore,
  masteryStore: MasteryStateStore,
  ruleRegistry: RuleRegistry,
  config?: Partial<MasteryMaterializerConfig>,
): MasteryMaterializer {
  return new DefaultMasteryMaterializer(
    featureStore,
    graphStore,
    masteryStore,
    ruleRegistry,
    config,
  );
}
