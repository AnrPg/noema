// =============================================================================
// IN-MEMORY FEATURE STORE - For Testing
// =============================================================================
// A simple in-memory implementation of the FeatureStore interface.
// Suitable for unit tests and development.
// NOT for production use - data is lost when the process exits.
// =============================================================================

import type {
  EntityId,
  EventId,
  SessionId,
  NodeId,
  Timestamp,
} from "../../types/lkgc/foundation";
import type {
  FeatureGranularity,
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
  FeatureWindow,
} from "../feature-store";

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * In-memory implementation of FeatureStore
 */
export class InMemoryFeatureStore implements FeatureStore {
  /** Feature storage by ID */
  private readonly features: Map<EntityId, FeatureRecord> = new Map();

  /** Index: event ID -> feature IDs (for traceability) */
  private readonly eventToFeatures: Map<EventId, EntityId[]> = new Map();

  /** Index: session ID -> feature IDs */
  private readonly sessionFeatures: Map<SessionId, EntityId[]> = new Map();

  /** Index: node ID -> feature IDs */
  private readonly nodeFeatures: Map<NodeId, EntityId[]> = new Map();

  /** Index: attempt ID -> feature ID */
  private readonly attemptFeatures: Map<string, EntityId> = new Map();

  /** Index: daily key -> feature ID */
  private readonly dailyFeatures: Map<string, EntityId> = new Map();

  /** Index: weekly key -> feature ID */
  private readonly weeklyFeatures: Map<string, EntityId> = new Map();

  /** Feature ID counter */
  private featureIdCounter = 0;

  /** Computation version counter */
  private computationVersion = 0;

  // -------------------------------------------------------------------------
  // WRITE OPERATIONS
  // -------------------------------------------------------------------------

  async store<T extends DerivedFeature>(
    feature: T,
    sourceEventIds: readonly EventId[],
    computation: ComputationMetadata,
  ): Promise<FeatureRecord<T>> {
    const featureId = this.generateFeatureId();
    const now = Date.now() as Timestamp;

    const window = this.createWindowFromFeature(feature);

    const record: FeatureRecord<T> = {
      featureId,
      feature,
      computedAt: now,
      computationVersion: ++this.computationVersion,
      sourceEventIds,
      window,
      computation,
    };

    // Store the feature
    this.features.set(featureId, record as FeatureRecord);

    // Update event -> feature index
    for (const eventId of sourceEventIds) {
      const featureIds = this.eventToFeatures.get(eventId) || [];
      featureIds.push(featureId);
      this.eventToFeatures.set(eventId, featureIds);
    }

    // Update granularity-specific indexes
    this.updateIndexes(record as FeatureRecord);

    return record;
  }

  async storeBatch<T extends DerivedFeature>(
    features: ReadonlyArray<{
      feature: T;
      sourceEventIds: readonly EventId[];
      computation: ComputationMetadata;
    }>,
  ): Promise<readonly FeatureRecord<T>[]> {
    const records: FeatureRecord<T>[] = [];
    for (const { feature, sourceEventIds, computation } of features) {
      const record = await this.store(feature, sourceEventIds, computation);
      records.push(record);
    }
    return records;
  }

  async invalidate(featureIds: readonly EntityId[]): Promise<void> {
    for (const featureId of featureIds) {
      const record = this.features.get(featureId);
      if (record) {
        // Mark as invalidated by removing from indexes but keeping record
        // In a real implementation, you'd mark it with a flag
        this.removeFromIndexes(record);
      }
    }
  }

  // -------------------------------------------------------------------------
  // READ OPERATIONS - By Type
  // -------------------------------------------------------------------------

  async getAttemptFeatures(
    attemptId: ReviewAttemptId,
  ): Promise<FeatureRecord<AttemptFeatures> | null> {
    const featureId = this.attemptFeatures.get(attemptId as unknown as string);
    if (!featureId) return null;
    return (
      (this.features.get(featureId) as FeatureRecord<AttemptFeatures>) ?? null
    );
  }

  async getSessionFeatures(
    sessionId: SessionId,
  ): Promise<FeatureRecord<SessionFeatures> | null> {
    const featureIds = this.sessionFeatures.get(sessionId) || [];
    for (const featureId of featureIds) {
      const record = this.features.get(featureId);
      if (record && record.feature.granularity === "session") {
        return record as FeatureRecord<SessionFeatures>;
      }
    }
    return null;
  }

  async getDailyFeatures(
    date: string,
  ): Promise<FeatureRecord<DailyFeatures> | null> {
    const featureId = this.dailyFeatures.get(date);
    if (!featureId) return null;
    return (
      (this.features.get(featureId) as FeatureRecord<DailyFeatures>) ?? null
    );
  }

  async getWeeklyFeatures(
    year: number,
    weekNumber: number,
  ): Promise<FeatureRecord<WeeklyFeatures> | null> {
    const key = `${year}-W${weekNumber.toString().padStart(2, "0")}`;
    const featureId = this.weeklyFeatures.get(key);
    if (!featureId) return null;
    return (
      (this.features.get(featureId) as FeatureRecord<WeeklyFeatures>) ?? null
    );
  }

