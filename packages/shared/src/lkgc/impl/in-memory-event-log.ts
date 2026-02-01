// =============================================================================
// IN-MEMORY EVENT LOG - For Testing
// =============================================================================
// A simple in-memory implementation of the EventLog interface.
// Suitable for unit tests and development.
// NOT for production use - data is lost when the process exits.
// =============================================================================

import { createHash } from "crypto";
import type {
  EventId,
  SessionId,
  NodeId,
  Timestamp,
  EntityId,
} from "../../types/lkgc/foundation";
import type { LKGCEvent } from "../../types/lkgc/events";
import type {
  SubscribableEventLog,
  EventRecord,
  EventProcessingStatus,
  EventQueryOptions,
  EventQueryResult,
  AppendResult,
  AppendError,
  EventSubscriber,
  EventSubscription,
  ExportedEventLog,
  TimeRange,
} from "../event-log";
import type { EventValidator, ValidationContext } from "../event-validator";

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * In-memory implementation of EventLog
 */
export class InMemoryEventLog implements SubscribableEventLog {
  /** Event storage (Map for O(1) lookup by ID) */
  private readonly events: Map<EventId, EventRecord> = new Map();

  /** Events in sequence order */
  private readonly eventsBySequence: EventRecord[] = [];

  /** Index: session ID -> event IDs */
  private readonly sessionIndex: Map<SessionId, EventId[]> = new Map();

  /** Index: node ID -> event IDs */
  private readonly nodeIndex: Map<NodeId, EventId[]> = new Map();

  /** Current sequence number */
  private currentSequence = 0;

  /** Subscribers for real-time events */
  private readonly subscribers: Map<
    string,
    {
      callback: EventSubscriber;
      filter?: Pick<EventQueryOptions, "categories" | "eventTypes">;
    }
  > = new Map();

  /** Optional validator */
  private readonly validator?: EventValidator;

  constructor(options?: { validator?: EventValidator }) {
    this.validator = options?.validator;
  }

  // -------------------------------------------------------------------------
  // WRITE OPERATIONS
  // -------------------------------------------------------------------------

  async append(event: LKGCEvent): Promise<AppendResult> {
    return this.appendBatch([event]);
  }

  async appendBatch(events: readonly LKGCEvent[]): Promise<AppendResult> {
    const records: EventRecord[] = [];
    const errors: AppendError[] = [];
    const batchId =
      `batch_${Date.now()}_${Math.random().toString(36).slice(2)}` as EntityId;

    for (const event of events) {
      // Check for duplicate
      if (this.events.has(event.id)) {
        errors.push({
          event,
          code: "DUPLICATE_EVENT_ID",
          message: `Event with ID ${event.id} already exists`,
        });
        continue;
      }

      // Validate if validator is configured
      if (this.validator) {
        const result = await this.validator.validate(event);
        if (!result.valid) {
          errors.push({
            event,
            code: "VALIDATION_FAILED",
            message: result.errors.map((e) => e.message).join("; "),
          });
          continue;
        }
      }

      // Create record
      const record: EventRecord = {
        eventId: event.id,
        event,
        receivedAt: Date.now() as Timestamp,
        status: "pending",
        sequenceNumber: ++this.currentSequence,
        eventHash: this.computeHash(event),
      };

      // Store
      this.events.set(event.id, record);
      this.eventsBySequence.push(record);

      // Update indexes
      if (event.sessionId) {
        const sessionEvents = this.sessionIndex.get(event.sessionId) || [];
        sessionEvents.push(event.id);
        this.sessionIndex.set(event.sessionId, sessionEvents);
      }

      // Index by node ID if present
      const nodeId = this.extractNodeId(event);
      if (nodeId) {
        const nodeEvents = this.nodeIndex.get(nodeId) || [];
        nodeEvents.push(event.id);
        this.nodeIndex.set(nodeId, nodeEvents);
      }

      records.push(record);

      // Notify subscribers
      this.notifySubscribers(record);
    }

    return {
      success: errors.length === 0,
      records,
      errors,
      batchId,
    };
  }

  // -------------------------------------------------------------------------
  // READ OPERATIONS
  // -------------------------------------------------------------------------

  async getById(eventId: EventId): Promise<EventRecord | null> {
    return this.events.get(eventId) ?? null;
  }

