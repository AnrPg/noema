// =============================================================================
// SQLITE FEATURE STORE - Stub Implementation
// =============================================================================
// This file contains the interface and method signatures for a SQLite-backed
// feature store implementation. The actual SQL execution logic is NOT implemented
// here - this is a stub for future implementation.
// =============================================================================

import type {
  EntityId,
  EventId,
  SessionId,
  NodeId,
} from "../../types/lkgc/foundation";
import type {
  AttemptFeatures,
  SessionFeatures,
  DailyFeatures,
  WeeklyFeatures,
  DerivedFeature,
} from "../../types/lkgc/aggregation";
import type { ReviewAttemptId } from "../../types/lkgc/session";
import type {
  FeatureStore,
  FeatureRecord,
  FeatureQueryOptions,
  FeatureQueryResult,
  SessionFeatureBundle,
  LatestFeatures,
  FeatureStatistics,
  ComputationMetadata,
} from "../feature-store";
import type { SQLiteConnection } from "./sqlite-event-log";
import { NotImplementedError } from "./sqlite-event-log";

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for SQLite feature store
 */
export interface SQLiteFeatureStoreConfig {
  /**
   * Database file path (or :memory: for in-memory)
   * Should be the same database as the event log for transactional consistency
   */
  readonly databasePath: string;

  /**
   * Whether to automatically create event-feature mappings
   */
  readonly trackEventMappings?: boolean;
}

// =============================================================================
// SQLITE FEATURE STORE STUB
// =============================================================================

/**
 * SQLite-backed implementation of FeatureStore
 *
 * ⚠️ STUB IMPLEMENTATION - Methods throw NotImplementedError
 * This is provided as a template for future implementation.
 */
export class SQLiteFeatureStore implements FeatureStore {
  private readonly config: SQLiteFeatureStoreConfig;
  private connection: SQLiteConnection | null = null;

  constructor(config: SQLiteFeatureStoreConfig) {
    this.config = config;
  }

  // -------------------------------------------------------------------------
  // LIFECYCLE
  // -------------------------------------------------------------------------

  /**
   * Initialize with a database connection
   */
  async initialize(connection: SQLiteConnection): Promise<void> {
    this.connection = connection;
    // TODO: Verify schema exists (tables from sqlite-schema.ts)
    throw new NotImplementedError("SQLiteFeatureStore.initialize");
  }

  // -------------------------------------------------------------------------
  // WRITE OPERATIONS
  // -------------------------------------------------------------------------

  async store<T extends DerivedFeature>(
    _feature: T,
    _sourceEventIds: readonly EventId[],
    _computation: ComputationMetadata,
  ): Promise<FeatureRecord<T>> {
    // TODO: Implement using transaction:
    // 1. Generate feature ID
    // 2. INSERT INTO lkgc_features
    // 3. For each sourceEventId, INSERT INTO lkgc_event_feature_mapping
    // 4. Return FeatureRecord
    throw new NotImplementedError("SQLiteFeatureStore.store");
  }

  async storeBatch<T extends DerivedFeature>(
    _features: ReadonlyArray<{
      feature: T;
      sourceEventIds: readonly EventId[];
      computation: ComputationMetadata;
    }>,
  ): Promise<readonly FeatureRecord<T>[]> {
    // TODO: Implement using transaction with batch inserts
    throw new NotImplementedError("SQLiteFeatureStore.storeBatch");
  }

  async invalidate(_featureIds: readonly EntityId[]): Promise<void> {
    // TODO: Implement using:
    // UPDATE lkgc_features SET invalidated = 1, invalidated_at = ? WHERE feature_id IN (...)
    throw new NotImplementedError("SQLiteFeatureStore.invalidate");
  }

  // -------------------------------------------------------------------------
  // READ OPERATIONS - By Type
  // -------------------------------------------------------------------------

