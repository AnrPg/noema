// =============================================================================
// FEATURE STORE - Derived Feature Storage Abstraction
// =============================================================================
// Stores derived features computed from raw events.
// Features are:
// - Computed deterministically from events
// - Traceable back to source events
// - Organized by granularity (attempt, session, day, week)
//
// Features are the bridge between raw events and state updates.
// They can be recomputed from events if needed.
// =============================================================================

import type {
  EntityId,
  EventId,
  SessionId,
  NodeId,
  Timestamp,
} from "../types/lkgc/foundation";
import type {
  FeatureGranularity,
  AttemptFeatures,
  SessionFeatures,
  DailyFeatures,
  WeeklyFeatures,
  DerivedFeature,
} from "../types/lkgc/aggregation";
import type { ReviewAttemptId } from "../types/lkgc/session";

// =============================================================================
// FEATURE RECORD - Stored feature with metadata
// =============================================================================

/**
 * Stored feature record with traceability metadata
 */
export interface FeatureRecord<T extends DerivedFeature = DerivedFeature> {
  /** Unique ID for this feature record */
  readonly featureId: EntityId;

  /** The feature data */
  readonly feature: T;

  /** When this feature was computed */
  readonly computedAt: Timestamp;

  /** Version of the computation (for cache invalidation) */
  readonly computationVersion: number;

  /** Source event IDs (for traceability) */
  readonly sourceEventIds: readonly EventId[];

  /** Aggregation window */
  readonly window: FeatureWindow;

  /** Computation metadata */
  readonly computation: ComputationMetadata;
}

/**
 * Time window for feature aggregation
 */
export interface FeatureWindow {
  /** Start of the window (inclusive) */
  readonly start: Timestamp;

  /** End of the window (exclusive) */
  readonly end: Timestamp;

  /** Granularity level */
  readonly granularity: FeatureGranularity;

  /** Human-readable label (e.g., "2026-02-02" for daily) */
  readonly label: string;
}

/**
 * Metadata about how the feature was computed
 */
export interface ComputationMetadata {
  /** Transformation rule that produced this feature */
  readonly ruleId: string;

  /** Rule version */
  readonly ruleVersion: number;

  /** Duration of computation (ms) */
  readonly computationDuration: number;

  /** Number of events processed */
  readonly eventsProcessed: number;

  /** Whether this is a recomputation */
  readonly isRecomputation: boolean;

  /** Previous feature ID if recomputed */
  readonly previousFeatureId?: EntityId;
}

// =============================================================================
// FEATURE QUERIES
// =============================================================================

/**
 * Query options for features
 */
export interface FeatureQueryOptions {
  /** Filter by granularity */
  readonly granularity?: FeatureGranularity;

  /** Filter by time range */
  readonly timeRange?: {
    readonly start?: Timestamp;
    readonly end?: Timestamp;
  };

  /** Filter by session (for attempt/session features) */
  readonly sessionId?: SessionId;

  /** Filter by node (for attempt features) */
  readonly nodeId?: NodeId;

  /** Maximum number of results */
  readonly limit?: number;

  /** Offset for pagination */
  readonly offset?: number;

  /** Sort order */
  readonly order?: "asc" | "desc";
}

/**
 * Result of a feature query
 */
export interface FeatureQueryResult<T extends DerivedFeature = DerivedFeature> {
  /** The matching features */
  readonly features: readonly FeatureRecord<T>[];

  /** Total count */
  readonly totalCount: number;

  /** Whether there are more results */
  readonly hasMore: boolean;
}

// =============================================================================
// FEATURE STORE INTERFACE
// =============================================================================

/**
 * FeatureStore - Storage for derived features
 *
 * Features are computed from events and stored for efficient querying.
 * They form the basis for state updates and AI snapshots.
 */
export interface FeatureStore {
  // -------------------------------------------------------------------------
  // WRITE OPERATIONS
  // -------------------------------------------------------------------------

  /**
   * Store a computed feature
   * @param feature The feature to store
   * @param sourceEventIds Event IDs that contributed to this feature
   * @returns The stored feature record
   */
  store<T extends DerivedFeature>(
    feature: T,
    sourceEventIds: readonly EventId[],
    computation: ComputationMetadata,
  ): Promise<FeatureRecord<T>>;

  /**
   * Store multiple features atomically
   * @param features Array of features with their metadata
   * @returns The stored feature records
   */
  storeBatch<T extends DerivedFeature>(
    features: ReadonlyArray<{
      feature: T;
      sourceEventIds: readonly EventId[];
      computation: ComputationMetadata;
    }>,
  ): Promise<readonly FeatureRecord<T>[]>;

  /**
   * Invalidate features (mark for recomputation)
   * Used when events are found to be incorrect or need reprocessing
   * @param featureIds IDs of features to invalidate
   */
  invalidate(featureIds: readonly EntityId[]): Promise<void>;

  // -------------------------------------------------------------------------
  // READ OPERATIONS - By Type
  // -------------------------------------------------------------------------

  /**
   * Get attempt features for a specific review attempt
   */
  getAttemptFeatures(
    attemptId: ReviewAttemptId,
  ): Promise<FeatureRecord<AttemptFeatures> | null>;

  /**
   * Get session features for a specific session
   */
  getSessionFeatures(
    sessionId: SessionId,
  ): Promise<FeatureRecord<SessionFeatures> | null>;

  /**
   * Get daily features for a specific date
   * @param date ISO date string (YYYY-MM-DD)
   */
  getDailyFeatures(date: string): Promise<FeatureRecord<DailyFeatures> | null>;

  /**
   * Get weekly features for a specific week
   * @param year Year
   * @param weekNumber ISO week number
   */
  getWeeklyFeatures(
    year: number,
    weekNumber: number,
  ): Promise<FeatureRecord<WeeklyFeatures> | null>;