  async query(options: EventQueryOptions): Promise<EventQueryResult> {
    let results = [...this.eventsBySequence];

    // Apply filters
    if (options.timeRange) {
      results = results.filter((r) => {
        if (
          options.timeRange?.start &&
          r.event.timestamp < options.timeRange.start
        ) {
          return false;
        }
        if (
          options.timeRange?.end &&
          r.event.timestamp >= options.timeRange.end
        ) {
          return false;
        }
        return true;
      });
    }

    if (options.categories?.length) {
      results = results.filter((r) =>
        options.categories!.includes(r.event.category),
      );
    }

    if (options.eventTypes?.length) {
      results = results.filter((r) =>
        options.eventTypes!.includes(r.event.eventType),
      );
    }

    if (options.sessionId) {
      results = results.filter((r) => r.event.sessionId === options.sessionId);
    }

    if (options.nodeId) {
      const nodeEvents = this.nodeIndex.get(options.nodeId) || [];
      const nodeEventSet = new Set(nodeEvents);
      results = results.filter((r) => nodeEventSet.has(r.eventId));
    }

    if (options.status) {
      results = results.filter((r) => r.status === options.status);
    }

    if (options.afterSequence !== undefined) {
      results = results.filter(
        (r) => r.sequenceNumber > options.afterSequence!,
      );
    }

    if (options.beforeSequence !== undefined) {
      results = results.filter(
        (r) => r.sequenceNumber < options.beforeSequence!,
      );
    }

    // Sort
    if (options.order === "desc") {
      results.reverse();
    }

    const totalCount = results.length;

    // Pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? results.length;
    results = results.slice(offset, offset + limit);

    return {
      events: results,
      totalCount,
      hasMore: offset + results.length < totalCount,
      maxSequence:
        results.length > 0
          ? Math.max(...results.map((r) => r.sequenceNumber))
          : 0,
    };
  }

