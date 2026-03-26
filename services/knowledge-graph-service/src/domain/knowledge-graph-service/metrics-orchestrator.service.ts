/**
 * @noema/knowledge-graph-service — Metrics Orchestrator
 *
 * Handles all Phase 7 operations: structural metrics, misconception
 * detection, structural health, metacognitive stage, and PKG↔CKG comparison.
 *
 * Extracted from KnowledgeGraphService as part of Fix 4.3 (God-object decomposition).
 *
 * Responsibilities:
 * - Compute and cache structural metrics (11 dimensions)
 * - Detect misconceptions via pattern-based engine
 * - Assess structural health and metacognitive stage
 * - Compare PKG with CKG for alignment analysis
 */

import { KnowledgeGraphEventType } from '@noema/events';
import type {
  IGraphEdge,
  IMetacognitiveStageAssessment,
  IMisconceptionDetection,
  IStructuralHealthReport,
  IStructuralMetrics,
  ISubgraph,
  MisconceptionPatternId,
  MisconceptionStatus,
  UserId,
} from '@noema/types';
import { ConfidenceScore as ConfidenceScoreFactory, GraphType } from '@noema/types';
import type { Logger } from 'pino';

import type { IEventPublisher } from '../shared/event-publisher.js';
import type { AgentHintsFactory } from './agent-hints.factory.js';
import { buildScopedGraphComparison } from './comparison-scope.builder.js';
import type { IExecutionContext, IServiceResult } from './execution-context.js';
import type { IGraphRepository } from './graph.repository.js';
import type { IMetricsStalenessRepository } from './metrics-staleness.repository.js';
import type { IMetricsHistoryOptions, IMetricsRepository } from './metrics.repository.js';
import {
  assessMetacognitiveStage,
  buildGraphComparison,
  buildMetricComputationContext,
  buildStructuralHealthReport,
  StructuralMetricsEngine,
} from './metrics/index.js';
import type { IMisconceptionRepository } from './misconception.repository.js';
import type { IMisconceptionDetectionContext } from './misconception/index.js';
import { MisconceptionDetectionEngine } from './misconception/index.js';
import { resolveFamily } from './misconception/misconception-family.config.js';
import { KG_COUNTERS, kgCounters, withSpan } from './observability.js';
import { detectSignificantMetricChange, requireAuth } from './service-helpers.js';
import type { IGraphComparison } from './value-objects/comparison.js';
import type { IComparisonRequest } from './value-objects/comparison.js';
import type { INodeFilter } from './value-objects/graph.value-objects.js';

/**
 * Phase 7 metrics orchestrator sub-service.
 *
 * Computes structural metrics, detects misconceptions, builds health
 * reports, assesses metacognitive stage, and compares PKG↔CKG.
 */
export class MetricsOrchestrator {
  private readonly metricsEngine: StructuralMetricsEngine;
  private readonly misconceptionEngine: MisconceptionDetectionEngine;
  /** Single-flight map: prevents duplicate concurrent metric computations for the same scope. */
  private readonly inflightMetrics = new Map<string, Promise<IServiceResult<IStructuralMetrics>>>();

  /** Max nodes fetched for domain-wide metrics computation. */
  private static readonly MAX_DOMAIN_NODES_FOR_METRICS = 10_000;
  /** Number of historical snapshots for structural health trend analysis. */
  private static readonly HEALTH_SNAPSHOT_HISTORY_DEPTH = 5;
  /** Number of historical snapshots for metacognitive stage regression detection. */
  private static readonly METACOGNITIVE_STAGE_HISTORY_DEPTH = 2;

  constructor(
    private readonly graphRepository: IGraphRepository,
    private readonly metricsRepository: IMetricsRepository,
    private readonly metricsStalenessRepository: IMetricsStalenessRepository,
    private readonly misconceptionRepository: IMisconceptionRepository,
    private readonly eventPublisher: IEventPublisher,
    private readonly hintsFactory: AgentHintsFactory,
    private readonly logger: Logger
  ) {
    this.metricsEngine = new StructuralMetricsEngine(this.logger);
    this.misconceptionEngine = new MisconceptionDetectionEngine(this.logger);
  }

