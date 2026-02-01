// =============================================================================
// AGGREGATION PIPELINE - Event Processing Orchestration
// =============================================================================
// Orchestrates the flow from raw events to derived features.
// This is the central coordination point for event processing.
//
// Pipeline stages:
// 1. Event ingestion (append to log)
// 2. Validation
// 3. Feature extraction (attempt → session → daily → weekly)
// 4. Audit trail recording
//
// NO mastery computation. NO scheduling. NO AI. Those are downstream consumers.
// =============================================================================

import type { EventId, SessionId, Timestamp } from "../types/lkgc/foundation";
import type { LKGCEvent } from "../types/lkgc/events";
import type {
  AttemptFeatures,
  SessionFeatures,
  DailyFeatures,
  WeeklyFeatures,
} from "../types/lkgc/aggregation";
import type { ReviewAttemptId } from "../types/lkgc/session";
import type { EventLog, SubscribableEventLog, EventRecord } from "./event-log";
import type { EventValidator, EventValidationResult } from "./event-validator";
import type {
  FeatureStore,
  FeatureRecord,
  FeatureExtractor,
  ComputationMetadata,
} from "./feature-store";
import type { AuditTrail } from "./audit-trail";

// =============================================================================
// PIPELINE CONFIGURATION
// =============================================================================

/**
 * Configuration for the aggregation pipeline
 */
export interface PipelineConfig {
  /**
   * Whether to compute features automatically on event ingestion
   */
  readonly autoComputeFeatures: boolean;

  /**
   * Feature computation settings
   */
  readonly featureComputation: {
    /**
     * Compute attempt features immediately after review events
     */
    readonly attemptFeaturesOnReviewComplete: boolean;

    /**
     * Compute session features when session ends
     */
    readonly sessionFeaturesOnSessionEnd: boolean;

    /**
     * Interval for computing daily features (ms)
     */
    readonly dailyFeaturesInterval: number;

    /**
     * Interval for computing weekly features (ms)
     */
    readonly weeklyFeaturesInterval: number;
  };

  /**
   * Audit settings
   */
  readonly audit: {
    /**
     * Record all event ingestions
     */
    readonly recordEventIngestion: boolean;

    /**
     * Record feature computations
     */
    readonly recordFeatureComputation: boolean;

    /**
     * Record validation results
     */
    readonly recordValidation: boolean;
  };

  /**
   * Error handling
   */
  readonly errorHandling: {
    /**
     * Continue processing other events if one fails
     */
    readonly continueOnError: boolean;

    /**
     * Maximum retries for failed operations
     */
    readonly maxRetries: number;
  };
}

/**
 * Default pipeline configuration
 */
export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  autoComputeFeatures: true,
  featureComputation: {
    attemptFeaturesOnReviewComplete: true,
    sessionFeaturesOnSessionEnd: true,
    dailyFeaturesInterval: 60 * 60 * 1000, // 1 hour
    weeklyFeaturesInterval: 24 * 60 * 60 * 1000, // 1 day
  },
  audit: {
    recordEventIngestion: true,
    recordFeatureComputation: true,
    recordValidation: true,
  },
  errorHandling: {
    continueOnError: true,
    maxRetries: 3,
  },
};

// =============================================================================
// PIPELINE RESULT TYPES
// =============================================================================

/**
 * Result of processing a single event
 */
export interface EventProcessingResult {
  /** The event that was processed */
  readonly eventId: EventId;

  /** Whether processing succeeded */
  readonly success: boolean;

  /** The stored event record */
  readonly record?: EventRecord;

  /** Validation result */
  readonly validation?: EventValidationResult;

  /** Features computed from this event */
  readonly featuresComputed?: readonly FeatureRecord[];

  /** Errors encountered */
  readonly errors?: readonly ProcessingError[];
}

/**
 * Result of processing a batch of events
 */
export interface BatchProcessingResult {
  /** Total events in batch */
  readonly totalEvents: number;

  /** Successfully processed */
  readonly successCount: number;

  /** Failed events */
  readonly failedCount: number;

  /** Individual results */
  readonly results: readonly EventProcessingResult[];

  /** Total processing time (ms) */
  readonly processingTime: number;
}

/**
 * Processing error details
 */
export interface ProcessingError {
  /** Stage where error occurred */
  readonly stage: "validation" | "storage" | "feature_computation" | "audit";