  async getBySession(sessionId: SessionId): Promise<readonly EventRecord[]> {
    const eventIds = this.sessionIndex.get(sessionId) || [];
    return eventIds
      .map((id) => this.events.get(id)!)
      .filter(Boolean)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  async getByNode(
    nodeId: NodeId,
    options?: Omit<EventQueryOptions, "nodeId">,
  ): Promise<EventQueryResult> {
    return this.query({ ...options, nodeId });
  }

  async getAfterSequence(
    afterSequence: number,
    limit?: number,
  ): Promise<readonly EventRecord[]> {
    const result = await this.query({ afterSequence, limit, order: "asc" });
    return result.events;
  }

  // -------------------------------------------------------------------------
  // STATUS OPERATIONS
  // -------------------------------------------------------------------------

  async updateStatus(
    eventId: EventId,
    status: EventProcessingStatus,
    error?: string,
  ): Promise<void> {
    const record = this.events.get(eventId);
    if (!record) {
      throw new Error(`Event ${eventId} not found`);
    }

    // Create updated record (immutable update pattern)
    const updatedRecord: EventRecord = {
      ...record,
      status,
      processedAt:
        status === "processed" || status === "failed"
          ? (Date.now() as Timestamp)
          : undefined,
      processingError: error,
    };

    // Replace in map
    this.events.set(eventId, updatedRecord);

    // Update in sequence array
    const index = this.eventsBySequence.findIndex((r) => r.eventId === eventId);
    if (index >= 0) {
      this.eventsBySequence[index] = updatedRecord;
    }
  }

  // -------------------------------------------------------------------------
  // METADATA OPERATIONS
  // -------------------------------------------------------------------------

  async getCurrentSequence(): Promise<number> {
    return this.currentSequence;
  }

  async getStatusCounts(): Promise<Record<EventProcessingStatus, number>> {
    const counts: Record<EventProcessingStatus, number> = {
      pending: 0,
      validated: 0,
      processed: 0,
      failed: 0,
      skipped: 0,
    };

    for (const record of this.events.values()) {
      counts[record.status]++;
    }

    return counts;
  }

  async getLastEventTimestamp(): Promise<Timestamp | null> {
    if (this.eventsBySequence.length === 0) {
      return null;
    }
    return this.eventsBySequence[this.eventsBySequence.length - 1].event
      .timestamp;
  }

  // -------------------------------------------------------------------------
  // REPLAY OPERATIONS
  // -------------------------------------------------------------------------

  async *replay(options?: EventQueryOptions): AsyncIterable<EventRecord> {
    const result = await this.query({ ...options, order: "asc" });
    for (const record of result.events) {
      yield record;
    }
  }

  async export(options?: EventQueryOptions): Promise<ExportedEventLog> {
    const result = await this.query({ ...options, order: "asc" });
    const events = result.events;

    const timeRange: TimeRange = {
      start: events.length > 0 ? events[0].event.timestamp : undefined,
      end:
        events.length > 0
          ? events[events.length - 1].event.timestamp
          : undefined,
    };

    const checksum = this.computeChecksum(events);

    return {
      version: 1,
      exportedAt: Date.now() as Timestamp,
      eventCount: events.length,
      timeRange,
      events,
      checksum,
    };
  }

  // -------------------------------------------------------------------------
  // SUBSCRIPTION OPERATIONS
  // -------------------------------------------------------------------------

  subscribe(
    subscriber: EventSubscriber,
    filter?: Pick<EventQueryOptions, "categories" | "eventTypes">,
  ): EventSubscription {
    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.subscribers.set(id, { callback: subscriber, filter });

    return {
      id,
      unsubscribe: () => {
        this.subscribers.delete(id);
      },
    };
  }

  // -------------------------------------------------------------------------
  // HELPER METHODS
  // -------------------------------------------------------------------------

  private computeHash(event: LKGCEvent): string {
    const content = JSON.stringify(event);
    return createHash("sha256").update(content).digest("hex");
  }

  private computeChecksum(events: readonly EventRecord[]): string {
    const hashes = events.map((e) => e.eventHash).join("");
    return createHash("sha256").update(hashes).digest("hex");
  }

  private extractNodeId(event: LKGCEvent): NodeId | undefined {
    // Extract nodeId from various event types
    // We need to cast through unknown since LKGCEvent is a discriminated union
    const e = event as unknown as Record<string, unknown>;
    return (e.cardId ?? e.nodeId ?? e.entryNodeId) as NodeId | undefined;
  }

  private notifySubscribers(record: EventRecord): void {
    for (const { callback, filter } of this.subscribers.values()) {
      // Check filter
      if (
        filter?.categories?.length &&
        !filter.categories.includes(record.event.category)
      ) {
        continue;
      }
      if (
        filter?.eventTypes?.length &&
        !filter.eventTypes.includes(record.event.eventType)
      ) {
        continue;
      }

      // Notify (async, don't await)
      Promise.resolve(callback(record)).catch((err) => {
        console.error("Subscriber error:", err);
      });
    }
  }

  // -------------------------------------------------------------------------
  // TESTING UTILITIES
  // -------------------------------------------------------------------------

  /**
   * Clear all events (for testing only)
   */
  clear(): void {
    this.events.clear();
    this.eventsBySequence.length = 0;
    this.sessionIndex.clear();
    this.nodeIndex.clear();
    this.currentSequence = 0;
  }

  /**
   * Get total event count
   */
  get size(): number {
    return this.events.size;
  }
}

/**
 * Create a simple validation context for testing
 */
export function createTestValidationContext(
  options?: Partial<{
    existingEventIds: Set<EventId>;
    existingSessionIds: Set<SessionId>;
    existingNodeIds: Set<NodeId>;
    maxTimestampSkew: number;
    supportedSchemaVersions: number[];
  }>,
): ValidationContext {
  const now = Date.now() as Timestamp;
  const oneYearAgo = (now - 365 * 24 * 60 * 60 * 1000) as Timestamp;

  return {
    eventExists: async (eventId) =>
      options?.existingEventIds?.has(eventId) ?? false,
    sessionExists: async (sessionId) =>
      options?.existingSessionIds?.has(sessionId) ?? true,
    nodeExists: async (nodeId) => options?.existingNodeIds?.has(nodeId) ?? true,
    getCurrentTimestamp: () => now,
    getMaxTimestampSkew: () => options?.maxTimestampSkew ?? 60000, // 1 minute
    getMinTimestamp: () => oneYearAgo,
    getSupportedSchemaVersions: () => options?.supportedSchemaVersions ?? [1],
  };
}