  // ========================================================================
  // Phase 7 — Structural Metrics
  // ========================================================================

  async computeMetrics(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics>> {
    // Single-flight: coalesce concurrent computations for the same userId+domain
    const flightKey = `${userId as string}:${domain}`;
    const inflight = this.inflightMetrics.get(flightKey);
    if (inflight) {
      this.logger.debug({ userId, domain }, 'Coalescing duplicate metrics computation');
      return inflight;
    }

    const promise = this.doComputeMetrics(userId, domain, context);
    this.inflightMetrics.set(flightKey, promise);
    try {
      return await promise;
    } finally {
      this.inflightMetrics.delete(flightKey);
    }
  }

  private async doComputeMetrics(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics>> {
    return withSpan('kg.computeMetrics', async (span) => {
      span.setAttribute('kg.userId', userId as string);
      span.setAttribute('kg.domain', domain);

      requireAuth(context);
      this.logger.info({ userId, domain }, 'Computing structural metrics');

      // I-1: Staleness guard — return cached metrics if they are still fresh
      const existingSnapshot = await this.metricsRepository.getLatestSnapshot(userId, domain);
      if (existingSnapshot) {
        const isStale = await this.metricsStalenessRepository.isStale(
          userId,
          domain,
          existingSnapshot.computedAt
        );
        if (!isStale) {
          span.setAttribute('kg.metrics.cached', true);
          this.logger.debug({ userId, domain }, 'Metrics are fresh — returning cached snapshot');
          return {
            data: existingSnapshot.metrics,
            agentHints: this.hintsFactory.createMetricsHints(existingSnapshot.metrics, domain),
          };
        }
      }

      // Fetch subgraphs in parallel
      const [pkgSubgraph, ckgSubgraph] = await Promise.all([
        this.fetchDomainSubgraph(GraphType.PKG, domain, userId),
        this.fetchDomainSubgraph(GraphType.CKG, domain),
      ]);

      span.setAttribute('kg.metrics.pkgNodeCount', pkgSubgraph.nodes.length);
      span.setAttribute('kg.metrics.ckgNodeCount', ckgSubgraph.nodes.length);

      // Detect CKG unavailability (empty CKG subgraph)
      const ckgUnavailable = ckgSubgraph.nodes.length === 0;
      if (ckgUnavailable) {
        this.logger.warn(
          { userId, domain },
          'CKG subgraph is empty — CKG-dependent metrics will default to 0.0'
        );
      }

      // Build comparison
      const comparison = buildGraphComparison(pkgSubgraph, ckgSubgraph);

      // Re-use the snapshot fetched during staleness check (or null for first run)
      const previousSnapshot = existingSnapshot;

      // Build computation context
      const ctx = buildMetricComputationContext(
        pkgSubgraph,
        ckgSubgraph,
        comparison,
        previousSnapshot,
        domain,
        userId
      );

      // Compute all 11 metrics
      const { metrics, partialFailures } = this.metricsEngine.computeAll(ctx);

      if (partialFailures.length > 0) {
        this.logger.warn(
          { domain, partialFailures },
          'Structural metrics computed with partial failures'
        );
      }

      // Save snapshot
      await this.metricsRepository.saveSnapshot(userId, domain, metrics);

      kgCounters.increment(KG_COUNTERS.METRICS_COMPUTED, { domain });

      // Publish event only when metrics changed significantly
      const hasSignificantChange = detectSignificantMetricChange(
        metrics,
        previousSnapshot?.metrics ?? null
      );

      if (hasSignificantChange) {
        await this.eventPublisher.publish({
          eventType: KnowledgeGraphEventType.PKG_STRUCTURAL_METRICS_UPDATED,
          aggregateType: 'PersonalKnowledgeGraph',
          aggregateId: userId,
          payload: { userId, domain, metrics },
          metadata: {
            correlationId: context.correlationId,
            userId: context.userId,
          },
        });
      }

      // Build hints — include CKG unavailability warning if applicable
      const hints = this.hintsFactory.createMetricsHints(metrics, domain);
      if (ckgUnavailable) {
        hints.riskFactors.push({
          type: 'accuracy',
          severity: 'medium',
          description:
            'CKG unavailable for this domain — CKG-dependent metrics ' +
            '(AD, DCG, SLI, SCE, ULS) defaulted to 0.0. Results are partial.',
          probability: 1.0,
          impact: 0.6,
        });
        hints.assumptions.push('CKG subgraph was empty — CKG-dependent metrics are not meaningful');
      }

      return {
        data: metrics,
        agentHints: hints,
      };
    });
  }

  async getMetrics(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics>> {
    requireAuth(context);

    const snapshot = await this.metricsRepository.getLatestSnapshot(userId, domain);
    if (!snapshot) {
      // No cached snapshot — compute fresh
      return this.computeMetrics(userId, domain, context);
    }

    // Check staleness — compare snapshot.computedAt against last structural change
    const isStale = await this.metricsStalenessRepository.isStale(
      userId,
      domain,
      snapshot.computedAt
    );
    if (isStale) {
      return this.computeMetrics(userId, domain, context);
    }

    return {
      data: snapshot.metrics,
      agentHints: this.hintsFactory.createMetricsHints(snapshot.metrics, domain),
    };
  }

  async getMetricsHistory(
    userId: UserId,
    domain: string,
    options: IMetricsHistoryOptions,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralMetrics[]>> {
    requireAuth(context);

    const snapshots = await this.metricsRepository.getSnapshotHistory(userId, domain, options);
    const metricsList = snapshots.map((s) => s.metrics);

    return {
      data: metricsList,
      agentHints: this.hintsFactory.createListHints(
        'metric snapshots',
        metricsList.length,
        metricsList.length
      ),
    };
  }

  // ========================================================================
  // Phase 7 — Misconception Detection
  // ========================================================================

  async detectMisconceptions(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IMisconceptionDetection[]>> {
    return withSpan('kg.detectMisconceptions', async (span) => {
      span.setAttribute('kg.userId', userId as string);
      span.setAttribute('kg.domain', domain);

      requireAuth(context);
      this.logger.info({ userId, domain }, 'Running misconception detection');

      // Fetch subgraphs
      const [pkgSubgraph, ckgSubgraph] = await Promise.all([
        this.fetchDomainSubgraph(GraphType.PKG, domain, userId),
        this.fetchDomainSubgraph(GraphType.CKG, domain),
      ]);

      const comparison = buildGraphComparison(pkgSubgraph, ckgSubgraph);

      // Get active patterns
      const patterns = await this.misconceptionRepository.getActivePatterns();

      // Build detection context
      const detectionCtx: IMisconceptionDetectionContext = {
        pkgSubgraph,
        ckgSubgraph,
        comparison,
        patterns,
        domain,
        userId: userId as string,
      };

      // Run detection engine
      const { results: rawResults, detectorStatuses } =
        this.misconceptionEngine.detectAll(detectionCtx);

      if (detectorStatuses.some((s) => s.status === 'error')) {
        this.logger.warn(
          { domain, detectorStatuses: detectorStatuses.filter((s) => s.status === 'error') },
          'Misconception detection completed with detector failures'
        );
      }

      // Persist detections (upsert: dedup by userId + patternId)
      const detections: IMisconceptionDetection[] = [];
      for (const result of rawResults) {
        if (result.confidence < 0.3) continue; // Filter very low confidence

        // Find the pattern to get the misconception type
        const pattern = patterns.find((p) => p.patternId === result.patternId);
        if (!pattern) continue;

        // Compute per-detection severity
        const clampedConfidence = ConfidenceScoreFactory.clamp(result.confidence);
        const severityScore = computeSeverityScore(
          clampedConfidence as number,
          result.affectedNodeIds.length
        );
        const severity = scoreToBand(severityScore);

        // Resolve family from misconception type
        const family = resolveFamily(pattern.misconceptionType);

        const record = await this.misconceptionRepository.upsertDetection({
          userId,
          patternId: result.patternId as MisconceptionPatternId,
          misconceptionType: pattern.misconceptionType,
          affectedNodeIds: result.affectedNodeIds,
          confidence: clampedConfidence,
          severity,
          severityScore,
          family: family.key,
          description: result.description !== '' ? result.description : null,
        });

        detections.push({
          userId: record.userId as string,
          misconceptionType: record.misconceptionType,
          status: record.status,
          affectedNodeIds: record.affectedNodeIds,
          confidence: record.confidence,
          patternId: record.patternId,
          severity: record.severity,
          severityScore: record.severityScore,
          family: record.family,
          familyLabel: family.label,
          description: record.description,
          detectionCount: record.detectionCount,
          detectedAt: record.detectedAt,
          lastDetectedAt: record.lastDetectedAt,
          resolvedAt: record.resolvedAt,
        });

        // Publish MisconceptionDetected event (Phase 7 spec requirement)
        await this.eventPublisher.publish({
          eventType: KnowledgeGraphEventType.MISCONCEPTION_DETECTED,
          aggregateType: 'PersonalKnowledgeGraph',
          aggregateId: userId,
          payload: {
            userId,
            misconceptionType: record.misconceptionType,
            affectedNodeIds: record.affectedNodeIds,
            confidence: record.confidence,
            patternId: record.patternId,
            evidence: {
              detectionMethod: pattern.kind,
              domain,
            } satisfies Record<string, string>,
          },
          metadata: {
            correlationId: context.correlationId,
            userId: context.userId,
          },
        });
      }

      span.setAttribute('kg.misconceptions.count', detections.length);
      kgCounters.increment(KG_COUNTERS.MISCONCEPTIONS_DETECTED, { domain }, detections.length);

      return {
        data: detections,
        agentHints: this.hintsFactory.createMisconceptionHints(detections),
      };
    });
  }

  async getMisconceptions(
    userId: UserId,
    domain: string | undefined,
    context: IExecutionContext
  ): Promise<IServiceResult<IMisconceptionDetection[]>> {
    requireAuth(context);

    const records = await this.misconceptionRepository.getActiveMisconceptions(userId, domain);

    const detections: IMisconceptionDetection[] = records.map((r) => {
      const family = resolveFamily(r.misconceptionType);
      return {
        userId: r.userId as string,
        misconceptionType: r.misconceptionType,
        status: r.status,
        affectedNodeIds: r.affectedNodeIds,
        confidence: r.confidence,
        patternId: r.patternId,
        severity: r.severity,
        severityScore: r.severityScore,
        family: r.family,
        familyLabel: family.label,
        description: r.description,
        detectionCount: r.detectionCount,
        detectedAt: r.detectedAt,
        lastDetectedAt: r.lastDetectedAt,
        resolvedAt: r.resolvedAt,
      };
    });

    return {
      data: detections,
      agentHints: this.hintsFactory.createMisconceptionHints(detections),
    };
  }

  async updateMisconceptionStatus(
    detectionId: string,
    status: string,
    context: IExecutionContext
  ): Promise<IServiceResult<void>> {
    requireAuth(context);

    await this.misconceptionRepository.updateMisconceptionStatus(
      detectionId,
      status as MisconceptionStatus
    );

    return {
      data: undefined,
      agentHints: {
        suggestedNextActions: [],
        relatedResources: [],
        confidence: 1.0,
        sourceQuality: 'high',
        validityPeriod: 'short',
        contextNeeded: [],
        assumptions: [],
        riskFactors: [],
        dependencies: [],
        estimatedImpact: { benefit: 0.3, effort: 0.1, roi: 3.0 },
        preferenceAlignment: [],
        reasoning: `Misconception ${detectionId} status updated to "${status}"`,
      },
    };
  }

  // ========================================================================
  // Phase 7 — Structural Health & Metacognitive Stage
  // ========================================================================

  async getStructuralHealth(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IStructuralHealthReport>> {
    requireAuth(context);

    // Get or compute metrics
    const { data: metrics } = await this.getMetrics(userId, domain, context);

    // Get recent snapshots for trend
    const snapshots = await this.metricsRepository.getSnapshotHistory(userId, domain, {
      limit: MetricsOrchestrator.HEALTH_SNAPSHOT_HISTORY_DEPTH,
    });

    // Get misconception count
    const misconceptions = await this.misconceptionRepository.getActiveMisconceptions(
      userId,
      domain
    );

    // Get metacognitive stage
    const previousSnapshot = snapshots.length > 1 ? snapshots[1] : undefined;
    const previousMetrics = previousSnapshot?.metrics ?? null;
    const stageAssessment = assessMetacognitiveStage(metrics, previousMetrics, domain);

    // Build health report
    const report = buildStructuralHealthReport(
      metrics,
      snapshots,
      misconceptions.length,
      stageAssessment.currentStage,
      domain
    );

    return {
      data: report,
      agentHints: this.hintsFactory.createHealthHints(report),
    };
  }

  async getMetacognitiveStage(
    userId: UserId,
    domain: string,
    context: IExecutionContext
  ): Promise<IServiceResult<IMetacognitiveStageAssessment>> {
    requireAuth(context);

    // Get or compute metrics
    const { data: metrics } = await this.getMetrics(userId, domain, context);

    // Get previous metrics for regression detection
    const snapshots = await this.metricsRepository.getSnapshotHistory(userId, domain, {
      limit: MetricsOrchestrator.METACOGNITIVE_STAGE_HISTORY_DEPTH,
    });
    const prevSnapshot = snapshots.length > 1 ? snapshots[1] : undefined;
    const previousMetrics = prevSnapshot?.metrics ?? null;

    const assessment = assessMetacognitiveStage(metrics, previousMetrics, domain);

    return {
      data: assessment,
      agentHints: this.hintsFactory.createStageHints(assessment),
    };
  }

  // ========================================================================
  // Phase 7 — PKG↔CKG Comparison
  // ========================================================================

  async compareWithCkg(
    userId: UserId,
    request: IComparisonRequest,
    context: IExecutionContext
  ): Promise<IServiceResult<IGraphComparison>> {
    requireAuth(context);
    this.logger.info({ userId, request }, 'Comparing PKG with CKG');

    const [pkgSubgraph, ckgSubgraph] = await Promise.all([
      this.fetchComparisonSubgraph(GraphType.PKG, request.domain, userId),
      this.fetchComparisonSubgraph(GraphType.CKG, request.domain),
    ]);

    const comparison = buildScopedGraphComparison(pkgSubgraph, ckgSubgraph, request);

    return {
      data: comparison,
      agentHints: this.hintsFactory.createComparisonHints(comparison),
    };
  }

  // ========================================================================
  // Private — Domain Subgraph Fetching
  // ========================================================================

  /**
   * Fetch all nodes and intra-domain edges for a given graph type and domain.
   * Used by metrics, comparison, and misconception operations.
   */
  private async fetchDomainSubgraph(
    graphType: GraphType,
    domain: string,
    userId?: UserId
  ): Promise<ISubgraph> {
    const filter: INodeFilter = {
      graphType,
      domain,
      ...(userId !== undefined && { userId: userId as string }),
      includeDeleted: false,
    };

    // Fetch all nodes in this domain — use a generous limit
    const maxNodes = MetricsOrchestrator.MAX_DOMAIN_NODES_FOR_METRICS;
    const nodes = await this.graphRepository.findNodes(filter, maxNodes, 0);

    if (nodes.length >= maxNodes) {
      this.logger.warn(
        { domain, graphType, nodeCount: nodes.length, limit: maxNodes },
        'Domain node count reached metrics fetch limit — metrics may be incomplete'
      );
    }

    if (nodes.length === 0) {
      return { nodes: [], edges: [] };
    }

    // Collect all node IDs for filtering edges
    const nodeIdSet = new Set<string>(nodes.map((n) => n.nodeId as string));

    // Batch-fetch all edges for these nodes in a single query (Fix 3.1: N+1 → O(1))

    const allEdges = await this.graphRepository.getEdgesForNodes(
      nodes.map((n) => n.nodeId),
      {},
      userId as string | undefined
    );

    // Filter to intra-domain outbound edges only
    const edges: IGraphEdge[] = [];
    for (const edge of allEdges) {
      // Only include edges where source is in our set (outbound) and target is too (intra-domain)
      if (
        nodeIdSet.has(edge.sourceNodeId as string) &&
        nodeIdSet.has(edge.targetNodeId as string)
      ) {
        edges.push(edge);
      }
    }

    return { nodes, edges };
  }

  /**
   * Fetch nodes and intra-scope edges for comparison.
   * When domain is omitted, the comparison spans the learner's full graph.
   */
  private async fetchComparisonSubgraph(
    graphType: GraphType,
    domain?: string,
    userId?: UserId
  ): Promise<ISubgraph> {
    const filter: INodeFilter = {
      graphType,
      ...(domain !== undefined ? { domain } : {}),
      ...(userId !== undefined ? { userId: userId as string } : {}),
      includeDeleted: false,
    };

    const maxNodes = MetricsOrchestrator.MAX_DOMAIN_NODES_FOR_METRICS;
    const nodes = await this.graphRepository.findNodes(filter, maxNodes, 0);

    if (nodes.length === 0) {
      return { nodes: [], edges: [] };
    }

    const nodeIdSet = new Set<string>(nodes.map((node) => node.nodeId as string));
    const allEdges = await this.graphRepository.getEdgesForNodes(
      nodes.map((node) => node.nodeId),
      {},
      userId as string | undefined
    );

    const edges: IGraphEdge[] = [];
    for (const edge of allEdges) {
      if (
        nodeIdSet.has(edge.sourceNodeId as string) &&
        nodeIdSet.has(edge.targetNodeId as string)
      ) {
        edges.push(edge);
      }
    }

    return { nodes, edges };
  }
}

// ============================================================================
// Severity scoring helpers (module-private)
// ============================================================================

import type { MisconceptionSeverity } from '@noema/types';
import { MisconceptionSeverity as SeverityEnum } from '@noema/types';

/** Weights for the severity formula */
const CONFIDENCE_WEIGHT = 0.7;
const AFFECTED_WEIGHT = 0.3;
/** Max affected nodes before score saturates */
const MAX_AFFECTED_NODES = 20;

/**
 * Compute a normalised severity score (0.0–1.0) from detection signals.
 *
 * Formula: `w_c * confidence + w_a * min(affectedCount / maxAffected, 1)`
 */
function computeSeverityScore(confidence: number, affectedCount: number): number {
  const normAffected = Math.min(affectedCount / MAX_AFFECTED_NODES, 1.0);
  return Math.min(CONFIDENCE_WEIGHT * confidence + AFFECTED_WEIGHT * normAffected, 1.0);
}

/**
 * Convert a continuous severity score to a discrete severity band.
 */
function scoreToBand(score: number): MisconceptionSeverity {
  if (score >= 0.85) return SeverityEnum.CRITICAL;
  if (score >= 0.6) return SeverityEnum.HIGH;
  if (score >= 0.35) return SeverityEnum.MODERATE;
  return SeverityEnum.LOW;
}
