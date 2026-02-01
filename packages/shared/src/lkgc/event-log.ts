// =============================================================================
// EVENT LOG - Append-Only Event Storage Abstraction
// =============================================================================
// The EventLog is the foundational abstraction for all event ingestion.
// Events are IMMUTABLE once written. This is the source of truth for all
// derived state in the LKGC system.
//
// Implementations:
// - InMemoryEventLog (for testing)
// - SQLiteEventLog (for production)
// =============================================================================

import type {
  EventId,
  SessionId,
  NodeId,
  Timestamp,
  EntityId,
} from "../types/lkgc/foundation";
import type { LKGCEvent, EventCategory } from "../types/lkgc/events";

// =============================================================================
// EVENT ENVELOPE - Mandatory wrapper for all events
// =============================================================================

/**
 * Processing status for an event
 */
export type EventProcessingStatus =
  | "pending" // Received but not yet processed
  | "validated" // Passed validation
  | "processed" // Fully processed (features extracted)
  | "failed" // Processing failed
  | "skipped"; // Intentionally skipped (e.g., duplicate)

/**
 * Immutable event record as stored in the log
 * This wraps the LKGCEvent with storage metadata
 */
export interface EventRecord {
  /** The event ID (from the event itself) */
  readonly eventId: EventId;

  /** The actual event data (immutable) */
  readonly event: LKGCEvent;

  /** When this record was received by the event log */
  readonly receivedAt: Timestamp;

  /** Processing status */
  readonly status: EventProcessingStatus;

  /** When processing completed (if applicable) */
  readonly processedAt?: Timestamp;

  /** Error message if processing failed */
  readonly processingError?: string;

  /** Local sequence number (monotonic, for ordering) */
  readonly sequenceNumber: number;

  /** Hash of the event for integrity verification */
  readonly eventHash: string;
}

// =============================================================================
// QUERY INTERFACES
// =============================================================================

/**
 * Time range for queries
 */
export interface TimeRange {
  readonly start?: Timestamp;
  readonly end?: Timestamp;
}

/**
 * Query options for retrieving events
 */
export interface EventQueryOptions {
  /** Filter by time range */
  readonly timeRange?: TimeRange;

  /** Filter by event categories */
  readonly categories?: readonly EventCategory[];

  /** Filter by event types (e.g., "review_completed") */
  readonly eventTypes?: readonly string[];

  /** Filter by session ID */
  readonly sessionId?: SessionId;

  /** Filter by node ID (for node-related events) */
  readonly nodeId?: NodeId;

  /** Filter by processing status */
  readonly status?: EventProcessingStatus;

  /** Maximum number of events to return */
  readonly limit?: number;

  /** Offset for pagination */
  readonly offset?: number;

  /** Sort order */
  readonly order?: "asc" | "desc";

  /** Include only events after this sequence number */
  readonly afterSequence?: number;

  /** Include only events before this sequence number */
  readonly beforeSequence?: number;
}

/**
 * Result of an event query
 */
export interface EventQueryResult {
  /** The matching events */
  readonly events: readonly EventRecord[];

  /** Total count (before limit/offset) */
  readonly totalCount: number;

  /** Whether there are more events */
  readonly hasMore: boolean;

  /** The highest sequence number in results */
  readonly maxSequence: number;
}

/**
 * Batch of events for bulk operations
 * (Named EventLogBatch to avoid conflict with aggregation.ts EventBatch)
 */
export interface EventLogBatch {
  /** Unique ID for this batch */
  readonly batchId: EntityId;

  /** Events in the batch */
  readonly events: readonly LKGCEvent[];

  /** When the batch was created */
  readonly createdAt: Timestamp;
}

/**
 * Result of appending events
 */
export interface AppendResult {
  /** Whether the operation succeeded */
  readonly success: boolean;

  /** Event records that were created */
  readonly records: readonly EventRecord[];

  /** Errors for any events that failed validation */
  readonly errors: readonly AppendError[];

  /** The batch ID if batched */
  readonly batchId?: EntityId;
}

/**
 * Error during append operation
 */
export interface AppendError {
  /** The event that failed */
  readonly event: LKGCEvent;

  /** Error code */
  readonly code: AppendErrorCode;

  /** Human-readable error message */
  readonly message: string;
}

export type AppendErrorCode =
  | "DUPLICATE_EVENT_ID" // Event with this ID already exists
  | "VALIDATION_FAILED" // Event failed validation
  | "STORAGE_ERROR" // Storage layer error
  | "INVALID_TIMESTAMP" // Timestamp is invalid or in the future
  | "INVALID_PROVENANCE" // Provenance data is invalid
  | "SCHEMA_VERSION_MISMATCH"; // Schema version not supported

// =============================================================================
// EVENT LOG INTERFACE
// =============================================================================