  /** Error code */
  readonly code: string;

  /** Error message */
  readonly message: string;

  /** Whether the error is recoverable */
  readonly recoverable: boolean;
}

// =============================================================================
// PIPELINE INTERFACE
// =============================================================================

/**
 * AggregationPipeline - Coordinates event processing
 */
export interface AggregationPipeline {
  // -------------------------------------------------------------------------
  // EVENT INGESTION
  // -------------------------------------------------------------------------

  /**
   * Ingest a single event through the full pipeline
   */
  ingest(event: LKGCEvent): Promise<EventProcessingResult>;

  /**
   * Ingest multiple events
   */
  ingestBatch(events: readonly LKGCEvent[]): Promise<BatchProcessingResult>;

  // -------------------------------------------------------------------------
  // FEATURE COMPUTATION (manual triggers)
  // -------------------------------------------------------------------------

  /**
   * Compute attempt features for a review attempt
   */
  computeAttemptFeatures(
    attemptId: ReviewAttemptId,
  ): Promise<FeatureRecord<AttemptFeatures> | null>;

  /**
   * Compute session features for a session
   */
  computeSessionFeatures(
    sessionId: SessionId,
  ): Promise<FeatureRecord<SessionFeatures> | null>;

  /**
   * Compute daily features for a specific date
   */
  computeDailyFeatures(
    date: string,
  ): Promise<FeatureRecord<DailyFeatures> | null>;

  /**
   * Compute weekly features for a specific week
   */
  computeWeeklyFeatures(
    year: number,
    weekNumber: number,
  ): Promise<FeatureRecord<WeeklyFeatures> | null>;

  /**
   * Recompute all features from raw events (for recovery/migration)
   */
  recomputeAllFeatures(): Promise<BatchProcessingResult>;

  // -------------------------------------------------------------------------
  // PIPELINE CONTROL
  // -------------------------------------------------------------------------

  /**
   * Start the pipeline (including scheduled tasks)
   */
  start(): Promise<void>;

  /**
   * Stop the pipeline
   */
  stop(): Promise<void>;

  /**
   * Check if pipeline is running
   */
  isRunning(): boolean;

  /**
   * Get pipeline statistics
   */
  getStatistics(): Promise<PipelineStatistics>;
}

/**
 * Pipeline statistics
 */
export interface PipelineStatistics {
  /** Is pipeline running */
  readonly running: boolean;

  /** Events processed since start */
  readonly eventsProcessed: number;

  /** Events failed since start */
  readonly eventsFailed: number;

  /** Features computed since start */
  readonly featuresComputed: number;

  /** Average processing time per event (ms) */
  readonly avgProcessingTime: number;

  /** Pipeline uptime (ms) */
  readonly uptime: number;

  /** Last event processed at */
  readonly lastEventAt?: Timestamp;
}

// =============================================================================
// PIPELINE BUILDER
// =============================================================================

/**
 * Dependencies for the pipeline
 */
export interface PipelineDependencies {
  readonly eventLog: EventLog | SubscribableEventLog;
  readonly validator: EventValidator;
  readonly featureStore: FeatureStore;
  readonly featureExtractor: FeatureExtractor;
  readonly auditTrail?: AuditTrail;
}

/**
 * Create a new aggregation pipeline
 */
export function createPipeline(
  dependencies: PipelineDependencies,
  config: Partial<PipelineConfig> = {},
): AggregationPipeline {
  const fullConfig = { ...DEFAULT_PIPELINE_CONFIG, ...config };
  return new DefaultAggregationPipeline(dependencies, fullConfig);
}

// =============================================================================
// DEFAULT IMPLEMENTATION
// =============================================================================

/**
 * Default implementation of AggregationPipeline
 */
class DefaultAggregationPipeline implements AggregationPipeline {
  private readonly deps: PipelineDependencies;
  private readonly config: PipelineConfig;
  private running = false;
  private stats = {
    eventsProcessed: 0,
    eventsFailed: 0,
    featuresComputed: 0,
    totalProcessingTime: 0,
    startTime: 0,
    lastEventAt: undefined as Timestamp | undefined,
  };

  // Scheduled task handles
  private dailyFeaturesInterval?: ReturnType<typeof setInterval>;
  private weeklyFeaturesInterval?: ReturnType<typeof setInterval>;

