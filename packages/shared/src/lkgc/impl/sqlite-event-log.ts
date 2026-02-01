// =============================================================================
// SQLITE EVENT LOG - Stub Implementation
// =============================================================================
// This file contains the interface and method signatures for a SQLite-backed
// event log implementation. The actual SQL execution logic is NOT implemented
// here - this is a stub for future implementation.
//
// To implement:
// 1. Add a SQLite driver dependency (e.g., better-sqlite3, sql.js)
// 2. Implement each method using the schema from sqlite-schema.ts
// 3. Add proper error handling and transaction support
// =============================================================================

import type {
  EventId,
  SessionId,
  NodeId,
  Timestamp,
} from "../../types/lkgc/foundation";
import type { LKGCEvent } from "../../types/lkgc/events";
import type {
  EventLog,
  EventRecord,
  EventProcessingStatus,
  EventQueryOptions,
  EventQueryResult,
  AppendResult,
  ExportedEventLog,
} from "../event-log";

// =============================================================================
// DATABASE CONNECTION INTERFACE
// =============================================================================

/**
 * Abstract interface for SQLite database operations
 * This allows different SQLite drivers to be used (better-sqlite3, sql.js, etc.)
 */
export interface SQLiteConnection {
  /**
   * Execute a SQL statement that doesn't return results
   */
  run(sql: string, params?: unknown[]): Promise<void>;

  /**
   * Execute a SQL query and return all results
   */
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Execute a SQL query and return the first result
   */
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;

  /**
   * Begin a transaction
   */
  beginTransaction(): Promise<void>;

  /**
   * Commit a transaction
   */
  commit(): Promise<void>;

  /**
   * Rollback a transaction
   */
  rollback(): Promise<void>;

  /**
   * Close the connection
   */
  close(): Promise<void>;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for SQLite event log
 */
export interface SQLiteEventLogConfig {
  /**
   * Database file path (or :memory: for in-memory)
   */
  readonly databasePath: string;

  /**
   * Whether to enable WAL mode (recommended for concurrent access)
   */
  readonly enableWAL?: boolean;

  /**
   * Maximum batch size for bulk operations
   */
  readonly maxBatchSize?: number;

  /**
   * Whether to validate events before storing
   */
  readonly validateOnStore?: boolean;
}

// =============================================================================
// SQLITE EVENT LOG STUB
// =============================================================================

/**
 * SQLite-backed implementation of EventLog
 *
 * ⚠️ STUB IMPLEMENTATION - Methods throw NotImplementedError
 * This is provided as a template for future implementation.
 */
export class SQLiteEventLog implements EventLog {
  private readonly config: SQLiteEventLogConfig;
  private connection: SQLiteConnection | null = null;

  constructor(config: SQLiteEventLogConfig) {
    this.config = config;
  }

  // -------------------------------------------------------------------------
  // LIFECYCLE
  // -------------------------------------------------------------------------

  /**
   * Initialize the database connection and schema
   */
  async initialize(connection: SQLiteConnection): Promise<void> {
    this.connection = connection;
    // TODO: Run schema initialization from sqlite-schema.ts
    throw new NotImplementedError("SQLiteEventLog.initialize");
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }

  // -------------------------------------------------------------------------
  // WRITE OPERATIONS
  // -------------------------------------------------------------------------

  async append(_event: LKGCEvent): Promise<AppendResult> {
    // TODO: Implement using:
    // 1. Check for duplicate event ID
    // 2. Get next sequence number from lkgc_sequences
    // 3. Extract node_id from event for indexing
    // 4. Compute event hash
    // 5. INSERT INTO lkgc_events
    throw new NotImplementedError("SQLiteEventLog.append");
  }

  async appendBatch(_events: readonly LKGCEvent[]): Promise<AppendResult> {
    // TODO: Implement using transaction:
    // 1. BEGIN TRANSACTION
    // 2. For each event, call append logic
    // 3. COMMIT (or ROLLBACK on error)
    throw new NotImplementedError("SQLiteEventLog.appendBatch");
  }