  async getAttemptFeatures(
    _attemptId: ReviewAttemptId,
  ): Promise<FeatureRecord<AttemptFeatures> | null> {
    // TODO: Implement using:
    // SELECT * FROM lkgc_features WHERE granularity = 'attempt' AND window_label = ? AND invalidated = 0
    throw new NotImplementedError("SQLiteFeatureStore.getAttemptFeatures");
  }

  async getSessionFeatures(
    _sessionId: SessionId,
  ): Promise<FeatureRecord<SessionFeatures> | null> {
    // TODO: Implement using:
    // SELECT * FROM lkgc_features WHERE granularity = 'session' AND session_id = ? AND invalidated = 0
    throw new NotImplementedError("SQLiteFeatureStore.getSessionFeatures");
  }

  async getDailyFeatures(
    _date: string,
  ): Promise<FeatureRecord<DailyFeatures> | null> {
    // TODO: Implement using:
    // SELECT * FROM lkgc_features WHERE granularity = 'day' AND date_key = ? AND invalidated = 0
    throw new NotImplementedError("SQLiteFeatureStore.getDailyFeatures");
  }

  async getWeeklyFeatures(
    _year: number,
    _weekNumber: number,
  ): Promise<FeatureRecord<WeeklyFeatures> | null> {
    // TODO: Implement using:
    // SELECT * FROM lkgc_features WHERE granularity = 'week' AND week_key = ? AND invalidated = 0
    throw new NotImplementedError("SQLiteFeatureStore.getWeeklyFeatures");
  }

  // -------------------------------------------------------------------------
  // READ OPERATIONS - Queries
  // -------------------------------------------------------------------------

  async query<T extends DerivedFeature>(
    _options: FeatureQueryOptions,
  ): Promise<FeatureQueryResult<T>> {
    // TODO: Implement using dynamic SQL construction
    throw new NotImplementedError("SQLiteFeatureStore.query");
  }

  async getNodeFeatureHistory(
    _nodeId: NodeId,
    _options?: Omit<FeatureQueryOptions, "nodeId">,
  ): Promise<FeatureQueryResult<AttemptFeatures>> {
    // TODO: Implement using query() with nodeId and granularity = 'attempt'
    throw new NotImplementedError("SQLiteFeatureStore.getNodeFeatureHistory");
  }

  async getSessionFeatureBundle(
    _sessionId: SessionId,
  ): Promise<SessionFeatureBundle> {
    // TODO: Implement using:
    // 1. Get session feature
    // 2. Get all attempt features for session
    // 3. Count unique source events
    throw new NotImplementedError("SQLiteFeatureStore.getSessionFeatureBundle");
  }

  // -------------------------------------------------------------------------
  // TRACEABILITY OPERATIONS
  // -------------------------------------------------------------------------

  async getFeaturesFromEvent(
    _eventId: EventId,
  ): Promise<readonly FeatureRecord[]> {
    // TODO: Implement using:
    // SELECT f.* FROM lkgc_features f
    // JOIN lkgc_event_feature_mapping m ON f.feature_id = m.feature_id
    // WHERE m.event_id = ?
    throw new NotImplementedError("SQLiteFeatureStore.getFeaturesFromEvent");
  }

  async getSourceEvents(_featureId: EntityId): Promise<readonly EventId[]> {
    // TODO: Implement using:
    // SELECT event_id FROM lkgc_event_feature_mapping WHERE feature_id = ?
    throw new NotImplementedError("SQLiteFeatureStore.getSourceEvents");
  }

  // -------------------------------------------------------------------------
  // AGGREGATION OPERATIONS
  // -------------------------------------------------------------------------

  async getLatestFeatures(): Promise<LatestFeatures> {
    // TODO: Implement using subqueries with MAX(period_start)
    throw new NotImplementedError("SQLiteFeatureStore.getLatestFeatures");
  }

  async getStatistics(): Promise<FeatureStatistics> {
    // TODO: Implement using aggregate queries
    throw new NotImplementedError("SQLiteFeatureStore.getStatistics");
  }
}