  // -------------------------------------------------------------------------
  // READ OPERATIONS - Queries
  // -------------------------------------------------------------------------

  async query<T extends DerivedFeature>(
    options: FeatureQueryOptions,
  ): Promise<FeatureQueryResult<T>> {
    let results = [...this.features.values()];

    // Apply filters
    if (options.granularity) {
      results = results.filter(
        (r) => r.feature.granularity === options.granularity,
      );
    }

    if (options.timeRange) {
      results = results.filter((r) => {
        if (
          options.timeRange?.start &&
          r.window.end <= options.timeRange.start
        ) {
          return false;
        }
        if (options.timeRange?.end && r.window.start >= options.timeRange.end) {
          return false;
        }
        return true;
      });
    }

    if (options.sessionId) {
      const sessionFeatureIds = new Set(
        this.sessionFeatures.get(options.sessionId) || [],
      );
      results = results.filter((r) => sessionFeatureIds.has(r.featureId));
    }

    if (options.nodeId) {
      const nodeFeatureIds = new Set(
        this.nodeFeatures.get(options.nodeId) || [],
      );
      results = results.filter((r) => nodeFeatureIds.has(r.featureId));
    }

    // Sort by period start
    results.sort((a, b) =>
      options.order === "desc"
        ? b.window.start - a.window.start
        : a.window.start - b.window.start,
    );

    const totalCount = results.length;

    // Pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? results.length;
    results = results.slice(offset, offset + limit);

    return {
      features: results as FeatureRecord<T>[],
      totalCount,
      hasMore: offset + results.length < totalCount,
    };
  }

  async getNodeFeatureHistory(
    nodeId: NodeId,
    options?: Omit<FeatureQueryOptions, "nodeId">,
  ): Promise<FeatureQueryResult<AttemptFeatures>> {
    return this.query<AttemptFeatures>({
      ...options,
      nodeId,
      granularity: "attempt",
    });
  }

  async getSessionFeatureBundle(
    sessionId: SessionId,
  ): Promise<SessionFeatureBundle> {
    const featureIds = this.sessionFeatures.get(sessionId) || [];
    const features = featureIds
      .map((id) => this.features.get(id)!)
      .filter(Boolean);

    const sessionFeature = features.find(
      (f) => f.feature.granularity === "session",
    ) as FeatureRecord<SessionFeatures> | undefined;

    const attemptFeatures = features.filter(
      (f) => f.feature.granularity === "attempt",
    ) as FeatureRecord<AttemptFeatures>[];

    const allEventIds = new Set<EventId>();
    for (const f of features) {
      for (const eventId of f.sourceEventIds) {
        allEventIds.add(eventId);
      }
    }

    return {
      sessionFeature: sessionFeature ?? null,
      attemptFeatures,
      totalEvents: allEventIds.size,
    };
  }

  // -------------------------------------------------------------------------
  // TRACEABILITY OPERATIONS
  // -------------------------------------------------------------------------

  async getFeaturesFromEvent(
    eventId: EventId,
  ): Promise<readonly FeatureRecord[]> {
    const featureIds = this.eventToFeatures.get(eventId) || [];
    return featureIds.map((id) => this.features.get(id)!).filter(Boolean);
  }

  async getSourceEvents(featureId: EntityId): Promise<readonly EventId[]> {
    const record = this.features.get(featureId);
    return record?.sourceEventIds ?? [];
  }

  // -------------------------------------------------------------------------
  // AGGREGATION OPERATIONS
  // -------------------------------------------------------------------------

  async getLatestFeatures(): Promise<LatestFeatures> {
    let latestDaily: FeatureRecord<DailyFeatures> | null = null;
    let latestWeekly: FeatureRecord<WeeklyFeatures> | null = null;
    let latestSession: FeatureRecord<SessionFeatures> | null = null;

    for (const record of this.features.values()) {
      if (record.feature.granularity === "day") {
        if (!latestDaily || record.window.start > latestDaily.window.start) {
          latestDaily = record as FeatureRecord<DailyFeatures>;
        }
      } else if (record.feature.granularity === "week") {
        if (!latestWeekly || record.window.start > latestWeekly.window.start) {
          latestWeekly = record as FeatureRecord<WeeklyFeatures>;
        }
      } else if (record.feature.granularity === "session") {
        if (
          !latestSession ||
          record.window.start > latestSession.window.start
        ) {
          latestSession = record as FeatureRecord<SessionFeatures>;
        }
      }
    }

    return {
      latestDaily,
      latestWeekly,
      latestSession,
      totalFeatureCount: this.features.size,
    };
  }