/**
 * EventLog - The append-only event storage abstraction
 *
 * This is the single source of truth for all events in the LKGC system.
 * Events are immutable once written. All state is derived from this log.
 */
export interface EventLog {
  // -------------------------------------------------------------------------
  // WRITE OPERATIONS (append-only)
  // -------------------------------------------------------------------------

  /**
   * Append a single event to the log
   * @param event The event to append
   * @returns Result with the created record or error
   */
  append(event: LKGCEvent): Promise<AppendResult>;

  /**
   * Append multiple events atomically
   * @param events The events to append
   * @returns Result with created records or errors
   */
  appendBatch(events: readonly LKGCEvent[]): Promise<AppendResult>;

  // -------------------------------------------------------------------------
  // READ OPERATIONS
  // -------------------------------------------------------------------------

  /**
   * Get a single event by ID
   * @param eventId The event ID
   * @returns The event record or null if not found
   */
  getById(eventId: EventId): Promise<EventRecord | null>;

  /**
   * Query events with filters
   * @param options Query options
   * @returns Query result with matching events
   */
  query(options: EventQueryOptions): Promise<EventQueryResult>;

  /**
   * Get events for a specific session
   * @param sessionId The session ID
   * @returns All events for that session in order
   */
  getBySession(sessionId: SessionId): Promise<readonly EventRecord[]>;

  /**
   * Get events related to a specific node
   * @param nodeId The node ID
   * @param options Additional query options
   * @returns Events related to that node
   */
  getByNode(
    nodeId: NodeId,
    options?: Omit<EventQueryOptions, "nodeId">,
  ): Promise<EventQueryResult>;

  /**
   * Get events since a sequence number (for sync/replay)
   * @param afterSequence Get events after this sequence number
   * @param limit Maximum number of events to return
   * @returns Events in order
   */
  getAfterSequence(
    afterSequence: number,
    limit?: number,
  ): Promise<readonly EventRecord[]>;

  // -------------------------------------------------------------------------
  // STATUS OPERATIONS
  // -------------------------------------------------------------------------

  /**
   * Update the processing status of an event
   * This is the ONLY mutation allowed on event records
   * @param eventId The event ID
   * @param status New status
   * @param error Optional error message if status is 'failed'
   */
  updateStatus(
    eventId: EventId,
    status: EventProcessingStatus,
    error?: string,
  ): Promise<void>;

  // -------------------------------------------------------------------------
  // METADATA OPERATIONS
  // -------------------------------------------------------------------------

  /**
   * Get the current sequence number (highest assigned)
   */
  getCurrentSequence(): Promise<number>;

  /**
   * Get event count by status
   */
  getStatusCounts(): Promise<Record<EventProcessingStatus, number>>;

  /**
   * Get the timestamp of the most recent event
   */
  getLastEventTimestamp(): Promise<Timestamp | null>;

  // -------------------------------------------------------------------------
  // REPLAY OPERATIONS (for debugging, ML, auditing)
  // -------------------------------------------------------------------------

  /**
   * Create an iterator for replaying events in order
   * @param options Query options to filter which events to replay
   * @returns Async iterator over events
   */
  replay(options?: EventQueryOptions): AsyncIterable<EventRecord>;

  /**
   * Export events to a portable format
   * @param options Query options to filter which events to export
   * @returns Exported data suitable for archival or transfer
   */
  export(options?: EventQueryOptions): Promise<ExportedEventLog>;
}

/**
 * Exported event log format (for backup/transfer)
 */
export interface ExportedEventLog {
  /** Export format version */
  readonly version: number;

  /** When the export was created */
  readonly exportedAt: Timestamp;

  /** Number of events included */
  readonly eventCount: number;

  /** Time range of included events */
  readonly timeRange: TimeRange;

  /** The events */
  readonly events: readonly EventRecord[];

  /** Checksum for integrity verification */
  readonly checksum: string;
}

// =============================================================================
// SUBSCRIPTION INTERFACE (for real-time processing)
// =============================================================================

/**
 * Event subscription callback
 */
export type EventSubscriber = (record: EventRecord) => void | Promise<void>;

/**
 * Subscription handle for managing subscriptions
 */
export interface EventSubscription {
  /** Unique subscription ID */
  readonly id: string;

  /** Unsubscribe from events */
  unsubscribe(): void;
}

/**
 * EventLog with subscription support
 */
export interface SubscribableEventLog extends EventLog {
  /**
   * Subscribe to new events
   * @param subscriber Callback for new events
   * @param filter Optional filter for which events to receive
   * @returns Subscription handle
   */
  subscribe(
    subscriber: EventSubscriber,
    filter?: Pick<EventQueryOptions, "categories" | "eventTypes">,
  ): EventSubscription;
}