  // -------------------------------------------------------------------------
  // READ OPERATIONS - Queries
  // -------------------------------------------------------------------------

  /**
   * Query features with filters
   */
  query<T extends DerivedFeature>(
    options: FeatureQueryOptions,
  ): Promise<FeatureQueryResult<T>>;

  /**
   * Get features for a specific node across time
   */
  getNodeFeatureHistory(
    nodeId: NodeId,
    options?: Omit<FeatureQueryOptions, "nodeId">,
  ): Promise<FeatureQueryResult<AttemptFeatures>>;

  /**
   * Get features for a specific session and all its attempts
   */
  getSessionFeatureBundle(sessionId: SessionId): Promise<SessionFeatureBundle>;

  // -------------------------------------------------------------------------
  // TRACEABILITY OPERATIONS
  // -------------------------------------------------------------------------

  /**
   * Get all features that were computed from a specific event
   * @param eventId The source event ID
   */
  getFeaturesFromEvent(eventId: EventId): Promise<readonly FeatureRecord[]>;

  /**
   * Get the event IDs that contributed to a feature
   * @param featureId The feature ID
   */
  getSourceEvents(featureId: EntityId): Promise<readonly EventId[]>;

  // -------------------------------------------------------------------------
  // AGGREGATION OPERATIONS
  // -------------------------------------------------------------------------

  /**
   * Get the latest feature of each type for a summary view
   */
  getLatestFeatures(): Promise<LatestFeatures>;

  /**
   * Get feature statistics
   */
  getStatistics(): Promise<FeatureStatistics>;
}

/**
 * Bundle of all features for a session
 */
export interface SessionFeatureBundle {
  /** The session features */
  readonly sessionFeature: FeatureRecord<SessionFeatures> | null;

  /** All attempt features from this session */
  readonly attemptFeatures: readonly FeatureRecord<AttemptFeatures>[];

  /** Source events count */
  readonly totalEvents: number;
}

/**
 * Latest features summary
 */
export interface LatestFeatures {
  /** Most recent daily feature */
  readonly latestDaily: FeatureRecord<DailyFeatures> | null;

  /** Most recent weekly feature */
  readonly latestWeekly: FeatureRecord<WeeklyFeatures> | null;

  /** Most recent session feature */
  readonly latestSession: FeatureRecord<SessionFeatures> | null;

  /** Total features stored */
  readonly totalFeatureCount: number;
}

/**
 * Feature store statistics
 */
export interface FeatureStatistics {
  /** Count by granularity */
  readonly countByGranularity: Record<FeatureGranularity, number>;

  /** Total source events referenced */
  readonly totalSourceEvents: number;

  /** Average events per feature by granularity */
  readonly avgEventsPerFeature: Record<FeatureGranularity, number>;

  /** Oldest feature timestamp */
  readonly oldestFeature: Timestamp | null;

  /** Newest feature timestamp */
  readonly newestFeature: Timestamp | null;

  /** Number of invalidated features */
  readonly invalidatedCount: number;
}

// =============================================================================
// FEATURE EXTRACTION INTERFACE
// =============================================================================

/**
 * Feature extractor - computes features from events
 * This is the boundary between raw events and derived features
 */
export interface FeatureExtractor {
  /**
   * Extract attempt features from events for a single review attempt
   */
  extractAttemptFeatures(
    attemptId: ReviewAttemptId,
    events: readonly import("./event-log").EventRecord[],
  ): Promise<AttemptFeatures>;

  /**
   * Extract session features from events for a session
   */
  extractSessionFeatures(
    sessionId: SessionId,
    events: readonly import("./event-log").EventRecord[],
  ): Promise<SessionFeatures>;

  /**
   * Extract daily features from events for a day
   */
  extractDailyFeatures(
    date: string,
    events: readonly import("./event-log").EventRecord[],
  ): Promise<DailyFeatures>;

  /**
   * Extract weekly features from events for a week
   */
  extractWeeklyFeatures(
    year: number,
    weekNumber: number,
    events: readonly import("./event-log").EventRecord[],
  ): Promise<WeeklyFeatures>;
}

// =============================================================================
// FEATURE WINDOW HELPERS
// =============================================================================

/**
 * Create a feature window for an attempt
 */
export function createAttemptWindow(
  attemptStart: Timestamp,
  attemptEnd: Timestamp,
  attemptId: string,
): FeatureWindow {
  return {
    start: attemptStart,
    end: attemptEnd,
    granularity: "attempt",
    label: attemptId,
  };
}

/**
 * Create a feature window for a session
 */
export function createSessionWindow(
  sessionStart: Timestamp,
  sessionEnd: Timestamp,
  sessionId: string,
): FeatureWindow {
  return {
    start: sessionStart,
    end: sessionEnd,
    granularity: "session",
    label: sessionId,
  };
}

/**
 * Create a feature window for a day
 */
export function createDailyWindow(date: string): FeatureWindow {
  const start = new Date(date).getTime() as Timestamp;
  const end = (start + 24 * 60 * 60 * 1000) as Timestamp;
  return {
    start,
    end,
    granularity: "day",
    label: date,
  };
}

/**
 * Create a feature window for a week
 */
export function createWeeklyWindow(
  year: number,
  weekNumber: number,
): FeatureWindow {
  // Calculate start of ISO week
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const startOfYear = new Date(
    jan4.getTime() - (dayOfWeek - 1) * 24 * 60 * 60 * 1000,
  );
  const weekStart = new Date(
    startOfYear.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000,
  );
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  return {
    start: weekStart.getTime() as Timestamp,
    end: weekEnd.getTime() as Timestamp,
    granularity: "week",
    label: `${year}-W${weekNumber.toString().padStart(2, "0")}`,
  };
}