  async getStatistics(): Promise<FeatureStatistics> {
    const countByGranularity: Record<FeatureGranularity, number> = {
      attempt: 0,
      session: 0,
      day: 0,
      week: 0,
      month: 0,
    };

    const eventsByGranularity: Record<FeatureGranularity, number> = {
      attempt: 0,
      session: 0,
      day: 0,
      week: 0,
      month: 0,
    };

    let oldest: Timestamp | null = null;
    let newest: Timestamp | null = null;
    const allEventIds = new Set<EventId>();

    for (const record of this.features.values()) {
      countByGranularity[record.feature.granularity]++;
      eventsByGranularity[record.feature.granularity] +=
        record.sourceEventIds.length;

      for (const eventId of record.sourceEventIds) {
        allEventIds.add(eventId);
      }

      if (!oldest || record.window.start < oldest) {
        oldest = record.window.start;
      }
      if (!newest || record.window.end > newest) {
        newest = record.window.end;
      }
    }

    const avgEventsPerFeature: Record<FeatureGranularity, number> = {
      attempt: countByGranularity.attempt
        ? eventsByGranularity.attempt / countByGranularity.attempt
        : 0,
      session: countByGranularity.session
        ? eventsByGranularity.session / countByGranularity.session
        : 0,
      day: countByGranularity.day
        ? eventsByGranularity.day / countByGranularity.day
        : 0,
      week: countByGranularity.week
        ? eventsByGranularity.week / countByGranularity.week
        : 0,
      month: countByGranularity.month
        ? eventsByGranularity.month / countByGranularity.month
        : 0,
    };

    return {
      countByGranularity,
      totalSourceEvents: allEventIds.size,
      avgEventsPerFeature,
      oldestFeature: oldest,
      newestFeature: newest,
      invalidatedCount: 0, // In-memory doesn't track invalidated
    };
  }

  // -------------------------------------------------------------------------
  // HELPER METHODS
  // -------------------------------------------------------------------------

  private generateFeatureId(): EntityId {
    return `feature_${Date.now()}_${++this.featureIdCounter}` as EntityId;
  }

  private createWindowFromFeature(feature: DerivedFeature): FeatureWindow {
    return {
      start: feature.periodStart,
      end: feature.periodEnd,
      granularity: feature.granularity,
      label: this.createWindowLabel(feature),
    };
  }

  private createWindowLabel(feature: DerivedFeature): string {
    switch (feature.granularity) {
      case "attempt":
        return (feature as AttemptFeatures).cardId as string;
      case "session":
        return (feature as SessionFeatures).sessionId as string;
      case "day":
        return (feature as DailyFeatures).date;
      case "week": {
        const w = feature as WeeklyFeatures;
        return `${w.year}-W${w.weekNumber.toString().padStart(2, "0")}`;
      }
    }
  }

  private updateIndexes(record: FeatureRecord): void {
    const feature = record.feature;

    switch (feature.granularity) {
      case "attempt": {
        const af = feature as AttemptFeatures;
        this.attemptFeatures.set(record.featureId as string, record.featureId);

        // Update node index
        const nodeFeatureIds = this.nodeFeatures.get(af.cardId) || [];
        nodeFeatureIds.push(record.featureId);
        this.nodeFeatures.set(af.cardId, nodeFeatureIds);

        // Update session index
        const sessionFeatureIds = this.sessionFeatures.get(af.sessionId) || [];
        sessionFeatureIds.push(record.featureId);
        this.sessionFeatures.set(af.sessionId, sessionFeatureIds);
        break;
      }
      case "session": {
        const sf = feature as SessionFeatures;
        const sessionFeatureIds = this.sessionFeatures.get(sf.sessionId) || [];
        sessionFeatureIds.push(record.featureId);
        this.sessionFeatures.set(sf.sessionId, sessionFeatureIds);
        break;
      }
      case "day": {
        const df = feature as DailyFeatures;
        this.dailyFeatures.set(df.date, record.featureId);
        break;
      }
      case "week": {
        const wf = feature as WeeklyFeatures;
        const key = `${wf.year}-W${wf.weekNumber.toString().padStart(2, "0")}`;
        this.weeklyFeatures.set(key, record.featureId);
        break;
      }
    }
  }

  private removeFromIndexes(record: FeatureRecord): void {
    // Remove from event index
    for (const eventId of record.sourceEventIds) {
      const featureIds = this.eventToFeatures.get(eventId);
      if (featureIds) {
        const index = featureIds.indexOf(record.featureId);
        if (index >= 0) {
          featureIds.splice(index, 1);
        }
      }
    }

    // Remove from granularity-specific indexes (simplified)
    // In a real implementation, you'd want more thorough cleanup
  }

  // -------------------------------------------------------------------------
  // TESTING UTILITIES
  // -------------------------------------------------------------------------

  /**
   * Clear all features (for testing only)
   */
  clear(): void {
    this.features.clear();
    this.eventToFeatures.clear();
    this.sessionFeatures.clear();
    this.nodeFeatures.clear();
    this.attemptFeatures.clear();
    this.dailyFeatures.clear();
    this.weeklyFeatures.clear();
    this.featureIdCounter = 0;
  }

  /**
   * Get total feature count
   */
  get size(): number {
    return this.features.size;
  }
}