  // -------------------------------------------------------------------------
  // READ OPERATIONS
  // -------------------------------------------------------------------------

  async getById(_eventId: EventId): Promise<EventRecord | null> {
    // TODO: Implement using:
    // SELECT * FROM lkgc_events WHERE event_id = ?
    throw new NotImplementedError("SQLiteEventLog.getById");
  }

  async query(_options: EventQueryOptions): Promise<EventQueryResult> {
    // TODO: Implement using dynamic SQL construction:
    // 1. Build WHERE clause from options
    // 2. Add ORDER BY clause
    // 3. Add LIMIT/OFFSET
    // 4. Execute and map results to EventRecord
    throw new NotImplementedError("SQLiteEventLog.query");
  }

  async getBySession(_sessionId: SessionId): Promise<readonly EventRecord[]> {
    // TODO: Implement using:
    // SELECT * FROM lkgc_events WHERE session_id = ? ORDER BY sequence_number
    throw new NotImplementedError("SQLiteEventLog.getBySession");
  }

  async getByNode(
    _nodeId: NodeId,
    _options?: Omit<EventQueryOptions, "nodeId">,
  ): Promise<EventQueryResult> {
    // TODO: Implement using query() with nodeId filter
    throw new NotImplementedError("SQLiteEventLog.getByNode");
  }

  async getAfterSequence(
    _afterSequence: number,
    _limit?: number,
  ): Promise<readonly EventRecord[]> {
    // TODO: Implement using:
    // SELECT * FROM lkgc_events WHERE sequence_number > ? ORDER BY sequence_number LIMIT ?
    throw new NotImplementedError("SQLiteEventLog.getAfterSequence");
  }

  // -------------------------------------------------------------------------
  // STATUS OPERATIONS
  // -------------------------------------------------------------------------

  async updateStatus(
    _eventId: EventId,
    _status: EventProcessingStatus,
    _error?: string,
  ): Promise<void> {
    // TODO: Implement using:
    // UPDATE lkgc_events SET processing_status = ?, processed_at = ?, processing_error = ? WHERE event_id = ?
    throw new NotImplementedError("SQLiteEventLog.updateStatus");
  }

  // -------------------------------------------------------------------------
  // METADATA OPERATIONS
  // -------------------------------------------------------------------------

  async getCurrentSequence(): Promise<number> {
    // TODO: Implement using:
    // SELECT current_value FROM lkgc_sequences WHERE sequence_name = 'events'
    throw new NotImplementedError("SQLiteEventLog.getCurrentSequence");
  }

  async getStatusCounts(): Promise<Record<EventProcessingStatus, number>> {
    // TODO: Implement using:
    // SELECT processing_status, COUNT(*) FROM lkgc_events GROUP BY processing_status
    throw new NotImplementedError("SQLiteEventLog.getStatusCounts");
  }

  async getLastEventTimestamp(): Promise<Timestamp | null> {
    // TODO: Implement using:
    // SELECT MAX(event_timestamp) FROM lkgc_events
    throw new NotImplementedError("SQLiteEventLog.getLastEventTimestamp");
  }

  // -------------------------------------------------------------------------
  // REPLAY OPERATIONS
  // -------------------------------------------------------------------------

  async *replay(_options?: EventQueryOptions): AsyncIterable<EventRecord> {
    // TODO: Implement using cursor-based iteration:
    // 1. Execute query with ORDER BY sequence_number
    // 2. Yield records one at a time
    // Yielding nothing before throwing to satisfy require-yield
    yield* [];
    throw new NotImplementedError("SQLiteEventLog.replay");
  }

  async export(_options?: EventQueryOptions): Promise<ExportedEventLog> {
    // TODO: Implement using query() and formatting
    throw new NotImplementedError("SQLiteEventLog.export");
  }
}

// =============================================================================
// ERROR CLASS
// =============================================================================

/**
 * Error thrown when a method is not yet implemented
 */
export class NotImplementedError extends Error {
  constructor(methodName: string) {
    super(
      `${methodName} is not yet implemented. This is a stub for future SQLite implementation.`,
    );
    this.name = "NotImplementedError";
  }
}