  constructor(deps: PipelineDependencies, config: PipelineConfig) {
    this.deps = deps;
    this.config = config;
  }

  // -------------------------------------------------------------------------
  // EVENT INGESTION
  // -------------------------------------------------------------------------

  async ingest(event: LKGCEvent): Promise<EventProcessingResult> {
    const startTime = Date.now();
    const errors: ProcessingError[] = [];

    // 1. Validate
    const validation = await this.deps.validator.validate(event);
    if (!validation.valid) {
      this.stats.eventsFailed++;
      return {
        eventId: event.id,
        success: false,
        validation,
        errors: validation.errors.map((e) => ({
          stage: "validation" as const,
          code: e.code,
          message: e.message,
          recoverable: false,
        })),
      };
    }

    // 2. Store event
    const appendResult = await this.deps.eventLog.append(event);
    if (!appendResult.success) {
      this.stats.eventsFailed++;
      return {
        eventId: event.id,
        success: false,
        validation,
        errors: appendResult.errors.map((e) => ({
          stage: "storage" as const,
          code: e.code,
          message: e.message,
          recoverable: e.code !== "DUPLICATE_EVENT_ID",
        })),
      };
    }

    const record = appendResult.records[0];

    // 3. Update status to processed
    await this.deps.eventLog.updateStatus(event.id, "processed");

    // 4. Compute features if configured
    let featuresComputed: FeatureRecord[] = [];
    if (this.config.autoComputeFeatures) {
      try {
        featuresComputed = await this.computeFeaturesForEvent(record);
        this.stats.featuresComputed += featuresComputed.length;
      } catch (err) {
        errors.push({
          stage: "feature_computation",
          code: "FEATURE_COMPUTATION_FAILED",
          message: err instanceof Error ? err.message : String(err),
          recoverable: true,
        });
      }
    }

    // 5. Record audit
    if (this.config.audit.recordEventIngestion && this.deps.auditTrail) {
      try {
        await this.deps.auditTrail.recordEventIngested(
          event.id,
          event.category,
          event.eventType,
          record.sequenceNumber,
          record.eventHash,
          Date.now() - startTime,
          { type: "system", id: "pipeline" },
        );
      } catch (err) {
        // Audit errors shouldn't fail the pipeline
        console.error("Audit recording failed:", err);
      }
    }

    // Update stats
    this.stats.eventsProcessed++;
    this.stats.totalProcessingTime += Date.now() - startTime;
    this.stats.lastEventAt = Date.now() as Timestamp;

    return {
      eventId: event.id,
      success: true,
      record,
      validation,
      featuresComputed,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async ingestBatch(
    events: readonly LKGCEvent[],
  ): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    const results: EventProcessingResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const event of events) {
      const result = await this.ingest(event);
      results.push(result);
      if (result.success) {
        successCount++;
      } else {
        failedCount++;
        if (!this.config.errorHandling.continueOnError) {
          break;
        }
      }
    }

    return {
      totalEvents: events.length,
      successCount,
      failedCount,
      results,
      processingTime: Date.now() - startTime,
    };
  }

  // -------------------------------------------------------------------------
  // FEATURE COMPUTATION
  // -------------------------------------------------------------------------

  async computeAttemptFeatures(
    _attemptId: ReviewAttemptId,
  ): Promise<FeatureRecord<AttemptFeatures> | null> {
    // Get events for this attempt
    // This would require querying events by attemptId
    // For now, return null (stub)
    return null;
  }

  async computeSessionFeatures(
    sessionId: SessionId,
  ): Promise<FeatureRecord<SessionFeatures> | null> {
    const events = await this.deps.eventLog.getBySession(sessionId);
    if (events.length === 0) return null;

    const feature = await this.deps.featureExtractor.extractSessionFeatures(
      sessionId,
      events,
    );

    const computation = this.createComputationMetadata(
      "session_features",
      events.length,
    );

    return this.deps.featureStore.store(
      feature,
      events.map((e) => e.eventId),
      computation,
    );
  }

  async computeDailyFeatures(
    date: string,
  ): Promise<FeatureRecord<DailyFeatures> | null> {
    const dayStart = new Date(date).getTime() as Timestamp;
    const dayEnd = (dayStart + 24 * 60 * 60 * 1000) as Timestamp;

    const result = await this.deps.eventLog.query({
      timeRange: { start: dayStart, end: dayEnd },
      order: "asc",
    });

    if (result.events.length === 0) return null;

    const feature = await this.deps.featureExtractor.extractDailyFeatures(
      date,
      result.events,
    );

    const computation = this.createComputationMetadata(
      "daily_features",
      result.events.length,
    );

    return this.deps.featureStore.store(
      feature,
      result.events.map((e) => e.eventId),
      computation,
    );
  }

  async computeWeeklyFeatures(
    year: number,
    weekNumber: number,
  ): Promise<FeatureRecord<WeeklyFeatures> | null> {
    // Calculate week start/end
    // Simplified - would need proper ISO week calculation
    const feature = await this.deps.featureExtractor.extractWeeklyFeatures(
      year,
      weekNumber,
      [], // Would fetch events for the week
    );

    const computation = this.createComputationMetadata("weekly_features", 0);

    return this.deps.featureStore.store(feature, [], computation);
  }

  async recomputeAllFeatures(): Promise<BatchProcessingResult> {
    // This would replay all events and recompute features
    // Stub implementation
    return {
      totalEvents: 0,
      successCount: 0,
      failedCount: 0,
      results: [],
      processingTime: 0,
    };
  }

  // -------------------------------------------------------------------------
  // PIPELINE CONTROL
  // -------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    this.stats.startTime = Date.now();

    // Set up scheduled feature computation
    if (this.config.featureComputation.dailyFeaturesInterval > 0) {
      this.dailyFeaturesInterval = setInterval(
        () => this.runDailyFeatureComputation(),
        this.config.featureComputation.dailyFeaturesInterval,
      );
    }

    if (this.config.featureComputation.weeklyFeaturesInterval > 0) {
      this.weeklyFeaturesInterval = setInterval(
        () => this.runWeeklyFeatureComputation(),
        this.config.featureComputation.weeklyFeaturesInterval,
      );
    }
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.dailyFeaturesInterval) {
      clearInterval(this.dailyFeaturesInterval);
      this.dailyFeaturesInterval = undefined;
    }

    if (this.weeklyFeaturesInterval) {
      clearInterval(this.weeklyFeaturesInterval);
      this.weeklyFeaturesInterval = undefined;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  async getStatistics(): Promise<PipelineStatistics> {
    return {
      running: this.running,
      eventsProcessed: this.stats.eventsProcessed,
      eventsFailed: this.stats.eventsFailed,
      featuresComputed: this.stats.featuresComputed,
      avgProcessingTime:
        this.stats.eventsProcessed > 0
          ? this.stats.totalProcessingTime / this.stats.eventsProcessed
          : 0,
      uptime: this.running ? Date.now() - this.stats.startTime : 0,
      lastEventAt: this.stats.lastEventAt,
    };
  }

  // -------------------------------------------------------------------------
  // PRIVATE HELPERS
  // -------------------------------------------------------------------------

  private async computeFeaturesForEvent(
    record: EventRecord,
  ): Promise<FeatureRecord[]> {
    const features: FeatureRecord[] = [];

    // Check if this is a review completion event
    if (
      record.event.category === "review_performance" &&
      record.event.eventType === "review_completed" &&
      this.config.featureComputation.attemptFeaturesOnReviewComplete
    ) {
      const attemptFeature = await this.computeAttemptFeatures(
        (record.event as { attemptId: ReviewAttemptId }).attemptId,
      );
      if (attemptFeature) {
        features.push(attemptFeature as FeatureRecord);
      }
    }

    return features;
  }

  private createComputationMetadata(
    ruleId: string,
    eventsProcessed: number,
  ): ComputationMetadata {
    return {
      ruleId,
      ruleVersion: 1,
      computationDuration: 0, // Would be measured
      eventsProcessed,
      isRecomputation: false,
    };
  }

  private async runDailyFeatureComputation(): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    try {
      await this.computeDailyFeatures(today);
    } catch (err) {
      console.error("Daily feature computation failed:", err);
    }
  }

  private async runWeeklyFeatureComputation(): Promise<void> {
    const now = new Date();
    const year = now.getFullYear();
    const weekNumber = this.getISOWeekNumber(now);
    try {
      await this.computeWeeklyFeatures(year, weekNumber);
    } catch (err) {
      console.error("Weekly feature computation failed:", err);
    }
  }

  private getISOWeekNumber(date: Date): number {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }
}
